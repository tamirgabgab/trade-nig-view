#!/usr/bin/env bash
# Regenerate the API contract: backend OpenAPI -> frontend/src/api/openapi.json -> schema.ts.
# Run after changing a backend request or response model; commit both generated files.
. "$(dirname "$0")/_common.sh"
step "backend: export OpenAPI"; (cd "$BACKEND_DIR" && uv run python -m app.openapi_export)
step "frontend: gen:api";       (cd "$FRONTEND_DIR" && npm run --silent gen:api)
echo "Done. Commit frontend/src/api/openapi.json and frontend/src/api/schema.ts."
