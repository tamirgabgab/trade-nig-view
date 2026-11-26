"""Layer 2 of the comparison metrics: how risky each option is (``docs/HOME_VS_MARKET_PLAN.md``).

Pure functions on arrays: the end values (or returns) of an option over many realizations, or
one realization's path. They do not care where the realizations come from.

**The bad tail** of :math:`n` values :math:`v`:

* percentiles by linear interpolation between the order statistics;
* :math:`\\text{CVaR}_\\alpha`: the mean of the worst :math:`\\lceil \\alpha n \\rceil` values
  (at least one), so it is never above the :math:`\\alpha` percentile;
* the chance of ending below the money put in, :math:`P(W < \\sum b)`.

Variance alone would also punish good surprises.

**Regret** of choosing X when Y was there: :math:`\\max(Y - X, 0)` in each realization; its mean
and its 95 % percentile.

**Stochastic dominance** between two samples of equal size, by their order statistics
:math:`x_{(1)} \\le \\dots \\le x_{(n)}`:

* first order: :math:`x_{(i)} \\ge y_{(i)}` for every :math:`i` (X is better for everyone who
  prefers more);
* second order: :math:`\\sum_{i \\le k} x_{(i)} \\ge \\sum_{i \\le k} y_{(i)}` for every
  :math:`k` (X is better for every risk-averse investor).

When neither holds either way the answer depends on the investor.

**Certainty equivalent** under CRRA utility with risk aversion :math:`\\gamma`:
:math:`u(W) = W^{1-\\gamma} / (1 - \\gamma)` (:math:`\\ln W` at :math:`\\gamma = 1`), and
:math:`CE = u^{-1}(\\overline{u(W)})`: the sure amount worth as much as the gamble. Undefined
when any :math:`W \\le 0` (ruin).

**The same money in both.** Both options put in the same money, so a share :math:`w` of it in
X and the rest in Y ends at :math:`w X + (1 - w) Y` in each realization (an indication: half an
apartment cannot be bought, and fixed fees and tax brackets do not scale). Its percentiles
against those of X and Y alone show whether holding both lowers the risk.

**One path.** The max drawdown is the deepest fall from a running peak,
:math:`\\max_t (\\text{peak}_t - v_t) / \\text{peak}_t`. A year's return takes the money put in
out of the growth (modified Dietz, the money counted from mid-year):
:math:`r = (V_1 - V_0 - C) / (V_0 + C/2)`. Sharpe is the mean of such returns over their
standard deviation, Sortino over the root mean square of the losing ones; both against a
return of zero.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

import numpy as np

from app.models.bars import FloatArray

PERCENTILES = (5, 25, 50, 75, 95)
#: Differences below this share of the values' size are rounding noise.
NOISE = 1e-12

Dominance = Literal["x_first", "x_second", "y_first", "y_second", "equal", "none"]


def percentiles(values: FloatArray) -> list[float]:
    """The 5, 25, 50, 75 and 95 % percentiles."""
    return [float(v) for v in np.percentile(values, PERCENTILES)]


def cvar(values: FloatArray, level: float = 0.05) -> float:
    """The mean of the worst ``level`` share of the values."""
    worst = max(1, int(np.ceil(round(level * len(values), 9))))
    return float(np.mean(np.partition(values, worst - 1)[:worst]))


def shortfall_probability(wealth: FloatArray, spent: FloatArray) -> float:
    """The share of realizations that end below the money put in."""
    return float(np.mean(wealth < spent))


def regret(chosen: FloatArray, other: FloatArray) -> tuple[float, float]:
    """The mean and the 95 % percentile of what the other option would have added."""
    short = np.maximum(other - chosen, 0.0)
    return float(np.mean(short)), float(np.percentile(short, 95))


def dominance(x: FloatArray, y: FloatArray) -> Dominance:
    """Which sample dominates the other, and in which order (see the module docstring)."""
    gaps = np.sort(x) - np.sort(y)
    noise = NOISE * max(float(np.max(np.abs(x))), float(np.max(np.abs(y))), 1.0)
    sums = np.cumsum(gaps)
    if np.all(np.abs(gaps) <= noise):
        return "equal"
    if np.all(gaps >= -noise):
        return "x_first"
    if np.all(gaps <= noise):
        return "y_first"
    if np.all(sums >= -noise * len(gaps)):
        return "x_second"
    if np.all(sums <= noise * len(gaps)):
        return "y_second"
    return "none"


def certainty_equivalent(wealth: FloatArray, gamma: float = 2.0) -> float | None:
    """The sure amount a CRRA investor values as much as ``wealth`` (None: ruin in it)."""
    if np.any(wealth <= 0):
        return None
    if gamma == 1.0:
        return float(np.exp(np.mean(np.log(wealth))))
    power = 1.0 - gamma
    return float(np.mean(wealth**power) ** (1.0 / power))


def max_drawdown(path: FloatArray) -> float:
    """The deepest fall from a running peak, as a share of that peak."""
    peak = np.maximum.accumulate(path)
    falls = np.divide(peak - path, peak, out=np.zeros(len(path)), where=peak > 0)
    return float(falls.max())


def dietz_returns(worth: FloatArray, put_in: FloatArray) -> FloatArray:
    """Yearly returns of a net-worth path: ``worth`` at the year ends (one more than the
    years), ``put_in`` the money added in each year. A year with nothing to earn on is left
    out."""
    base = worth[:-1] + put_in / 2.0
    earned = worth[1:] - worth[:-1] - put_in
    return earned[base > 0] / base[base > 0]


def sharpe(returns: FloatArray) -> float | None:
    """The mean return over its standard deviation (None without a spread)."""
    if len(returns) < 2:  # noqa: PLR2004
        return None
    mean, spread = float(np.mean(returns)), float(np.std(returns, ddof=1))
    return None if spread <= NOISE * max(abs(mean), 1.0) else mean / spread


def sortino(returns: FloatArray) -> float | None:
    """The mean return over the root mean square of the losses (None without a loss)."""
    downside = float(np.sqrt(np.mean(np.minimum(returns, 0.0) ** 2))) if len(returns) else 0.0
    return None if downside == 0.0 else float(np.mean(returns)) / downside


@dataclass(frozen=True, slots=True)
class SplitRow:
    #: The share of the money in x.
    weight: float
    p50: float
    p5: float
    cvar5: float


def split(x: FloatArray, y: FloatArray, weights: Sequence[float]) -> list[SplitRow]:
    """The end values of the same money split between x and y, for each share in x."""
    rows: list[SplitRow] = []
    for weight in weights:
        mixed = weight * x + (1.0 - weight) * y
        p5, _, p50, _, _ = percentiles(mixed)
        rows.append(SplitRow(weight, p50, p5, cvar(mixed)))
    return rows
