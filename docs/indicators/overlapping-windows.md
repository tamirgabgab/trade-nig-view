# Overlapping windows

"Run history" does not ask what the plan would have done once. It starts the same plan on every month history
allows, and reports how often each option won. This page explains that count, and why it is worth far fewer
independent tries than it looks.

## What it answers

*"Had I started this plan in any month of the past, how often would the apartment have ended ahead of the
market?"*

One past start is one story. Hundreds of starts show whether the answer depends on *when*. But a 10-year plan that
starts in January 2005 and one that starts in February 2005 live through 119 of the same 120 months: they are
almost the same story told twice.

## Formula

### The windows

A **window** is the plan moved in time by whole months: every date of both options shifts together. With starts
spread over $S$ months, one every `step` months, there are

$$
N = \frac{S}{\text{step}} + 1
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $N$ | the number of windows | tens to hundreds |
| $S$ | the span of the starts: from the first start to the last | months |
| $\text{step}$ | the field "A start every" | 1, 3, 6 or 12 months |

Each window $w$ gives a pair of end values, $W_A^{(w)}$ and $W_B^{(w)}$, by [the same money rule](learn:same-money).

### How often A wins

$$
\begin{aligned}
P(A > B) &= \frac{1}{N} \sum_{w=1}^{N} \mathbb{1}^{(w)} \\[4pt]
\mathbb{1}^{(w)} &= \begin{cases} 1 & W_A^{(w)} > W_B^{(w)} \\ \tfrac12 & W_A^{(w)} = W_B^{(w)} \\ 0 & W_A^{(w)} < W_B^{(w)} \end{cases}
\end{aligned}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $W_A^{(w)},\ W_B^{(w)}$ | the end values of the two options in window $w$ | ₪ |
| $\mathbb{1}^{(w)}$ | the score of window $w$: a win, half for a tie, nothing for a loss | 0, ½ or 1 |
| $P(A > B)$ | the share of windows option A won | 0 % to 100 % |

A tie counts as half so that two identical options score exactly 50 %.

### How many independent terms

$$
n_{\text{eff}} = \frac{S + T}{T}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $T$ | the term of the plan | months |
| $S + T$ | the stretch of history the windows cover together: from the first start to the last end | months |
| $n_{\text{eff}}$ | about how many separate, non-overlapping terms of length $T$ that stretch holds | usually 1 to 5 |

### The rates of a window

The rates typed into the Apartment tab are today's quotes. With "Move the tracks' rates" ticked, a window that
starts in the past gets the rates of its own day:

$$
q^{(w)} = q + \mathrm{BoI}(\text{start of window } w) - \mathrm{BoI}(\text{today})
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $q$ | the rate typed in for a fixed or a variable track that is not CPI-linked | per year |
| $q^{(w)}$ | the rate that track gets in window $w$ | per year |
| $\mathrm{BoI}(\cdot)$ | the Bank of Israel rate on a day; "today" is the last published one | per year |

Prime tracks follow the Bank of Israel rate by themselves, and linked tracks keep their real rate.

## Worked example

**Counting.** A 10-year plan ($T = 120$), started every month from January 1995 to January 2015: $S = 240$, so
$N = 241$ windows. But

$$
n_{\text{eff}} = \frac{240 + 120}{120} = 3.0
$$

The 241 windows hold about **three** independent decades.

**The probability.** Five windows end with differences $W_A - W_B$ of +5, +3, −2, 0 and +4 (thousand shekels).
Three wins, one tie, one loss: $P(A > B) = (1 + 1 + 0 + \tfrac12 + 1) / 5 =$ **70 %**.

**The rates.** A fixed track quoted today at 4.6 %, with the Bank of Israel rate at 4.5 % today. A window that
starts when it was 10 % gets $4.6 + 10 - 4.5 =$ 10.1 %.

## How to read it

- **Read $P(A > B)$ together with "Independent terms".** 70 % of 241 windows sounds like strong evidence. 70 % of
  three decades is "two of three, roughly": one unusual decade moves it a lot.
- **The median difference** is the middle window's $W_A - W_B$. Half the starts did better for A than that, half
  worse. "Real" is in shekels of each window's first day.
- **The win map** shows the same thing by start year and by horizon. A column that changes colour as you go down
  says the answer depended on when you started; a row that changes colour says it depended on how long you held.
- **"Earlier starts cannot run"** names what stopped the windows: usually the youngest asset of the mix, or the
  start of a macro series.
- **The window of the plan's own day** differs from the plan as entered when the rates move with history, unless
  that day is today.

## Where it comes from

**Why overlapping windows are not independent.** Write a window's result as a sum of the $T$ monthly returns it
lives through, and suppose the months themselves are independent with variance $\omega^2$ each. A window has
variance $T\omega^2$. Two windows that start $j$ months apart share $T - j$ months, so their covariance is
$(T - j)\omega^2$ and their correlation is

$$
\rho_j = \frac{T - j}{T} \qquad (0 \le j \le T)
$$

For $T = 120$, neighbouring windows ($j = 1$) correlate at 0.992, and windows two years apart at 0.80. Only windows
at least $T$ months apart share nothing.

**Why $(S + T)/T$.** All the windows together look at $S + T$ months of history. However they are cut, those months
hold only $(S + T)/T$ stretches of length $T$ that do not overlap. More starts inside the same stretch add
smoothness, not information.

**A rough gauge of the uncertainty.** If the $n_{\text{eff}}$ terms were independent coin flips with chance $p$,
the standard error of the share won would be

$$
\sqrt{\frac{p\,(1 - p)}{n_{\text{eff}}}}
$$

With $p = 0.7$ and $n_{\text{eff}} = 3$ that is 0.26: the 70 % could as well be 45 % or 95 %. It is a gauge, not an
interval: three terms are far too few for the formula to be exact.

## Limits

- **History is one path.** Every window is cut from the same few decades, with their one great fall of rates and
  their one long rise of prices. The windows cannot show a future unlike that past.
- **The same shekel amounts in every window.** The price, the rent and the deposits are not rescaled to each era,
  so the ratios (rent to price, tax to price) are the plan's own in every window. There is no historical rent
  series.
- **The linear betterment rule is off** in a window: it depends on the calendar date 2014-01-01, and a window
  stands for a plan that starts today.
- **A window never runs past the published data.** A series that would have to be held flat ends the windows, so
  the last starts stop one term before today.
