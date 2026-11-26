"""The worked examples of the planner's learn pages (ADR 0025), pinned twice.

Each test writes the page's formula as plain arithmetic (the golden model), checks that the
engine gives the same, and checks that the number the page prints is that number. So neither
the printed number nor the formula above it can drift from the code.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import replace
from datetime import date, timedelta

import numpy as np
import pytest

from app.config import REPO_ROOT
from app.models.bars import FloatArray
from app.planner.deposits import Deposit, add_months, day_number
from app.planner.explain import lead, shapley
from app.planner.home import Betterment, HomePlan, HomeSeries, RentMode, rate_stress, run_home
from app.planner.inflation import assumed_cpi
from app.planner.mortgage import RateKind, Repayment, Track, amortize
from app.planner.paths import block_index, estimate, lognormal
from app.planner.risk import (
    certainty_equivalent,
    cvar,
    dietz_returns,
    max_drawdown,
    percentiles,
    sharpe,
    shortfall_probability,
    sortino,
)
from app.planner.scenario import Account, Side, run_pair
from app.planner.study import effective_samples, win_probability
from app.planner.tax_presets import PURCHASE
from app.planner.xirr import xirr
from tests.unit.planner.test_scenario import FLAT_CPI, NO_TAX, account, grower, home

START = date(2026, 1, 15)

LEARN = REPO_ROOT / "docs" / "indicators"
#: The pages write negative amounts in prose with a real minus sign.
MINUS = "\u2212"


def shows(slug: str, *texts: str) -> None:
    """The page prints every one of ``texts``."""
    page = (LEARN / f"{slug}.md").read_text(encoding="utf-8")
    for text in texts:
        assert text in page, f"{slug}.md does not print {text!r}"


def pct(value: float, digits: int = 2) -> str:
    return f"{value * 100:.{digits}f} %"


def money(value: float) -> str:
    """Whole shekels as the pages write them in prose: ``3,295``, and a negative one with a
    real minus sign (U+2212)."""
    return f"{value:,.0f}".replace("-", MINUS)


def tex(text: str) -> str:
    """A number inside math: a plain minus, the separators braced, the percent sign escaped."""
    return text.replace(MINUS, "-").replace(",", "{,}").replace(" %", "\\,\\%")


def root(function: Callable[[float], float], low: float, high: float) -> float:
    """Bisection, as the pages describe it: ``function`` changes sign between the bounds."""
    for _ in range(200):
        middle = (low + high) / 2
        if function(low) * function(middle) <= 0:
            high = middle
        else:
            low = middle
    return (low + high) / 2


# ---------------------------------------------------------------- xirr.md


def test_xirr_page() -> None:
    days = [day_number(date(2020 + j, 1, 1)) for j in range(3)]
    flows = [-100_000.0, -50_000.0, 180_000.0]
    tau = [(day - days[0]) / 365.25 for day in days]

    def present_value(rate: float, amounts: list[float]) -> float:
        return sum(c * (1 + rate) ** -t for c, t in zip(amounts, tau, strict=True))

    golden = root(lambda rate: present_value(rate, flows), 0.0, 1.0)
    assert xirr(days, flows) == pytest.approx(golden, abs=1e-10)
    shows("xirr", "366 / 365.25 = 1.0021", "731 / 365.25 = 2.0014")
    assert (tau[1], tau[2]) == pytest.approx((1.0021, 2.0014), abs=5e-5)
    shows(
        "xirr",
        f"= +{tex(money(present_value(0.10, flows)))}$",
        f"${tex(money(present_value(0.12, flows)))}$",
        f"**r = {pct(golden)}**",
        f"= {tex(pct((180_000 / 150_000) ** 0.5 - 1))}$",
    )
    # The real return: the same equation on flows in shekels of the first day.
    cpi = assumed_cpi(days[0], days[-1], mu=0.025, sigma=0.0, phi=0.0, rng=None)
    rise = cpi.at(np.array(days)) / cpi.at(np.array(days))[0]
    real = [c / k for c, k in zip(flows, rise, strict=True)]
    golden_real = root(lambda rate: present_value(rate, real), 0.0, 1.0)
    assert xirr(days, real) == pytest.approx(golden_real, abs=1e-10)
    shows(
        "xirr",
        f"by {rise[1]:.3f} and {rise[2]:.4f}",
        f"{money(real[1])} and +{money(real[2])}",
        f"**real return is {pct(golden_real)}**",
        f"${1 + golden:.4f} / 1.025 = {(1 + golden) / 1.025:.4f}$",
        f"(that would be {pct(golden - 0.025)})",
    )
    # The three kinds of yearly rate.
    shows("xirr", f"₪{100 * (1 + 0.04 / 12) ** 12:.2f}: {pct((1 + 0.04 / 12) ** 12 - 1)} effective")
    # One deposit: the XIRR is the compound growth rate.
    assert xirr([0, 730.5], [-100.0, 121.0]) == pytest.approx(0.10, abs=1e-9)
    # A gain of 2 % in a month.
    shows("xirr", f"an XIRR of about {1.02 ** (365.25 / 30.4375) - 1:.0%}".replace("%", " %"))


# ---------------------------------------------------------------- mortgage-tracks.md


def table(
    loan: float,
    months: int,
    rates: list[float],
    index: list[float] | None = None,
    *,
    equal_principal: bool = False,
) -> list[tuple[float, float, float, float]]:
    """The page's "one month of a track", as a loop: (payment, interest, linkage, balance)."""
    rows: list[tuple[float, float, float, float]] = []
    balance = loan
    for k in range(1, months + 1):
        start = balance * (index[k] / index[k - 1]) if index else balance
        i = rates[k - 1] / 12
        left = months - k + 1
        interest = start * i
        if equal_principal:
            payment = start / left + interest
        else:
            payment = start * i / (1 - (1 + i) ** -left)
        rows.append((payment, interest, start - balance, start + interest - payment))
        balance = rows[-1][3]
    return rows


