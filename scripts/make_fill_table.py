"""Generate the fill table: where the price is inside a bar, given only its O, H, L and C.

The user's algorithm (Monte Carlo with rejection, 2026-11-26), amortised: instead of rejecting the
paths that do not match one bar, every path is binned by its own (u, v), so one run serves every
bar. Run from ``backend/`` (about five minutes for the committed table's 8 million paths)::

    uv run python ../scripts/make_fill_table.py

Model: inside a bar the price is a driftless random walk of ``STEPS`` steps. Normalised to the
bar's range, ``y = (x - min x) / (max x - min x)``, the path's law given ``u = y(0)`` and
``v = y(1)`` does not depend on the volatility. The table stores, per (u, v) cell and time t, the
mean and five quantiles of the **residual** ``y(t) - (u + t (v - u))`` from the straight line
between each path's own open and close, so it is exactly 0 at t = 0 and t = 1.

Two symmetries quadruple the samples and make the table exactly symmetric: reflection
(``y -> 1 - y``) and time reversal (``y(t) -> y(1 - t)``).

Three granularities are cut from one simulation (cells and time points are merged):
fine 40 x 40 cells x 79 times, medium 20 x 20 x 27, coarse 10 x 10 x 14.
"""

from __future__ import annotations

import sys
import time

import numpy as np

from app.config import REPO_ROOT

SEED = 20261126
STEPS = 390
T_STEP = 5  # 79 time points
CELLS = 40
BINS = 200  # of the residual, over [-1, 1]
CHUNK = 25_000
QUANTILES = (0.05, 0.25, 0.5, 0.75, 0.95)
#: name -> (cells merged per side, time points skipped)
LEVELS = {"fine": (1, 1), "medium": (2, 3), "coarse": (4, 6)}
OUT = REPO_ROOT / "backend" / "app" / "planner" / "fill_table.npz"


def simulate(paths: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(sum of residuals, count, residual histogram) per (u cell, v cell, time)."""
    rng = np.random.default_rng(SEED)
    times = STEPS // T_STEP + 1
    t = np.linspace(0.0, 1.0, times, dtype=np.float32)
    size = CELLS * CELLS * times
    sums = np.zeros(size)
    counts = np.zeros(CELLS * CELLS, dtype=np.int64)
    hist = np.zeros(size * BINS, dtype=np.int64)
    offsets = (np.arange(times) * BINS).astype(np.int64)
    started = time.time()
    for done in range(0, paths, CHUNK):
        x = np.cumsum(rng.standard_normal((CHUNK, STEPS), dtype=np.float32), axis=1)
        x = np.concatenate([np.zeros((CHUNK, 1), dtype=np.float32), x], axis=1)
        lo = x.min(axis=1, keepdims=True)
        y = (x[:, ::T_STEP] - lo) / (x.max(axis=1, keepdims=True) - lo)
        for z in (y, 1.0 - y, y[:, ::-1], 1.0 - y[:, ::-1]):
            u, v = z[:, :1], z[:, -1:]
            resid = z - (u + t * (v - u))
            cell = np.minimum((u[:, 0] * CELLS).astype(np.int64), CELLS - 1) * CELLS + np.minimum(
                (v[:, 0] * CELLS).astype(np.int64), CELLS - 1
            )
            counts += np.bincount(cell, minlength=CELLS * CELLS)
            flat = (cell[:, None] * times + np.arange(times)).ravel()
            sums += np.bincount(flat, weights=resid.ravel(), minlength=size)
            bins = np.clip(((resid + 1.0) * (BINS / 2)).astype(np.int64), 0, BINS - 1)
            index = cell[:, None] * (times * BINS) + offsets + bins
            hist += np.bincount(index.ravel(), minlength=size * BINS)
        if (done // CHUNK) % 20 == 0:
            print(f"{done + CHUNK:>10,} paths  {time.time() - started:6.0f} s", flush=True)
    shape = (CELLS, CELLS, times)
    return sums.reshape(shape), counts.reshape(CELLS, CELLS), hist.reshape(*shape, BINS)


def quantiles(hist: np.ndarray) -> np.ndarray:
    """Quantiles of the residual from its histogram (linear inside a bin)."""
    cdf = np.cumsum(hist, axis=-1) / np.maximum(hist.sum(axis=-1, keepdims=True), 1)
    edges = np.linspace(-1.0, 1.0, BINS + 1)
    out = np.empty((*hist.shape[:-1], len(QUANTILES)), dtype=np.float32)
    flat_cdf = cdf.reshape(-1, BINS)
    flat_out = out.reshape(-1, len(QUANTILES))
    for i, row in enumerate(flat_cdf):
        full = np.concatenate(([0.0], row))
        flat_out[i] = np.interp(QUANTILES, full, edges)
    return out


def level(
    sums: np.ndarray, counts: np.ndarray, hist: np.ndarray, merge: int, skip: int
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    cells = CELLS // merge
    s = sums[:, :, ::skip].reshape(cells, merge, cells, merge, -1).sum(axis=(1, 3))
    n = counts.reshape(cells, merge, cells, merge).sum(axis=(1, 3))
    h = hist[:, :, ::skip].reshape(cells, merge, cells, merge, -1, BINS).sum(axis=(1, 3))
    mean = (s / np.maximum(n, 1)[:, :, None]).astype(np.float32)
    q = quantiles(h)
    # The line is exact at the ends: no residual there.
    mean[:, :, [0, -1]] = 0.0
    q[:, :, [0, -1], :] = 0.0
    return mean, q, n


def main(paths: int) -> int:
    sums, counts, hist = simulate(paths)
    arrays: dict[str, np.ndarray] = {"quantile_levels": np.array(QUANTILES, dtype=np.float32)}
    for name, (merge, skip) in LEVELS.items():
        mean, q, n = level(sums, counts, hist, merge, skip)
        arrays[f"{name}_mean"], arrays[f"{name}_quantiles"] = mean, q
        arrays[f"{name}_count"] = n.astype(np.int64)
        print(
            f"{name:6} cells {mean.shape[0]:2}  times {mean.shape[2]:2}  fewest samples {n.min():,}"
        )
    np.savez_compressed(OUT, **arrays)
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main(int(sys.argv[1]) if len(sys.argv) > 1 else 8_000_000))
