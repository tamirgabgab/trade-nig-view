"""Two options on the same money: hand answers, the ledgers, and an independent golden model."""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pytest

from app.planner.deposits import Deposit, add_months, day_number
from app.planner.home import Betterment, HomePlan, HomeSeries, RentMode, run_home
from app.planner.inflation import CpiPath, assumed_cpi
from app.planner.market import AssetData, Fees, PlanError, TaxBase, Taxes
from app.planner.mortgage import Repayment, Track
from app.planner.scenario import Account, Side, run_pair
from tests.unit.planner.test_market import asset, golden

START = date(2020, 1, 15)
NO_TAX = Taxes(gains=0.0, dividend=0.0)
FLAT_CPI = CpiPath(np.array([0, 40_000]), np.array([100.0, 100.0]))


def grower(rate: float, first: date = START, years: int = 31) -> AssetData:
    """A bar on every calendar day, growing by ``rate`` a year (so a deposit buys on its day)."""
    days = np.arange(day_number(first), day_number(first) + years * 366, dtype=np.int64)
    close = (1.0 + rate) ** ((days - days[0]) / 365.25)
    ones = np.ones(len(days))
    return AssetData("MKT", 1.0, days, close, close, close, close, ones, ones)


def account(rate: float = 0.0, taxes: Taxes = NO_TAX) -> Account:
    return Account([grower(rate)], taxes=taxes)


def home(
    price: float = 1_000_000,
    equity: float = 400_000,
    months: int = 24,
    rate: float = 0.0,
    **plan: object,
) -> Side:
    """An apartment on a constant value, with one track over 20 years and no taxes."""
    ones = np.ones(241)
    return Side(
        home=HomePlan(
            start=START,
            months=months,
            price=price,
            equity=equity,
            tracks=[Track(price - equity, 240, rate=rate)],
            betterment=Betterment(rate=0.0),
            **plan,  # type: ignore[arg-type]
        ),
        series=HomeSeries(ones, ones, np.full(241, 0.04), ones),
    )


END = add_months(START, 24)

# ---------------------------------------------------------------- hand answers


def test_a_mirror_at_zero_return_ends_where_the_apartment_does() -> None:
    # 600,000 at 0 % over 240 months: 2,500 a month. After 24 months the balance is 540,000.
    result = run_pair(home(), Side(account=account()), END, FLAT_CPI)
    # The day of the sale pays its own bills in cash: both sides end with 460,000 less the
    # last payment, and both put in 400,000 and then 2,500 on each of 23 month dates.
    assert result.x.wealth == pytest.approx(460_000 - 2_500)
    assert result.y.wealth == pytest.approx(457_500)
    assert result.budget == pytest.approx([400_000] + [2_500] * 23)
    assert list(result.days) == [day_number(add_months(START, k)) for k in range(24)]
    assert result.y.top_up == pytest.approx(result.budget)
    assert result.x.top_up == pytest.approx(np.zeros(24))
    assert result.x.market is None
    assert (result.x.xirr, result.y.xirr) == pytest.approx((0.0, 0.0), abs=1e-9)


def test_the_mirror_of_a_constant_return_earns_exactly_that_return() -> None:
    side = home(rate=0.04, maintenance=0.005)
    result = run_pair(side, Side(account=account(0.07)), END, FLAT_CPI)
    assert result.y.xirr == pytest.approx(0.07, abs=1e-9)
    # Without a month of surplus the apartment's side is the apartment alone.
    assert side.home is not None
    assert side.series is not None
    alone = run_home(side.home, side.series)
    assert result.x.xirr == pytest.approx(alone.xirr, abs=1e-12)
    assert result.x.wealth == pytest.approx(
        alone.net_worth[-1] - alone.payment[-1] - alone.costs[-1]
    )


def test_a_month_of_surplus_is_invested_by_the_apartments_side() -> None:
    # Rented out for 4,000 against a payment of 2,500: 1,500 a month to invest.
    owner = home(rent_mode=RentMode.RENT_OUT, rent=4_000.0)
    result = run_pair(owner, Side(account=account()), END, FLAT_CPI)
    assert result.budget == pytest.approx([400_000] + [0.0] * 23)
    assert result.x.top_up == pytest.approx([0.0] + [1_500.0] * 23)
    assert result.x.market is not None  # in the other side's mix: the owner named none
    assert result.x.market.deposited == pytest.approx(23 * 1_500)
    # 460,000 of net worth, 23 invested surpluses, and the last month's 1,500 in cash.
    assert result.x.wealth == pytest.approx(460_000 + 24 * 1_500)
    assert result.y.wealth == pytest.approx(400_000)


