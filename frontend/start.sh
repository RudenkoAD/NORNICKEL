#!/usr/bin/env bash
# Запуск фронтенда с конфигом из .env (node dotenv не подключён — грузим сами).
# Использование: ./start.sh            (из каталога frontend/)
#                ./frontend/start.sh   (из корня репозитория)
set -euo pipefail
cd "$(dirname "$0")"

# .env → окружение (строки KEY=VALUE, # — комментарии)
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# Дефолты, если .env нет или переменная не задана
export PORT="${PORT:-3000}"
export CORPUS_VAULT_PATH="${CORPUS_VAULT_PATH:-../corpus}"
export AUTO_CREATE_DEFAULT="${AUTO_CREATE_DEFAULT:-false}"
export AGENT_API_URL="${AGENT_API_URL:-http://localhost:8000/query}"

# Ключ агента: пустой → берём lead-ключ из backend/.env (один источник правды)
if [[ -z "${AGENT_API_KEY:-}" && -f ../backend/.env ]]; then
  AGENT_API_KEY="$(grep -o 'demo-lead-[a-f0-9]*' ../backend/.env | head -1 || true)"
  export AGENT_API_KEY
fi
if [[ -z "${AGENT_API_KEY:-}" ]]; then
  echo "ВНИМАНИЕ: AGENT_API_KEY не найден — агент ответит 401." >&2
fi

echo "фронт: http://localhost:${PORT}  (агент → ${AGENT_API_URL}, корпус: ${CORPUS_VAULT_PATH})"
exec node server/index.js