def shekels(value: float, digits: int = 0) -> str:
    return f"₪{value:,.{digits}f}"


def test_mortgage_tracks_page() -> None:
    n, flat, four = 240, np.ones(241), np.full(241, 0.04)
    # A fixed track, by the loop and by the closed forms of the derivation.
    fixed = amortize(Track(600_000, n, rate=0.04), four, flat)
    golden = table(600_000, n, [0.04] * n)
    assert fixed.payment == pytest.approx([row[0] for row in golden])
    assert fixed.balance[:-1] == pytest.approx([row[3] for row in golden][:-1])
    i = 0.04 / 12
    payment = 600_000 * i / (1 - (1 + i) ** -n)
    after_24 = 600_000 * (1 + i) ** 24 - payment * ((1 + i) ** 24 - 1) / i
    assert (fixed.payment[0], fixed.balance[23]) == pytest.approx((payment, after_24))
    shows(
        "mortgage-tracks",
        f"**{shekels(payment, 2)}**",
        f"{shekels(golden[0][1], 2)}, so principal {shekels(payment - golden[0][1], 2)}",
        f"falls to\n  {shekels(golden[0][3], 2)}",
        f"the balance is {shekels(after_24)}: two years of payments ({shekels(24 * payment)}) "
        f"repaid only {shekels(600_000 - after_24)}",
        f"the interest is {shekels(float(fixed.interest.sum()))}.",
        f"=$ {shekels(after_24)}.",
    )
    # Equal principal.
    equal = amortize(Track(600_000, n, rate=0.04, repayment=Repayment.EQUAL_PRINCIPAL), four, flat)
    golden_equal = table(600_000, n, [0.04] * n, equal_principal=True)
    assert equal.payment == pytest.approx([row[0] for row in golden_equal])
    shows(
        "mortgage-tracks",
        f"=$ {shekels(golden_equal[0][0], 2)} and the last\nis {shekels(golden_equal[-1][0], 2)}",
        f"over the term is {shekels(float(equal.interest.sum()))}",
    )
    # Prime, and the stress test on it.
    prime_track = Track(600_000, n, kind=RateKind.PRIME, rate=-0.005)
    prime = amortize(prime_track, four, flat)
    assert prime.rate[0] == pytest.approx(0.04 + 0.015 - 0.005)
    golden_prime = table(600_000, n, [0.05] * n)
    assert prime.payment[0] == pytest.approx(golden_prime[0][0])
    plan = HomePlan(START, 24, 1_000_000, 400_000, [prime_track], betterment=Betterment(rate=0.0))
    (_, two, _) = rate_stress(plan, HomeSeries(flat, flat, four, flat))
    golden_stress = table(600_000, n, [0.05] + [0.07] * (n - 1))
    assert two.highest_payment == pytest.approx(max(row[0] for row in golden_stress))
    shows(
        "mortgage-tracks",
        f"over 20 years is {shekels(golden_prime[0][0], 2)}.",
        f"on the {shekels(golden_stress[0][3])} still owed",
        f"**{shekels(golden_stress[1][0], 2)}** a month, "
        f"{shekels(golden_stress[1][0] - golden_stress[0][0], 2)} more",
    )
    # A variable track whose anchor is 2 points higher at its first reset.
    anchor = four.copy()
    anchor[60:] = 0.06
    variable = amortize(
        Track(600_000, n, kind=RateKind.VARIABLE, rate=0.04, reset_months=60), anchor, flat
    )
    golden_variable = table(600_000, n, [0.04] * 60 + [0.06] * 180)
    assert variable.payment == pytest.approx([row[0] for row in golden_variable])
    shows(
        "mortgage-tracks",
        f"jumps from {shekels(golden_variable[59][0], 2)} to {shekels(golden_variable[60][0], 2)}",
    )
    # A linked track against the same one without linkage.
    cpi = [1.025 ** (k / 12) for k in range(n + 1)]
    linked = amortize(Track(600_000, n, rate=0.03, linked=True), four, np.array(cpi))
    golden_linked = table(600_000, n, [0.03] * n, cpi)
    plain = table(600_000, n, [0.03] * n)
    assert linked.payment == pytest.approx([row[0] for row in golden_linked])
    assert linked.linkage == pytest.approx([row[2] for row in golden_linked])
    shows(
        "mortgage-tracks",
        f"adds {shekels(golden_linked[0][2], 2)} to the\ndebt",
        f"first payment is {shekels(golden_linked[0][0], 2)}, only a little above the "
        f"{shekels(plain[0][0], 2)}",
        f"the last one is {shekels(golden_linked[-1][0], 2)}",
        f"the debt is\n{shekels(golden_linked[11][3])}, against {shekels(plain[11][3])}",
        f"is {pct((1 + 0.04 / 12) ** 12 - 1)} effective",
    )


