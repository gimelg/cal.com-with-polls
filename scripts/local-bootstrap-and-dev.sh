#!/usr/bin/env bash

set -euo pipefail

log() {
  printf "\n[%s] %s\n" "local-bootstrap-and-dev" "$1"
}

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

log "Creating Docker volumes"
docker volume create calcom_database-data >/dev/null
docker volume create calcom_redis-data >/dev/null

log "Starting database and redis"
docker compose up -d database redis

log "Waiting for Postgres to accept connections"
until docker exec calcom-db pg_isready -U calcom -d calendso >/dev/null 2>&1; do
  sleep 1
done

log "Resetting public schema"
docker exec calcom-db psql -U calcom -d calendso -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'

log "Applying migrations"
yarn db-deploy

log "Seeding database"
yarn db-seed

log "Starting web dev server"
yarn dev
