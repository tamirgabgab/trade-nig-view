"""``GET /api/forecast`` - a probabilistic OHLC forecast of the next k bars
(``app.analysis.forecast``), with its walk-forward validation against the naive benchmark. A
research tool, not advice."""

from __future__ import annotations

from collections import OrderedDict
from datetime import date
from http import HTTPStatus
from threading import Lock
from typing import Annotated, Literal

import numpy as np
from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field

from app.analysis import forecast as fc
from app.api.deps import get_bar_service
from app.data.bar_service import BarService
from app.errors import ChartLabError
from app.models.bars import BarFrame, Interval, ts_to_iso_dates

router = APIRouter(tags=["forecast"])

#: Walk-forward evaluation: the last bars scored, and how often the models are refitted.
EVALUATE_BARS = 500
REFIT_EVERY = 20
CACHE_SIZE = 32
MODELS: tuple[fc.Model, ...] = ("naive", "a", "c")


class NotEnoughHistoryError(ChartLabError):
    status = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "not_enough_history"


class InvalidForecastParamsError(ChartLabError):
    status = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "invalid_params"


class ForecastParams(BaseModel):
    window: int | None = Field(description="Training bars; null = all the history")
    ridge: float = Field(description="Ridge penalty (model C only)")
    lags: int = Field(description="Past bars p used as features")


class HorizonForecast(BaseModel):
    h: int = Field(description="Bars ahead")
    open: list[float] = Field(description="Price quantiles at `levels`")
    high: list[float]
    low: list[float]
    close: list[float]
    p_up: float = Field(description="P(close after h bars > last close)")
    expected_range: float = Field(description="Mean (high - low) / last close")


class Validation(BaseModel):
    model: Literal["naive", "a", "c"]
    h: int
    n: int = Field(description="Out-of-sample forecasts scored")
    pinball: float = Field(
        description="Mean pinball loss of the four log targets (lower is better)"
    )
    coverage: list[float] = Field(description="Share of closes inside the 50 / 80 / 95 % intervals")
    r2: float | None = Field(description="Out-of-sample R^2 of the return vs a zero-mean walk")
    hit_rate: float | None = Field(
        description="Share of right directions among the forecasts whose median return is not 0"
    )


class Coefficient(BaseModel):
    feature: str
    value: float


class Tried(BaseModel):
    params: ForecastParams
    pinball: float


class ForecastResponse(BaseModel):
    symbol: str
    interval: Interval
    model: Literal["a", "c"]
    auto: bool
    params: ForecastParams = Field(description="Parameters of the forecast model (tuned if auto)")
    last_time: str | int = Field(description="The forecast origin bar, as in /api/bars")
    last_close: float
    levels: list[float]
    horizons: list[HorizonForecast]
    validation: list[Validation] = Field(description="Walk-forward scores per model and horizon")
    coefficients: list[Coefficient] = Field(
        description="h = 1 return coefficients of the model (model C: on standardised features)"
    )
    tuning: list[Tried] = Field(description="The best tuning grid points (auto only)")


def _params_info(p: fc.Params) -> ForecastParams:
    return ForecastParams(window=p.window, ridge=p.ridge, lags=p.lags)


def _num(x: float) -> float | None:
    return x if np.isfinite(x) else None


Tuned = dict[fc.Model, tuple[fc.Params, list[tuple[fc.Params, float]]]]


def tune_all(frame: BarFrame) -> Tuned:
    """Every model's tuned parameters and its grid, on the EVALUATE_BARS origins before the
    validated ones: the reported validation stays out of sample for the tuning too."""
    return {m: fc.tune(frame, m, EVALUATE_BARS, REFIT_EVERY, skip=EVALUATE_BARS) for m in MODELS}


class ForecastCache:
    """Per-app LRU caches (on ``app.state``, guarded by a lock: sync endpoints run in a
    threadpool): the tuning per frame, and the responses per frame and request."""

    def __init__(self, size: int = CACHE_SIZE) -> None:
        self.size = size
        self.lock = Lock()
        self.tuned: OrderedDict[tuple[object, ...], Tuned] = OrderedDict()
        self.responses: OrderedDict[tuple[object, ...], ForecastResponse] = OrderedDict()

    def get[V](
        self, store: OrderedDict[tuple[object, ...], V], key: tuple[object, ...]
    ) -> V | None:
        with self.lock:
            value = store.get(key)
            if value is not None:
                store.move_to_end(key)
            return value

    def put[V](
        self, store: OrderedDict[tuple[object, ...], V], key: tuple[object, ...], value: V
    ) -> None:
        with self.lock:
            store[key] = value
            store.move_to_end(key)
            while len(store) > self.size:
                store.popitem(last=False)