# ---------------------------------------------------------------- rent-or-buy.md


def test_rent_or_buy_page() -> None:
    months, term = 120, 300
    grid = np.arange(term + 1)
    value, cpi = 1.03 ** (grid / 12), 1.025 ** (grid / 12)
    single = PURCHASE[0].brackets
    plan = HomePlan(
        start=START,
        months=months,
        price=2_000_000,
        equity=600_000,
        tracks=[Track(1_400_000, term, rate=0.04)],
        purchase_tax=single,
        lawyer=0.006,
        broker=0.024,
        maintenance=0.005,
        insurance=1_500,
        rent_mode=RentMode.LIVE,
        rent=5_500,
        selling=0.024,
        betterment=Betterment(single_home=True),
    )
    result = run_home(plan, HomeSeries(value, cpi, np.full(term + 1, 0.04), cpi))

    # The page's ledger as a loop.
    tax = 0.035 * (2_000_000 - 1_978_745)
    costs = tax + (0.006 + 0.024) * 2_000_000
    loan = table(1_400_000, term, [0.04] * term)
    flows = [-(600_000 + costs)]
    for k in range(1, months + 1):
        own = 0.005 * 2_000_000 * value[k] / 12 + 1_500 / 12 * cpi[k]
        rent = 5_500 * cpi[k - 1]
        flows.append(rent - loan[k - 1][0] - own)
    worth = 2_000_000 * value[months]
    gain = worth * (1 - 0.024) - (2_000_000 + costs) * cpi[months]
    net = worth * (1 - 0.024) - loan[months - 1][3]  # the gain is negative: no tax
    out_1 = -flows[1]
    flows[-1] += net
    years = [(day_number(add_months(START, k)) - day_number(START)) / 365.25 for k in range(121)]
    golden = root(lambda r: sum(c * (1 + r) ** -t for c, t in zip(flows, years, strict=True)), 0, 1)

    assert (result.purchase_tax, result.purchase_costs) == pytest.approx((tax, costs))
    assert result.net_worth[-1] == pytest.approx(net)
    assert result.betterment[-1] == 0.0
    assert gain < 0
    assert result.xirr == pytest.approx(golden, abs=1e-10)
    own_1 = 0.005 * 2_000_000 * value[1] / 12 + 1_500 / 12 * cpi[1]
    shows(
        "rent-or-buy",
        f"=$ {shekels(tax)}.",
        f"$C_0 =$ **{shekels(costs)}**",
        f"starts {shekels(600_000 + costs)} out of pocket",
        f"The payment is {shekels(loan[0][0], 2)}",
        f"{tex(money(2_000_000 * value[1]))} / 12 + 1{{,}}500 / 12 \\cdot {cpi[1]:.5f} =$ "
        f"{shekels(own_1, 2)}",
        f"=$ {shekels(out_1, 2)}.",
        f"=$ {shekels(worth)}.",
        f"still owed: {shekels(loan[months - 1][3])}.",
        f"= {tex(money(gain))}$",
        f"=$ **{shekels(net)}**",
        f"**{pct(golden)} a year**, and {pct(result.xirr_real or 0)} above inflation",
    )
    # An additional home that gained in real terms pays the tax.
    growing = 1.05 ** (grid / 12)
    additional = replace(
        plan, purchase_tax=PURCHASE[1].brackets, betterment=Betterment(single_home=False)
    )
    taxed = run_home(additional, HomeSeries(growing, cpi, np.full(term + 1, 0.04), cpi))
    costs_2 = 0.08 * 2_000_000 + 0.03 * 2_000_000
    worth_2 = 2_000_000 * 1.05**10
    gain_2 = worth_2 * (1 - 0.024) - (2_000_000 + costs_2) * cpi[months]
    assert taxed.purchase_tax == pytest.approx(160_000)
    assert taxed.betterment[-1] == pytest.approx(0.25 * gain_2)
    shows(
        "rent-or-buy",
        f"ends at {shekels(worth_2)}. The real gain is {shekels(gain_2)} and the tax is a quarter "
        f"of it: {shekels(0.25 * gain_2)}.",
    )
    # How long the owner is below the money put in.
    back = next(k for k in range(1, months + 1) if result.net_worth[k] >= 600_000 + costs)
    shows("rent-or-buy", f"for the first {back - 1} months")


