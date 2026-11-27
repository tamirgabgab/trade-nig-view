# Synthetic symbols: invented series, how they are built

A synthetic symbol (`SYN:` and a name) is a series ChartLab makes up from a definition, then serves like a market
symbol: on the chart, in Compare, in a watchlist, in the Planner's mix. It is marked **SYN** wherever it is listed and
**Synthetic** on the chart, so an invented series is never read as a market. This page is how each kind is built.

## What it answers

*"What does a pure random walk look like on a chart, next to a real stock? How did dwelling prices move against the
S&P 500, on the same axis? What does a stock of 7 % a year, 18 % volatility and fat tails look like, and does my rule
still work on it?"*

Three kinds exist today:

- **A lab scenario**: one of the learn lab's eight scenarios (random walk, uptrend, range, reversal, shock,
  volatility regime, accumulation, regimes), from a seed, a first date, a first price and a length.
- **Dwelling prices**: the CBS dwelling price index (Israel from 1994, or a district from 2017-10) as the close,
  with a little noise around it.
- **Statistics (parametric)**: daily returns drawn from what you set: the expected yearly return, the yearly
  volatility, one of five families for the daily shock (normal, Student-t, uniform, Laplace, skew-normal), and three
  optional layers (memory, volatility clusters, jumps).

All have 1h, 4h, daily, weekly and monthly bars, Monday to Friday, seven 1h bars a day from 09:30 to 16:00 New York.

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

### The day's return: a parametric symbol

A parametric symbol draws each day's simple return $R_t$ from the statistics you set. With the layers off:

$$
C_t = C_{t-1}\,(1 + R_t), \qquad R_t = m + \sqrt{q}\, z_t, \qquad (1 + m)^N = 1 + \mu,
\qquad q = \frac{\sigma^2}{n}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $C_t$ | the day's close ($C_0 = P_0$, the first price) | price |
| $R_t$ | the day's simple return | about ±3 % |
| $\mu$ | the expected simple return of a year | −50 to 100 %, 7 % by default |
| $\sigma$ | the yearly volatility: the standard deviation of a year's summed daily returns | 1 to 100 %, 18 % by default |
| $N$ | the bars in an average year, 365.25 × 5/7 weekdays | 260.89 |
| $n$ | $N$ rounded: the days a year's sum adds up | 261 |
| $m$ | the daily mean that compounds to $\mu$ over $N$ bars | % a day |
| $q$ | the shock's daily variance | (% a day)² |
| $z_t$ | the day's shock, mean 0 and variance 1, from the family you pick | about −3 to 3 |

The shocks have mean 0 and the days are independent, so $E\big[\prod_t (1 + R_t)\big] = (1 + m)^N = 1 + \mu$ exactly
over a year: $\mu$ is the expected simple return of a year, an average over many paths (a typical path earns less,
by about $\sigma^2/2$ in log terms).

### The shocks: five families

Each family is drawn, then shifted and scaled to mean 0 and variance 1, so $\sigma$ alone sets the spread and the
family only the shape:

$$
z^{t} = t_\nu \sqrt{\frac{\nu - 2}{\nu}}, \qquad z^{U} \sim U(-\sqrt3, \sqrt3), \qquad
z^{L} \sim \operatorname{Laplace}\big(0, 1/\sqrt2\big), \qquad
z^{SN} = \frac{\delta\, \lvert u_0 \rvert + \sqrt{1 - \delta^2}\, u_1 - \delta\sqrt{2/\pi}}{\sqrt{1 - 2\delta^2/\pi}},
\quad \delta = \frac{\alpha}{\sqrt{1 + \alpha^2}}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $t_\nu$ | a Student-t draw with $\nu$ degrees of freedom (variance $\nu/(\nu-2)$ before scaling) | about −5 to 5 |
| $\nu$ | degrees of freedom: the lower, the fatter the tails; above 2 for a finite variance | 2 to 100, 5 by default |
| $U(a, b)$ | uniform between $a$ and $b$ | — |
| $\operatorname{Laplace}(0, s)$ | the double exponential of scale $s$ (variance $2s^2$) | — |
| $\alpha$ | the skew-normal's shape: negative, a long left tail | −20 to 20, −4 by default |
| $\delta$ | $\alpha / \sqrt{1 + \alpha^2}$ | −1 to 1 |
| $u_0$, $u_1$ | two standard normal draws | about −3 to 3 |

What each family gives the daily shock (with $b = \delta\sqrt{2/\pi}$):

