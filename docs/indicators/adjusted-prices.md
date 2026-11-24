# Adjusted prices

A company that splits its shares or pays a dividend changes its share price without changing what a shareholder
owns. A raw price chart shows those changes as moves, and every indicator reads them as moves. Adjusted prices rescale
the history so that the series measures what a holder actually earned. This page explains the factor ChartLab uses
(`backend/app/data/adjust.py`), the **ADJ** toggle in the bottom bar, and what adjustment does to indicators.

## Splits and dividends
- **Split.** In a 4-for-1 split each share becomes four shares worth a quarter as much. The price falls to a quarter
  overnight; nothing happened to the company. Providers deliver split-adjusted bars: every price before the split is
  divided by 4 and every volume multiplied by 4. ChartLab always uses these; there is no "unsplit" mode.
- **Dividend.** On the **ex-dividend date** the share starts trading without the right to the next dividend $D$, so
  its price drops by about $D$ at the open. The holder lost $D$ in price and gained $D$ in cash: no change in wealth.
  On a raw chart the drop looks like a small gap down, and on a long chart the raw price understates the total return
  by the dividend yield every year.

Splits are always adjusted; dividends are adjusted only when **ADJ** is on (the default).

## The dividend factor
Providers deliver split-adjusted open, high, low and close plus an **adjusted close** $\tilde C_t$ that also accounts
for dividends. The dividend factor of bar $t$ and the adjusted bar are

$$
f_t = \frac{\tilde C_t}{C_t},
\qquad
\bigl(\tilde O_t,\ \tilde H_t,\ \tilde L_t,\ \tilde C_t\bigr) = \bigl(f_t O_t,\ f_t H_t,\ f_t L_t,\ \tilde C_t\bigr),
\qquad
\tilde V_t = V_t.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $C_t$ | split-adjusted close of bar $t$ | price |
| $\tilde C_t$ | split- and dividend-adjusted close (from the provider) | price, $\le C_t$ |
| $f_t$ | dividend factor of bar $t$ | 0–1, equal to 1 after the last ex-dividend date |
| $O_t,\ H_t,\ L_t$ | split-adjusted open, high, low | price |
| $\tilde O_t,\ \tilde H_t,\ \tilde L_t$ | the same, dividend-adjusted | price |
| $V_t$, $\tilde V_t$ | volume, unchanged (dividends do not change share counts) | shares |

All four prices of a bar are scaled by the same $f_t$, so the bar keeps its shape: $L \le O, C \le H$ still holds and
every ratio inside the bar (range over close, body over range) is unchanged.

The provider builds $\tilde C_t$ with the usual multiplicative convention: each ex-dividend date scales everything
before it by one minus the dividend's share of the previous close,

$$
\tilde C_t = C_t \prod_{j\,:\,e_j > t} \left(1 - \frac{D_j}{C_{e_j - 1}}\right).
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $e_j$ | bar of the $j$-th ex-dividend date | bar index |
| $D_j$ | dividend per share that goes ex on bar $e_j$ | price, often 0.2–1 % of $C$ for a quarterly payer |
| $C_{e_j - 1}$ | close on the last day the share still carried the dividend | price |
| $\prod_{j\,:\,e_j > t}$ | product over every ex-dividend date **after** bar $t$ | — |

So $f_t$ is a step function of time: constant between two ex-dividend dates, one step down (going back in time) at
each of them.

## Why the last bar is unchanged
The product runs over ex-dividend dates *after* bar $t$. For the newest bar there are none, the product is empty and
$f = 1$: the adjusted price of today equals the price traded today. Adjustment always rewrites the **past**, never the
present.

That has two consequences:
- **Adjusted history depends on the download date.** Every new dividend multiplies all earlier bars by one more
  factor. A chart downloaded before and after an ex-dividend date shows different numbers for the same day in 2015.
  The cache notices: on a refresh, if the re-downloaded overlap disagrees with the cached bars, the whole history is
  downloaded again and the bars come with the warning "adjustment changed (split or dividend), full history
  re-downloaded".