# ---------------------------------------------------------------- same-money.md


def test_same_money_page() -> None:
    first, second, end = date(2020, 1, 15), date(2021, 1, 15), date(2022, 1, 15)
    a = Side(
        account=Account([grower(0.05)], taxes=NO_TAX),
        deposits=[Deposit(first, 100_000), Deposit(second, 50_000)],
    )
    result = run_pair(a, Side(account=Account([grower(0.08)], taxes=NO_TAX)), end, FLAT_CPI)

    # The page's rule as a loop over the days.
    own_a, own_b = [100_000.0, 50_000.0], [0.0, 0.0]
    shared = [max(x, y, 0.0) for x, y in zip(own_a, own_b, strict=True)]
    top_a = [f - x for f, x in zip(shared, own_a, strict=True)]
    top_b = [f - y for f, y in zip(shared, own_b, strict=True)]
    years = [(day_number(end) - day_number(day)) / 365.25 for day in (first, second)]
    end_a = sum(x * 1.05**t for x, t in zip(own_a, years, strict=True))
    end_b = sum(u * 1.08**t for u, t in zip(top_b, years, strict=True))

    assert result.budget == pytest.approx(shared)
    assert (list(result.x.top_up), list(result.y.top_up)) == (top_a, top_b)
    assert (result.x.wealth, result.y.wealth) == pytest.approx((end_a, end_b))
    assert (result.x.xirr, result.y.xirr) == pytest.approx((0.05, 0.08), abs=1e-9)
    shows(
        "same-money",
        f"1.05^{{{years[0]:.4f}}} + 50{{,}}000 \\cdot 1.05^{{{years[1]:.4f}}} =$ {shekels(end_a)}",
        f"\n{shekels(end_b)}. So $\\Delta = {tex(money(end_a - end_b))}$",
        "exactly 5.00 % and 8.00 %",
    )
    # A month of surplus is invested by the option that has it.
    owner = home(rent_mode=RentMode.RENT_OUT, rent=4_000.0)
    surplus = run_pair(owner, Side(account=account()), add_months(first, 24), FLAT_CPI)
    assert list(surplus.x.own[:2]) == [400_000, -1_500]
    assert list(surplus.budget[:2]) == [max(400_000, 0, 0), max(-1_500, 0, 0)]
    assert list(surplus.x.top_up[:2]) == [0, 1_500]
    assert list(surplus.y.top_up[:2]) == [400_000, 0]
    # Spending on different days does not cancel.
    flat = Account([grower(0.0)], taxes=NO_TAX)
    early = Side(account=flat, deposits=[Deposit(first, 10_000)])
    late = Side(account=flat, deposits=[Deposit(first + timedelta(days=30), 10_000)])
    apart = run_pair(early, late, end, FLAT_CPI)
    assert list(apart.budget) == [10_000, 10_000]
    assert float(apart.budget.sum()) == 20_000
    shows("same-money", "each option puts in ₪20,000")


