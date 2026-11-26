"""The market account: deposits buy a mix of assets, fees and dividend tax along the way, one
sale at the end. Pure arithmetic on arrays; ``app.planner.data`` loads the inputs.

**Notation.** Asset :math:`a` has daily bars :math:`s = 0, 1, \\dots` with close :math:`C_s`,
dividend factor :math:`f_s` (adjusted close over close), and :math:`x_s`, the shekels per unit of
its currency (1 with FX off or for a shekel asset). Deposit :math:`j` of :math:`A_j` shekels on
day :math:`d_j` buys asset :math:`a` at its first bar :math:`i` on or after :math:`d_j`.

**A purchase.** With deposit fee :math:`\\delta`, weight :math:`w_a` and buy commission
:math:`\\beta`: the money :math:`m = A_j (1 - \\delta) w_a` pays a trade of :math:`m/(1 + \\beta)`
plus its commission. At fill price :math:`p` (``app.planner.fills``) the lot holds
:math:`q_0 = m / ((1 + \\beta)\\,p\\,x_i)` units, at a cost basis of :math:`m`.

**Dividends.** On bar :math:`s` the gross growth of units from reinvested dividends is
:math:`r_s = (f_s / f_{s-1})\\,(1 + y)^{\\Delta_s/365.25}` (:math:`y` is an assumed yearly yield
for price-only series, :math:`\\Delta_s` the days since the previous bar). After the dividend tax
:math:`\\tau_d`, units grow by :math:`g_s = 1 + (1 - \\tau_d)(r_s - 1)`;
:math:`G_s = \\prod_{k \\le s} g_k`. The net dividend reinvested is a new purchase, so it joins the
cost basis: :math:`q_{s-1} (g_s - 1) C_s x_s` shekels.

**Account fees.** At each month end :math:`m` the account is worth :math:`V_m` and pays
:math:`\\min(V_m, V_m (1 - (1 - \\mu)^{1/12}) + F)` (yearly management fee :math:`\\mu`, monthly
fee :math:`F`) by selling the fraction :math:`\\varphi_m` of every lot. These sales are proceeds
like any other; the fee itself is not deductible.

**At the end** (bar :math:`T`): lot value :math:`q_T C_T x_T`; proceeds after the sell commission
:math:`\\sigma`: :math:`(1 - \\sigma)` of it. The taxable gain of a lot is everything it sold minus
everything it bought, the costs optionally indexed:

.. math::
    \\text{gain}_j = (1 - \\sigma)\\,q_T C_T x_T + \\text{fees paid}_j
        - \\Big(m\\,\\frac{I_T}{I_i} + \\sum_s \\text{reinvested}_s \\frac{I_T}{I_s}\\Big)

with :math:`I \\equiv 1` (nominal), the CPI (real) or :math:`x` (linked to the currency). The tax
is :math:`\\tau \\max(\\sum_j \\text{gain}_j, 0)`: a loss in one lot offsets a gain in another. All
of it is charged at the end (a simplification: the gains of the fee sales are taxed then too).
"""

from __future__ import annotations

import calendar
from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from datetime import date, timedelta
from enum import StrEnum

import numpy as np

from app.models.bars import FloatArray, IntArray
from app.planner.deposits import Deposit, day_number
from app.planner.fills import FillMode, Granularity, fill_prices
from app.planner.inflation import CpiPath
from app.planner.xirr import xirr

DAYS_PER_YEAR = 365.25
MAX_FEE_FRACTION = 1.0 - 1e-9  # keeps the logarithm of the fee factor finite


class TaxBase(StrEnum):
    NOMINAL = "nominal"
    REAL = "real"
    CURRENCY = "currency"


@dataclass(frozen=True, slots=True)
class AssetData:
    """One asset of the mix: its daily bars and the shekel rate of its currency on each bar."""

    symbol: str
    weight: float
    days: IntArray
    open: FloatArray
    high: FloatArray
    low: FloatArray
    close: FloatArray
    #: Adjusted close over close (1 everywhere for a series without dividends).
    factor: FloatArray
    fx: FloatArray
    dividend_yield: float = 0.0


@dataclass(frozen=True, slots=True)
class Fees:
    deposit: float = 0.0
    buy: float = 0.0
    sell: float = 0.0
    management: float = 0.0
    monthly: float = 0.0


@dataclass(frozen=True, slots=True)
class Taxes:
    gains: float = 0.25
    dividend: float = 0.25
    base: TaxBase = TaxBase.NOMINAL


