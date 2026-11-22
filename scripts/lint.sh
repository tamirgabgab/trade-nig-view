#!/usr/bin/env bash
# Auto-fix lint and formatting issues.
. "$(dirname "$0")/_common.sh"
step "backend: ruff";      (cd "$BACKEND_DIR" && uv run ruff check --fix . && uv run ruff format .)
step "frontend: eslint";   (cd "$FRONTEND_DIR" && npx eslint . --fix && npm run --silent format)
echo "Done. Run ./scripts/test.sh to verify."
