"""The market account: hand vectors, an independent day-by-day golden model, and properties."""

from __future__ import annotations

import calendar
from datetime import date, timedelta

import numpy as np
import pytest

from app.planner.deposits import Deposit, Recurring, day_number, expand
from app.planner.fills import FillMode
from app.planner.inflation import CpiPath, assumed_cpi
from app.planner.market import (
    AssetData,
    Fees,
    FillSpec,
    PlanError,
    TaxBase,
    Taxes,
    month_ends,
    run_market,
)

START = date(2020, 1, 1)
END = date(2023, 1, 2)
NO_TAX = Taxes(gains=0.0, dividend=0.0)


def business_days(first: date, last: date) -> np.ndarray:
    days = [first + timedelta(days=k) for k in range((last - first).days + 1)]
    return np.array([day_number(d) for d in days if d.weekday() < 5], dtype=np.int64)


def asset(
    symbol: str = "AAA",
    weight: float = 1.0,
    *,
    price: float | None = None,
    seed: int = 1,
    dividends: bool = False,
    fx: float | np.ndarray = 1.0,
    dividend_yield: float = 0.0,
    first: date = START - timedelta(days=10),
) -> AssetData:
    """A random walk (or a constant ``price``) on business days, with optional quarterly
    dividends of 1 %."""
    days = business_days(first, END + timedelta(days=5))
    rng = np.random.default_rng(seed)
    n = len(days)
    close = (
        np.full(n, price) if price is not None else 50 * np.exp(np.cumsum(rng.normal(0, 0.01, n)))
    )
    open_ = close * (1 + rng.normal(0, 0.002, n)) if price is None else close.copy()
    high = np.maximum(open_, close) * (1 + np.abs(rng.normal(0, 0.003, n)) * (price is None))
    low = np.minimum(open_, close) * (1 - np.abs(rng.normal(0, 0.003, n)) * (price is None))
    factor = np.ones(n)
    if dividends:  # every 63rd bar is an ex-dividend day of 1 %: the factor steps up after it
        ex = np.arange(63, n, 63)
        steps = np.ones(n)
        steps[ex] = 1 / 0.99
        factor = np.cumprod(steps)
        factor /= factor[-1]
    return AssetData(
        symbol, weight, days, open_, high, low, close, factor,
        np.broadcast_to(np.asarray(fx, dtype=float), (n,)).copy(), dividend_yield,
    )  # fmt: skip


FLAT_CPI = CpiPath(np.array([0, 40_000]), np.array([100.0, 100.0]))


def run(assets: list[AssetData], deposits: list[Deposit], **kw: object):  # noqa: ANN201
    kw.setdefault("cpi", FLAT_CPI)
    return run_market(assets, deposits, END, **kw)  # type: ignore[arg-type]


# ---------------------------------------------------------------- hand vectors


def test_a_constant_price_returns_the_deposit() -> None:
    result = run([asset(price=10.0)], [Deposit(START, 1000.0)])
    assert result.value == pytest.approx(1000.0)
    assert (result.tax, result.taxable_gain) == (0.0, pytest.approx(0.0))
    assert result.lots[0].units == pytest.approx(100.0)
    assert result.xirr_net == pytest.approx(0.0, abs=1e-9)


def test_a_doubled_price_is_taxed_on_the_gain_only() -> None:
    a = asset(price=10.0)
    close = a.close.copy()
    close[-10:] = 20.0
    a = AssetData(a.symbol, 1.0, a.days, close, close, close, close, a.factor, a.fx)
    result = run([a], [Deposit(START, 1000.0)])
    assert result.value == pytest.approx(2000.0)
    assert result.taxable_gain == pytest.approx(1000.0)
    assert result.tax == pytest.approx(250.0)
    assert result.net_value == pytest.approx(1750.0)
    row = result.deposits[0]
    assert (row.gross_gain, row.tax, row.net_gain) == pytest.approx((1000.0, 250.0, 750.0))
    assert result.xirr_gross == pytest.approx(2 ** (365.25 / (END - START).days) - 1, abs=1e-9)