# ---------------------------------------------------------------- overlapping-windows.md


def test_overlapping_windows_page() -> None:
    span, term = 240, 120
    assert span // 1 + 1 == 241
    golden = (span + term) / term
    assert effective_samples(span, term) == golden
    shows("overlapping-windows", f"= {golden:.1f}", "$N = 241$ windows")
    differences = np.array([5.0, 3.0, -2.0, 0.0, 4.0])
    scores = [1.0 if d > 0 else 0.5 if d == 0 else 0.0 for d in differences]
    assert win_probability(differences, np.zeros(5)) == sum(scores) / len(scores)
    shows("overlapping-windows", f"**{sum(scores) / len(scores):.0%}**".replace("%", " %"))
    # The correlation of two windows j months apart, on simulated independent months.
    rng = np.random.default_rng(1)
    months = rng.standard_normal((20_000, term + 24))
    sums = np.cumsum(months, axis=1)

    def window(j: int) -> FloatArray:
        return sums[:, j + term - 1] - (sums[:, j - 1] if j else 0.0)

    for apart in (1, 24):
        measured = float(np.corrcoef(window(0), window(apart))[0, 1])
        assert measured == pytest.approx((term - apart) / term, abs=0.01)
    shows(
        "overlapping-windows",
        f"correlate at {(term - 1) / term:.3f}, and windows two years apart at "
        f"{(term - 24) / term:.2f}",
        f"that is {(0.7 * 0.3 / golden) ** 0.5:.2f}:",
        "$4.6 + 10 - 4.5 =$ 10.1 %",
    )


# ---------------------------------------------------------------- simulated-worlds.md