- **Adjusted prices contain future information.** The adjusted close of a day in 2015 embeds every dividend paid
  from 2015 to today. Returns are unaffected (see below), but the price *level* is one nobody saw in 2015. See
  [Lookahead and replay](learn:lookahead-and-replay).

## A worked example
A stock closes at 51.00 on Wednesday. A dividend of $D = 0.80$ goes ex on Thursday. Then
$1 - D/C = 1 - 0.80/51.00 = 0.984314$, and every bar up to Wednesday is multiplied by it (illustrative numbers):

| Day | Raw open | Raw close | $f_t$ | Adjusted open | Adjusted close |
|---|---|---|---|---|---|
| Mon | 49.80 | 50.00 | 0.984314 | 49.0188 | 49.2157 |
| Tue | 50.10 | 50.50 | 0.984314 | 49.3141 | 49.7078 |
| Wed | 50.60 | 51.00 | 0.984314 | 49.8063 | 50.2000 |
| Thu (ex-date) | 50.25 | 50.20 | 1 | 50.25 | 50.20 |
| Fri | 50.30 | 50.70 | 1 | 50.30 | 50.70 |

What the two series say about Thursday:

| Measurement | Raw | Adjusted |
|---|---|---|
| Thursday's close-to-close log return | −1.58 % | 0.00 % |
| Thursday's opening gap from Wednesday's close | −1.47 % | +0.10 % |
| SMA 3 on Wednesday | 50.5000 | 49.7078 |
| SMA 3 on Thursday | 50.5667 | 50.0359 |
| Monday close to Friday close | +1.40 % | +3.02 % |

- On Thursday the stock closed exactly 0.80 below Wednesday, so a holder's wealth did not move: the adjusted return
  is 0.00 %, the raw one −1.58 %.
- The raw open is a 1.47 % gap down; the adjusted open is 0.10 % *above* the adjusted previous close. A gap scanner
  on raw prices reports a gap that is only the dividend.
- Monday to Wednesday, both series give the same returns (+1.98 %), and the adjusted SMA 3 on Wednesday is exactly
  $0.984314 \times 50.5000$: inside one dividend segment adjustment is a pure rescaling. The SMA on Thursday mixes
  two segments, so it is not a rescaling any more.
- A holder who bought at Monday's close made $(50.70 + 0.80)/50.00 - 1 = +3.00\,\%$. The adjusted series says
  +3.02 %, the raw one +1.40 %. The small residual is the adjusted series' implicit reinvestment of the dividend at
  Thursday's price.

## What adjustment does to indicators
Across an ex-dividend date $e$ the adjusted gross return is

$$
\frac{\tilde C_e}{\tilde C_{e-1}} = \frac{C_e}{C_{e-1} - D},
\qquad
\frac{C_e + D}{C_{e-1}} - \frac{C_e}{C_{e-1} - D} = -\frac{D\,\bigl(C_e - (C_{e-1} - D)\bigr)}{C_{e-1}\,(C_{e-1} - D)}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\tilde C_e / \tilde C_{e-1}$ | adjusted gross return over the ex-date | about 1 |
| $(C_e + D)/C_{e-1}$ | the holder's total gross return (price plus cash) | about 1 |
| $C_{e-1} - D$ | the previous close minus the dividend: the "fair" ex-dividend price | price |

