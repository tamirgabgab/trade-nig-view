"""Mortgage tracks: closed forms, an independent golden loop, and properties."""

from __future__ import annotations

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.planner.mortgage import (
    PRIME_MARGIN,
    RateKind,
    Repayment,
    Track,
    amortize,
    annuity,
    combine,
    track_rates,
)

LOAN, N, RATE = 1_000_000.0, 240, 0.04
R = RATE / 12
FLAT = np.ones(N + 1)
ANCHOR = np.full(N + 1, 0.045)


def table(track: Track, anchor: np.ndarray = ANCHOR, index: np.ndarray = FLAT):  # noqa: ANN201
    return amortize(track, anchor, index)


# ---------------------------------------------------------------- closed forms


def test_spitzer_is_the_textbook_constant_payment() -> None:
    s = table(Track(LOAN, N, rate=RATE))
    payment = LOAN * R / (1 - (1 + R) ** -N)
    assert payment == pytest.approx(6059.80, abs=0.01)
    np.testing.assert_allclose(s.payment, payment, rtol=1e-12)
    k = np.arange(1, N + 1)
    closed = LOAN * (1 + R) ** k - payment * ((1 + R) ** k - 1) / R
    np.testing.assert_allclose(s.balance[:-1], closed[:-1], rtol=1e-9)
    assert s.balance[-1] == 0.0
    assert s.principal.sum() == pytest.approx(LOAN, rel=1e-12)
    assert s.interest[0] == pytest.approx(LOAN * R)
    assert s.outstanding(0, LOAN) == LOAN
    assert s.outstanding(12, LOAN) == pytest.approx(closed[11])
    assert s.outstanding(N + 5, LOAN) == 0.0


def test_a_zero_rate_divides_the_loan_evenly() -> None:
    s = table(Track(1200.0, 12, rate=0.0))
    np.testing.assert_allclose(s.payment, 100.0)
    assert annuity(1200.0, 0.0, 12) == 100.0


def test_equal_principal_pays_a_constant_principal_and_falling_interest() -> None:
    s = table(Track(LOAN, N, rate=RATE, repayment=Repayment.EQUAL_PRINCIPAL))
    np.testing.assert_allclose(s.principal, LOAN / N, rtol=1e-9)
    k = np.arange(N)
    np.testing.assert_allclose(s.interest, (LOAN - k * LOAN / N) * R, rtol=1e-9)
    assert np.all(np.diff(s.payment) < 0)
    # Less interest in total than Spitzer.
    assert s.interest.sum() < table(Track(LOAN, N, rate=RATE)).interest.sum()


def test_grace_partial_pays_interest_only_and_full_grace_lets_it_accrue() -> None:
    partial = table(Track(LOAN, N, rate=RATE, repayment=Repayment.GRACE, grace_months=24))
    np.testing.assert_allclose(partial.payment[:24], LOAN * R)
    np.testing.assert_allclose(partial.balance[:24], LOAN)
    np.testing.assert_allclose(partial.payment[24:], annuity(LOAN, R, N - 24), rtol=1e-12)
    full = table(
        Track(LOAN, N, rate=RATE, repayment=Repayment.GRACE, grace_months=24, grace_full=True)
    )
    np.testing.assert_allclose(full.payment[:24], 0.0)
    assert full.balance[23] == pytest.approx(LOAN * (1 + R) ** 24)
    np.testing.assert_allclose(full.payment[24:], annuity(LOAN * (1 + R) ** 24, R, N - 24))
    # No grace at all is plain Spitzer.
    none = table(Track(LOAN, N, rate=RATE, repayment=Repayment.GRACE, grace_months=0))
    np.testing.assert_allclose(none.payment, table(Track(LOAN, N, rate=RATE)).payment)


def test_balloon_repays_the_principal_in_the_last_payment() -> None:
    partial = table(Track(LOAN, 60, rate=RATE, repayment=Repayment.BALLOON))
    np.testing.assert_allclose(partial.payment[:-1], LOAN * R)
    assert partial.payment[-1] == pytest.approx(LOAN * (1 + R))
    full = table(Track(LOAN, 60, rate=RATE, repayment=Repayment.BALLOON, grace_full=True))
    np.testing.assert_allclose(full.payment[:-1], 0.0)
    assert full.payment[-1] == pytest.approx(LOAN * (1 + R) ** 60)
    assert (partial.balance[-1], full.balance[-1]) == (0.0, 0.0)


def test_cpi_linkage_scales_the_unlinked_table_by_the_index() -> None:
    rng = np.random.default_rng(1)
    index = 100 * np.cumprod(np.concatenate(([1.0], 1 + rng.normal(0.002, 0.003, N))))
    plain = table(Track(LOAN, N, rate=RATE))
    linked = table(Track(LOAN, N, rate=RATE, linked=True), index=index)
    scale = index[1:] / index[0]
    np.testing.assert_allclose(linked.payment, plain.payment * scale, rtol=1e-9)
    np.testing.assert_allclose(linked.balance, plain.balance * scale, rtol=1e-9, atol=1e-6)
    assert linked.principal.sum() == pytest.approx(LOAN + linked.linkage.sum(), rel=1e-9)
    # A flat index is no linkage at all.
    flat = table(Track(LOAN, N, rate=RATE, linked=True))
    np.testing.assert_allclose(flat.payment, plain.payment)
    assert flat.linkage.sum() == 0.0


