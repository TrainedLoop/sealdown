#!/usr/bin/env bash
# Runs Playwright inside the official image so browsers have their system libraries and screenshots
# match CI. Arguments go straight to `playwright test`. The image tag must match @playwright/test.
set -euo pipefail
version=$(node -p "require('@playwright/test/package.json').version")
exec docker run --rm --network host --ipc host \
  -u "$(id -u):$(id -g)" -e HOME=/tmp -e CI -e npm_config_cache=/work/node_modules/.cache/npm \
  -v "$PWD":/work -w /work \
  "mcr.microsoft.com/playwright:v${version}-noble" \
  bash -c 'npx --yes pnpm@12.3.4 exec playwright test "$@"' -- "$@"
