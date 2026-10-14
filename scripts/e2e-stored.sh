#!/usr/bin/env bash
# End-to-end tests against the local Supabase (start it with `pnpm db:start`). The build gets the
# local API URL and publishable key, as production gets its own.
set -euo pipefail
status=$(node_modules/.bin/supabase status -o env)
export VITE_SUPABASE_URL=$(sed -n 's/^API_URL="\(.*\)"$/\1/p' <<<"$status")
export VITE_SUPABASE_ANON_KEY=$(sed -n 's/^PUBLISHABLE_KEY="\(.*\)"$/\1/p' <<<"$status")
exec "$(dirname "$0")/playwright-docker.sh" --config playwright.stored.config.ts "$@"
