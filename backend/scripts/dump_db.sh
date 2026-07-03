#!/usr/bin/env bash
# Дамп готового графа Neo4j в репозиторий (ARCHITECTURE.md §10, §11, P2-пункт §12).
#
# Зачем: жюри поднимает граф из дампа ОДНИМ docker-compose, без LLM-ключей вообще —
# Cypher-сценарии Neo4j Browser (README_DEMO.md) работают без сети. Дамп кладётся в
# NORNICKEL/dumps/ и коммитится (профиль deploy-cloud).
#
# ВАЖНО (Community 5.26): `neo4j-admin database dump` — ОФФЛАЙН-операция, дамп живой,
# смонтированной БД невозможен ("The database is in use. Stop database."). Поэтому:
#   1) останавливаем контейнер БД (сервер отпускает файлы данных);
#   2) запускаем ОДНОРАЗОВЫЙ neo4j-контейнер на тех же volume'ах и дампим оффлайн
#      (dump и system, и neo4j — на случай будущего восстановления);
#   3) поднимаем контейнер обратно.
# Дамп пишем через --to-path (без --verbose: с --to-stdout+--verbose дамп бьётся,
# известный баг neo4j#13397).
#
# Использование:
#   backend/scripts/dump_db.sh                 # дамп в NORNICKEL/dumps/
#   DUMP_DIR=/tmp backend/scripts/dump_db.sh   # переопределить каталог назначения

set -euo pipefail

# --- Пути и имена (контейнер/образ/volume сверены с docker-compose.yml) ---
REPO_ROOT="/Users/rudenkoad/Documents/my_projects/NORNICKEL"
CONTAINER="nornickel-neo4j"                 # container_name из docker-compose.yml
IMAGE="neo4j:5.26-community"                # тот же запинённый образ (§2)
DATA_VOLUME="nornickel_neo4j_data"          # volume neo4j_data с префиксом проекта
DUMP_DIR="${DUMP_DIR:-${REPO_ROOT}/dumps}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

echo "== Дамп графа Neo4j =="
echo "Контейнер: ${CONTAINER}"
echo "Каталог дампа: ${DUMP_DIR}"

mkdir -p "${DUMP_DIR}"

# --- Определяем реальное имя volume (compose префиксует именем проекта). ---
if ! docker volume inspect "${DATA_VOLUME}" >/dev/null 2>&1; then
  echo "Volume '${DATA_VOLUME}' не найден напрямую — ищу по метке проекта…"
  FOUND="$(docker volume ls --format '{{.Name}}' | grep -E 'neo4j_data$' | head -n1 || true)"
  if [[ -z "${FOUND}" ]]; then
    echo "ОШИБКА: не нашёл volume с данными Neo4j (искал *neo4j_data). " >&2
    echo "Проверьте 'docker volume ls' и задайте DATA_VOLUME." >&2
    exit 1
  fi
  DATA_VOLUME="${FOUND}"
  echo "Использую volume: ${DATA_VOLUME}"
fi

# --- Был ли контейнер запущен (чтобы вернуть исходное состояние в конце). ---
WAS_RUNNING="false"
if docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
  WAS_RUNNING="true"
fi

restore_state() {
  if [[ "${WAS_RUNNING}" == "true" ]]; then
    echo "Поднимаю контейнер ${CONTAINER} обратно…"
    docker start "${CONTAINER}" >/dev/null 2>&1 || \
      echo "ПРЕДУПРЕЖДЕНИЕ: не удалось запустить ${CONTAINER} — запустите вручную." >&2
  fi
}
# Гарантируем возврат БД в рабочее состояние даже при ошибке дампа.
trap restore_state EXIT

# --- 1) Останавливаем БД (оффлайн-режим для дампа). ---
if [[ "${WAS_RUNNING}" == "true" ]]; then
  echo "Останавливаю ${CONTAINER} (нужно для оффлайн-дампа Community)…"
  docker stop "${CONTAINER}" >/dev/null
else
  echo "Контейнер ${CONTAINER} уже остановлен — продолжаю."
fi

# --- 2) Оффлайн-дамп одноразовым контейнером на тех же volume'ах. ---
# Монтируем data-volume и каталог назначения; neo4j-admin пишет <db>.dump в /dumps.
dump_one() {
  local db="$1"
  echo "  → дамп базы '${db}'…"
  docker run --rm \
    -v "${DATA_VOLUME}:/data" \
    -v "${DUMP_DIR}:/dumps" \
    "${IMAGE}" \
    neo4j-admin database dump "${db}" \
      --to-path=/dumps --overwrite-destination=true
}

echo "Дампирую базы (neo4j + system)…"
dump_one "neo4j"
# system-база нужна для будущего восстановления метаданных БД (не обязателен для
# демо, но полезен). Не валим весь дамп, если её нет.
dump_one "system" || echo "  system-дамп пропущен (не критично для демо)."

# --- 3) Возврат состояния делает trap restore_state (см. выше). ---

# --- Версионируем дамп с меткой времени рядом с neo4j.dump (последний прогон). ---
if [[ -f "${DUMP_DIR}/neo4j.dump" ]]; then
  cp "${DUMP_DIR}/neo4j.dump" "${DUMP_DIR}/neo4j_${TS}.dump"
  echo "Готово:"
  ls -lh "${DUMP_DIR}"/*.dump
else
  echo "ОШИБКА: ${DUMP_DIR}/neo4j.dump не создан — проверьте вывод выше." >&2
  exit 1
fi

echo
echo "Восстановление на чистом инстансе (Community, БД оффлайн):"
echo "  docker run --rm -v <data_volume>:/data -v ${DUMP_DIR}:/dumps ${IMAGE} \\"
echo "    neo4j-admin database load neo4j --from-path=/dumps --overwrite-destination=true"
