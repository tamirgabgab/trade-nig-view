from __future__ import annotations

import random

import pytest

from app.data.ratelimit import CircuitBreaker, TokenBucket, retry_with_backoff


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def test_bucket_allows_burst_then_paces_at_rate() -> None:
    clock = FakeClock()
    bucket = TokenBucket(rate=2.0, capacity=3, clock=clock, sleep=clock.sleep)
    waits = [bucket.acquire() for _ in range(5)]
    assert waits[:3] == [0.0, 0.0, 0.0]
    assert waits[3:] == pytest.approx([0.5, 0.5])


def test_bucket_refills_over_time() -> None:
    clock = FakeClock()
    bucket = TokenBucket(rate=1.0, capacity=1, clock=clock, sleep=clock.sleep)
    bucket.acquire()
    clock.now += 10.0
    assert bucket.acquire() == 0.0


def test_bucket_rejects_bad_parameters() -> None:
    with pytest.raises(ValueError, match="rate"):
        TokenBucket(rate=0, capacity=1)


class Flaky:
    def __init__(self, failures: int) -> None:
        self.failures = failures
        self.calls = 0

    def __call__(self) -> str:
        self.calls += 1
        if self.calls <= self.failures:
            raise TimeoutError("busy")
        return "ok"


def test_retry_succeeds_after_transient_failures_with_capped_jitter() -> None:
    clock = FakeClock()
    flaky = Flaky(failures=2)
    result = retry_with_backoff(
        flaky, retry_on=(TimeoutError,), base_delay=2.0, sleep=clock.sleep, rng=random.Random(1)
    )
    assert result == "ok"
    assert flaky.calls == 3
    assert 0.0 <= clock.sleeps[0] <= 2.0
    assert 0.0 <= clock.sleeps[1] <= 4.0


def test_retry_gives_up_after_attempts() -> None:
    clock = FakeClock()
    flaky = Flaky(failures=10)
    with pytest.raises(TimeoutError):
        retry_with_backoff(flaky, retry_on=(TimeoutError,), attempts=3, sleep=clock.sleep)
    assert flaky.calls == 3
    assert len(clock.sleeps) == 2


def test_retry_does_not_catch_other_errors() -> None:
    def boom() -> None:
        raise KeyError("x")

    with pytest.raises(KeyError):
        retry_with_backoff(boom, retry_on=(TimeoutError,), sleep=lambda _s: None)


def test_breaker_opens_after_threshold_and_recovers_after_cooldown() -> None:
    clock = FakeClock()
    breaker = CircuitBreaker(threshold=2, cooldown_s=60.0, clock=clock)
    breaker.record_failure()
    assert breaker.allow()
    breaker.record_failure()
    assert not breaker.allow()
    clock.now += 60.0
    assert breaker.allow()


def test_breaker_success_resets_failure_count() -> None:
    breaker = CircuitBreaker(threshold=2, clock=FakeClock())
    breaker.record_failure()
    breaker.record_success()
    breaker.record_failure()
    assert breaker.allow()
