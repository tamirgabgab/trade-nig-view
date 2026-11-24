import { useForecast, type ForecastQuery } from '../api/forecast.ts';
import { barSeconds } from '../chart/visibleRange.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useReplayStore } from '../store/replayStore.ts';
import { useStructureStore } from '../store/structureStore.ts';

/**
 * The chart's forecast (one query for the chart layer and the Forecast tab): the current symbol
 * and interval with the tab's settings, made at the last bar, or while replaying at the frozen
 * origin (the start bar, or where "Forecast from here" was pressed). `active`: fetch at all.
 */
export function useChartForecast(active: boolean) {
  const symbol = useChartStore((s) => s.symbol);
  const interval = useChartStore((s) => s.interval);
  const adjusted = useChartStore((s) => s.adjusted);
  const settings = useStructureStore((s) => s.forecastSettings);
  const replaying = useReplayStore((s) => s.mode === 'on' && s.symbol === symbol);
  const from = useReplayStore((s) => s.forecastFrom);
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
        origin: replaying && from !== null ? barSeconds(from) : null,
      }
    : null;
  return useForecast(query);
}
