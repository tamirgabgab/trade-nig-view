#!/usr/bin/env bash
# Run backend (:8000) and frontend (:5173) together. Ctrl+C stops both.
. "$(dirname "$0")/_common.sh"
step "Backend on http://127.0.0.1:8000 (API docs: /api/docs)"
(cd "$BACKEND_DIR" && exec uv run python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000) &
BACKEND_PID=$!
trap 'kill "$BACKEND_PID" 2>/dev/null || true' EXIT INT TERM
step "Frontend on http://localhost:5173"
cd "$FRONTEND_DIR" && npm run dev
