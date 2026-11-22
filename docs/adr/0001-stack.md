# ADR 0001 — Technology stack

- Status: Accepted (2026-11-22)

## Context
Single-user, local research platform. Developer machine is Windows 11 (PowerShell). Indicators, backtesting and the
agent are numeric/data work where Python's ecosystem (numpy, pandas, TA-Lib, hypothesis) is strongest. The UI is a
dense, interactive single-page app.

## Decision
- **Backend**: Python **3.13** (`requires-python >=3.12`), FastAPI + Uvicorn, pydantic v2 + pydantic-settings,
  numpy 2.x, pandas 3.x, httpx (provider HTTP), yfinance. SQLite via the stdlib `sqlite3` module (no ORM).
- **Env/package manager**: `uv` (installs Python itself on Windows; lockfile `uv.lock`). Fallback: `python -m venv` + `pip`.
- **Quality**: ruff (lint + format), mypy `--strict` (with `pandas-stubs`), pytest, hypothesis, TA-Lib (reference model, test-only).
- **Frontend**: React 19 + TypeScript **6.0.x** (strict) + Vite 8, Zustand 5, TanStack Query 5, lightweight-charts 5.3,
  KaTeX (P2). Tests: Vitest + React Testing Library + Playwright. Lint/format: ESLint (flat config, typescript-eslint) + Prettier.
- **Node**: 22 LTS or newer. Package manager: npm (ships with Node, no extra install on Windows).
- **Scripts**: `scripts/*.ps1` (primary) with `scripts/*.sh` equivalents. CI: GitHub Actions on `ubuntu-latest` and
  `windows-latest`.

## Consequences
- Two languages; the API contract is the boundary → generate TS types from OpenAPI (`openapi-typescript`) to avoid drift.
- TypeScript is pinned to 6.0.x because `typescript-eslint` 8.x supports `<6.1` only; TS 7 (native) is revisited later.
- pandas 3 has copy-on-write and the new default string dtype — code must not rely on chained assignment.

## Alternatives
- Node/TS backend with JS indicator code: one language, but weaker numeric/testing ecosystem and P3/P4/P5 would be
  in Python anyway (ML). Rejected.
- Poetry/conda: heavier on Windows than uv. Rejected.
- pyright instead of mypy: faster, but needs Node in the Python toolchain and mypy has better pandas-stubs support. Revisit if mypy is slow.

## Amendment 1 (2026-11-22, R0)
- Test HTTP client: **`httpx2`** (maintained by the pydantic org). Starlette 1.x's `TestClient` deprecates `httpx` in
  favour of `httpx2`. Provider HTTP calls in R1 use `httpx2` as well.
- Icons: **`lucide-react`** (ISC/MIT, tree-shaken per icon, ~1 KB per icon). No proprietary icon assets.
- Network blocking in tests is implemented in `backend/tests/conftest.py` (patches `socket.getaddrinfo`,
  `socket.socket.connect`, `connect_ex`; loopback allowed) instead of adding `pytest-socket`; it is itself tested.
