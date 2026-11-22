"""Rate limiting and resilience for provider calls.

* :class:`TokenBucket` - at most ``rate`` calls/second on average, bursts up to ``capacity``.
* :func:`retry_with_backoff` - exponential backoff with full jitter:
  :math:`d_k = U(0, \\min(d_{max}, d_0 2^k))` for attempt :math:`k = 0, 1, ...`
* :class:`CircuitBreaker` - after ``threshold`` consecutive failures the provider is skipped for
  ``cooldown_s`` seconds, so a rate-limited provider is not hammered.

Clock, sleep and random source are injectable so tests run instantly and deterministically.
"""

from __future__ import annotations

import random
import threading
import time
from collections.abc import Callable


class TokenBucket:
    """Thread-safe token bucket."""

    def __init__(
        self,
        rate: float,
        capacity: float,
        *,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if rate <= 0 or capacity < 1:
            raise ValueError("rate must be > 0 and capacity >= 1")
        self._rate = rate
        self._capacity = capacity
        self._tokens = capacity
        self._clock = clock
        self._sleep = sleep
        self._updated = clock()
        self._lock = threading.Lock()

    def acquire(self) -> float:
        """Take one token, sleeping if necessary. Returns the time waited (seconds)."""
        with self._lock:
            now = self._clock()
            self._tokens = min(self._capacity, self._tokens + (now - self._updated) * self._rate)
            self._updated = now
            wait = 0.0 if self._tokens >= 1.0 else (1.0 - self._tokens) / self._rate
            self._tokens -= 1.0  # may go negative: the debt is repaid by the sleep below
        if wait > 0:
            self._sleep(wait)
        return wait


def retry_with_backoff[T](
    func: Callable[[], T],
    *,
    retry_on: tuple[type[BaseException], ...],
    attempts: int = 4,
    base_delay: float = 2.0,
    max_delay: float = 60.0,
    sleep: Callable[[float], None] = time.sleep,
    rng: random.Random | None = None,
) -> T:
    """Call ``func``; on an exception in ``retry_on`` wait and retry, up to ``attempts`` calls."""
    rng = rng or random.Random()  # noqa: S311 - jitter, not cryptography
    for attempt in range(attempts):
        try:
            return func()
        except retry_on:
            if attempt == attempts - 1:
                raise
            sleep(rng.uniform(0.0, min(max_delay, base_delay * 2**attempt)))
    raise AssertionError("unreachable")  # pragma: no cover


class CircuitBreaker:
    """Skip a provider for ``cooldown_s`` after ``threshold`` consecutive failures."""

    def __init__(
        self,
        threshold: int = 2,
        cooldown_s: float = 600.0,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._threshold = threshold
        self._cooldown_s = cooldown_s
        self._clock = clock
        self._failures = 0
        self._open_until = 0.0
        self._lock = threading.Lock()

    def allow(self) -> bool:
        with self._lock:
            return self._clock() >= self._open_until

    def record_success(self) -> None:
        with self._lock:
            self._failures = 0
            self._open_until = 0.0

    def record_failure(self) -> None:
        with self._lock:
            self._failures += 1
            if self._failures >= self._threshold:
                self._open_until = self._clock() + self._cooldown_s
                self._failures = 0
