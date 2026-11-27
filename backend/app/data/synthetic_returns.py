r"""The daily returns of a parametric synthetic symbol (K2, ADR 0033).

**Shocks.** Each family is drawn and standardised to mean 0 and variance 1:

* normal: :math:`z \sim N(0, 1)`;
* Student-t with :math:`\nu > 2` degrees of freedom: :math:`z = t_\nu \sqrt{(\nu - 2)/\nu}`;
* uniform: :math:`z \sim U(-\sqrt3, \sqrt3)`;
* Laplace: :math:`z \sim \operatorname{Laplace}(0, 1/\sqrt2)`;
* skew-normal with shape :math:`\alpha` (Azzalini): with :math:`\delta = \alpha/\sqrt{1+\alpha^2}`,
  :math:`x = \delta |u_0| + \sqrt{1-\delta^2}\, u_1` (standard normals :math:`u`) and
  :math:`z = (x - \delta\sqrt{2/\pi}) / \sqrt{1 - 2\delta^2/\pi}`.

**The year.** :math:`N` = ``YEAR_BARS`` (365.25 x 5 / 7, the weekdays of an average calendar year)
and :math:`n = \operatorname{round}(N)`. With :math:`\sigma` the yearly volatility, :math:`\lambda`
jumps a year of size :math:`N(\mu_J, \sigma_J^2)`, memory :math:`\varphi` and GARCH
:math:`(a, b)`:

.. math::
    V_D = \sigma^2 - \lambda(\mu_J^2 + \sigma_J^2), \qquad
    K = n + 2\sum_{k=1}^{n-1} (n-k)\varphi^k, \qquad
    \gamma_0 = V_D / K, \qquad q = \gamma_0 (1 - \varphi^2)

so the diffusion :math:`D` sums to the variance :math:`V_D` over a year (:math:`\gamma_0` its daily
variance, :math:`q` its innovation's), and

.. math::
    h_0 = q, \quad h_{t+1} = q(1-a-b) + a\, e_t^2 + b\, h_t, \quad e_t = \sqrt{h_t}\, z_t, \quad
    D_0 = \frac{e_0}{\sqrt{1-\varphi^2}}, \quad D_t = \varphi D_{t-1} + e_t

.. math::
    J_t = k_t \mu_J + \sqrt{k_t}\, \sigma_J\, y_t - \frac{\lambda}{N}\mu_J, \qquad
    k_t \sim \operatorname{Poisson}(\lambda/N), \quad y_t \sim N(0, 1)

.. math::
    R_t = m + D_t + J_t, \qquad (1 + m)^N \Big(1 + \frac{C}{(1+m)^2}\Big) = 1 + \mu, \qquad
    C = \gamma_0 \sum_{k=1}^{n-1} (n - k)\varphi^k

:math:`D` (GARCH) and :math:`J` (compensated) are martingale differences, so without memory
:math:`E[\prod (1 + R_t)] = (1 + m)^N = 1 + \mu` exactly over a year; with memory the year's
covariances :math:`C` enter the product, and :math:`m` holds :math:`\mu` to second order.

**Exact.** The path's returns are shifted and scaled, :math:`R \leftarrow m + (R - \bar R)\, s /
\hat s` with :math:`s^2 = \gamma_0 + \frac{\lambda}{N}(\mu_J^2 + \sigma_J^2)`, so the path's own
mean and standard deviation are the targets (not prefix-stable: the whole path sets them).

**Floor.** :math:`1 + R_t \ge 0.01` (a fall of at most 99 % a day), applied last; with sane
parameters it never binds, and the preview counts the days it does.

Draws: the shocks from ``default_rng([seed, 1])``, the jump counts and sizes from ``[seed, 2]``
and ``[seed, 3]``, one per day in order, so a longer path starts with the shorter one (outside
``exact``).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from app.models.bars import FloatArray
from app.models.synthetic import YEAR_BARS, ReturnShape

FLOOR = -0.99
#: Bins of the preview's histogram.
BINS = 40


def standard_shocks(shape: ReturnShape, n: int, seed: int) -> FloatArray:
    """``n`` draws of the family, standardised to mean 0 and variance 1."""
    rng = np.random.default_rng([seed, 1])
    match shape.distribution:
        case "normal":
            return rng.standard_normal(n)
        case "student_t":
            return rng.standard_t(shape.df, n) * math.sqrt((shape.df - 2) / shape.df)
        case "uniform":
            return rng.uniform(-math.sqrt(3), math.sqrt(3), n)
        case "laplace":
            return rng.laplace(0.0, 1 / math.sqrt(2), n)
        case "skew_normal":
            delta = _delta(shape.skew)
            u = rng.standard_normal((n, 2))
            x = delta * np.abs(u[:, 0]) + math.sqrt(1 - delta**2) * u[:, 1]
            mean, sd = _skew_normal_mean_sd(delta)
            return (x - mean) / sd


def family_moments(shape: ReturnShape) -> tuple[float, float | None]:
    """The standardised family's skewness and excess kurtosis (None: infinite, t with nu <= 4)."""
    match shape.distribution:
        case "normal":
            return 0.0, 0.0
        case "student_t":
            return 0.0, (6 / (shape.df - 4) if shape.df > 4 else None)  # noqa: PLR2004
        case "uniform":
            return 0.0, -1.2
        case "laplace":
            return 0.0, 3.0
        case "skew_normal":
            b = _delta(shape.skew) * math.sqrt(2 / math.pi)
            var = 1 - b**2
            return (4 - math.pi) / 2 * b**3 / var**1.5, 2 * (math.pi - 3) * b**4 / var**2


