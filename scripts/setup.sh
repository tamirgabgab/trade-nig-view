#!/usr/bin/env bash
# Install backend (uv) and frontend (npm) dependencies and create .env if missing.
. "$(dirname "$0")/_common.sh"
require uv "Install: curl -LsSf https://astral.sh/uv/install.sh | sh"
require node "Install Node.js 22 LTS or newer."
[ -f "$REPO_ROOT/.env" ] || { cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"; echo "Created .env"; }
step "Backend: uv sync";  (cd "$BACKEND_DIR" && uv sync)
step "Frontend: npm ci";  (cd "$FRONTEND_DIR" && npm ci)
echo "Setup complete. Next: ./scripts/dev.sh"
