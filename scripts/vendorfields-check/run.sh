#!/usr/bin/env bash
# Compiles the real module, runs check.js against it. Run from the repo root:
#   bash scripts/vendorfields-check/run.sh
# CI runs every scripts/*-check/run.sh this way (the "Module checks" step).
set -euo pipefail
dir=scripts/vendorfields-check
npx tsc -p "$dir/tsconfig.json"
# tsc leaves the "@/lib/..." aliases in the output; node cannot resolve them.
sed -i -E 's#require\("@/lib/([^"]+)"\)#require("./\1")#g' "$dir"/out/*.js
cp "$dir/check.js" "$dir/out/"
node "$dir/out/check.js"
