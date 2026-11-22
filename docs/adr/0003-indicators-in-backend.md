# ADR 0003 — Indicators are computed in the Python backend

- Status: Accepted (2026-11-22)

## Context
The project requirement is one indicator implementation shared by the chart, learn pages, plugins, backtester and
agent. Backtesting and the agent are Python.

## Decision
Indicators are pure, vectorised numpy functions in `backend/app/indicators/`, registered in a registry with full
metadata. The frontend only renders returned series and builds UI from registry metadata. Compute requests include a
warm-up lookback and an optional `until` replay cursor.

## Consequences
- + Single source of truth; every on-screen value is covered by the golden-test harness.
- + Adding an indicator = 1 Python file + 1 registry entry + tests, no frontend change.
- − A network round-trip per indicator change (local, ~10–50 ms for 10k bars). Mitigation: TanStack Query caching,
  batch endpoint later if needed, debounced param sliders (P2).
- − Live "last bar" updates (P5 delayed data) need a recompute of the tail; acceptable (O(lookback)).

## Alternatives
- TypeScript indicators in the browser: instant, but duplicates logic with Python (P4/P5) → two implementations to keep equal. Rejected.
- Python compiled to WASM (Pyodide) in the browser: heavy (~10 MB), complex. Rejected.
