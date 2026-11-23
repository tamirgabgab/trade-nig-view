# ADR 0001 — Technology stack

- Status: Accepted (2026-11-22), amended (httpx2; pyright replaces mypy)

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

## Amendment 2 (2026-11-22, R0)
- Type checker: **pyright (strict)** replaces mypy. mypy 2.x imports the native `librt` extension
  (no pure-Python fallback), and Windows Smart App Control on the developer's machine blocks that unsigned
  `.pyd`. pyright is pure JavaScript on the (signed) Node runtime, installed via the pure-Python `pyright`
  wrapper from PyPI and run as `uv run python -m pyright`. Config: `[tool.pyright]` in `backend/pyproject.toml`.
- All Python tools are invoked as `uv run python -m <tool>` (SAC blocks uv's unsigned launcher `.exe` files).
- On Windows with SAC on, the official signed python.org CPython is used (`UV_PYTHON_PREFERENCE=only-system`),
  not uv's downloaded python-build-standalone (its `_socket.pyd` was blocked).
- `uvicorn` without the `[standard]` extras (httptools, watchfiles, websockets are unsigned native modules).
- Rule for new dependencies: prefer pure-Python packages or widely used wheels; verify on the user's Windows
  machine (`test.ps1`) before relying on a new native extension. numpy/pandas (R1) must be verified first thing.

## Phase-1 review (2026-11-23): versions
Policy kept: patch/minor upgrades only, and nothing published less than two weeks ago.
- Upgraded: `zustand` 5.0.16 → **5.1.0** (published 2026-11-06; all tests green).
- Backend: every direct dependency is already on its latest release (FastAPI 0.165, pandas 3.1.1, numpy 2.5.5,
  pydantic 2.14.4, yfinance 1.8.0, ruff 0.17.6, pyright 1.1.414, pytest 9.2).
- Deferred, too fresh (published 2026-11-23): `lucide-react` 1.78, `typescript-eslint` 8.74, `@tanstack/react-query`
  5.108.4. Take them at the next round after 2026-12-07.
- Deferred on purpose: `@playwright/test` 1.65 (the cloud sandbox ships the browser of 1.63; upgrade together with
  `npx playwright install` on the user's machine), `typescript` 7 (typescript-eslint 8.74 still requires `<6.1`),
  `@types/node` 26 (major; follows Node 26, we run Node 22 LTS as in CI and `engines`).
- The Decision section above is kept as written on 2026-11-22: `httpx` there reads `httpx2` (Amendment 1), mypy reads
  pyright strict (Amendment 2), and Zustand is now pinned `~5.1.0` in `frontend/package.json`.
