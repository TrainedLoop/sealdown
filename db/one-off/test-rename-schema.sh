#!/usr/bin/env bash
# Rehearses 2026-10-15-rename-schema.sql on the local Supabase: builds the old rendermd schema
# from git history, stores a document, runs the one-off, and checks the document still opens.
# Leaves the local database reset to the current migrations.
set -euo pipefail
cd "$(dirname "$0")/../.."
db() { docker exec -i supabase_db_sealdown psql -U postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

old=$(git show 47aa21c:db/migrations/20261014000000_docs.sql | sed -n '/-- migrate:up/,/-- migrate:down/p' | sed '$d')
db -c "drop schema if exists sealdown cascade; drop schema if exists rendermd cascade;" -c "select cron.unschedule(jobname) from cron.job where jobname like '%prune-docs';" >/dev/null
db <<<"$old"
db -c "create table rendermd.schema_migrations (version varchar(128) primary key); insert into rendermd.schema_migrations values ('20261014000000');"
id=$(db -c "select rendermd.create_doc(encode('sealed bytes', 'base64'));")

db -f - < db/one-off/2026-10-15-rename-schema.sql

got=$(db -c "select convert_from(decode(sealdown.get_doc('$id'), 'base64'), 'UTF8');")
jobs=$(db -c "select string_agg(jobname, ',') from cron.job where jobname like '%prune-docs';")
anon=$(db -c "set role anon; select sealdown.ping();")
left=$(db -c "select count(*) from pg_namespace where nspname = 'rendermd';")
status=$(DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable' \
  DBMATE_MIGRATIONS_DIR=db/migrations DBMATE_MIGRATIONS_TABLE=sealdown.schema_migrations DBMATE_NO_DUMP_SCHEMA=true \
  node_modules/.bin/dbmate status | tail -1)

echo "document: $got | cron: $jobs | anon ping: $anon | old schema left: $left | dbmate: $status"
[[ "$got" == "sealed bytes" && "$jobs" == "sealdown-prune-docs" && "$anon" == "1" && "$left" == "0" && "$status" == "Pending: 0" ]]
echo "PASS"