def test_every_fee_by_hand() -> None:
    fees = Fees(deposit=0.01, buy=0.002, sell=0.005)
    result = run([asset(price=10.0)], [Deposit(START, 1000.0)], fees=fees, taxes=NO_TAX)
    money = 1000.0 * 0.99
    units = money / 1.002 / 10.0
    assert result.lots[0].units == pytest.approx(units)
    assert result.lots[0].cost == pytest.approx(money)  # the trade plus its commission
    assert result.value == pytest.approx(units * 10.0)
    assert result.proceeds == pytest.approx(units * 10.0 * 0.995)
    assert result.deposit_fees == pytest.approx(10.0)
    assert result.commissions == pytest.approx(money / 1.002 * 0.002 + units * 10.0 * 0.005)
    # The commissions make a loss: no tax even at 25 %.
    taxed = run([asset(price=10.0)], [Deposit(START, 1000.0)], fees=fees)
    assert taxed.taxable_gain == pytest.approx(units * 10.0 * 0.995 - money)
    assert taxed.tax == 0.0


def test_account_fees_are_paid_by_selling_units_each_month_end() -> None:
    start = date(2022, 10, 3)  # month ends before END: Oct, Nov, Dec
    result = run(
        [asset(price=10.0)], [Deposit(start, 1000.0)], fees=Fees(monthly=10.0), taxes=NO_TAX
    )
    assert result.account_fees == pytest.approx(30.0)
    assert result.value == pytest.approx(970.0)
    assert result.path_value == pytest.approx([990.0, 980.0, 970.0, 970.0])
    assert result.path_deposited == [1000.0] * 4
    yearly = run(
        [asset(price=10.0)], [Deposit(start, 1000.0)], fees=Fees(management=0.12), taxes=NO_TAX
    )
    assert yearly.value == pytest.approx(1000.0 * 0.88 ** (3 / 12))  # 12 % a year, 3 months


def test_fees_larger_than_the_account_empty_it_without_failing() -> None:
    result = run([asset(price=10.0)], [Deposit(START, 100.0)], fees=Fees(monthly=60.0))
    assert result.value == pytest.approx(0.0, abs=1e-4)
    assert result.account_fees == pytest.approx(100.0, abs=1e-4)
    assert result.tax == 0.0


def test_the_shekel_rate_moves_the_value_and_the_tax_base_decides_what_is_taxed() -> None:
    a = asset(price=10.0)
    fx = np.where(a.days < day_number(date(2021, 1, 1)), 3.0, 4.0)
    a = AssetData(a.symbol, 1.0, a.days, a.open, a.high, a.low, a.close, a.factor, fx)
    deposit = [Deposit(START, 3000.0)]
    nominal = run([a], deposit)
    assert nominal.lots[0].units == pytest.approx(100.0)  # 3000 / 3 / 10
    assert nominal.value == pytest.approx(4000.0)
    assert nominal.tax == pytest.approx(250.0)
    # Linked to the currency: the dollar price did not move, so nothing is taxed.
    linked = run([a], deposit, taxes=Taxes(base=TaxBase.CURRENCY))
    assert linked.taxable_gain == pytest.approx(0.0, abs=1e-9)
    # Real: the cost is indexed by the CPI (here +10 %), so the gain is 4000 - 3300.
    cpi = CpiPath(np.array([day_number(START), day_number(END)]), np.array([100.0, 110.0]))
    real = run([a], deposit, taxes=Taxes(base=TaxBase.REAL), cpi=cpi)
    assert real.taxable_gain == pytest.approx(700.0)
    assert real.net_value_real == pytest.approx((4000.0 - 175.0) / 1.10)


