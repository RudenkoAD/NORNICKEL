"""RBAC и аудит на уровне приложения (ARCHITECTURE.md §7).

Neo4j Community не имеет нативного RBAC (Enterprise-фича), поэтому разграничение
доступа целиком живёт здесь и в Cypher-шаблонах `db/queries.py`.

Ответственности модуля:
- `X-API-Key` → роль. Маппинг ключ→роль строится из `Settings.api_key_*`. Если ключ
  роли не задан в env — роль ОТКЛЮЧЕНА (её нельзя получить): пустой демо-ключ не должен
  открывать доступ (fail closed).
- `require_role(minimum)` — FastAPI-зависимость: пропускает роли иерархии не ниже
  `minimum` (через `role_at_least`). `partner` — ВНЕ иерархии: доступен только к
  явно разрешённому множеству endpoint'ов (§7), поэтому к `require_role` он всегда
  получает 403 (для partner-endpoint'ов используется `require_partner_or_role`).
- Аудит-middleware: на каждый запрос пишет строку JSONL
  `{ts, role, endpoint, question|doc_id, status}` в `logs/audit.jsonl`.

Инвариант №9 (fail fast): никаких обращений к внешним сервисам здесь нет —
идентификация ключа локальна и мгновенна.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import Depends, Header, HTTPException, status

from app.config import (
    ALL_ROLES,
    PARTNER_ROLE,
    Settings,
    get_settings,
    role_at_least,
)

log = logging.getLogger(__name__)

# Заголовок аутентификации (§6, §7). Регистронезависим на уровне HTTP.
API_KEY_HEADER = "X-API-Key"

# Куда пишем аудит (§7). Каталог создаётся при импорте — ротацию НЕ делаем (контракт).
LOGS_DIR = Path(__file__).resolve().parents[1] / "logs"
AUDIT_LOG_PATH = LOGS_DIR / "audit.jsonl"

# Endpoint'ы, доступные partner (вне иерархии, §7): только /query, /graph/subgraph,
# /gaps, /export. Сверяем по префиксу пути запроса.
PARTNER_ALLOWED_PREFIXES: tuple[str, ...] = (
    "/query",
    "/graph/subgraph",
    "/gaps",
    "/export",
)


def _role_key_map(settings: Settings) -> dict[str, str]:
    """Обратный индекс «значение ключа → имя роли» по непустым `api_key_*` из Settings.

    Пустой/незаданный ключ роли исключается (fail closed): роль без ключа недоступна.
    """
    raw = {
        "researcher": settings.api_key_researcher,
        "analyst": settings.api_key_analyst,
        "lead": settings.api_key_lead,
        "admin": settings.api_key_admin,
        PARTNER_ROLE: settings.api_key_partner,
    }
    mapping: dict[str, str] = {}
    for role, key in raw.items():
        if key and key.strip():
            mapping[key.strip()] = role
    return mapping


def role_for_key(api_key: Optional[str], settings: Optional[Settings] = None) -> Optional[str]:
    """Роль по значению `X-API-Key` либо None (ключ не задан/не совпал).

    Никаких значений по умолчанию: неизвестный ключ = аноним (доступа нет).
    """
    if not api_key:
        return None
    settings = settings or get_settings()
    return _role_key_map(settings).get(api_key.strip())


def get_role(
    x_api_key: Optional[str] = Header(default=None, alias=API_KEY_HEADER),
) -> str:
    """FastAPI-зависимость: извлекает роль из заголовка или 401.

    Возвращает строго одну из `ALL_ROLES`. Отсутствие/неверный ключ → 401 (а не 403):
    сначала докажи, кто ты, потом проверяем права.
    """
    role = role_for_key(x_api_key)
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный или отсутствующий X-API-Key.",
        )
    # Санити: роль обязана быть из известного множества (защита от опечатки в конфиге).
    if role not in ALL_ROLES:  # pragma: no cover — недостижимо при корректном _role_key_map
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неизвестная роль.")
    return role


def require_role(minimum: str):
    """Фабрика зависимостей: доступ ролям иерархии не ниже `minimum` (§7).

    `partner` вне иерархии → всегда 403 (для partner-endpoint'ов см.
    `require_partner_or_role`). Так `/dashboard` (lead+) и `/audit` (admin) закрыты
    для partner и младших ролей.
    """

    def _dep(role: str = Depends(get_role)) -> str:
        if not role_at_least(role, minimum):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Роль «{role}» не имеет доступа (нужно {minimum}+).",
            )
        return role

    return _dep


def require_partner_or_role(minimum: str = "researcher"):
    """Фабрика зависимостей для partner-доступных endpoint'ов (§7): пропускает
    `partner` ИЛИ любую роль иерархии не ниже `minimum`.

    Используется на /query, /graph/subgraph, /gaps, /export — единственных, куда
    partner допущен. Остальные роли проходят по обычной иерархии.
    """

    def _dep(role: str = Depends(get_role)) -> str:
        if role == PARTNER_ROLE:
            return role
        if not role_at_least(role, minimum):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Роль «{role}» не имеет доступа (нужно {minimum}+ или partner).",
            )
        return role

    return _dep


# ---------------------------------------------------------------------------
# Аудит (§7): строка JSONL на каждый запрос
# ---------------------------------------------------------------------------
def _ensure_logs_dir() -> None:
    try:
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
    except OSError as err:  # noqa: BLE001 — аудит не должен валить запрос
        log.warning("Не удалось создать каталог аудита %s: %s", LOGS_DIR, err)


def write_audit_record(record: dict) -> None:
    """Дописывает одну JSONL-строку аудита (§7). Ошибка записи логируется, но не
    прерывает обработку запроса — аудит вторичен по отношению к ответу."""
    _ensure_logs_dir()
    try:
        with AUDIT_LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError as err:  # noqa: BLE001
        log.warning("Аудит не записан (%s): %r", err, record)


def read_audit_tail(limit: int = 100) -> list[dict]:
    """Хвост аудит-лога для `GET /audit` (§6, admin). Битые строки пропускаем."""
    if not AUDIT_LOG_PATH.exists():
        return []
    try:
        lines = AUDIT_LOG_PATH.read_text(encoding="utf-8").splitlines()
    except OSError as err:  # noqa: BLE001
        log.warning("Аудит-лог не прочитан: %s", err)
        return []
    out: list[dict] = []
    for line in lines[-limit:]:
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


def audit_timestamp() -> str:
    """UTC ISO-8601 отметка времени для строки аудита."""
    return datetime.now(timezone.utc).isoformat()