@dataclass(frozen=True, slots=True)
class FillSpec:
    mode: FillMode = FillMode.CLOSE
    granularity: Granularity = Granularity.MEDIUM
    rng: np.random.Generator | None = None


@dataclass(frozen=True, slots=True)
class Lot:
    deposit: int
    symbol: str
    day: int
    price: float
    fx: float
    units: float
    cost: float
    value: float
    fees_paid: float
    reinvested: float
    gain: float


@dataclass(frozen=True, slots=True)
class DepositRow:
    day: date
    amount: float
    value: float
    proceeds: float
    gross_gain: float
    tax: float
    net_gain: float


@dataclass(frozen=True, slots=True)
class MarketResult:
    deposits: list[DepositRow]
    lots: list[Lot]
    deposited: float
    value: float
    proceeds: float
    taxable_gain: float
    tax: float
    net_value: float
    deposit_fees: float
    commissions: float
    account_fees: float
    dividend_tax: float
    xirr_gross: float | None
    xirr_net: float | None
    #: In shekels of the first deposit's day (deflated by the planner's CPI).
    net_value_real: float
    xirr_net_real: float | None
    path_days: list[int] = field(default_factory=list[int])
    path_value: list[float] = field(default_factory=list[float])
    path_deposited: list[float] = field(default_factory=list[float])


class PlanError(ValueError):
    """The plan cannot run on this data (a 422 for the API)."""


def month_ends(first: int, last: int) -> IntArray:
    """Day numbers of the month ends in ``[first, last)``."""
    out: list[int] = []
    day = date(1970, 1, 1) + timedelta(days=int(first))
    end = date(1970, 1, 1) + timedelta(days=int(last))
    while True:
        month_end = day.replace(day=calendar.monthrange(day.year, day.month)[1])
        if month_end >= end:
            return np.array(out, dtype=np.int64)
        out.append(day_number(month_end))
        day = month_end + timedelta(days=1)


def growth(asset: AssetData, dividend_tax: float) -> FloatArray:
    """:math:`G_s`: units per unit bought at bar 0, from net dividends reinvested."""
    gross = np.ones(len(asset.days))
    gross[1:] = asset.factor[1:] / asset.factor[:-1]
    if asset.dividend_yield:
        gross[1:] *= (1.0 + asset.dividend_yield) ** (np.diff(asset.days) / DAYS_PER_YEAR)
    return np.cumprod(1.0 + (1.0 - dividend_tax) * (gross - 1.0))


