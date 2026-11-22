#!/usr/bin/env bash
# Prueba el esquema SQL en un Postgres 17 desechable (requiere Docker).
# Uso: bash supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")"
NAME=mision-cambio-pgtest
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test postgres:17-alpine >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 2
psql_in() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql_in < bootstrap.sql
psql_in < ../schema.sql
echo "Esquema aplicado. Ejecutando pruebas..."
psql_in < ../schema.sql   # segunda vez: debe ser idempotente
psql_in < test.sql
