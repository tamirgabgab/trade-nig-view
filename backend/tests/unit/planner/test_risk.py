"""Layer 2 of the comparison metrics: each one against an answer worked out by hand."""

from __future__ import annotations

import numpy as np
import pytest

from app.planner.risk import (
    certainty_equivalent,
    cvar,
    dietz_returns,
    dominance,
    max_drawdown,
    percentiles,
    regret,
    sharpe,
    shortfall_probability,
    sortino,
)

# ---------------------------------------------------------------- the bad tail


def test_percentiles_interpolate_between_the_order_statistics() -> None:
    assert percentiles(np.array([5.0, 1.0, 4.0, 2.0, 3.0])) == pytest.approx([1.2, 2, 3, 4, 4.8])


def test_cvar_is_the_mean_of_the_worst_share() -> None:
    values = np.arange(100.0, 0.0, -1.0)  # 100 .. 1
    assert cvar(values) == pytest.approx(3.0)  # the worst five: 1 .. 5
    assert cvar(values, level=0.10) == pytest.approx(5.5)
    # Fewer than twenty values: still at least the single worst one.
    assert cvar(np.array([7.0, 3.0, 9.0])) == 3.0
    assert cvar(values) <= percentiles(values)[0]


def test_the_chance_of_ending_below_the_money_put_in() -> None:
    wealth = np.array([90.0, 110.0, 100.0, 80.0])
    assert shortfall_probability(wealth, np.full(4, 100.0)) == 0.5  # ending level is not a loss
    assert shortfall_probability(wealth, np.array([95.0, 120.0, 100.0, 70.0])) == 0.5


# ---------------------------------------------------------------- regret


def test_regret_is_what_the_other_option_would_have_added() -> None:
    chosen = np.array([1.0, 5.0, 3.0])
    other = np.array([2.0, 2.0, 7.0])
    mean, high = regret(chosen, other)  # the shortfalls are 1, 0 and 4
    assert mean == pytest.approx(5 / 3)
    assert high == pytest.approx(3.7)


def test_identical_options_have_no_regret() -> None:
    values = np.array([3.0, 8.0, 1.0])
    assert regret(values, values) == (0.0, 0.0)
    assert regret(values + 1, values) == (0.0, 0.0)


# ---------------------------------------------------------------- stochastic dominance


def test_a_sure_extra_dominates_in_the_first_order() -> None:
    x = np.array([4.0, 9.0, 1.0, 6.0])
    assert dominance(x + 1, x) == "x_first"
    assert dominance(x, x + 1) == "y_first"
    assert dominance(x, x) == "equal"
    # The order of the worlds does not matter: dominance compares the two distributions.
    assert dominance(x[::-1] + 1, x) == "x_first"


def test_the_same_mean_with_less_spread_dominates_in_the_second_order_only() -> None:
    spread, tight = np.array([1.0, 3.0]), np.array([2.0, 2.0])
    assert dominance(tight, spread) == "x_second"
    assert dominance(spread, tight) == "y_second"


def test_distributions_that_cross_have_no_dominance() -> None:
    # Safer and lower on average, against riskier and higher: the answer depends on the investor.
    assert dominance(np.array([0.0, 10.0]), np.array([1.0, 5.0])) == "none"


# ---------------------------------------------------------------- utility


def test_the_certainty_equivalent_by_risk_aversion() -> None:
    wealth = np.array([100.0, 400.0])
    assert certainty_equivalent(wealth, gamma=0.0) == pytest.approx(250.0)  # the mean
    assert certainty_equivalent(wealth, gamma=1.0) == pytest.approx(200.0)  # the geometric mean
    assert certainty_equivalent(wealth) == pytest.approx(160.0)  # gamma 2: the harmonic mean
    assert certainty_equivalent(np.full(5, 123.0)) == pytest.approx(123.0)
    # More risk aversion, a lower equivalent.
    assert certainty_equivalent(wealth, gamma=5.0) < 160.0


def test_ruin_has_no_certainty_equivalent() -> None:
    assert certainty_equivalent(np.array([100.0, 0.0])) is None
    assert certainty_equivalent(np.array([100.0, -5.0])) is None


# ---------------------------------------------------------------- paths


def test_max_drawdown_is_the_deepest_fall_from_a_peak() -> None:
    assert max_drawdown(np.array([100.0, 120.0, 90.0, 130.0, 65.0])) == pytest.approx(0.5)
    assert max_drawdown(np.array([100.0, 120.0, 90.0, 130.0])) == pytest.approx(0.25)
    assert max_drawdown(np.array([1.0, 2.0, 3.0])) == 0.0
    # Before the first positive worth there is no peak to fall from.
    assert max_drawdown(np.array([0.0, 0.0, 10.0, 5.0])) == pytest.approx(0.5)


def test_yearly_returns_take_the_money_put_in_out_of_the_growth() -> None:
    # 100 grew to 130 while 20 came in: 10 earned on 100 plus half the 20.
    worth = np.array([100.0, 130.0, 130.0])
    assert dietz_returns(worth, np.array([20.0, 0.0])) == pytest.approx([10 / 110, 0.0])
    # A year that starts and takes in nothing has no return.
    assert dietz_returns(np.array([0.0, 0.0, 50.0]), np.array([0.0, 40.0])) == pytest.approx(
        [10 / 20]
    )


def test_sharpe_and_sortino_by_hand() -> None:
    assert sharpe(np.array([0.1, 0.2, 0.3])) == pytest.approx(2.0)
    assert sortino(np.array([0.1, -0.1, 0.3])) == pytest.approx(3**0.5)
    # No spread, no ratio; no losing year, no downside to divide by.
    assert sharpe(np.array([0.1, 0.1, 0.1])) is None
    assert sortino(np.array([0.1, 0.2])) is None
    assert sharpe(np.array([0.1])) is None