| Family | Shape | Skewness | Excess kurtosis |
|---|---|---|---|
| Normal | the bell curve, thin tails | 0 | 0 |
| Student-t | more quiet days and more huge ones | 0 | $6/(\nu - 4)$; infinite for $\nu \le 4$ |
| Uniform | a flat band, nothing beyond it | 0 | −1.2 |
| Laplace | a sharp peak, exponential tails | 0 | 3 |
| Skew-normal | lopsided, at most about ±1 of skewness | $\frac{4 - \pi}{2}\, b^3 / (1 - b^2)^{3/2}$ | $2(\pi - 3)\, b^4 / (1 - b^2)^2$ |

### The layers: memory, volatility clusters, jumps

Three layers can sit on the shocks, each off by default:

$$
R_t = m + D_t + J_t, \qquad D_t = \varphi\, D_{t-1} + e_t, \qquad e_t = \sqrt{h_t}\, z_t, \qquad
h_{t+1} = q\,(1 - a - b) + a\, e_t^2 + b\, h_t
$$

$$
J_t = k_t\, \mu_J + \sqrt{k_t}\, \sigma_J\, y_t - \frac{\lambda}{N}\, \mu_J,
\qquad k_t \sim \operatorname{Poisson}(\lambda / N)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $D_t$ | the diffusion: the day's move without jumps ($D_0 = e_0 / \sqrt{1 - \varphi^2}$) | % a day |
| $\varphi$ | memory, AR(1): the share of yesterday's move carried into today | −0.9 to 0.9, 0 by default |
| $e_t$ | the day's innovation | % a day |
| $h_t$ | its variance, GARCH(1,1), from its long-run value ($h_0 = q$) | (% a day)² |
| $a$, $b$ | GARCH: how much a big day raises the next day's variance, and how long that lasts ($a + b < 1$) | 0 to 0.5; 0 to 0.99 |
| $J_t$ | the day's jumps, less their expected sum (compensated, so they do not move $\mu$) | % |
| $k_t$ | the jumps that day | 0, rarely 1 |
| $\lambda$ | jumps a year | 0 to 50, 0 by default |
| $\mu_J$, $\sigma_J$ | a jump's mean and standard deviation | −5 % and 5 % by default |
| $y_t$ | a standard normal draw for the jump's size | about −3 to 3 |

The layers keep $\mu$ and $\sigma$: the jumps take their share of a year's variance, the diffusion the rest, and
memory spreads the diffusion's share over the year's covariances:

$$
\sigma^2 = \lambda\,(\mu_J^2 + \sigma_J^2) + \gamma_0 K, \qquad K = n + 2C, \qquad
C = \sum_{k=1}^{n-1} (n - k)\, \varphi^k, \qquad q = \gamma_0\,(1 - \varphi^2), \qquad
(1 + m)^N = \frac{1 + \mu}{1 + \gamma_0 C / (1 + m_0)^2}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\gamma_0$ | the diffusion's daily variance | (% a day)² |
| $K$ | a year's variance of the diffusion, in units of $\gamma_0$: $n$ without memory | about $n(1+\varphi)/(1-\varphi)$ |
| $C$ | the year's covariances between days, in units of $\gamma_0$ | 0 without memory |
| $m_0$ | the daily mean without memory, $(1 + m_0)^N = 1 + \mu$ | % a day |

Without memory the diffusion and the jumps are martingale differences, and $\mu$ holds exactly; with memory the
year's covariances enter the product of the days, and $m$ holds $\mu$ to second order. GARCH moves the variance from
day to day around $q$, not its average, so $\sigma$ holds with it too.

### Exact in this path, and the floor

By default $\mu$ and $\sigma$ are what the path is drawn from: one path lands near them, not on them. **Exact in this
path** shifts and scales the whole path so its own daily mean and standard deviation are the targets:

$$
R_t \leftarrow m + (R_t - \bar R)\,\frac{s}{\hat s}, \qquad
s^2 = \gamma_0 + \frac{\lambda}{N}\,(\mu_J^2 + \sigma_J^2), \qquad 1 + R_t \ge 0.01
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\bar R$, $\hat s$ | the path's own mean and standard deviation of its daily returns | % a day |
| $s$ | the targeted daily standard deviation | % a day |

The shape, the clusters and the jumps stay, scaled. Since the whole path sets $\bar R$ and $\hat s$, a longer exact
path is not the shorter one extended (without Exact, it is). The last rule is the **floor**: a day falls 99 % at
most. With sane statistics it never binds; the dialog's preview counts the days it does.

### The hours and the bars

A day's seven 1h bars run from its open to its close along a second bridge scaled by the day's volatility, with
wicks drawn around each; the daily bar is their aggregate. For dwelling prices the open is the last close moved by a
small gap, $O_d = C_{d-1}\,e^{\eta_d \sigma / 4}$, and there is no volume.

$$
H = \max_h H_h, \qquad L = \min_h L_h, \qquad O = O_{h=1}, \qquad C = C_{h=7}
$$