def test_simulated_worlds_page() -> None:
    mu, sigma = 0.07, 0.16
    drift, correction, noise = math.log(1 + mu) / 12, sigma**2 / 24, sigma / math.sqrt(12)
    shows("simulated-worlds", f"= {drift:.6f}$", f"= {correction:.6f}$", f"= {noise:.6f}$")
    for z, sign in ((-1.0, MINUS), (0.0, "+"), (1.0, "+")):
        step = drift - correction + noise * z  # the page's formula, one month
        level = float(lognormal(mu, sigma, np.array([z]))[-1])
        assert level == pytest.approx(math.exp(step))
        shows("simulated-worlds", f"| {sign}{abs(step):.5f} | {sign}{pct(abs(level - 1))} |")
    # Twelve ordinary months are the median year; the mean of many worlds is the stated growth.
    median = float(lognormal(mu, sigma, np.zeros(12))[-1]) - 1
    assert median == pytest.approx((1 + mu) * math.exp(-(sigma**2) / 2) - 1)
    shocks = np.random.default_rng(1).standard_normal((40_000, 12))
    mean = float(lognormal(mu, sigma, shocks)[:, -1].mean()) - 1
    assert mean == pytest.approx(mu, abs=0.003)
    shows(
        "simulated-worlds",
        f"compound to +{pct(median)}, not +7 %",
        f"e^{{-{sigma**2 / 2:.4f}}} - 1 = {tex(pct(median))}$",
        f"it came out at {pct(mean)}",
    )
    # The estimate inverts the model.
    logs = [0.03, -0.02, 0.05, 0.01, -0.04, 0.02]
    x_bar = sum(logs) / len(logs)
    s2 = sum((x - x_bar) ** 2 for x in logs) / (len(logs) - 1)
    golden = (math.exp(12 * (x_bar + s2 / 2)) - 1, math.sqrt(12 * s2))
    assert estimate(np.exp(np.array(logs))) == pytest.approx(golden)
    shows(
        "simulated-worlds",
        f"$\\bar x = {tex(pct(x_bar, 3))}$",
        f"$\\operatorname{{sd}}(x) = {tex(pct(math.sqrt(s2), 3))}$",
        f"= {tex(pct(golden[1]))}$",
        f"e^{{12({x_bar:.6f} + {s2 / 2:.6f})}} - 1 = {tex(pct(golden[0]))}$",
    )
    tied = 0.5 * 1 + math.sqrt(1 - 0.5**2) * -0.4
    shows("simulated-worlds", f"{math.sqrt(0.75):.3f} \\cdot (-0.4) = +{tied:.3f}$")
    # A block is a run of consecutive months of history.
    index = block_index(np.random.default_rng(3), 60, 12)
    assert np.all(np.diff(index.reshape(-1, 12), axis=1) == 1)


# ---------------------------------------------------------------- risk-metrics.md

# fmt: off
WORLDS = [
    820, 910, 950, 1010, 1040, 1080, 1120, 1150, 1190, 1230,
    1260, 1300, 1340, 1380, 1430, 1480, 1540, 1620, 1730, 1900,
]
# fmt: on


def test_risk_metrics_page() -> None:
    worlds = np.array(WORLDS, dtype=np.float64)
    count = len(WORLDS)
    shows("risk-metrics", ", ".join(f"{w:,}" for w in WORLDS[:17]))
    p5, _, median, _, _ = percentiles(worlds)
    assert median == (WORLDS[9] + WORLDS[10]) / 2
    at = 0.05 * (count - 1)  # linear between the order statistics
    assert p5 == pytest.approx(WORLDS[0] + at * (WORLDS[1] - WORLDS[0]))
    worst = math.ceil(0.05 * count)
    assert cvar(worlds) == sum(WORLDS[:worst]) / worst
    below = sum(w < 1000 for w in WORLDS) / count
    assert shortfall_probability(worlds, np.full(count, 1000.0)) == below
    harmonic = count / sum(1 / w for w in WORLDS)
    assert certainty_equivalent(worlds) == pytest.approx(harmonic)
    mean = sum(WORLDS) / count
    inside = sum(1000 <= w <= 1500 for w in WORLDS)
    shows(
        "risk-metrics",
        f"=$ {median:,.0f}.",
        f"**5 % percentile:** {p5:,.1f},",
        f"single worst world: {cvar(worlds):.0f}.",
        f"end below 1,000: {below:.0%}".replace("%", " %"),
        f"harmonic mean is {harmonic:,.0f}, against an ordinary mean of {mean:,.0f}",
        f"costs this investor {mean - harmonic:.0f}",
        f"{inside} of {count} worlds, $\\hat p = {tex(pct(inside / count, 0))}$",
    )
    # One world's path.
    path = [100.0, 120.0, 90.0, 110.0, 130.0, 104.0]
    peak, deepest = 0.0, 0.0
    for worth in path:
        peak = max(peak, worth)
        deepest = max(deepest, (peak - worth) / peak)
    assert max_drawdown(np.array(path)) == deepest
    shows("risk-metrics", f"= {tex(pct(deepest, 0))}$", f"is {pct((130 - 104) / 130, 0)}")
    worth, put_in = [500.0, 560.0, 640.0, 610.0, 720.0], 40.0
    yearly = [(worth[t] - worth[t - 1] - put_in) / (worth[t - 1] + put_in / 2) for t in range(1, 5)]
    assert dietz_returns(np.array(worth), np.full(4, put_in)) == pytest.approx(yearly)
    y_bar = sum(yearly) / 4
    spread = math.sqrt(sum((y - y_bar) ** 2 for y in yearly) / 3)
    downside = math.sqrt(sum(min(y, 0) ** 2 for y in yearly) / 4)
    assert sharpe(np.array(yearly)) == pytest.approx(y_bar / spread)
    assert sortino(np.array(yearly)) == pytest.approx(y_bar / downside)
    shows(
        "risk-metrics",
        f"= {tex(pct(yearly[0]))}$",
        "give "
        + ", ".join(pct(y).replace("-", MINUS) for y in yearly[:3])
        + f" and {pct(yearly[3])}",
        f"of {pct(y_bar)} and a standard deviation of {pct(spread)}, "
        f"so Sharpe is {y_bar / spread:.2f}",
        f"= {y_bar / downside:.2f}$",
    )


