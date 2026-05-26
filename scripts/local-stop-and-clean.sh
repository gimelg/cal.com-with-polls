#!/usr/bin/env bash

set -euo pipefail

log() {
  printf "\n[%s] %s\n" "local-stop-and-clean" "$1"
}

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

if lsof -ti :3000 >/dev/null 2>&1; then
  log "Stopping process on port 3000"
  lsof -ti :3000 | xargs kill
  sleep 2
fi

if docker ps --format '{{.Names}}' | grep -qx 'calcom'; then
  log "Stopping calcom app container"
  docker stop calcom >/dev/null
fi

log "Stopping docker compose services and removing attached volumes"
docker compose down -v || true

log "Removing local Docker volumes if present"
docker volume rm calcom_database-data calcom_redis-data >/dev/null 2>&1 || true

log "Local instance stopped and local Docker data removed"
