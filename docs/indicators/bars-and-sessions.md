# Bars and sessions

Every indicator in ChartLab is a function of bars, so what a bar *is* matters: which trades it summarises, which
clock stamps it, and which trading session it belongs to. This page describes the bars exactly as the backend builds
them (`backend/app/data/`: `sessions.py`, `resample.py`, `bar_service.py`) and how the chart shows them. Short
definitions of the terms are in the [Glossary](learn:glossary).

## A bar: OHLCV
A bar summarises all trades in one time interval (an hour, a session, a week, a month):

$$
O = p_{\text{first}}, \qquad H = \max_i p_i, \qquad L = \min_i p_i, \qquad C = p_{\text{last}}, \qquad V = \sum_i q_i.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $p_i$ | price of trade $i$ inside the interval | price |
| $q_i$ | size of trade $i$ | shares or contracts |
| $O,\ H,\ L,\ C$ | open, high, low, close of the bar | price, $L \le O, C \le H$ |
| $V$ | volume: everything traded in the interval | shares or contracts, $\ge 0$ |

The order of the trades inside a bar is lost: a bar does not say whether the high came before the low. Two
consequences run through every page: an indicator at bar $t$ may use the close of bar $t$ only if a decision is made
*at* that close (see [Lookahead and replay](learn:lookahead-and-replay)), and a level touched inside a bar may have been
touched before or after the bar's other extreme.

Every provider answer passes the same gate before it is cached (`validate.py`): bars sorted by time, duplicates
resolved (the last value wins), all prices finite and positive, $H \ge \max(O, C)$ and $L \le \min(O, C)$, [volume](glossary:volume)
finite and non-negative (indices and forex have no traded volume: their volume is 0). A bar that breaks a rule is
dropped and the response carries a warning.

## Two base intervals, three derived ones
The app downloads and caches two **base** intervals: `1D` (the full daily history) and `1h` (as far back as the
provider allows, about 730 days, and the cache keeps older hours it already has). The others are built from them on
every request:

| Interval | Built from | Rule |
|---|---|---|
| `1h` | downloaded | one bar per hour of the regular session |
| `4h` | `1h` | four-hour blocks counted from each session's first bar |
| `1D` | downloaded | one bar per session, as the provider labels it |
| `1W` | `1D` | ISO weeks (Monday to Sunday) |
| `1M` | `1D` | calendar months |

The range buttons pick an interval that fits the span: 1D, 5D, 1M and 3M show `1h` bars, 6M `4h`, YTD and 1Y `1D`, 5Y
`1W`, All `1M`.

## Time stamps: daily dates, intraday UTC
- **Daily, weekly and monthly bars** are stored at 00:00 UTC of their session date and reach the chart as a plain date
  string, `'YYYY-MM-DD'`. They have no clock time, so no time zone can shift them: the bar of 2026-03-02 is drawn on
  2026-03-02 everywhere.
- **Intraday bars** (`1h`, `4h`) are stored and sent as UTC epoch seconds of the bar's **open**. Only the chart layer
  (`ChartEngine`) shifts them to the display time zone, which is set in Settings (a fixed zone, Asia/Jerusalem by
  default, or the symbol's exchange zone). The offset is computed per bar, so a daylight-saving change in the middle of
  the history lands on the right bar.

A New York stock's first hourly bar opens at 09:30 New York time: 14:30 UTC in winter, 13:30 UTC in summer, and in
Jerusalem time whatever the two zones' offsets give that day. The bar is the same; only the label moves.

## Sessions
Every intraday bar belongs to one **trading session**, named by its **session date**: the date the provider gives
that session's daily bar. For a stock the session is one calendar day (09:30 to 16:00 New York, the regular session;
pre- and post-market bars are not loaded). Futures, the dollar index and forex trade through midnight, so their
session starts the evening *before* its date. The universe file sets that start, `session_start`, in New York time:
CME futures (`CL=F`, `GC=F`, `SI=F`) 18:00, the dollar index (`DX-Y.NYB`) 20:00, forex 17:00. Then

