#!/usr/bin/env bash
# Fails the deploy when the Supabase repository variables are missing.
set -euo pipefail
missing=()
[[ -n "${VITE_SUPABASE_URL:-}" ]] || missing+=(SUPABASE_URL)
[[ -n "${VITE_SUPABASE_ANON_KEY:-}" ]] || missing+=(SUPABASE_ANON_KEY)
if ((${#missing[@]})); then
  echo "::error::Missing repository variables: ${missing[*]}. Set them under Settings → Secrets and variables → Actions → Variables."
  exit 1
fi
echo "Supabase variables present."