# ---------------------------------------------------------------- what-the-answer-depends-on.md


def test_what_the_answer_depends_on_page() -> None:
    worth = {
        frozenset[str](): 0.0,
        frozenset({"appreciation"}): 0.03,
        frozenset({"leverage"}): -0.01,
        frozenset({"appreciation", "leverage"}): 0.05,
    }
    # Every order of switching the two on, by hand.
    first = (worth[frozenset({"appreciation"})] - 0.0, 0.05 - worth[frozenset({"appreciation"})])
    second = (worth[frozenset({"leverage"})] - 0.0, 0.05 - worth[frozenset({"leverage"})])
    golden = {"appreciation": (first[0] + second[1]) / 2, "leverage": (first[1] + second[0]) / 2}
    shares = shapley(worth.__getitem__, ["appreciation", "leverage"])
    assert shares == pytest.approx(golden)
    assert sum(shares.values()) == pytest.approx(0.05)
    shows(
        "what-the-answer-depends-on",
        f"**{golden['appreciation'] * 100:.1f} points**",
        f"**{golden['leverage'] * 100:.1f} points**",
    )
    # The forced sale of the ledger page's apartment (no tax: its real gain is negative).
    value, owed = 2_000_000 * 1.03**10, 999_031.5521349199
    normal = value * 0.976 - owed
    forced = value * 0.9 * 0.976 - owed
    shows(
        "what-the-answer-depends-on",
        f"=$ {shekels(forced)}, against {shekels(normal)} in a\nnormal sale: "
        f"{shekels(normal - forced)} less",
        f"took {(normal - forced) / normal:.0%}".replace("%", " %"),
        f"1.1046: an apartment worth {shekels(value)} at the sale is worth "
        f"{shekels(value * 1.01**10)}",
    )
    assert pytest.approx(1.1046, abs=5e-5) == 1.01**10
    # Who leads.
    found = lead([12, 24, 36, 48, 60], np.array([1.0, 2, 5, 6, 9]), np.array([2.0, 3, 4, 7, 8]))
    assert (found.leader, found.since, found.x_share) == ("x", 60, 0.4)
    # Fisher's interval.
    z, half = math.atanh(0.30), 1.96 / math.sqrt(20 - 3)
    shows(
        "what-the-answer-depends-on",
        f"= {z:.4f}$",
        f"= {half:.4f}$",
        f"$\\tanh({z - half:.4f})$ to $\\tanh({z + half:.4f})$",
        f"**{math.tanh(z - half):.2f} to {math.tanh(z + half):.2f}**".replace("-", MINUS),
    )
