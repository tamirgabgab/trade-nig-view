# Synthetic symbols: invented series, how they are built

A synthetic symbol (`SYN:` and a name) is a series ChartLab makes up from a definition, then serves like a market
symbol: on the chart, in Compare, in a watchlist, in the Planner's mix. It is marked **SYN** wherever it is listed and
**Synthetic** on the chart, so an invented series is never read as a market. This page is how each kind is built.

## What it answers

*"What does a pure random walk look like on a chart, next to a real stock? How did dwelling prices move against the
S&P 500, on the same axis? Does my rule still work on a series with the same statistics but another history?"*

Two kinds exist today:

- **A lab scenario**: one of the learn lab's eight scenarios (random walk, uptrend, range, reversal, shock,
  volatility regime, accumulation, regimes), from a seed, a first date, a first price and a length.
- **Dwelling prices**: the CBS dwelling price index (Israel from 1994, or a district from 2017-10) as the close,
  with a little noise around it.

Both have 1h, 4h, daily, weekly and monthly bars, Monday to Friday, seven 1h bars a day from 09:30 to 16:00 New York.

## Formula

### The day's close: a lab scenario

The daily close follows the scenario's own recursion in the learn lab, with the first price in place of 100:

$$
C_t = P_0\, e^{d_t}, \qquad O_t = C_{t-1}\, J_t\, e^{\eta_t \sigma_t / 4}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $t$ | the day, counted from the first one | 0 to 9,999 |
| $C_t$, $O_t$ | the day's close and open | price |
| $P_0$ | the first price you set ($C_{-1} = P_0$) | 100 by default |
| $d_t$ | the scenario's log path: the drift, volatility, mean reversion or regimes it is named for | log points |
| $\sigma_t$ | the scenario's daily volatility on day $t$ | 0.008 to 0.03 |
| $J_t$ | the shock scenario's jump (0.85 on its one day, 1 elsewhere) | 0.85 or 1 |
| $\eta_t$ | a standard normal draw of the day (the overnight gap) | about −3 to 3 |

### The day's close: dwelling prices

The index has a value $I_j$ on each month date $M_j$ (the first of the month). Its first value is put at the first
price, so every close is $P_0$ times the index over its first value. Between two **anchors** $A_j$ and $E_j$ the log
close runs from $a_j$ to $b_j$ in steps of weekdays (the bars' time), plus a noise $\beta$ that is zero on every
anchor. An anchor on a weekend lands on the next weekday, so every value of the index is a close:

$$
\ln C_d = a_j + \frac{k}{\tau_j}\,(b_j - a_j) + \beta_{j,k},
\qquad \lambda_j = \ln P_0 + \ln\frac{I_j}{I_0}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $d$, $k$ | a weekday with a bar, and the weekdays from $A_j$ to it | a date; 0 to $\tau_j - 1$ |
| $\tau_j$ | the weekdays from $A_j$ to $E_j$ | about 21 to 23 |
| $C_d$ | that day's close | ₪ |
| $I_j$, $M_j$ | the index's value for month $j$ and its date (the first of the month) | index points; a date |
| $I_0$ | the index's first value | index points |
| $\lambda_j$ | month $j$'s value as a log price | log ₪ |
| $A_j$, $E_j$ | the segment's start and end anchors | dates |
| $a_j$, $b_j$ | the log close at the two anchors | log ₪ |
| $\beta_{j,k}$ | the noise on the segment's $k$-th weekday (next section) | log points, about ±1 % |

**Interpolated** (the default): $A_j = M_j$, $E_j = M_{j+1}$, $a_j = \lambda_j$, $b_j = \lambda_{j+1}$. The close runs
geometrically from one month's value to the next, as the Planner reads the index between month dates (counted in
weekdays here, in days there). A day in January already uses February's value: the series **looks ahead**.

**Causal**: $A_j$ is the date month $j$'s value is assumed to be published, $L$ months after $M_j$, $E_j = A_{j+1}$,
and $a_j = b_j = \lambda_j$. Each value holds from its publication to the next one, and no bar falls on or after today.
No day uses a value published after it. Past the last value in the data, it holds until yesterday; a value that
arrives after its assumed publication then rewrites the bars from that publication (they held the previous one), so
set the lag at least as long as the real one.

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $L$ | the assumed publication lag (the data carries no publication dates) | months, 0 to 12, 2 by default |

### The noise: a bridge back to the index