The adjusted return measures the move from the fair ex-dividend price, and it differs from the holder's total return
only by a second-order term (the product of the dividend and the day's real move). Between ex-dates the factor is
constant, so:

- **Scale-free indicators** ([RSI](learn:rsi), [Stochastic](learn:stochastic), returns, %b, any ratio) are identical
  on raw and adjusted prices, except where their window contains an ex-date.
- **Price-level indicators** ([SMA](learn:sma), [EMA](learn:ema), [Bollinger Bands](learn:bollinger-bands),
  [ATR](learn:atr)) are scaled by $f$ when the whole window is inside one segment (they are scale-equivariant:
  $\mathrm{SMA}(f x) = f\,\mathrm{SMA}(x)$); windows across an ex-date differ by more. Recursive averages such as the
  EMA remember older segments for a long time.
- **On raw prices, every ex-date is a fake down-move.** RSI counts a loss of $D$, a moving average bends down, MACD
  ticks lower, a gap detector reports a gap, an event study counts a return of about $-D/C$. For a quarterly payer
  that is four small negative shocks a year, all on known dates.
- **Volume indicators** ([OBV](learn:obv), [Volume SMA](learn:volume-sma)) do not change: volume is not adjusted for
  dividends. OBV does read the *sign* of each close-to-close change, so on raw prices an ex-date day that was flat in
  wealth counts as a down day.

## Intraday bars
An hourly bar has no adjusted close of its own. ChartLab gives it the factor of its session's daily bar (see
[Bars and sessions](learn:bars-and-sessions)): every hour of a session is scaled like that session's daily bar, so
with ADJ on the last hourly close of a session equals the session's adjusted daily close. A session that has no daily
bar yet (today, before the daily refresh) takes the nearest earlier daily bar's factor. Only stocks and ETFs are
adjusted; indices, futures and forex pay no dividends, so for them ADJ changes nothing. If the daily bars cannot be
loaded, hourly bars are shown unadjusted with a warning.

## The ADJ toggle in the app
- **Bottom bar → ADJ** switches the chart between dividend-adjusted (on, the default) and split-adjusted only (off).
  Indicators, gaps and the Data Window follow the chart's bars.
- **Watchlist quotes** (last, change, 52-week range) always use unadjusted daily closes: they are about today's
  prices.
- **Labs on a real symbol** use adjusted bars.
- With ADJ off the history is fixed (a 2015 close stays the 2015 close), apart from splits, which are always applied
  to the whole history.

## Pitfalls
- **Adjusted levels are not traded levels.** A support at "100" drawn on adjusted 2015 prices was at a higher raw
  price in 2015. Round-number and previous-high arguments need raw prices.
- **The past moves.** Saved values of an indicator on adjusted prices go stale with every new dividend. Recompute
  instead of storing.
- **Mixing modes.** Comparing an indicator computed with ADJ on against levels noted with ADJ off (or against another
  platform with the opposite setting) shows differences that are only the factor.
- **High-yield and special dividends.** A large one-off dividend makes a large step in $f$. On raw prices it is a big
  "crash" on a known date; on adjusted prices it disappears. Check which one a signal fired on.

## Exercise
1. In the worked example, compute the raw and adjusted RSI change on Thursday by hand (up and down moves only): which
   one records a loss?
2. Replay SPY (a quarterly dividend payer) and switch ADJ while the replay runs:

```lab
{"kind": "replay", "symbol": "SPY", "date": "2020-02-19", "indicators": [{"id": "sma", "params": {"length": 50}}],
 "steps": ["Start in Replay and note the close of the cursor bar in the legend.",
  "Click ADJ in the bottom bar to switch it off. Note the close again and divide the adjusted close by the raw one: that ratio is the factor f of the cursor bar.",
  "Compare the SMA 50 in both modes: is its ratio the same factor?",
  "Exit the replay and compare the two modes on the newest bar."],
 "reveal": "With ADJ on, the February 2020 prices are lower than the prices actually traded then: they are scaled by every dividend SPY has paid from then until the day the history was downloaded, so they contain information from after the cursor. The SMA 50 has (almost) the same ratio, because all 50 bars of its window share nearly the same factor; only the dividends inside the window make a small difference. On the newest bar both modes agree: no dividend has gone ex after it."}
```

More exercises: [Guided exercises](learn:guided-exercises).