def family_density(shape: ReturnShape, z: FloatArray) -> FloatArray:
    """The standardised family's density at ``z``."""
    match shape.distribution:
        case "normal":
            return np.exp(-(z**2) / 2) / math.sqrt(2 * math.pi)
        case "student_t":
            nu = shape.df
            scale = math.sqrt((nu - 2) / nu)
            t = z / scale
            log_c = math.lgamma((nu + 1) / 2) - math.lgamma(nu / 2) - 0.5 * math.log(nu * math.pi)
            return np.exp(log_c - (nu + 1) / 2 * np.log1p(t**2 / nu)) / scale
        case "uniform":
            return np.where(np.abs(z) <= math.sqrt(3), 1 / (2 * math.sqrt(3)), 0.0)
        case "laplace":
            return np.exp(-math.sqrt(2) * np.abs(z)) / math.sqrt(2)
        case "skew_normal":
            delta = _delta(shape.skew)
            mean, sd = _skew_normal_mean_sd(delta)
            x = mean + sd * z
            phi = np.exp(-(x**2) / 2) / math.sqrt(2 * math.pi)
            cdf = 0.5 * (1 + np.vectorize(math.erf)(shape.skew * x / math.sqrt(2)))
            return sd * 2 * phi * cdf


@dataclass(frozen=True, slots=True)
class Targets:
    """What the layers are scaled to, per day: the mean m, the diffusion's daily variance gamma_0,
    its innovation's q, the jump rate lambda/N, and the returns' daily standard deviation s."""

    m: float
    gamma0: float
    q: float
    jump_rate: float
    s: float


def targets(shape: ReturnShape) -> Targets:
    mu, sigma, phi = shape.mean_pct / 100, shape.vol_pct / 100, shape.memory
    n = round(YEAR_BARS)
    lags = np.arange(1, n)
    cross = float(np.sum((n - lags) * phi**lags))
    gamma0 = (sigma**2 - shape.jump_variance) / (n + 2 * cross)
    m0 = (1 + mu) ** (1 / YEAR_BARS) - 1
    m = ((1 + mu) / (1 + gamma0 * cross / (1 + m0) ** 2)) ** (1 / YEAR_BARS) - 1
    jump_rate = shape.jumps_per_year / YEAR_BARS
    mu_j, sd_j = shape.jump_mean_pct / 100, shape.jump_sd_pct / 100
    s = math.sqrt(gamma0 + jump_rate * (mu_j**2 + sd_j**2))
    return Targets(m, gamma0, gamma0 * (1 - phi**2), jump_rate, s)


