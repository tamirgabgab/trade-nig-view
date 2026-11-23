import { useId, useState } from 'react';

import {
  defaultParams,
  useIndicatorList,
  type IndicatorInfo,
  type Params,
} from '../api/indicators.ts';
import { useFilterResponse, type OutputResponse } from '../api/learn.ts';
import { useIndicatorStore } from '../store/indicatorStore.ts';
import styles from './FilterView.module.css';
import { ResponsePlot, type PlotSeries } from './ResponsePlot.tsx';

interface FilterViewProps {
  spec: IndicatorInfo;
  params: Params;
}

const SERIES = ['var(--color-series-1)', 'var(--color-series-2)'] as const;
/** Impulse responses with at most this many taps are drawn as stems. */
const MAX_STEMS = 64;
/** The magnitude plot's floor: deeper notches are clipped (they are -inf at exact zeros). */
const DB_RANGE: [number, number] = [-40, 6];

interface Measured {
  label: string;
  out: OutputResponse;
}

function fixed(value: number | null, digits: number): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const text = value.toFixed(digits);
  // A tiny negative rounds to "-0.00": show it as zero.
  return Number(text) === 0 ? (0).toFixed(digits) : text;
}

/** How far the step response rises above its final value, in % of it. */
function overshoot(out: OutputResponse): number {
  const final = out.dcGain ?? 1;
  return Math.max(0, (Math.max(...out.step) - final) / Math.abs(final)) * 100;
}

/** Single-line moving averages another average can be compared with. */
function comparable(specs: readonly IndicatorInfo[], current: string): IndicatorInfo[] {
  return specs.filter(
    (s) =>
      s.category === 'moving_averages' &&
      s.id !== current &&
      s.id !== 'ma' &&
      s.outputs.filter((o) => o.plot !== 'markers').length === 1,
  );
}

/** Params for the compared average: its defaults, with `length` when it has one. */
function compareParams(spec: IndicatorInfo, length: number): Params | null {
  const param = spec.params.find((p) => p.name === 'length');
  if (param === undefined) return {};
  const ok =
    Number.isInteger(length) &&
    (param.min === null || length >= param.min) &&
    (param.max === null || length <= param.max);
  return ok ? { length } : null;
}

function series(items: readonly Measured[], pick: (out: OutputResponse) => PlotSeries['y'] | null) {
  return items.flatMap(({ label, out }, i): PlotSeries[] => {
    const y = pick(out);
    if (y === null) return [];
    return [{ key: label, label, color: SERIES[i] ?? SERIES[0], x: y.map((_, k) => k), y }];
  });
}

function frequency(items: readonly Measured[], pick: 'magnitudeDb' | 'groupDelay') {
  return items.flatMap(({ label, out }, i): PlotSeries[] =>
    out.frequency === null
      ? []
      : [
          {
            key: label,
            label,
            color: SERIES[i] ?? SERIES[0],
            x: out.frequency.period,
            y: out.frequency[pick],
          },
        ],
  );
}

/**
 * Filter view: the measured impulse, step and frequency response of one output, optionally next
 * to another moving average, with the lag / noise table.
 */