$$
\mathrm{session}_t =
\begin{cases}
\mathrm{date}(w_t) & \text{no session start} \\
\mathrm{date}(w_t + 24\,\mathrm{h} - s) & \text{session starts at } s
\end{cases}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\mathrm{session}_t$ | session date of bar $t$ | date |
| $w_t$ | wall-clock time of the bar's open in the exchange time zone | date and time |
| $s$ | session start (`session_start`) | time of day, e.g. 18:00 |
| $\mathrm{date}(\cdot)$ | the calendar date of a wall-clock time | date |

Adding $24\,\mathrm{h} - s$ moves the session start to midnight, so the whole session falls on one calendar date, the
next one. Examples (New York time; 2026-03-01 is a Sunday):

| Symbol | Session start | Bar opens at | Session date |
|---|---|---|---|
| AAPL | none | Mon 2026-03-02 09:30 | 2026-03-02 |
| GC=F | 18:00 | Sun 2026-03-01 18:00 | 2026-03-02 (Monday) |
| GC=F | 18:00 | Mon 2026-03-02 16:00 | 2026-03-02 |
| JPY=X | 17:00 | Mon 2026-03-02 17:00 | 2026-03-03 (Tuesday) |

The session date decides everything that is "per day" on intraday bars:
- [VWAP](learn:vwap) restarts at the first bar of each session.
- [Previous High/Low/Close](learn:previous-hlc) with period "day" takes the previous *session*, not the previous
  calendar day.
- Dividend adjustment of hourly bars uses the factor of the session's daily bar ([Adjusted prices](learn:adjusted-prices)).
- Date filters of the bars API (`start`, `end` and the cursor `until`) select whole sessions.

## Hourly and 4-hour bars
An hourly bar is stamped with its open. A US stock has seven a session: 09:30, 10:30, ..., 15:30, the last one only
half an hour long (it ends at the 16:00 close).

A 4-hour bar aggregates the hourly bars of one session in blocks counted from the session's **first bar**:

$$
\mathrm{block}_t = \left\lfloor \frac{\tau_t - \tau_{\text{first}(t)}}{4\,\mathrm{h}} \right\rfloor
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\mathrm{block}_t$ | index of the 4-hour block of bar $t$ inside its session | 0, 1, 2, ... |
| $\tau_t$ | open time of hourly bar $t$ | UTC seconds |
| $\tau_{\text{first}(t)}$ | open time of the first bar of the same session | UTC seconds |

Bars with the same session and block form one 4-hour bar (the aggregation rule is the one below). A US stock gets two
bars a session, 09:30 to 13:30 and 13:30 to 16:00; a CME future opening at 18:00 gets 18:00, 22:00, 02:00, 06:00, 10:00
and 14:00. Each is stamped with its first hourly bar's open. The 4-hour bars never straddle two sessions, and they
match the TradingView layout. One caveat: the anchor is the first bar the data *has* for that session, so a session
whose first hour is missing is anchored one hour later.

## Weekly and monthly bars
Daily bars are grouped by calendar period of their session date, ISO weeks (Monday to Sunday) or calendar months, and
each group of daily bars $s..e$ becomes one bar:

$$
O = O_s, \qquad H = \max_{s \le t \le e} H_t, \qquad L = \min_{s \le t \le e} L_t, \qquad C = C_e, \qquad V = \sum_{t=s}^{e} V_t.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $s,\ e$ | first and last daily bar of the period | bar index |
| $O_s$ | open of the first day | price |
| $C_e$ | close of the last day | price |
| $V$ | total volume of the period | shares |

The bar is keyed by the **first trading day** in the period, not the calendar start, as TradingView labels it. The
week of Martin Luther King Day 2025 (Monday 2025-01-20, markets closed) is the bar `2025-01-21`; September 2025, whose
first Monday was Labor Day, is the bar `2025-09-02`.

A period that is not over yet (the current week, or a week cut by the [replay](glossary:replay) cursor) is emitted with the days that
exist: a Wednesday cursor shows a weekly bar of Monday to Wednesday. Resampling therefore never looks ahead, and a
weekly bar keeps changing until its last day closes, exactly like the live bar on the right edge of any chart.

## Why a future's daily bar differs from a stock's
- **It covers more hours.** A stock's daily bar is the regular session, 09:30 to 16:00 New York. A CME future's daily
  bar is the electronic session that starts at 18:00 the evening before and ends at 17:00 on the session date, about 23
  hours. Its open is the evening open, so overnight news is *inside* the bar rather than in a gap between two bars:
  a future's daily bars gap less often, and by less, than a stock's (see [Gaps](learn:gaps)).