@dataclass(frozen=True, slots=True)
class ParametricPath:
    """``n`` daily simple returns, each day's diffusion standard deviation (for the hours and the
    wicks), its raw jump (for the open), and how many days the floor caught."""

    returns: FloatArray
    sigma: FloatArray
    jumps: FloatArray
    floored: int


def parametric_returns(shape: ReturnShape, n: int, seed: int) -> ParametricPath:
    """The layered daily returns (module docstring)."""
    t = targets(shape)
    z = standard_shocks(shape, n, seed)
    a, b, phi = shape.garch_alpha, shape.garch_beta, shape.memory
    h = np.empty(n)
    d = np.empty(n)
    var, prev = t.q, 0.0
    for i in range(n):  # recursive (GARCH and AR(1)): no closed vectorised form
        h[i] = var
        e = math.sqrt(var) * z[i]
        prev = e / math.sqrt(1 - phi**2) if i == 0 else phi * prev + e
        d[i] = prev
        var = t.q * (1 - a - b) + a * e * e + b * var
    counts = np.random.default_rng([seed, 2]).poisson(t.jump_rate, n)
    sizes = np.random.default_rng([seed, 3]).standard_normal(n)
    mu_j, sd_j = shape.jump_mean_pct / 100, shape.jump_sd_pct / 100
    raw_jumps = counts * mu_j + np.sqrt(counts) * sd_j * sizes
    returns = t.m + d + raw_jumps - t.jump_rate * mu_j
    if shape.exact and n > 1:
        returns = t.m + (returns - returns.mean()) * (t.s / returns.std())
    floored = int(np.count_nonzero(returns < FLOOR))
    return ParametricPath(np.maximum(returns, FLOOR), np.sqrt(h), raw_jumps, floored)


@dataclass(frozen=True, slots=True)
class Preview:
    """The drawn daily returns as a histogram, the family's density as expected counts per bin at
    ``curve_x``, the realized yearly mean and volatility, skewness and excess kurtosis, and the
    family's own (None: infinite)."""

    edges: list[float]
    counts: list[int]
    curve_x: list[float]
    curve_counts: list[float]
    mean_pct: float
    vol_pct: float
    skewness: float
    excess_kurtosis: float
    family_skewness: float
    family_excess_kurtosis: float | None
    floored: int


def preview(shape: ReturnShape, n: int, seed: int) -> Preview:
    """What a parametric symbol of ``n`` bars draws, for the dialog."""
    path = parametric_returns(shape, n, seed)
    r = path.returns
    t = targets(shape)
    mean, sd = float(r.mean()), float(r.std())
    centred = (r - mean) / sd if sd > 0 else np.zeros_like(r)
    # The histogram spans mean +- 5 sd (a t's far tail would squeeze the rest into a few bins);
    # the days beyond fall in the end bins.
    lo, hi = mean - 5 * sd, mean + 5 * sd
    edges = np.linspace(lo, hi, BINS + 1)
    counts = np.histogram(np.clip(r, lo, hi), edges)[0]
    width = (hi - lo) / BINS
    x = np.linspace(lo, hi, 161)
    density = family_density(shape, (x - t.m) / t.s) / t.s
    skew_f, kurt_f = family_moments(shape)
    return Preview(
        edges=edges.tolist(),
        counts=counts.astype(int).tolist(),
        curve_x=x.tolist(),
        curve_counts=(density * len(r) * width).tolist(),
        mean_pct=((1 + mean) ** YEAR_BARS - 1) * 100,
        vol_pct=sd * math.sqrt(YEAR_BARS) * 100,
        skewness=float(np.mean(centred**3)),
        excess_kurtosis=float(np.mean(centred**4) - 3),
        family_skewness=skew_f,
        family_excess_kurtosis=kurt_f,
        floored=path.floored,
    )


def _delta(alpha: float) -> float:
    return alpha / math.sqrt(1 + alpha**2)


def _skew_normal_mean_sd(delta: float) -> tuple[float, float]:
    mean = delta * math.sqrt(2 / math.pi)
    return mean, math.sqrt(1 - mean**2)
