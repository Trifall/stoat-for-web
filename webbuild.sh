#!/bin/bash
set -e

# Pull brand assets submodule
git -c submodule."packages/client/assets".update=checkout submodule update --init packages/client/assets

# build:deps
pnpm --filter stoat.js build
pnpm --filter solid-livekit-components build

# lingui:extract + compile
pnpm --filter client exec lingui extract
pnpm --filter client exec lingui compile --typescript

# install:assets
pnpm --filter client exec node scripts/copyAssets.mjs

# build
pnpm --filter client exec vite build
