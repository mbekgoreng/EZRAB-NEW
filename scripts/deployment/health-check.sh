#!/usr/bin/env bash
# EZRAB — health check lokal di server: web menjawab, API /health sehat,
# engine-status publik menjawab JSON.
set -euo pipefail
WEB_PORT="${WEB_PORT:-8080}"
API_PORT="${API_PORT:-3001}"

# Di produksi web berada di belakang Nginx host; sesuaikan WEB_PORT.
curl -fsS "http://127.0.0.1:${WEB_PORT}/" >/dev/null && echo "web: OK" || { echo "web: FAIL"; exit 1; }
# API tidak dipublikasikan langsung di produksi; periksa lewat container.
if curl -fsS "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
  echo "api (langsung): OK"
else
  docker compose exec -T web wget -qO- http://api:3001/health >/dev/null && echo "api (via web container): OK"
fi
curl -fsS "http://127.0.0.1:${WEB_PORT}/api/ai/engine-status" | grep -q '"success":true' \
  && echo "engine-status via proxy: OK" || { echo "engine-status: FAIL"; exit 1; }