export function FilterView({ spec, params }: FilterViewProps) {
  const id = useId();
  const registry = useIndicatorList().data ?? [];
  const add = useIndicatorStore((s) => s.add);
  const [outputName, setOutputName] = useState<string | null>(null);
  const [compareId, setCompareId] = useState('');
  const length = typeof params['length'] === 'number' ? params['length'] : 20;
  const [compareLength, setCompareLength] = useState(String(length));

  const primary = useFilterResponse({ id: spec.id, params });
  const compareSpec = registry.find((s) => s.id === compareId);
  const otherParams =
    compareSpec === undefined ? null : compareParams(compareSpec, Number(compareLength));
  const compare = useFilterResponse(
    compareSpec === undefined || otherParams === null
      ? null
      : { id: compareSpec.id, params: otherParams },
  );

  if (primary.isError) {
    return (
      <p className={styles.note} role="alert">
        Could not measure {spec.shortName}: {primary.error.message}
      </p>
    );
  }
  const outputs = primary.data?.outputs ?? [];
  const selected = outputs.find((o) => o.name === outputName) ?? outputs[0];
  if (selected === undefined) {
    return (
      <p className={styles.note} role="status">
        Measuring…
      </p>
    );
  }

  const items: Measured[] = [
    {
      label: outputs.length > 1 ? `${spec.shortName} ${selected.label}` : spec.shortName,
      out: selected,
    },
  ];
  const other = compare.data?.outputs[0];
  if (compareSpec !== undefined && other !== undefined && otherParams !== null) {
    const suffix = 'length' in otherParams ? ` ${String(otherParams['length'])}` : '';
    items.push({ label: `${compareSpec.shortName}${suffix}`, out: other });
  }
  const linear = items.filter((m) => m.out.impulse !== null);
  const taps = Math.max(...linear.map((m) => m.out.impulse?.length ?? 0), 0);

  return (
    <div className={styles.view}>
      <div className={styles.controls}>
        {outputs.length > 1 && (
          <label className={styles.control}>
            <span>Line</span>
            <select
              value={selected.name}
              onChange={(e) => {
                setOutputName(e.target.value);
              }}
            >
              {outputs.map((o) => (
                <option key={o.name} value={o.name}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={styles.control}>
          <span>Compare with</span>
          <select
            value={compareId}
            onChange={(e) => {
              setCompareId(e.target.value);
            }}
          >
            <option value="">None</option>
            {comparable(registry, spec.id).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {compareSpec?.params.some((p) => p.name === 'length') === true && (
          <label className={styles.control}>
            <span>Length</span>
            <input
              className={styles.length}
              type="number"
              inputMode="numeric"
              value={compareLength}
              aria-invalid={otherParams === null}
              onChange={(e) => {
                setCompareLength(e.target.value);
              }}
            />
          </label>
        )}
        {compareSpec !== undefined && otherParams !== null && (
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              add(compareSpec.id, { ...defaultParams(compareSpec), ...otherParams });
            }}
          >
            Add {compareSpec.shortName} to chart
          </button>
        )}
      </div>

      {items.length > 1 && (
        <ul className={styles.legend} aria-label="Series">
          {items.map((m, i) => (
            <li key={m.label}>
              <span className={styles.key} style={{ background: SERIES[i] }} />
              {m.label}
            </li>
          ))}
        </ul>
      )}

      {items
        .filter((m) => m.out.reason !== null)
        .map((m) => (
          <p key={m.label} className={styles.note}>
            <strong>{m.label}:</strong> {m.out.reason}
          </p>
        ))}

      <table className={styles.table} aria-describedby={`${id}-caption`}>
        <caption id={`${id}-caption`} className={styles.caption}>
          Measured on synthetic bars by the indicator itself
        </caption>
        <thead>
          <tr>
            <th scope="col">Measure</th>
            {items.map((m) => (
              <th key={m.label} scope="col">
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Lag (bars)</th>
            {items.map((m) => (
              <td key={m.label}>{fixed(m.out.lag, 2)}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Noise (NRF)</th>
            {items.map((m) => (
              <td key={m.label}>{fixed(m.out.nrf, 3)}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Lag on a trend (bars)</th>
            {items.map((m) => (
              <td key={m.label}>{fixed(m.out.rampLag, 2)}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">DC gain</th>
            {items.map((m) => (
              <td key={m.label}>{fixed(m.out.dcGain, 3)}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Step overshoot</th>
            {items.map((m) => (
              <td key={m.label}>{`${fixed(overshoot(m.out), 1)} %`}</td>
            ))}
          </tr>
        </tbody>
      </table>
      {linear.some((m) => m.out.truncated) && (
        <p className={styles.note}>
          The impulse response was cut before its tail died out (very long length): lag and noise
          are approximate.
        </p>
      )}

      {linear.length > 0 && (
        <ResponsePlot
          title="Impulse response h(k)"
          xLabel="bars after the impulse"
          series={series(linear, (o) => o.impulse)}
          stems={taps <= MAX_STEMS}
          formatY={(v) => v.toFixed(4)}
        />
      )}
      <ResponsePlot
        title="Step response"
        xLabel="bars after the step"
        series={series(items, (o) => o.step)}
        reference={selected.dcGain ?? 1}
        formatY={(v) => v.toFixed(3)}
      />
      {linear.length > 0 && (
        <>
          <ResponsePlot
            title="Magnitude |H| (dB) by cycle length"
            xLabel="period (bars)"
            series={frequency(linear, 'magnitudeDb')}
            periodAxis
            yDomain={DB_RANGE}
            reference={0}
            formatY={(v) => `${v.toFixed(1)} dB`}
          />
          <ResponsePlot
            title="Group delay by cycle length"
            xLabel="period (bars)"
            series={frequency(linear, 'groupDelay')}
            periodAxis
            formatY={(v) => `${v.toFixed(2)} bars`}
          />
        </>
      )}
    </div>
  );
}
