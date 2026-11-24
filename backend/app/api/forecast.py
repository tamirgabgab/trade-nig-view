"""``GET /api/forecast`` - a probabilistic OHLC forecast of the next k bars
(``app.analysis.forecast``), with its walk-forward validation against the naive benchmark. A
research tool, not advice."""

from __future__ import annotations

from collections import OrderedDict
from datetime import date
from http import HTTPStatus
from typing import Annotated, Literal

import numpy as np
from fastapi import APIRouter, Depends, Query
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


def compute(
    frame: BarFrame, k: int, model: Literal["a", "c"], params: fc.Params | None
) -> tuple[fc.Params, dict[fc.Model, fc.Params], list[tuple[fc.Params, float]]]:
    """The parameters of every model: tuned (``params`` None) or as given."""
    if params is not None:
        return params, dict.fromkeys(MODELS, params), []
    chosen: dict[fc.Model, fc.Params] = {}
    tried: list[tuple[fc.Params, float]] = []
    for m in MODELS:
        best, grid = fc.tune(frame, m, EVALUATE_BARS, REFIT_EVERY)
        chosen[m] = best
        if m == model:
            tried = grid
    return chosen[model], chosen, tried


def _forecast(
    frame: BarFrame,
    interval: Interval,
    symbol: str,
    k: int,
    model: Literal["a", "c"],
    params: fc.Params | None,
) -> ForecastResponse:
    horizons = list(range(1, k + 1))
    best, per_model, tried = compute(frame, k, model, params)
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


_cache: OrderedDict[tuple[object, ...], ForecastResponse] = OrderedDict()


@router.get("/forecast", response_model=ForecastResponse)
def get_forecast(
    service: Annotated[BarService, Depends(get_bar_service)],
    symbol: Annotated[str, Query(min_length=1, max_length=20)],
    interval: Interval = Interval.D1,
    k: Annotated[int, Query(ge=1, le=20, description="Bars ahead")] = 5,
    model: Literal["a", "c"] = "c",
    auto: Annotated[bool, Query(description="Tune window, ridge and lags out of sample")] = True,
    window: Annotated[
        int, Query(ge=0, le=5000, description="Manual: training bars, 0 = all")
    ] = 500,
    ridge: Annotated[float, Query(gt=0, le=1e6, description="Manual: model C's penalty")] = 100.0,
    lags: Annotated[int, Query(ge=1, le=10, description="Manual: past bars as features")] = 3,
    adjusted: bool = True,
    until: Annotated[date | None, Query(description="Replay cursor: no bar after it")] = None,
) -> ForecastResponse:
    """Quantiles of the next ``k`` bars' open, high, low and close from the bars up to the last
    one (``until`` in replay), with the models' walk-forward scores. Cached per last bar."""
    result = service.get_bars(symbol, interval, adjusted=adjusted, until=until)
    frame = result.frame
    if len(frame) < fc.MIN_TRAIN + max(fc.HAR) + k + 1:
        raise NotEnoughHistoryError(f"{symbol}: {len(frame)} bars are too few for a forecast")
    params = None if auto else fc.Params(window or None, ridge, lags)
    key = (
        result.symbol.symbol,
        interval,
        adjusted,
        len(frame),
        int(frame.time[-1]),
        k,
        model,
        params,
    )
    if key not in _cache:
        _cache[key] = _forecast(frame, interval, result.symbol.symbol, k, model, params)
        if len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)
    _cache.move_to_end(key)
    return _cache[key]