def test_identical_options_tie_and_need_no_account() -> None:
    result = run_pair(home(rate=0.05), home(rate=0.05), END, FLAT_CPI)
    assert result.x.wealth == result.y.wealth
    assert result.x.xirr == result.y.xirr
    assert not result.x.top_up.any()
    assert not result.y.top_up.any()


def test_the_cheaper_option_invests_the_difference() -> None:
    # X repays 6,000 a month; Y repays 4,000 and deposits 1,000: Y is topped up by 1,000 more.
    dear = home(price=1_840_000)
    cheap = home(price=1_360_000)
    saver = Side(
        home=cheap.home,
        series=cheap.series,
        account=account(),
        deposits=[Deposit(add_months(START, k), 1_000.0) for k in range(1, 24)],
    )
    result = run_pair(dear, saver, END, FLAT_CPI)
    assert result.budget == pytest.approx([400_000] + [6_000] * 23)
    assert result.y.top_up == pytest.approx([0.0] + [1_000.0] * 23)
    assert result.y.market is not None
    assert result.y.market.deposited == pytest.approx(23 * 2_000)
    assert result.x.wealth == pytest.approx(400_000 + 23 * 6_000)
    assert result.y.wealth == pytest.approx(400_000 + 23 * 4_000 + 23 * 2_000)


def test_plans_on_different_days_both_spend_the_sum() -> None:
    early = Side(account=account(), deposits=[Deposit(date(2020, 1, 5), 1_000.0)])
    late = Side(account=account(), deposits=[Deposit(date(2020, 1, 20), 1_000.0)])
    result = run_pair(early, late, date(2021, 1, 20), FLAT_CPI)
    assert result.budget == pytest.approx([1_000.0, 1_000.0])
    assert (result.x.wealth, result.y.wealth) == pytest.approx((2_000.0, 2_000.0))


def test_real_results_are_in_shekels_of_the_first_day() -> None:
    cpi = assumed_cpi(day_number(START), day_number(END), mu=0.03)
    result = run_pair(home(), Side(account=account(0.07)), END, cpi)
    rise = float(cpi.at(day_number(END)) / cpi.at(day_number(START)))
    assert result.y.wealth_real == pytest.approx(result.y.wealth / rise)
    assert result.y.xirr_real == pytest.approx(1.07 / 1.03 - 1, abs=2e-4)


def test_pairs_that_cannot_run_say_why() -> None:
    with pytest.raises(PlanError, match="asset mix"):
        run_pair(home(price=1_840_000), home(), END, FLAT_CPI)
    with pytest.raises(PlanError, match="sold on the end date"):
        run_pair(home(), Side(account=account()), END + timedelta(days=3), FLAT_CPI)
    with pytest.raises(PlanError, match="before the end"):
        run_pair(Side(account=account(), deposits=[Deposit(END, 5.0)]), Side(), END, FLAT_CPI)
    with pytest.raises(PlanError, match="nothing to compare"):
        run_pair(Side(), Side(account=account()), END, FLAT_CPI)


# ---------------------------------------------------------------- the golden model