def test_a_loss_in_one_deposit_offsets_the_gain_of_another() -> None:
    a = asset(price=10.0)
    close = a.close.copy()
    second = day_number(date(2021, 6, 1))
    close[a.days >= second] = 20.0  # the second deposit buys at 20
    close[-10:] = 15.0  # and everything is sold at 15
    a = AssetData(a.symbol, 1.0, a.days, close, close, close, close, a.factor, a.fx)
    result = run([a], [Deposit(START, 1000.0), Deposit(date(2021, 6, 1), 1000.0)])
    assert [lot.gain for lot in result.lots] == pytest.approx([500.0, -250.0])
    assert result.tax == pytest.approx(0.25 * 250.0)
    assert [row.tax for row in result.deposits] == pytest.approx([125.0, -62.5])


def test_net_dividends_grow_the_units_and_join_the_cost_basis() -> None:
    a = asset(price=10.0, dividends=True)
    gross = run([a], [Deposit(START, 1000.0)], taxes=NO_TAX)
    i = int(np.searchsorted(a.days, day_number(START)))
    t = int(np.searchsorted(a.days, day_number(END), side="right")) - 1
    assert gross.value == pytest.approx(1000.0 * a.factor[t] / a.factor[i])  # adjusted close
    net = run([a], [Deposit(START, 1000.0)], taxes=Taxes(gains=0.25, dividend=0.25))
    exes = round(np.log(a.factor[t] / a.factor[i]) / np.log(1 / 0.99))
    assert net.value == pytest.approx(1000.0 * (1 + 0.75 * (1 / 0.99 - 1)) ** exes)
    # The price never moved: every shekel of value above 1000 is a reinvested, already taxed
    # dividend, so no capital gain is left.
    assert net.taxable_gain == pytest.approx(0.0, abs=1e-9)
    assert net.lots[0].reinvested == pytest.approx(net.value - 1000.0)
    assert net.dividend_tax == pytest.approx((net.value - 1000.0) / 3)


def test_an_assumed_dividend_yield_grows_a_price_only_series() -> None:
    a = asset(price=10.0, dividend_yield=0.02)
    result = run([a], [Deposit(START, 1000.0)], taxes=NO_TAX)
    i = int(np.searchsorted(a.days, day_number(START)))
    t = int(np.searchsorted(a.days, day_number(END), side="right")) - 1
    years = (a.days[t] - a.days[i]) / 365.25
    assert result.value == pytest.approx(1000.0 * 1.02**years)


def test_the_mix_splits_each_deposit_by_weight() -> None:
    result = run(
        [asset("AAA", 60, price=10.0), asset("BBB", 30, price=5.0), asset("CCC", 10, price=1.0)],
        [Deposit(START, 1000.0)],
    )
    assert [(lot.symbol, lot.units) for lot in result.lots] == [
        ("AAA", pytest.approx(60.0)),
        ("BBB", pytest.approx(60.0)),
        ("CCC", pytest.approx(100.0)),
    ]


def test_a_holiday_deposit_buys_on_the_next_bar_and_fills_follow_the_model() -> None:
    a = asset(seed=4)
    saturday = date(2020, 3, 7)
    i = int(np.searchsorted(a.days, day_number(saturday)))
    assert a.days[i] == day_number(date(2020, 3, 9))
    for mode, want in (
        (FillMode.CLOSE, a.close[i]),
        (FillMode.OPEN, a.open[i]),
        (FillMode.MID, (a.high[i] + a.low[i]) / 2),
    ):
        result = run([a], [Deposit(saturday, 1000.0)], fill=FillSpec(mode))
        assert result.lots[0].price == pytest.approx(want)
        assert result.lots[0].day == a.days[i]
    # A known time inside the daily bar, and a price already taken from a finer bar.
    timed = run(
        [a],
        [Deposit(saturday, 1000.0)],
        fill=FillSpec(FillMode.LINEAR),
        session_t=np.array([[0.25]]),
    )
    assert timed.lots[0].price == pytest.approx(a.open[i] + 0.25 * (a.close[i] - a.open[i]))
    fixed = run([a], [Deposit(saturday, 1000.0)], fill_override=np.array([[42.0]]))
    assert fixed.lots[0].price == 42.0


