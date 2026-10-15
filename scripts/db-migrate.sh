#!/usr/bin/env bash
# Applies pending migrations from db/migrations with dbmate. The migration history lives in
# sealdown.schema_migrations, so other projects sharing the Supabase database keep their own.
#
#   scripts/db-migrate.sh local        # local Supabase (pnpm db:start runs this)
#   scripts/db-migrate.sh              # production: DATABASE_URL from the environment or .env.local
#   scripts/db-migrate.sh local status # any dbmate command after the target
set -euo pipefail
cd "$(dirname "$0")/.."

# DATABASE_URL can live in .env.local (git-ignored; Vite only exposes VITE_* variables to the site).
if [[ -z "${DATABASE_URL:-}" && -f .env.local ]]; then
  DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' .env.local | tail -1 | sed "s/^['\"]//; s/['\"]$//")
  [[ -n "$DATABASE_URL" ]] && export DATABASE_URL
fi

if [[ "${1:-}" == local ]]; then
  shift
  export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable'
elif [[ -z "${DATABASE_URL:-}" ]]; then
  echo 'Set DATABASE_URL to the Supabase session pooler URI (Connect → Session pooler), for' >&2
  echo 'example in .env.local:' >&2
  echo "  DATABASE_URL=postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres?sslmode=require" >&2
  exit 1
fi

export DBMATE_MIGRATIONS_DIR=db/migrations
export DBMATE_MIGRATIONS_TABLE=sealdown.schema_migrations
export DBMATE_NO_DUMP_SCHEMA=true
exec node_modules/.bin/dbmate "${@:-up}"