On the $k$-th weekday of a segment of $\tau_j$ weekdays, the noise is a Brownian bridge: a random walk of daily step
$\sigma$, with its own end pulled back to zero, so the close lands exactly on the index on every anchor.

$$
\beta_{j,k} = W_k - \frac{k}{\tau_j}\,W_{\tau_j}, \qquad W_k = \sigma \sum_{i=1}^{k} z_i,
\qquad \operatorname{Var}\,\beta_{j,k} = \sigma^2\,\frac{k\,(\tau_j - k)}{\tau_j}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $k$ | the weekday's place in its segment, from 0 (the anchor) | 0 to $\tau_j - 1$ |
| $\tau_j$ | the weekdays in the segment | about 21 to 23 |
| $\sigma$ | the noise: its daily standard deviation | 0 to 5 %, 0.2 % by default |
| $W_k$ | the walk after $k$ steps | log points |
| $z_i$ | standard normal draws, the segment's own (seeded by the seed and $j$) | about −3 to 3 |

Each segment draws its own numbers, so a month added to the data leaves every earlier bar as it was. With
$\sigma = 0$ the close is the plain interpolation (or the plain steps).

### The hours and the bars

A day's seven 1h bars run from its open to its close along a second bridge scaled by the day's volatility, with
wicks drawn around each; the daily bar is their aggregate. For dwelling prices the open is the last close moved by a
small gap, $O_d = C_{d-1}\,e^{\eta_d \sigma / 4}$, and there is no volume.

$$
H = \max_h H_h, \qquad L = \min_h L_h, \qquad O = O_{h=1}, \qquad C = C_{h=7}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $h$ | the day's 1h bar, 1 (09:30) to 7 (15:30, half an hour) | 1 to 7 |
| $O_h$, $H_h$, $L_h$, $C_h$ | that bar's open, high, low and close | price |
| $O$, $H$, $L$, $C$ | the daily bar | price |

## Worked example

The national index was 117.2 for January 1994 (dated 1994-01-01) and 119.6 for February (1994-02-01). With a first
price of 100 and no noise:

- **Interpolated**: 1994-01-01 was a Saturday, so January's value is the close of Monday 1994-01-03, 100.00. On
  Monday 1994-01-17, 10 of January's 21 weekdays in, $C = 100 \cdot (119.6 / 117.2)^{10/21} = 100.97$. On
  1994-02-01 the close is February's value exactly, $100 \cdot 119.6 / 117.2 = 102.05$.
- **Causal** with a lag of two months: January's value, 100.00, holds from 1994-03-01 to 1994-03-31; February's,
  102.05, from 1994-04-01.
- **The noise** at 0.2 % a day, in a month of $\tau = 22$ weekdays, is widest in the middle: at $k = 11$ its
  standard deviation is $0.2\,\% \cdot \sqrt{11 \cdot 11 / 22} \approx 0.47\,\%$, and it is 0 on the month dates.

## How to read it

- **Only the close of a dwelling symbol carries information**, and only on the month dates (interpolated) or the
  publication dates (causal). Everything between them, the noise, and the range of every bar are invented.
- **Interpolated looks ahead**: fine for looking and comparing, not for testing a rule. For a replay or a backtest,
  use causal: a rule then sees each value only from its publication.
- **The index is smooth**: an average over many sales, adjusted for quality. Its volatility is far below what one
  apartment does, so a chart of it understates the risk of owning one.
- **No rent**: the close is the price alone. As an asset in the Planner's mix it shows what owning without renting
  out would have gained, not the whole return of an apartment ([the apartment's ledger](learn:rent-or-buy)).
- A lab scenario is the learn lab's, so what each one shows is told there; the same seed gives another path here,
  because the bars are built from hours.

## Where it comes from

The scenarios are the learn lab's (`app/analysis/synthetic.py`). The index is the CBS dwelling price index, which the
Bank of Israel republishes (`app/macro`). The bridge is the standard construction of a Brownian motion pinned at both
ends: for a walk $W$ over $\tau$ steps, $W_k - \frac{k}{\tau} W_\tau$ is independent of $W_\tau$, starts and ends at
zero, and has the variance above. The same bridge, at the scale of hours, runs each day from its open to its close.

## Limits

- A dwelling symbol is no apartment: no rent, no costs, no taxes, and a far smoother path than a single home.
- The causal series assumes one publication lag for every month; the real dates move around it.
- The CBS revises its latest months: the end of a dwelling symbol can change when it does.
- The intraday bars of both kinds are invented; a dwelling symbol's hours carry nothing at all.
- The calendar is Monday to Friday, without holidays.