def test_plans_that_cannot_run_say_why() -> None:
    young = asset(first=date(2021, 1, 1))
    with pytest.raises(PlanError, match="AAA has no data before 2021-01-01"):
        run([young], [Deposit(START, 1000.0)])
    with pytest.raises(PlanError, match="after the last deposit"):
        run([asset()], [Deposit(END, 1000.0)])
    with pytest.raises(PlanError, match="positive"):
        run([asset()], [Deposit(START, 0.0)])
    with pytest.raises(PlanError, match="at least one"):
        run([], [Deposit(START, 1.0)])
    with pytest.raises(PlanError, match="weights"):
        run([asset(weight=0.0)], [Deposit(START, 1.0)])


def test_month_ends() -> None:
    got = month_ends(day_number(date(2020, 1, 31)), day_number(date(2020, 4, 30)))
    assert got.tolist() == [
        day_number(d) for d in (date(2020, 1, 31), date(2020, 2, 29), date(2020, 3, 31))
    ]


# ---------------------------------------------------------------- the golden model


def golden(  # noqa: PLR0912, PLR0915 - a deliberately plain day-by-day loop
    assets: list[AssetData],
    deposits: list[Deposit],
    end: date,
    fees: Fees,
    taxes: Taxes,
    cpi: CpiPath,
    prices: list[list[float]],
) -> dict[str, float]:
    """The same account as a calendar-day loop over per-lot state, independent of
    ``run_market``."""
    total_weight = sum(a.weight for a in assets)
    lots: list[dict[str, float]] = []
    pending = [(j, a) for j in range(len(deposits)) for a in range(len(assets))]
    fee_total = 0.0
    day = min(d.day for d in deposits)
    monthly_rate = 1 - (1 - fees.management) ** (1 / 12)

    def level(a: int, s: int) -> float:
        if taxes.base is TaxBase.REAL:
            return float(cpi.at(int(assets[a].days[s])))
        return float(assets[a].fx[s]) if taxes.base is TaxBase.CURRENCY else 1.0

    def bar_on_or_before(a: int, d: int) -> int:
        return int(np.searchsorted(assets[a].days, d, side="right")) - 1

    while day <= end:
        d = day_number(day)
        for a, asset_ in enumerate(assets):
            s = bar_on_or_before(a, d)
            if s < 0 or asset_.days[s] != d:
                continue
            if s > 0:
                gross = asset_.factor[s] / asset_.factor[s - 1]
                gross *= (1 + asset_.dividend_yield) ** (
                    (asset_.days[s] - asset_.days[s - 1]) / 365.25
                )
                g = 1 + (1 - taxes.dividend) * (gross - 1)
                for lot in lots:
                    if lot["asset"] == a and lot["bar"] < s:
                        added = lot["units"] * (g - 1)
                        shekels = added * asset_.close[s] * asset_.fx[s]
                        lot["reinvested"] += shekels
                        lot["indexed"] += shekels / level(a, s)
                        lot["units"] += added
            for j, b in list(pending):
                if b == a and day_number(deposits[j].day) <= d:
                    pending.remove((j, b))
                    money = deposits[j].amount * (1 - fees.deposit) * asset_.weight / total_weight
                    units = money / (1 + fees.buy) / prices[j][a] / asset_.fx[s]
                    lots.append(
                        {"asset": a, "deposit": j, "bar": s, "units": units, "cost": money,
                         "reinvested": 0.0, "indexed": money / level(a, s), "fees": 0.0}
                    )  # fmt: skip
        if day.day == calendar.monthrange(day.year, day.month)[1] and day < end:
            worth: list[float] = []
            for lot in lots:
                a = int(lot["asset"])
                s = bar_on_or_before(a, d)
                worth.append(lot["units"] * assets[a].close[s] * assets[a].fx[s])
            value = sum(worth)
            if value > 0:
                fee = min(value, value * monthly_rate + fees.monthly)
                phi = min(fee / value, 1 - 1e-9)
                for lot, w in zip(lots, worth, strict=True):
                    lot["fees"] += phi * w
                    lot["units"] *= 1 - phi
                fee_total += phi * value
        day += timedelta(days=1)

    value = gain = reinvested = 0.0
    for lot in lots:
        a = int(lot["asset"])
        t = bar_on_or_before(a, day_number(end))
        final = lot["units"] * assets[a].close[t] * assets[a].fx[t]
        value += final
        reinvested += lot["reinvested"]
        gain += (1 - fees.sell) * final + lot["fees"] - lot["indexed"] * level(a, t)
    tax = taxes.gains * gain if gain > 0 else 0.0
    return {
        "value": value,
        "taxable_gain": gain,
        "tax": tax,
        "net_value": (1 - fees.sell) * value - tax,
        "account_fees": fee_total,
        "reinvested": reinvested,
    }