def test_prime_follows_the_anchor_and_variable_resets_every_period() -> None:
    anchor = np.where(np.arange(N + 1) < 30, 0.02, 0.045)  # the BoI rate jumps at month 30
    prime = Track(LOAN, N, kind=RateKind.PRIME, rate=-0.005)
    rates = track_rates(prime, anchor)
    assert rates[29] == pytest.approx(0.02 + PRIME_MARGIN - 0.005)  # month 30 still at the old rate
    assert rates[30] == pytest.approx(0.045 + PRIME_MARGIN - 0.005)
    s = table(prime, anchor)
    assert s.payment[30] > s.payment[29]
    np.testing.assert_allclose(s.payment[:30], s.payment[0])
    variable = Track(LOAN, N, kind=RateKind.VARIABLE, rate=0.035, reset_months=60)
    v = track_rates(variable, anchor)
    np.testing.assert_allclose(v[:60], 0.035)  # the jump at month 30 waits for the reset
    np.testing.assert_allclose(v[60:], 0.035 + 0.025)


def test_tracks_that_make_no_sense_are_refused() -> None:
    with pytest.raises(ValueError, match="grace"):
        table(Track(LOAN, 12, repayment=Repayment.GRACE, grace_months=12))
    # A spread or a reset that would take the rate below zero stops at zero.
    assert (
        track_rates(Track(LOAN, 12, kind=RateKind.PRIME, rate=-0.10), ANCHOR).tolist() == [0.0] * 12
    )
    with pytest.raises(ValueError, match="positive term"):
        table(Track(LOAN, 0))


def test_combine_adds_the_tracks_and_pads_a_finished_one() -> None:
    a = table(Track(600_000.0, 120, rate=0.03))
    b = table(Track(400_000.0, 240, rate=0.05))
    both = combine([a, b], 240)
    assert both.payment[0] == pytest.approx(a.payment[0] + b.payment[0])
    assert both.payment[200] == pytest.approx(b.payment[200])
    assert both.balance[119] == pytest.approx(b.balance[119])
    assert both.rate[0] == pytest.approx(0.6 * 0.03 + 0.4 * 0.05)
    assert both.rate[200] == pytest.approx(0.05)
    assert combine([a], 300).payment[250] == 0.0


# ---------------------------------------------------------------- golden model and properties


def golden(track: Track, anchor: np.ndarray, index: np.ndarray) -> np.ndarray:
    """An independent table: the level payment is kept and recomputed only when the rate or the
    balance was changed from outside (a reset, the linkage, the end of the grace)."""
    n = track.months
    grace = track.grace_months if track.repayment is Repayment.GRACE else 0
    if track.repayment is Repayment.BALLOON:
        grace = n - 1
    balance, level, last_rate = track.amount, None, None
    rows: list[tuple[float, float, float]] = []
    for k in range(1, n + 1):
        if track.kind is RateKind.FIXED:
            yearly = track.rate
        elif track.kind is RateKind.PRIME:
            yearly = anchor[k - 1] + 0.015 + track.rate
        else:
            yearly = (
                track.rate
                + anchor[((k - 1) // track.reset_months) * track.reset_months]
                - anchor[0]
            )
        r = max(yearly, 0.0) / 12
        linkage = balance * (index[k] / index[k - 1] - 1) if track.linked else 0.0
        balance += linkage
        interest = balance * r
        if k <= grace:
            payment = 0.0 if track.grace_full else interest
            level = None
        elif track.repayment is Repayment.EQUAL_PRINCIPAL:
            payment = balance / (n - k + 1) + interest
        else:
            if level is None or r != last_rate or linkage != 0.0:
                m = n - k + 1
                level = balance / m if r == 0 else balance * r * (1 + r) ** m / ((1 + r) ** m - 1)
            payment = level
        last_rate = r
        balance -= payment - interest
        rows.append((payment, interest, balance))
    return np.array(rows).T


tracks = st.builds(
    Track,
    amount=st.floats(10_000, 3_000_000),
    months=st.integers(2, 360),
    kind=st.sampled_from(list(RateKind)),
    # Zero, or a rate a bank could quote (the golden model's plain formula loses digits below).
    rate=st.one_of(st.just(0.0), st.floats(0.001, 0.08)),
    linked=st.booleans(),
    reset_months=st.sampled_from([12, 24, 60]),
    repayment=st.sampled_from(list(Repayment)),
    grace_months=st.integers(0, 1),
    grace_full=st.booleans(),
)


@settings(max_examples=150, deadline=None)
@given(tracks, st.integers(0, 2**31 - 1))
def test_the_table_equals_the_golden_model_and_keeps_its_identities(
    track: Track, seed: int
) -> None:
    rng = np.random.default_rng(seed)
    n = track.months
    anchor = np.clip(0.03 + np.cumsum(rng.normal(0, 0.0015, n + 1)), 0.001, 0.12)
    index = 100 * np.cumprod(np.concatenate(([1.0], 1 + rng.normal(0.002, 0.004, n))))
    s = amortize(track, anchor, index)
    want = golden(track, anchor, index)
    scale = track.amount * (index.max() / index[0]) * 2
    np.testing.assert_allclose(s.payment, want[0], rtol=1e-9, atol=1e-9 * scale)
    np.testing.assert_allclose(s.interest, want[1], rtol=1e-9, atol=1e-9 * scale)
    np.testing.assert_allclose(s.balance[:-1], want[2][:-1], rtol=1e-9, atol=1e-9 * scale)
    # The loan is repaid: never a negative balance, zero at the end, and the money adds up.
    assert np.all(s.balance >= -1e-6 * scale)
    assert abs(want[2][-1]) < 1e-6 * scale
    assert s.principal.sum() == pytest.approx(track.amount + s.linkage.sum(), rel=1e-9, abs=1e-6)
    paid = s.payment.sum()
    assert paid == pytest.approx(track.amount + s.interest.sum() + s.linkage.sum(), rel=1e-9)