- **Its date is the trade date.** Sunday evening trading belongs to Monday's bar, and therefore to Monday's week.
- **It has no dividends.** ADJ changes only stocks and ETFs; a future's adjusted and raw bars are the same.
- **It is a chain of contracts.** `GC=F` and friends are continuous series: when the front contract rolls to the next
  one, the price can jump by the difference between the two contracts. That roll gap is an artefact of the chain,
  not a market move, and an indicator reads it as one.
- A cash index (`^GSPC`) opens near its previous close by construction, so its daily gaps are small too, while an ETF
  on the same index (`SPY`) gaps like a stock.

## The lab's hourly sessions
Every lab can run on hourly bars (`1h` in the data picker, or `"interval": "1h"` in the block). On a real symbol these
are the cached hourly bars with their sessions. On a synthetic [scenario](glossary:scenario) they are built from the same random close
path as the daily scenario, one bar per hour, **seven bars per business-day session stamped 14:30 to 20:30 UTC**
(09:30 to 15:30 New York in winter), with the session set so that VWAP and Previous High/Low/Close restart every
morning. The first bar of each session opens with an [overnight gap](glossary:gap) four times wider than the other bars' open
noise, and volume follows the intraday U shape: 1.8, 1.1, 0.8, 0.7, 0.8, 1.0 and 1.6 times the bar's base volume.

Honest caveat: the hourly sample is the daily path re-stamped, so each synthetic hour moves as much as a synthetic
day (1.5 % on `random_walk`). The session structure (resets, opening gaps, the volume profile) is realistic; the size
of an hourly move is not.

Below, an SMA on synthetic hourly bars. Length 7 averages exactly one session, 35 one week of five sessions:

```lab
{"kind": "param", "indicator": "sma", "vary": "length", "min": 1, "max": 70, "params": {"length": 7},
 "scenario": "random_walk", "interval": "1h"}
```

The SMA does not know about sessions: its window slides across the overnight gap. VWAP is the opposite, a running
average that starts again at every session's first bar (see the hourly labs on the [VWAP](learn:vwap) page).

## Pitfalls
- **"Daily" is the provider's session, not 24 hours.** Comparing the daily ranges of a stock and a future compares
  6.5 hours with 23.
- **Hourly history is short.** About two years of `1h` bars exist (more if the local cache kept older ones); a
  200-bar average on a stock's `4h` bars (two a session) needs about 100 sessions of [warm-up](glossary:warm-up) before the first value (see
  [Warm-up](learn:warm-up)).
- **The last bar is still forming.** The newest daily, weekly or monthly bar can change until its period closes; the
  cache re-downloads the last days on every refresh for that reason.
- **Time zone vs session.** The display time zone only relabels bars. Sessions, 4-hour blocks and VWAP resets are
  computed in the exchange's time zone, whatever the chart shows.

## Exercise
1. In the lab above, set the length to 7 and then to 8. With 7 the window always holds one bar of every hour of the
   day; with 8 it holds one hour twice. The synthetic sessions have no intraday seasonality in price, so the line
   barely changes, but on a real symbol with a strong opening move, which of the two lengths would show a
   once-a-day wiggle, and why?
2. Replay a gold-futures session and watch where the day starts:

```lab
{"kind": "replay", "symbol": "GC=F", "date": "2026-06-01", "interval": "1h",
 "indicators": [{"id": "vwap", "params": {}}, {"id": "prev_hlc", "params": {"period": "day"}}],
 "steps": ["Open Settings and set the display time zone to the exchange zone, so the bar times read in New York time.",
  "Start in Replay and step forward with Shift+Right until the bars stop after 16:00 and resume at 18:00.",
  "Watch VWAP and the previous-day lines on the 18:00 bar, and again at midnight.",
  "Exit the replay, switch to 4h and read the bar times of one session."],
 "reveal": "The 18:00 bar opens the session dated the next calendar day: VWAP starts again there and the previous-day high, low and close jump to the session that has just ended. Nothing happens at midnight. The 4h bars of a session start at 18:00, 22:00, 02:00, 06:00, 10:00 and 14:00, counted from the session's first bar, and the 14:00 bar holds only the three hours before the 17:00 break."}
```

More exercises: [Guided exercises](learn:guided-exercises).