def golden_pair(x: Side, y: Side, end: date, cpi: CpiPath) -> tuple[float, float, dict[int, float]]:
    """Both options by a plain loop over dated flows, each account valued by the day-by-day
    golden model of the market account. Independent of ``run_pair``."""
    end_day = day_number(end)
    own: list[dict[int, float]] = []
    worth: list[float] = []
    for side in (x, y):
        flows: dict[int, float] = {}
        net = 0.0
        if side.home is not None and side.series is not None:
            result = run_home(side.home, side.series)
            first = day_number(result.dates[0])
            flows[first] = side.home.equity + result.purchase_costs
            for k in range(1, len(result.dates)):
                day = day_number(result.dates[k])
                spent = result.payment[k] + result.costs[k] - result.rent[k]
                flows[day] = flows.get(day, 0.0) + float(spent)
            net = float(result.net_worth[-1])
        for deposit in side.deposits:
            day = day_number(deposit.day)
            flows[day] = flows.get(day, 0.0) + deposit.amount
        own.append(flows)
        worth.append(net)
    days = sorted(d for d in set(own[0]) | set(own[1]) if d < end_day)
    budget = {d: max(own[0].get(d, 0.0), own[1].get(d, 0.0), 0.0) for d in days}
    out: list[float] = []
    for side, other, flows, net in zip((x, y), (y, x), own, worth, strict=True):
        buys = [(day_number(d.day), d.amount) for d in side.deposits]
        buys += [(d, budget[d] - flows.get(d, 0.0)) for d in days]
        buys = sorted((d, a) for d, a in buys if a > 1e-6)
        value = 0.0
        if buys:
            used = side.account or other.account
            assert used is not None
            deposits = [Deposit(date(1970, 1, 1) + timedelta(days=d), a) for d, a in buys]
            prices = [
                [float(a.close[np.searchsorted(a.days, d, side="left")]) for a in used.assets]
                for d, _ in buys
            ]
            value = golden(list(used.assets), deposits, end, used.fees, used.taxes, cpi, prices)[
                "net_value"
            ]
        out.append(net + value - flows.get(end_day, 0.0))
    return out[0], out[1], budget


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_the_pair_equals_the_golden_model(seed: int) -> None:
    rng = np.random.default_rng(seed)
    start, end = date(2020, 1, 15), date(2022, 12, 15)
    months = 35
    cpi = assumed_cpi(day_number(start), day_number(end), mu=0.03, sigma=0.02, phi=0.5, rng=rng)
    month_days = np.array([day_number(add_months(start, k)) for k in range(241)])
    index = cpi.at(month_days)
    value = np.exp(np.cumsum(np.concatenate(([0.0], rng.normal(0.003, 0.01, 240)))))
    anchor = 0.03 + 0.0002 * np.arange(241)
    tracks = [
        Track(500_000, 240, rate=0.045),
        Track(400_000, 180, rate=0.03, linked=True),
        Track(300_000, 120, rate=0.04, repayment=Repayment.GRACE, grace_months=12),
    ]
    owner = Side(
        home=HomePlan(
            start=start,
            months=months,
            price=1_800_000,
            equity=600_000,
            tracks=tracks,
            lawyer=0.006,
            broker=0.02,
            maintenance=0.005,
            insurance=1_500.0,
            # High enough that some months leave a surplus once the grace track pays interest only.
            rent_mode=RentMode.LIVE,
            rent=6_800.0,
            selling=0.02,
            betterment=Betterment(rate=0.25),
        ),
        series=HomeSeries(value, index, anchor, index),
        deposits=[Deposit(date(2020, 6, 15), 20_000.0), Deposit(date(2021, 3, 2), 5_000.0)],
    )
    fx = 3.5 * np.exp(np.cumsum(rng.normal(0, 0.004, 786)))
    mix = Account(
        [asset("AAA", 70, seed=seed, dividends=True, fx=fx), asset("BBB", 30, seed=seed + 9)],
        fees=Fees(deposit=0.004, buy=0.001, sell=0.002, management=0.005, monthly=12.0),
        taxes=Taxes(gains=0.25, dividend=0.25, base=TaxBase.REAL),
    )
    mirror = Side(account=mix, deposits=[Deposit(date(2021, 9, 15), 9_000.0)])
    result = run_pair(owner, mirror, end, cpi)
    want_x, want_y, budget = golden_pair(owner, mirror, end, cpi)
    assert result.x.wealth == pytest.approx(want_x, rel=1e-9, abs=1e-6)
    assert result.y.wealth == pytest.approx(want_y, rel=1e-9, abs=1e-6)
    assert list(result.days) == list(budget)
    assert result.budget == pytest.approx(list(budget.values()), rel=1e-12)
    # The mirror's definition: on every day both options spend the same money.
    for side in (result.x, result.y):
        assert side.own + side.top_up == pytest.approx(result.budget, rel=1e-12, abs=1e-9)
        assert np.all(side.top_up >= 0)
    assert (result.x.top_up > 0).any()  # the scenario does exercise a surplus month
    assert (result.y.top_up > 0).any()
