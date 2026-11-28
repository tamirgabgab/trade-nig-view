# ADR 0036 — Trader profiles, the strategy model and causal signals (B0)

- Status: Accepted (2026-11-28)

## Context
Phase 4 (`docs/PHASE4_PLAN.md`) starts with B0: the profiles every later round follows, a strategy document, and the
signals the backtest engine (B1) will turn into trades. Before B0 the user answered the plan's questions
(2026-11-28): strategies as rules **and** as Python files; long **and** short always; fills at the next bar's open;
profiles in the order Position, Swing, Long-term, Day; the Day profile on the data collected so far; net profit (or
the equivalent net annual return) after costs is what matters most; for the portfolio, equal weight and risk parity
with a risk level to choose. On the trade cap the user added that 10 is **only a parameter**: what tells the
profiles apart is the calendar period it counts over, and a higher cap that earns more is allowed.

## Decision
- **`TraderProfile`** (`app/backtest/profiles.py`), four fixed objects: the decision intervals (the first is the
  default; Day 5m or 15m, Swing 1h, Position 1D, Long-term 1W or 1M), the longer context intervals a rule may read
  (Day 1h and 1D, Swing 1D, Position 1W, Long-term 1M), the cap's period (day, ISO week, month, year), the cap's
  **default** (10, 10, 10, 12), overnight holding (Day: flat at the close) and the Day's no-entry minutes before the
  close (15). Costs, evaluation windows and the metrics in front are added by the rounds that use them (B3, B4, B2).
- **The trade cap is a strategy parameter** (`max_trades`, null = the profile's default), stored now and enforced
  by the engine per period (B1); B4 and B7 tune it like any parameter, out of sample.
- **The strategy document** (`DocumentStore("strategies")` in `app.db`, like layouts): a description, a profile, the
  exits, the cap, and either
  - `rules`: up to 12 indicators (each on the decision interval or on a context interval of the profile), and for
    the long and the short side entry and exit groups: a side's entry fires when **any** group holds, a group when
    **all** its conditions hold (OR of ANDs; up to 8 groups of 8 conditions, the learn lab's `Condition`). Filters
    of the same shape gate the entries of both sides, not the exits. At least one entry group must exist.
  - `python`: a file in `strategies/` at the repo root (in git, the user's choice) and its parameter values.
  The exits (the other side's entry, a stop, a target and a trailing stop in % or ATR multiples, a time stop in
  bars) are validated and stored now, and run by the engine.
- **Context intervals without lookahead.** A context indicator is computed on that interval's own bars and reaches
  a decision bar only once its bar has closed: for daily, weekly and monthly context, from the first decision bar of
  a **later** period (a week's value arrives on the next week's first bar, never on its own last bar: which bar ends
  a week is known only once the next one exists, a holiday Friday moves it); for intraday context (1h for 5m), once
  the context bar has ended. A scalar golden model checks the alignment, and a property checks that a prefix of the
  bars, with the context bars rebuilt from that prefix, gives the prefix of the signals and of every operand.
- **The whole history.** `POST /strategies/signals` computes on all the bars up to `until` (20,000 at most): the
  signal of a bar does not depend on where a window would start (warm-up), and the chart shows the signals of the
  bars it has, so a replay shows those up to its cursor.
- **Python strategies** (`app/backtest/python_loader.py`): a file defines `SPEC` (description and `int`, `float` or
  `bool` parameters with limits) and `signals(bars, params, ind)` returning any of the four signals as booleans;
  `ind` is the indicator registry (one implementation, as for the chart), with `interval` for a context interval.
  The bars are read-only views. A file is imported again when its modification time changes. Errors (import,
  `SPEC`, the result's shape, an exception) are a 422 with the file's line.
  - **Trust:** a file runs inside the backend with its full rights. It is the user's own code on the user's own
    machine, as trusted as the app; there is no sandbox, and `strategies/README.md` says so.
  - **Lookahead check:** every run is repeated on prefixes (sixths of the bars and all but the last); a signal on an
    early bar that changes when later bars are added is refused (422 `strategy_lookahead`), naming the bar. This
    catches a peek at bar t+1, a statistic of the whole history, and randomness; it is a check, not a proof (a
    maximum reached before the first cut would pass).
- **Both entries on one bar** (a conflict) are both kept and shown (an amber square). The engine (B1) settles a
  conflict by the side whose trades **closed before that bar** earned the higher net annualised return (the user
  asked for the more profitable side per unit of time; only closed trades keep it causal), and takes neither while
  it cannot tell. The details (the minimum number of trades) are B1's.
- **The Strategy tab** (B0 scope): the profile picker (the chart moves to the profile's decision interval), the
  strategies of the profile (saved, examples, Python files), the rules in words or the file's parameters, the cap,
  the signals on the chart (`ChartEngine.setSignals`, merged with the indicator markers: an up arrow below the bar
  for a long entry, a down arrow above for a short entry, dots for exits, an amber square for a conflict) and their
  counts; save and delete. The rule builder is B2's.
- Deferred: the forecast P(up) filter (a causal per-bar forecast needs a rolling refit; B7's forecast-driven rules).

## Consequences
- + B1 receives four causal boolean arrays and a validated document; the engine never re-checks lookahead.
- + Python and rules strategies share one contract, one endpoint and one set of tests.
- − A Python strategy can do anything the user can; the lookahead check can miss a cleverly hidden peek.
- − Signals are computed on adjusted prices (the backtest's default) whatever the chart's ADJ setting; the times are
  the same.
