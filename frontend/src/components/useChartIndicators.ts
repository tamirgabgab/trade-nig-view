import { useMemo } from 'react';

import type { Bar } from '../api/bars.ts';
import {
  alignToBars,
  computeBody,
  effectiveParams,
  instanceLabel,
  useIndicatorComputes,
  useIndicatorList,
  type ComputeData,
  type ComputeRequestBody,
  type IndicatorInfo,
  type OutputInfo,
  type Params,
  type SeriesQuery,
} from '../api/indicators.ts';
import type { IndicatorLine } from '../chart/ChartEngine.ts';
import { useIndicatorStore, type IndicatorInstance } from '../store/indicatorStore.ts';

export interface OutputView {
  name: string;
  label: string;
  plot: OutputInfo['plot'];
  /** Extra colours by role (markers: `up`, `down`). */
  style: Record<string, string>;
  color: string;
  lineWidth: number;
  /** One value per loaded bar (null = no value). */
  values: (number | null)[];
}

/** Everything the legend, settings panel and chart need about one indicator instance. */
export interface IndicatorView {
  instance: IndicatorInstance;
  /** Undefined while the registry loads, or if the backend no longer has this indicator. */
  spec: IndicatorInfo | undefined;
  params: Params;
  label: string;
  outputs: OutputView[];
  error: Error | null;
  isFetching: boolean;
}

const NO_VALUES: Record<string, (number | null)[]> = {};
const EMPTY: (number | null)[] = [];

type Aligned = Record<string, (number | null)[]>;
const alignedCache = new WeakMap<ComputeData, { bars: readonly Bar[]; aligned: Aligned }>();

/** `alignToBars`, memoised per response and bars: a colour change must not re-send line data. */
function aligned(bars: readonly Bar[], data: ComputeData): Aligned {
  const hit = alignedCache.get(data);
  if (hit?.bars === bars) return hit.aligned;
  const value = alignToBars(bars, data);
  alignedCache.set(data, { bars, aligned: value });
  return value;
}

/**
 * Indicator instances of the chart with their values on `bars`. `series` is the data set the
 * bars come from; null while a new data set loads (the previous values stay meanwhile).
 */
export function useChartIndicators(
  series: SeriesQuery | null,
  bars: readonly Bar[],
): { views: IndicatorView[]; lines: IndicatorLine[]; registryMissing: boolean } {
  const instances = useIndicatorStore((s) => s.instances);
  const registry = useIndicatorList();
  const specs = registry.data;

  const requests = useMemo(
    () =>
      instances.map((instance): ComputeRequestBody | null => {
        const spec = specs?.find((s) => s.id === instance.id);
        if (spec === undefined || series === null) return null;
        return computeBody(series, bars, spec.id, effectiveParams(spec, instance.params));
      }),
    [instances, specs, series, bars],
  );
  const results = useIndicatorComputes(requests);

  const views = useMemo(
    () =>
      instances.map((instance, i): IndicatorView => {
        const spec = specs?.find((s) => s.id === instance.id);
        const result = results[i];
        const params =
          spec === undefined ? instance.params : effectiveParams(spec, instance.params);
        const values = result?.data === undefined ? NO_VALUES : aligned(bars, result.data);
        const outputs = (spec?.outputs ?? []).map((output) => {
          const style = instance.styles[output.name];
          return {
            name: output.name,
            label: output.label,
            plot: output.plot,
            style: output.style,
            color: style?.color ?? output.color,
            lineWidth: style?.lineWidth ?? output.lineWidth,
            values: values[output.name] ?? EMPTY,
          };
        });
        return {
          instance,
          spec,
          params,
          label: spec === undefined ? instance.id.toUpperCase() : instanceLabel(spec, params),
          outputs,
          error: result?.error ?? null,
          isFetching: result?.isFetching ?? false,
        };
      }),
    [instances, specs, results, bars],
  );

  const lines = useMemo(
    () =>
      views.flatMap((view) =>
        view.outputs.map((output): IndicatorLine => ({
          key: `${view.instance.uid}:${output.name}`,
          // Histogram and area plots arrive with the oscillators (R4); until then, lines.
          plot: output.plot === 'markers' ? 'markers' : 'line',
          values: output.values,
          color: output.color,
          lineWidth: output.lineWidth,
          visible: view.instance.visible,
          upColor: output.style.up,
          downColor: output.style.down,
        })),
      ),
    [views],
  );

  return { views, lines, registryMissing: registry.isError };
}
