# ADR 0037 — The backtest engine: fills, exits, decisions and metrics (B1)

- Status: Accepted (2026-11-28)

## Context
B1 (`docs/PHASE4_PLAN.md`) turns the causal signals of B0 (ADR 0036) into trades on one symbol. Before B1 the user
chose (2026-11-28): an opposite entry while in a position is decided from the past, with a hindsight ceiling shown
beside it; until 5 windows have ended it reverses; a conflict waits for 5 closed trades on each side; the whole
equity in each trade, compounding; a simple cost per fill from now on; a minimal results table; a risk-free rate of
0.

## Decision
- **A bar loop in Python** (`app/backtest/engine.py`): 25 years of daily bars in about 7 ms, so no vectorising yet.
  Every rule is in the module docstring, with formulas.
- **Fills:** a decision at the close of bar t fills at the open of t+1. An entry is refused at its open when the
  profile's trade cap for that bar's period (day, ISO week, month, year in the exchange calendar) is used up, and
  the refusal is counted. Exits are never refused.
- **Size and costs:** an entry takes the whole equity as its notional; every fill pays `cost` times its traded value
  (commission and slippage together, 0.05 % by default). A long round trip from p to q returns
  `(1 - c) q / p - c - 1`, a short one `1 - c - (1 + c) q / p`. A short that loses the whole equity is closed and
  trading stops ("ruin").
- **Exits inside a bar:** stop, target and trailing stop levels from the fill price, in % or in ATR multiples (the
  ATR of the signal bar; none while the ATR is in warm-up). The open first: a gap through a level fills at the open.
  When the stop and the target are both inside one bar, the stop fills. The trailing level moves by each bar's
  extreme only after that bar. A position opened at an open can be stopped in that bar. MAE and MFE count the exit
  bar's range.
- **At the close:** the Day profile is flat at the close of the bar that ends at the cash session's close
  (`cash_hours`, `friday_hours`, else US 09:30-16:00) and opens nothing that would fill in its last 15 minutes. An
  early close is not in any calendar here, so a position still held when a new session starts is closed at its first
  open. Markets without a cash session have no session end.
- **Signals in a position:** its own exit or the time stop closes it; with an opposite entry on the same bar it
  reverses (the strategy asked for both). An opposite entry alone (with `exits.on_opposite`) is a **reversal
  decision**: reverse, close or hold. Each earlier opposite entry whose window of H bars has ended is scored, from the
  next open to the close H bars on: hold `ln g` for the held side, close `ln(1 - c)`, reverse `2 ln(1 - c)` plus the
  other side's growth (for a short, `ln(2 - g)`). The best mean decides once `decide_after` (5) windows have ended;
  before, it reverses. H is a parameter, by default the profile's long horizon in decision bars (Day 12, Swing 70,
  Position 20, Long-term 12). The ranking is by mean log growth; the scores are shown as net annual returns.
- **A conflict while flat:** the side whose closed trades earned the higher net annual return,
  `exp(sum ln(1 + r) / sum bars * B) - 1`, once each side has `decide_after` closed trades; neither before, and
  neither on a tie. While in a position, both entries on one bar cancel (it holds).
- **Hindsight ceiling:** the same run with every reversal and conflict decided by its own future window (a conflict
  takes no side if neither would gain). It is labelled as not achievable and only its net profit, total return and
  annual return are returned.
- **End of the data:** a position still open is closed at the last close, with its cost, and flagged.
- **Metrics** (`app/backtest/metrics.py`, net): net profit, total return, CAGR over calendar years (the net annual
  return), volatility, Sharpe and Sortino (risk-free 0) with the bars a year of the data, max drawdown and its
  longest run under water, Calmar, win rate, profit factor, expectancy, average R (trades with a stop), exposure.
  A deviation under 1e-12 is rounding, not risk: no Sharpe for a constant return.
- **Buy-and-hold** over the same bars: bought at the first traded bar's open, sold at the last close, both fills
  paying the same cost.
- **`POST /api/backtest`**: the strategy (inline), `start`, `until`, and settings (capital 100,000, cost % a fill,
  `decide_after`, H). Signals are computed on the whole history (`/strategies/signals`, shared code), the engine
  trades from `start`. The answer has both metric sets, the ceiling, the decisions (with the action scores), the
  trades and the equity curves (B2 draws them).
- **The Strategy tab** gets a Backtest section: capital, cost, Run, and the table of the strategy beside
  buy-and-hold, the ceiling and the decisions in one line each.
- **Tests:** a golden model written from these rules (`tests/golden/backtest_model.py`), equal to 1e-9 on every bar
  and trade over 400 random cases (signals, exits, costs, caps, session flags, both decision modes); six mutations of
  the engine (target before stop, the trail moved before the check, the cap off by one, `decide_after` off by one,
  the ATR of the fill bar, a short hindsight window) are all caught. Directed scenarios computed by hand; properties:
  a run cut at bar k equals the full run before k, the final equity is the product of the trades, determinism, a
  strategy that never trades keeps its cash.

## Consequences
- + Every number is net of a stated cost from the first round, as the user asked.
- + The reversal and conflict rules learn only from what has closed, so the backtest stays causal; the ceiling shows
  how much a perfect decision would add, without ever entering the results.
- − Whole-equity sizing with a short can lose more than the equity in a gap; it is caught as "ruin". B3 brings the
  other sizing rules.
- − The decision score uses a fixed window, not the actual trade that would follow; it is a heuristic, stated as one.
- − Early-close days are guessed late (the next open), and fractional units are allowed (B3 may round them).
