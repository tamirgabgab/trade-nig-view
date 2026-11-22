#!/usr/bin/env bash
# Run every quality gate; exits non-zero if any gate fails.
. "$(dirname "$0")/_common.sh"
set +e
failed=()
run() { local name="$1" dir="$2"; shift 2; step "$name"; (cd "$dir" && "$@") || failed+=("$name"); }
run "backend: ruff check"          "$BACKEND_DIR"  uv run python -m ruff check .
run "backend: ruff format --check" "$BACKEND_DIR"  uv run python -m ruff format --check .
run "backend: pyright"             "$BACKEND_DIR"  uv run python -m pyright
run "backend: pytest"              "$BACKEND_DIR"  uv run python -m pytest --cov --cov-report=term-missing:skip-covered
run "frontend: eslint"             "$FRONTEND_DIR" npm run --silent lint
run "frontend: prettier"           "$FRONTEND_DIR" npm run --silent format:check
run "frontend: tsc"                "$FRONTEND_DIR" npm run --silent typecheck
run "frontend: vitest"             "$FRONTEND_DIR" npm run --silent test
echo
if [ ${#failed[@]} -gt 0 ]; then echo "FAILED: ${failed[*]}"; exit 1; fi
echo "All 8 gates passed."