For a parametric symbol the hours use the day's diffusion standard deviation $\sqrt{h_t}$, the day's jumps show as a
gap at the open, and the volume grows with the day's move:

$$
O_t = C_{t-1}\, e^{\eta_t \sqrt{h_t} / 4}\, \max\big(1 + k_t \mu_J + \sqrt{k_t}\, \sigma_J\, y_t,\ 0.05\big),
\qquad V_t = V_0\, e^{0.3\, \xi_t + 20\, \lvert \ln (C_t / C_{t-1}) \rvert}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $V_t$, $V_0$ | the day's volume, and its base | shares |
| $\xi_t$ | a standard normal draw of the day (the volume's own noise) | about −3 to 3 |
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

A parametric symbol with the defaults, $\mu = 7\,\%$, $\sigma = 18\,\%$, normal, no layers:

- **The day**: $N = 260.89$ and $n = 261$, so $m = 1.07^{1/N} - 1 = 0.0259\,\%$ a day and
  $\sqrt{q} = 18\,\% / \sqrt{261} = 1.114\,\%$ a day. A day with $z = -2$ returns
  $0.0259\,\% - 2 \cdot 1.114\,\% = -2.20\,\%$: from 100 to 97.80.
- **Student-t** with $\nu = 5$: each draw is multiplied by $\sqrt{3/5} = 0.775$, so its variance is 1 again, and
  its excess kurtosis is $6 / (5 - 4) = 6$.
- **Memory** $\varphi = 0.3$: $K = 483.5$ instead of 261, so the daily standard deviation falls to
  $18\,\% / \sqrt{483.5} = 0.819\,\%$ (days that follow each other add up to more over a year) and $m$ to
  $0.0231\,\%$.
- **Jumps**, 4 a year of $N(-6\,\%, 4\,\%)$: they carry $4 \cdot (0.06^2 + 0.04^2) = 0.0208$ of
  $\sigma^2 = 0.0324$; the diffusion keeps 0.0116 ($10.8\,\%$ a year, $0.667\,\%$ a day), and every day adds back
  $4 / N \cdot 6\,\% = 0.092\,\%$.

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
- **A parametric symbol's $\mu$ is an average over many paths.** One path of ten years can end far from it: a year's
  return spreads by about $\sigma$. For a path whose own numbers are the targets, pick *Exact in this path*.
- **The family shapes the days, not the years**: summed over a year, fat-tailed days mostly average out, unless
  GARCH keeps big days together. The preview's drawn skewness and kurtosis are the days'; the asked ones are the
  family's, and the layers add their own (negative jumps add negative skewness and kurtosis).
- **A Student-t with $\nu \le 4$ has no finite kurtosis**: the drawn kurtosis grows with the path instead of
  settling, and the preview shows ∞ as the asked value.
- **With memory, $\sigma$ is a whole year's spread**: the daily moves are smaller ($\varphi > 0$) or larger
  ($\varphi < 0$) than $\sigma / \sqrt{N}$, and the preview's "daily σ × √year" differs from $\sigma$ on purpose.

## Where it comes from

The scenarios are the learn lab's (`app/analysis/synthetic.py`). The index is the CBS dwelling price index, which the
Bank of Israel republishes (`app/macro`). The bridge is the standard construction of a Brownian motion pinned at both
ends: for a walk $W$ over $\tau$ steps, $W_k - \frac{k}{\tau} W_\tau$ is independent of $W_\tau$, starts and ends at
zero, and has the variance above. The same bridge, at the scale of hours, runs each day from its open to its close.

The parametric families and layers are the textbook ones: Student's t (W. S. Gosset, 1908), the skew-normal
(A. Azzalini, 1985), jumps on a diffusion (R. C. Merton, 1976), GARCH(1,1) volatility clusters (T. Bollerslev,
1986) and the AR(1) process. The variance of a year's sum of an AR(1) is the sum of its autocovariances
$\gamma_0 \varphi^{\lvert i - j \rvert}$ over every pair of days, which is $\gamma_0 K$.

## Limits

- A dwelling symbol is no apartment: no rent, no costs, no taxes, and a far smoother path than a single home.
- The causal series assumes one publication lag for every month; the real dates move around it.
- The CBS revises its latest months: the end of a dwelling symbol can change when it does.
- A parametric symbol has the statistics you give it and nothing else: no earnings, no regimes beyond GARCH's
  clusters, no link to any market. Its volume is invented from its moves.
- With memory, $\mu$ holds to second order; Exact makes the path's own numbers the targets but changes every bar
  when the length changes.
- The intraday bars of every kind are invented; a dwelling symbol's hours carry nothing at all.
- The calendar is Monday to Friday, without holidays.
