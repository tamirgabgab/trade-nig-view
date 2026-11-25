import { useForecast, type ForecastQuery } from '../api/forecast.ts';
import { barSeconds } from '../chart/visibleRange.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useForecastOriginStore } from '../store/forecastOriginStore.ts';
import { useReplayStore } from '../store/replayStore.ts';
import { useStructureStore } from '../store/structureStore.ts';

/**
 * The chart's forecast (one query for the chart layer and the Forecast tab): the current symbol
 * and interval with the tab's settings, made at the last bar, or while replaying at the frozen
 * origin (the start bar, or where "Forecast from here" was pressed), or at a past bar picked with
 * "Forecast from this bar". `active`: fetch at all.
 */
export function useChartForecast(active: boolean) {
  const symbol = useChartStore((s) => s.symbol);
  const interval = useChartStore((s) => s.interval);
  const adjusted = useChartStore((s) => s.adjusted);
  const settings = useStructureStore((s) => s.forecastSettings);
  const replaying = useReplayStore((s) => s.mode === 'on' && s.symbol === symbol);
  const from = useReplayStore((s) => s.forecastFrom);
  const past = usePastOrigin();
  const at = replaying ? from : past;
  const query: ForecastQuery | null = active
    ? {
        symbol,
        interval,
        adjusted,
        k: settings.k,
        model: settings.model,
        manual: settings.auto
          ? null
          : { window: settings.window || null, ridge: settings.ridge, lags: settings.lags },
        origin: at === null ? null : barSeconds(at),
      }
    : null;
  return useForecast(query);
}

/** The past bar the forecast is made at outside replay, if it is for the chart's symbol and
 *  interval and no replay runs on them. */
export function usePastOrigin() {
  const symbol = useChartStore((s) => s.symbol);
  const interval = useChartStore((s) => s.interval);
  const replaying = useReplayStore((s) => s.mode !== 'off' && s.symbol === symbol);
  const origin = useForecastOriginStore((s) => s.origin);
  return !replaying && origin?.symbol === symbol && origin.interval === interval
    ? origin.time
    : null;
}
