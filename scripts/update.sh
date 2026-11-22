#!/usr/bin/env bash
# Bring this checkout up to date: fast-forward pull, then reinstall dependencies only if the lock
# files changed (or were never installed). Mirrors scripts/update.ps1.
# A failed pull (offline, local changes in the way) only warns; exit 1 only if installing fails.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Older installs were cloned from a work branch (claude/...). New versions are published on 'main':
# move there once, only when nothing can be lost (clean tracked files, every commit on origin/main).
switch_to_main() {
  local branch
  branch="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)" || return 0
  [ "$branch" = "main" ] && return 0
  git -C "$ROOT" fetch --quiet origin main || return 0
  if ! git -C "$ROOT" merge-base --is-ancestor HEAD origin/main; then
    echo "WARNING: staying on branch '$branch': it has commits that are not on 'main'."
    return 0
  fi
  if [ -n "$(git -C "$ROOT" status --porcelain --untracked-files=no)" ]; then
    echo "WARNING: staying on branch '$branch': it has local changes."
    return 0
  fi
  if git -C "$ROOT" show-ref --verify --quiet refs/heads/main; then
    if ! git -C "$ROOT" merge-base --is-ancestor main origin/main; then
      echo "WARNING: staying on branch '$branch': the local 'main' has commits that are not on GitHub."
      return 0
    fi
    git -C "$ROOT" branch --force main origin/main || return 0
  else
    git -C "$ROOT" branch --track main origin/main || return 0
  fi
  git -C "$ROOT" switch main && echo "==> Moved from branch '$branch' to 'main' (where new versions are published)"
  return 0
}

changed=""
if ! command -v git >/dev/null; then
  echo "WARNING: git is not installed: skipping the update."
elif ! before="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null)"; then
  echo "WARNING: this folder is not a git checkout: skipping the update."
else
  echo "==> Checking GitHub for updates..."
  export GIT_TERMINAL_PROMPT=0
  switch_to_main
  if ! git -C "$ROOT" pull --ff-only; then
    echo "WARNING: could not download updates (see above). Keeping the version on disk."
  else
    after="$(git -C "$ROOT" rev-parse HEAD)"
    if [ "$after" = "$before" ]; then
      echo "==> Already up to date"
    else
      changed="$(git -C "$ROOT" diff --name-only "$before" "$after")"
      echo "==> Updated: $(git -C "$ROOT" rev-list --count "$before..$after") new commit(s)"
      git -C "$ROOT" log --oneline --no-decorate "$before..$after"
    fi
  fi
fi

# True if any of the given repo paths is in the list of changed files.
has_change() {
  [ -n "$changed" ] || return 1
  local path
  for path in "$@"; do
    grep -qxF -- "$path" <<<"$changed" && return 0
  done
  return 1
}

if [ ! -d "$ROOT/backend/.venv" ] || has_change backend/uv.lock backend/pyproject.toml backend/.python-version; then
  echo "==> Backend libraries changed: uv sync"
  (cd "$ROOT/backend" && uv sync) || { echo "ERROR: uv sync failed"; exit 1; }
fi
if [ ! -d "$ROOT/frontend/node_modules" ] || has_change frontend/package-lock.json frontend/package.json; then
  echo "==> Frontend libraries changed: npm ci"
  (cd "$ROOT/frontend" && npm ci) || { echo "ERROR: npm ci failed"; exit 1; }
fi
exit 0