@pytest.mark.parametrize("base", list(TaxBase))
@pytest.mark.parametrize("seed", [1, 2, 3])
def test_the_engine_equals_the_golden_model(base: TaxBase, seed: int) -> None:
    rng = np.random.default_rng(seed)
    first = START - timedelta(days=10)
    n = len(business_days(first, END + timedelta(days=5)))
    fx = 3.5 * np.exp(np.cumsum(rng.normal(0, 0.004, n)))
    assets = [
        asset("AAA", 60, seed=seed, dividends=True, fx=fx),
        asset("BBB", 30, seed=seed + 10, fx=fx, dividend_yield=0.015),
        asset("CCC", 10, seed=seed + 20, dividends=True),
    ]
    cpi = assumed_cpi(day_number(START), day_number(END), mu=0.03, sigma=0.02, phi=0.5, rng=rng)
    deposits = expand(
        [Deposit(START, 10_000.0), Deposit(date(2021, 7, 31), 5_000.0)],
        [Recurring(date(2020, 1, 31), 1_500.0, count=34)],
    )
    fees = Fees(deposit=0.005, buy=0.001, sell=0.002, management=0.006, monthly=15.0)
    taxes = Taxes(gains=0.25, dividend=0.25, base=base)
    result = run_market(
        assets, deposits, END, fees=fees, taxes=taxes, fill=FillSpec(FillMode.MID), cpi=cpi
    )
    prices = [[0.0] * len(assets) for _ in deposits]
    for lot in result.lots:
        prices[lot.deposit][[a.symbol for a in assets].index(lot.symbol)] = lot.price
    want = golden(assets, deposits, END, fees, taxes, cpi, prices)
    for name in ("value", "taxable_gain", "tax", "net_value", "account_fees"):
        assert getattr(result, name) == pytest.approx(want[name], rel=1e-9, abs=1e-6), name
    assert sum(lot.reinvested for lot in result.lots) == pytest.approx(want["reinvested"], rel=1e-9)
    # The per-deposit rows and the lots add up to the totals.
    assert sum(row.value for row in result.deposits) == pytest.approx(result.value, rel=1e-12)
    assert sum(row.tax for row in result.deposits) == pytest.approx(result.tax, rel=1e-12)
    assert sum(lot.fees_paid for lot in result.lots) == pytest.approx(result.account_fees, rel=1e-9)


def test_no_fx_equals_fx_at_a_constant_rate() -> None:
    deposits = expand([], [Recurring(START, 1000.0, count=24)])
    plain = run([asset(seed=7, dividends=True)], deposits)
    scaled = run([asset(seed=7, dividends=True, fx=3.7)], deposits)
    assert scaled.value == pytest.approx(plain.value, rel=1e-12)
    assert scaled.tax == pytest.approx(plain.tax, rel=1e-12)
    assert scaled.xirr_net == pytest.approx(plain.xirr_net, abs=1e-12)