def run_market(  # noqa: PLR0912, PLR0915 - one account, one pass; the docstring is the map
    assets: Sequence[AssetData],
    deposits: Sequence[Deposit],
    end: date,
    *,
    fees: Fees = Fees(),
    taxes: Taxes = Taxes(),
    fill: FillSpec = FillSpec(),
    cpi: CpiPath,
    session_t: FloatArray | None = None,
    fill_override: FloatArray | None = None,
) -> MarketResult:
    """Run the account (see the module docstring).

    ``session_t[j, a]`` is the known time of deposit ``j`` inside asset ``a``'s daily bar (NaN:
    unknown); ``fill_override[j, a]`` a fill price already taken from a finer bar (NaN: none).
    """
    if not assets or not deposits:
        raise PlanError("A plan needs at least one asset and one deposit")
    total_weight = sum(a.weight for a in assets)
    if total_weight <= 0 or any(a.weight < 0 for a in assets):
        raise PlanError("Asset weights must be positive")
    dep_days = np.array([day_number(d.day) for d in deposits], dtype=np.int64)
    amounts = np.array([d.amount for d in deposits])
    if np.any(amounts <= 0):
        raise PlanError("Every deposit must be positive")
    end_day = day_number(end)
    if end_day <= dep_days.max():
        raise PlanError("The end date must be after the last deposit")
    n = len(deposits)
    fee_days = month_ends(int(dep_days.min()), end_day)
    events = len(fee_days)
    monthly_rate = 1.0 - (1.0 - fees.management) ** (1.0 / 12.0)

    # Per asset: purchases, and the bar index and shekel price at every fee event and at the end.
    buy_index: list[IntArray] = []
    first_event: list[IntArray] = []
    per_g: list[FloatArray] = []  # units0 / G[purchase]: the lot's size in "bar 0 units"
    units0: list[FloatArray] = []
    cost: list[FloatArray] = []
    prices: list[FloatArray] = []
    g_all: list[FloatArray] = []
    shekel: list[FloatArray] = []
    event_index: list[IntArray] = []
    last_index: list[int] = []
    used: list[AssetData] = []
    for a, whole in enumerate(assets):
        first = date(1970, 1, 1) + timedelta(days=int(whole.days[0]))
        if dep_days.min() < whole.days[0]:
            raise PlanError(f"{whole.symbol} has no data before {first}: start the plan later")
        # Only the bars from the first purchase on: earlier ones (and a rate missing there)
        # must not reach the running sums.
        cut = slice(int(np.searchsorted(whole.days, dep_days.min(), side="left")), None)
        asset = replace(
            whole,
            days=whole.days[cut],
            open=whole.open[cut],
            high=whole.high[cut],
            low=whole.low[cut],
            close=whole.close[cut],
            factor=whole.factor[cut],
            fx=whole.fx[cut],
        )
        used.append(asset)
        i = np.searchsorted(asset.days, dep_days, side="left")
        t_last = int(np.searchsorted(asset.days, end_day, side="right")) - 1
        if np.any(i > t_last):
            raise PlanError(f"{asset.symbol} has no bar between a deposit and the end date")
        o, h, lo, c = (x[i] for x in (asset.open, asset.high, asset.low, asset.close))
        if not np.all(np.isfinite(asset.fx[i])):
            raise PlanError(f"No exchange rate for {asset.symbol} on a deposit day")
        known = None if session_t is None or np.all(np.isnan(session_t[:, a])) else session_t[:, a]
        price = fill_prices(o, h, lo, c, fill.mode, granularity=fill.granularity, rng=fill.rng)
        if known is not None:
            timed = fill_prices(
                o, h, lo, c, fill.mode, t=np.nan_to_num(known), granularity=fill.granularity
            )
            price = np.where(np.isnan(known), price, timed)
        if fill_override is not None:
            price = np.where(np.isnan(fill_override[:, a]), price, fill_override[:, a])
        money = amounts * (1.0 - fees.deposit) * (asset.weight / total_weight)
        g = growth(asset, taxes.dividend)
        q0 = money / ((1.0 + fees.buy) * price * asset.fx[i])
        buy_index.append(i)
        units0.append(q0)
        per_g.append(q0 / g[i])
        cost.append(money)
        prices.append(price)
        g_all.append(g)
        shekel.append(asset.close * asset.fx)
        e = np.searchsorted(asset.days, fee_days, side="right") - 1
        event_index.append(e)
        last_index.append(t_last)
        # A lot pays the fee of every month end on or after its purchase bar.
        first_event.append(np.searchsorted(fee_days, asset.days[i], side="left"))

    # The fee fraction of each month end, in time order (it depends on the whole account).
    phi = np.zeros(events)
    paid = np.zeros(events)
    path_value = np.zeros(events)
    held = [0.0] * len(assets)  # per asset: the active lots, summed in "bar 0 units"
    for m in range(events):
        value = 0.0
        for a in range(len(assets)):
            held[a] += float(per_g[a][first_event[a] == m].sum())
            e = int(event_index[a][m])
            value += held[a] * float(g_all[a][e] * shekel[a][e]) if e >= 0 else 0.0
        fee = min(value, value * monthly_rate + fees.monthly) if value > 0 else 0.0
        phi[m] = min(fee / value, MAX_FEE_FRACTION) if value > 0 else 0.0
        paid[m] = phi[m] * value
        path_value[m] = value - paid[m]
        held = [x * (1.0 - phi[m]) for x in held]
    # log of the units factor before event m (index events = after all of them).
    log_factor = np.concatenate(([0.0], np.cumsum(np.log1p(-phi))))

    lots: list[Lot] = []
    value_by_deposit = np.zeros(n)
    gain_by_deposit = np.zeros(n)
    reinvested_total = 0.0
    for a, asset in enumerate(used):
        g, e, t_last, i, k = g_all[a], event_index[a], last_index[a], buy_index[a], first_event[a]
        if taxes.base is TaxBase.REAL:
            level = cpi.at(asset.days)
        elif taxes.base is TaxBase.CURRENCY:
            level = asset.fx
        else:
            level = np.ones(len(asset.days))
        # Net dividends reinvested up to each bar, per "bar 0 unit" (plain and cost-indexed).
        step = np.zeros(len(g))
        step[1:] = g[:-1] * (g[1:] / g[:-1] - 1.0) * shekel[a][1:]
        reinvest = np.cumsum(step)
        reinvest_indexed = np.cumsum(step / level)
        # rel[j, m]: the lot's units factor before fee event m (0 before the lot exists).
        active = np.arange(events)[None, :] >= k[:, None]
        rel = np.where(active, np.exp(log_factor[:-1][None, :] - log_factor[k][:, None]), 0.0)
        e_safe = np.maximum(e, 0)
        fees_paid = per_g[a] * (rel * (phi * g[e_safe] * shekel[a][e_safe])[None, :]).sum(axis=1)
        # Dividends: before the first fee event at factor 1, then per segment between events.
        seg_start = np.concatenate((e_safe, [t_last]))  # bar of event m; the end after the last
        first_stop = seg_start[k]
        after = rel * (1.0 - phi)[None, :]  # the factor after event m
        plain, indexed = (
            per_g[a]
            * (
                cum[first_stop]
                - cum[i]
                + (after * (cum[seg_start[1:]] - cum[seg_start[:-1]])[None, :]).sum(axis=1)
            )
            for cum in (reinvest, reinvest_indexed)
        )
        final_factor = np.exp(log_factor[-1] - log_factor[k])
        final_units = per_g[a] * g[t_last] * final_factor
        value = final_units * shekel[a][t_last]
        indexed_cost = (cost[a] / level[i] + indexed) * level[t_last]
        gain = (1.0 - fees.sell) * value + fees_paid - indexed_cost
        reinvested_total += float(plain.sum())
        value_by_deposit += value
        gain_by_deposit += gain
        lots.extend(
            Lot(
                deposit=j,
                symbol=asset.symbol,
                day=int(asset.days[i[j]]),
                price=float(prices[a][j]),
                fx=float(asset.fx[i[j]]),
                units=float(units0[a][j]),
                cost=float(cost[a][j]),
                value=float(value[j]),
                fees_paid=float(fees_paid[j]),
                reinvested=float(plain[j]),
                gain=float(gain[j]),
            )
            for j in range(n)
        )

    deposited = float(amounts.sum())
    value_total = float(value_by_deposit.sum())
    proceeds_by_deposit = (1.0 - fees.sell) * value_by_deposit
    proceeds = float(proceeds_by_deposit.sum())
    taxable = float(gain_by_deposit.sum())
    rate = taxes.gains if taxable > 0 else 0.0
    tax_by_deposit = rate * gain_by_deposit
    tax = float(tax_by_deposit.sum())
    rows = [
        DepositRow(
            day=deposits[j].day,
            amount=float(amounts[j]),
            value=float(value_by_deposit[j]),
            proceeds=float(proceeds_by_deposit[j]),
            gross_gain=float(proceeds_by_deposit[j] - amounts[j]),
            tax=float(tax_by_deposit[j]),
            net_gain=float(proceeds_by_deposit[j] - tax_by_deposit[j] - amounts[j]),
        )
        for j in range(n)
    ]
    flow_days = np.concatenate((dep_days, [end_day]))
    deflate = float(cpi.at(int(dep_days.min()))) / cpi.at(flow_days)
    net_value = proceeds - tax
    net_flows = np.concatenate((-amounts, [net_value]))
    trade_value = deposited * (1.0 - fees.deposit) / (1.0 + fees.buy)
    path_days = [*fee_days.tolist(), end_day]
    return MarketResult(
        deposits=rows,
        lots=lots,
        deposited=deposited,
        value=value_total,
        proceeds=proceeds,
        taxable_gain=taxable,
        tax=tax,
        net_value=net_value,
        deposit_fees=deposited * fees.deposit,
        commissions=trade_value * fees.buy + value_total * fees.sell,
        account_fees=float(paid.sum()),
        dividend_tax=reinvested_total * taxes.dividend / (1.0 - taxes.dividend)
        if taxes.dividend < 1.0
        else 0.0,
        xirr_gross=xirr(flow_days, np.concatenate((-amounts, [proceeds]))),
        xirr_net=xirr(flow_days, net_flows),
        net_value_real=net_value * float(deflate[-1]),
        xirr_net_real=xirr(flow_days, net_flows * deflate),
        path_days=path_days,
        path_value=[*path_value.tolist(), value_total],
        path_deposited=[float(amounts[dep_days <= d].sum()) for d in path_days],
    )
