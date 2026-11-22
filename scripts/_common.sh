#!/usr/bin/env bash
# Shared helpers for ChartLab bash scripts. Source: . "$(dirname "$0")/_common.sh"
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "'$1' not found on PATH. $2" >&2; exit 1; }
}

step() { printf '\033[36m==> %s\033[0m\n' "$1"; }
