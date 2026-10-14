#!/usr/bin/env bash
# Applies pending migrations from db/migrations with dbmate. The migration history lives in
# rendermd.schema_migrations, so other projects sharing the Supabase database keep their own.
#
#   scripts/db-migrate.sh local        # local Supabase (pnpm db:start runs this)
#   scripts/db-migrate.sh              # production: needs DATABASE_URL (session pooler URI)
#   scripts/db-migrate.sh local status # any dbmate command after the target
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${1:-}" == local ]]; then
  shift
  export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable'
elif [[ -z "${DATABASE_URL:-}" ]]; then
  echo 'Set DATABASE_URL to the Supabase session pooler URI (Connect → Session pooler), e.g.' >&2
  echo "  DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres' pnpm db:migrate" >&2
  exit 1
fi

export DBMATE_MIGRATIONS_DIR=db/migrations
export DBMATE_MIGRATIONS_TABLE=rendermd.schema_migrations
export DBMATE_NO_DUMP_SCHEMA=true
exec node_modules/.bin/dbmate "${@:-up}"
