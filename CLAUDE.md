# CLAUDE.md — ChartLab operating manual

> **ALWAYS ANSWER THE USER IN HEBREW.** Every reply, every time, with no exceptions: summaries, tables, plans,
> explanations, questions, error reports, and short answers. This holds even when the user writes in English, when the
> source material (docs, `PLAN.md`, logs) is English, and after a context summary or a new session. (User's explicit
> request, 2026-11-22.)

## 1. Language policy (HARD RULE, every session)
- Reply to the user **in Hebrew**: chat, plans, round summaries, demo checklists, questions, tables.
- When asked to summarise an English file (e.g. `PLAN.md`, `ROADMAP.md`), the summary is written in Hebrew.
- **This includes every user-visible interim message**: short progress notes between tool calls ("reading the CI
  log...", "found the bug..."), reasoning shared while working, and the one-line descriptions of tool calls / commands.
  Nothing the user sees during a session is in English except code, commands, identifiers and tool output.
- Inside Hebrew text keep technical terms, identifiers, file names, commands, library and indicator names **in English**
  (e.g. "נוסיף את ה-EMA ל-registry"). Math as LaTeX/plain notation, not translated.
- Code blocks and command output stay in English. Never translate code.
- **Everything committed to the repo is English** (code, comments, docstrings, UI text, commit messages, README, docs,
  this file). **Exception: `HANDOFF.md` is written in Hebrew** (technical terms, paths, commands in English).
- The app UI is English only.

## 2. Project
ChartLab: a personal, local TradingView-style platform (FastAPI + React/TS + Lightweight Charts v5). Phase 1 = charting
MVP in rounds R0–R7 (see `docs/ROADMAP.md`); later phases: learn pages (P2), Python indicator plugins (P3),
backtesting (P4), **paper-only** agent (P5). Key rule: ONE Python indicator implementation serves chart, learn pages,
backtester and agent. **Current phase/round: see `HANDOFF.md`.**

User: MSc EE, senior design-verification engineer, Windows 11 + PowerShell, works via the Claude desktop app.
Treat every indicator like a DUT (golden model, directed + property tests, scoreboard, stated tolerance).

## 3. Commands (available from R0; run from repo root)
| Task | PowerShell | bash |
|---|---|---|
| Install all | `.\scripts\setup.ps1` | `./scripts/setup.sh` |
| Dev (backend :8000 + frontend :5173) | `.\scripts\dev.ps1` | `./scripts/dev.sh` |
| Desktop shortcut (double-click → update + app opens) | `.\scripts\install-shortcut.ps1` (runs `dev.ps1 -Open`, which runs `update.ps1` first) | — |
| Update checkout (ff-only pull, reinstall libs only if lock files changed) | `.\scripts\update.ps1` | `./scripts/update.sh` |
| All tests + lint + typecheck | `.\scripts\test.ps1` | `./scripts/test.sh` |
| Regenerate API types (after a backend model change) | `.\scripts\gen-api.ps1` | `./scripts/gen-api.sh` |
| Download fixtures from Yahoo + commit + push (user's machine only) | `.\scripts\make-fixtures.ps1` | — |
| Backend tests | `cd backend; uv run python -m pytest` | same |
| Backend lint/format/types | `uv run python -m ruff check . ; uv run python -m ruff format --check . ; uv run python -m pyright` | same |
| Frontend tests | `cd frontend; npm test` | same |
| Frontend lint/types/format | `npm run lint ; npm run typecheck ; npm run format:check` | same |
| Frontend build | `npm run build` | same |
| E2E (from R2) | `npm run e2e -- --trace off` | same |

**Windows Smart App Control rule:** always invoke Python tools as `uv run python -m <tool>` (uvicorn, pytest, pyright,
ruff), never `uv run <tool>`. The user's Windows blocks the unsigned launcher `.exe` files uv creates in `.venv\Scripts`
("An Application Control policy has blocked this file", os error 4551).

## 4. Repo map
- `backend/` — FastAPI app (`app/api`, `app/data/{providers,cache}`, `app/indicators`, `app/analysis`, `app/replay`, `app/models`, `app/storage`) and `tests/` (`unit`, `api`, `golden`, `property`, `fixtures`).
- `frontend/` — React app (`src/api`, `src/chart`, `src/indicators`, `src/drawings`, `src/components`, `src/store`, `src/styles`), `e2e/`.
- `docs/` — `ROADMAP.md`, `ARCHITECTURE.md`, `TRADINGVIEW_RESEARCH.md`, `adr/`, `indicators/` (learn pages).
- `scripts/` — setup/dev/test/lint in `.ps1` + `.sh`.
- `.github/workflows/` — CI (ubuntu + windows).

## 5. Conventions
- **Python 3.13** (`>=3.12`), full type hints, `pyright` strict (not mypy: its native `librt` is blocked by SAC), ruff lint+format (line length 100). snake_case; modules small;
  math documented in docstrings with formulas. Pure functions where possible; no global mutable state; config via
  `app.config.Settings`. pandas 3 copy-on-write: no chained assignment.
- **TypeScript 6.0.x strict** (TS 7 blocked by typescript-eslint). No `any` without a comment explaining why. React function
  components + hooks; camelCase vars, PascalCase components, one component per file, CSS Modules + tokens in `styles/tokens.css`.
- **File names**: never have two files in one folder whose names differ only by case or extension
  (`Clock.tsx` + `clock.ts` breaks TypeScript/ESLint on Windows' case-insensitive file system).
- **API**: REST JSON under `/api`, snake_case fields, errors as RFC 9457 problem+json, OpenAPI → generated TS types
  (`frontend/src/api/schema.ts`, never edited by hand). Contract in `docs/ARCHITECTURE.md §4`.
- **Time**: store UTC epoch seconds + exchange TZ. Daily+ bars to the chart as `'YYYY-MM-DD'`; intraday as UTC seconds,
  shifted to display TZ **only inside `ChartEngine`**. `start`/`end`/`until` are inclusive.

## 6. Indicator rules
- Pure, vectorised numpy function in `backend/app/indicators/<id>.py`; formulas in the docstring.
- Output `NaN` during warm-up; never fabricate values. Value at bar t uses only bars ≤ t.
- Registry entry required (`IndicatorSpec`: id, version, params with default/min/max, outputs with plot style,
  overlay/pane, levels, warmup, learn_slug). Frontend must not need changes to add an indicator.
- Tests required: hand vectors + golden scalar-loop model (all bars, `rtol=1e-9, atol=1e-12`) + TA-Lib on converged
  region where applicable + hypothesis properties incl. `check_no_lookahead`. Looser tolerance only with a written reason.
- Learn-page stub `docs/indicators/<slug>.md` required.
- Conventions (seeding, population σ, defaults) in `docs/TRADINGVIEW_RESEARCH.md §5` — follow them.

## 7. Chart rules
- Only `frontend/src/chart/` imports `lightweight-charts`; everything else goes through `ChartEngine`.
- Keep `layout.attributionLogo: true`. No TradingView branding/assets.
- No direct DOM hacks on the canvas; overlays = series/pane primitives; legends are React components.

## 8. Data rules
- Tests **never** hit the network (socket blocker fixture). Use committed fixtures / recorded responses.
- Every provider implements `DataProvider`; only `providers/yahoo.py` imports yfinance.
- Respect rate limits: token bucket + exponential backoff with jitter + circuit breaker + cache. `OFFLINE=1` = fixtures only.
- API keys only in `.env` (gitignored). Never commit, log, or send keys to the frontend.

## 9. Workflow rules
- One round per session. Start: read `CLAUDE.md`, `HANDOFF.md`, current round in `docs/ROADMAP.md`; post the plan in
  Hebrew (files, risks, open questions); then execute.
- Small focused commits, Conventional Commits in English (`feat(indicators): add RSI`).
- Ask before adding a heavy dependency or refactoring outside the round's scope. Verify library APIs/versions against
  current docs before relying on them; record changes in an ADR.
- End: run the full suite, update `HANDOFF.md` (Hebrew), README features, ROADMAP checkboxes; commit; give the demo
  checklist in Hebrew; STOP and wait for approval.
- Git: develop on the branch the session specifies; never force-push shared branches.

## 10. Safety
No real-money trading, no broker APIs or credentials, no order routing. The agent (P5) is paper-only. Not financial advice.

## 11. Definition of Done (every round)
- [ ] Tests green (backend + frontend; e2e from R2), no network in tests
- [ ] ruff + eslint + prettier clean; pyright + tsc clean
- [ ] New code covered by tests; indicators by the full harness
- [ ] Docs updated (ROADMAP checkboxes, README features, ARCHITECTURE/ADR if design changed)
- [ ] `HANDOFF.md` updated (Hebrew) incl. session log
- [ ] Demo checklist written (Hebrew) and committed work pushed
