import type { Bar } from '../api/bars.ts';
import type { Forecast } from '../api/forecast.ts';
import type { ForecastView } from '../chart/forecastLayer.ts';
import { atLevel, bandColor, forecastOutcomes } from './forecastOutcome.ts';

/** What the chart layer draws for a forecast made at bar `origin` (its index on the chart), with
 *  a dot on each actual close that `bars` (the chart's shown bars) already holds. */
export function forecastView(f: Forecast, origin: number, bars: readonly Bar[]): ForecastView {
  const q = (values: readonly number[], level: number) => atLevel(f.levels, values, level);
  return {
    origin,
    close: f.lastClose,
    bars: f.horizons.map((h) => ({
      index: origin + h.h,
      open: q(h.open, 0.5),
      high: q(h.high, 0.5),
      low: q(h.low, 0.5),
      close: q(h.close, 0.5),
      high80: q(h.high, 0.9),
      low80: q(h.low, 0.1),
      bands: [
        q(h.close, 0.025),
        q(h.close, 0.1),
        q(h.close, 0.25),
        q(h.close, 0.75),
        q(h.close, 0.9),
        q(h.close, 0.975),
      ],
    })),
    outcomes: forecastOutcomes(f, bars).map((o) => ({
      index: origin + o.h,
      close: o.actual,
      color: bandColor(o.band),
    })),
  };
}