def _forecast(
    frame: BarFrame,
    interval: Interval,
    symbol: str,
    k: int,
    model: Literal["a", "c"],
    params: fc.Params | None,
    tuned: Tuned | None,
) -> ForecastResponse:
    """``params`` for every model, or (auto) each model's tuned parameters."""
    horizons = list(range(1, k + 1))
    if tuned is None:
        assert params is not None  # noqa: S101 - manual mode has params
        per_model: dict[fc.Model, fc.Params] = dict.fromkeys(MODELS, params)
        tried: list[tuple[fc.Params, float]] = []
    else:
        per_model = {m: best for m, (best, _) in tuned.items()}
        tried = tuned[model][1]
    best = per_model[model]
    origin = len(frame) - 1
    validation: list[Validation] = []
    for m in MODELS:
        d = fc.design(frame, per_model[m].lags, horizons)
        for h in horizons:
            s = fc.evaluate(
                d, h, m, per_model[m], fc.eval_origins(len(frame), h, EVALUATE_BARS), REFIT_EVERY
            )
            if s is not None:
                validation.append(
                    Validation(
                        model=m,
                        h=h,
                        n=s.n,
                        pinball=s.pinball,
                        coverage=list(s.coverage),
                        r2=_num(s.r2),
                        hit_rate=_num(s.hit_rate),
                    )
                )
    d = fc.design(frame, best.lags, horizons)
    out: list[HorizonForecast] = []
    coefficients: list[Coefficient] = []
    for h in horizons:
        f = fc.fit(d, h, origin, model, best)
        if f is None or not np.isfinite(d.x[origin]).all():
            raise NotEnoughHistoryError(
                f"{symbol}: not enough bars to train the forecast for {h} bar(s) ahead"
            )
        hz = fc.horizon_forecast(f, d, origin, h)
        q = hz.quantiles
        out.append(
            HorizonForecast(
                h=h,
                open=q[:, 0].tolist(),
                high=q[:, 1].tolist(),
                low=q[:, 2].tolist(),
                close=q[:, 3].tolist(),
                p_up=hz.p_up,
                expected_range=hz.expected_range,
            )
        )
        if h == 1:
            names = fc.feature_names(best.lags)
            coefficients = [
                Coefficient(feature=name, value=float(v))
                for name, v in zip(names, f.beta[1:, 1], strict=True)
            ]
    last = frame.time[-1:]
    last_time: str | int = int(last[0]) if interval.is_intraday else ts_to_iso_dates(last)[0]
    return ForecastResponse(
        symbol=symbol,
        interval=interval,
        model=model,
        auto=params is None,
        params=_params_info(best),
        last_time=last_time,
        last_close=float(frame.close[-1]),
        levels=list(fc.LEVELS),
        horizons=out,
        validation=validation,
        coefficients=coefficients,
        tuning=[Tried(params=_params_info(p), pinball=s) for p, s in tried[:5]],
    )


def bars_key(frame: BarFrame) -> tuple[object, ...]:
    """A frame's identity for the caches: its bars' values too, not only their count and last
    time (a refreshed last bar or a re-adjusted history is another frame)."""
    return (
        len(frame),
        int(frame.time[-1]),
        float(frame.close.sum()),
        *(float(x[-1]) for x in (frame.open, frame.high, frame.low, frame.close)),
    )


def forecast_frame(
    cache: ForecastCache,
    source: tuple[object, ...],
    frame: BarFrame,
    interval: Interval,
    symbol: str,
    k: int,
    model: Literal["a", "c"],
    params: fc.Params | None,
) -> ForecastResponse:
    """The (cached) forecast of ``frame``; ``source`` names where its bars came from."""
    if len(frame) < fc.MIN_TRAIN + max(fc.HAR) + k + 1:
        raise NotEnoughHistoryError(f"{symbol}: {len(frame)} bars are too few for a forecast")
    frame_id = (*source, interval, *bars_key(frame))
    key = (*frame_id, k, model, params)
    response = cache.get(cache.responses, key)
    if response is None:
        tuned = None
        if params is None:
            tuned = cache.get(cache.tuned, frame_id)
            if tuned is None:
                tuned = tune_all(frame)
                cache.put(cache.tuned, frame_id, tuned)
        response = _forecast(frame, interval, symbol, k, model, params, tuned)
        cache.put(cache.responses, key, response)
    return response


def forecast_cache(request: Request) -> ForecastCache:
    """The app's forecast caches (created on first use)."""
    state = request.app.state
    if not hasattr(state, "forecast_cache"):
        state.forecast_cache = ForecastCache()
    cache: ForecastCache = state.forecast_cache
    return cache


@router.get("/forecast", response_model=ForecastResponse)
def get_forecast(
    request: Request,
    service: Annotated[BarService, Depends(get_bar_service)],
    symbol: Annotated[str, Query(min_length=1, max_length=20)],
    interval: Interval = Interval.D1,
    k: Annotated[int, Query(ge=1, le=20, description="Bars ahead")] = 5,
    model: Literal["a", "c"] = "c",
    auto: Annotated[bool, Query(description="Tune window, ridge and lags out of sample")] = True,
    window: Annotated[
        int,
        Query(
            ge=0, le=100_000, description=f"Manual: training bars, 0 = all, else >= {fc.MIN_TRAIN}"
        ),
    ] = 500,
    ridge: Annotated[float, Query(gt=0, le=1e6, description="Manual: model C's penalty")] = 100.0,
    lags: Annotated[int, Query(ge=1, le=10, description="Manual: past bars as features")] = 3,
    adjusted: bool = True,
    until: Annotated[date | None, Query(description="Replay cursor: no bar after it")] = None,
    origin: Annotated[
        int | None,
        Query(description="Forecast from this bar (UTC epoch seconds of its open; replay)"),
    ] = None,
) -> ForecastResponse:
    """Quantiles of the next ``k`` bars' open, high, low and close from the whole history up to
    the last bar (``until``, ``origin`` in replay), with the models' walk-forward scores."""
    if not auto and 0 < window < fc.MIN_TRAIN:
        raise InvalidForecastParamsError(
            f"window must be 0 (all the history) or at least {fc.MIN_TRAIN} bars, got {window}"
        )
    result = service.get_bars(symbol, interval, adjusted=adjusted, until=until, limit=1_000_000_000)
    frame = result.frame
    if origin is not None:
        frame = frame.take(frame.time <= origin)
    params = None if auto else fc.Params(window or None, ridge, lags)
    return forecast_frame(
        forecast_cache(request),
        ("symbol", result.symbol.symbol, adjusted),
        frame,
        interval,
        result.symbol.symbol,
        k,
        model,
        params,
    )
