r"""The standard metrics of an equity curve and its trades (B1, ADR 0037). Net: costs are in.

With equity :math:`E_0 \dots E_N` at each close, bar returns :math:`r_t = E_t / E_{t-1} - 1`,
:math:`B` bars a year (from the data) and :math:`Y` years from the first to the last bar:

* total return :math:`E_N / E_0 - 1`; net profit :math:`E_N - E_0`;
  CAGR :math:`(E_N / E_0)^{1/Y} - 1` (the net annual return);
* volatility :math:`\sigma \sqrt{B}`, :math:`\sigma` the sample deviation of :math:`r_t`;
* Sharpe :math:`\bar r / \sigma \cdot \sqrt{B}` (risk-free rate 0, the user's choice);
  Sortino :math:`\bar r / \sqrt{\overline{\min(r_t, 0)^2}} \cdot \sqrt{B}`;
* drawdown :math:`D_t = E_t / \max_{s \le t} E_s - 1`; max drawdown :math:`\min_t D_t`; its
  length: the longest run of bars under a previous peak; Calmar: CAGR over :math:`|\min D|`;
* per trade :math:`i` (net return :math:`\rho_i`, profit :math:`\pi_i`): win rate (share with
  :math:`\rho_i > 0`), profit factor :math:`\sum_{\pi>0} \pi / |\sum_{\pi<0} \pi|`, expectancy
  :math:`\bar\rho`, average R (over trades with a stop); exposure: the share of bars in a position.

A value that is not defined (no trades, no losses, a flat curve) is ``None``.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from app.models.bars import FloatArray

from .engine import BoolArray, Trade, annual

#: A deviation below this is rounding noise (a constant return), not risk.
TINY = 1e-12


@dataclass(frozen=True, slots=True)
class Metrics:
    net_profit: float
    total_return: float
    cagr: float | None
    volatility: float | None
    sharpe: float | None
    sortino: float | None
    max_drawdown: float
    max_drawdown_bars: int
    calmar: float | None
    trades: int
    win_rate: float | None
    profit_factor: float | None
    expectancy: float | None
    avg_r: float | None
    exposure: float


def _defined(x: float) -> float | None:
    return x if math.isfinite(x) else None


def _longest_run(mask: BoolArray) -> int:
    best = run = 0
    for flag in mask.tolist():
        run = run + 1 if flag else 0
        best = max(best, run)
    return best


def compute(
    equity: FloatArray,
    trades: Sequence[Trade],
    in_market: BoolArray,
    years: float,
    bars_per_year: float,
) -> Metrics:
    e0, en = float(equity[0]), float(equity[-1])
    r = equity[1:] / equity[:-1] - 1.0
    sd = float(np.std(r, ddof=1)) if len(r) > 1 else math.nan
    mean = float(np.mean(r)) if len(r) else math.nan
    down = float(np.sqrt(np.mean(np.minimum(r, 0.0) ** 2))) if len(r) else math.nan
    root = math.sqrt(bars_per_year) if bars_per_year > 0 else math.nan
    dd = equity / np.maximum.accumulate(equity) - 1.0
    mdd = float(dd.min())
    # (E_N / E_0)^(1/Y) - 1 through the log: a short span of a big gain is inf, not an error.
    cagr = annual(math.log(en / e0) / years, 1.0) if years > 0 and en > 0 else math.nan
    rets = [t.ret for t in trades]
    wins = sum(t.pnl for t in trades if t.pnl > 0)
    losses = -sum(t.pnl for t in trades if t.pnl < 0)
    rs = [t.r_multiple for t in trades if t.r_multiple is not None]
    return Metrics(
        net_profit=en - e0,
        total_return=en / e0 - 1,
        cagr=_defined(cagr),
        volatility=_defined(sd * root),
        sharpe=_defined(mean / sd * root) if sd > TINY else None,
        sortino=_defined(mean / down * root) if down > TINY else None,
        max_drawdown=mdd,
        max_drawdown_bars=_longest_run(dd < 0),
        calmar=_defined(cagr / -mdd) if mdd < 0 else None,
        trades=len(trades),
        win_rate=sum(x > 0 for x in rets) / len(rets) if rets else None,
        profit_factor=wins / losses if losses > 0 else None,
        expectancy=float(np.mean(rets)) if rets else None,
        avg_r=float(np.mean(rs)) if rs else None,
        exposure=float(np.mean(in_market)) if len(in_market) else 0.0,
    )


def buy_and_hold(open_: FloatArray, close: FloatArray, capital: float, cost: float) -> FloatArray:
    """Equity of buying at the first open (paying ``cost``) and selling at the last close."""
    units = capital / float(open_[0])
    equity = capital - cost * capital + units * (close - float(open_[0]))
    equity[-1] -= cost * units * float(close[-1])
    return equity
