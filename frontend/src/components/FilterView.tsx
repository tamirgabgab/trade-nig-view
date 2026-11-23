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
  /** The output shown first (default: the first measured one). */
  output?: string | undefined;
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

/** How far the step response rises above its final value, in % of it; null for a band-pass
 *  output (MACD), whose step settles at 0 (its measured DC gain is a rounding residue). */
function overshoot(out: OutputResponse): number | null {
  const final = out.dcGain ?? 1;
  if (Math.abs(final) < 1e-9) return null;
  return Math.max(0, (Math.max(...out.step) - final) / Math.abs(final)) * 100;
}

const percent = (value: number | null) => (value === null ? '—' : `${fixed(value, 1)} %`);

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

type Curve = Pick<PlotSeries, 'x' | 'y'>;

function series(items: readonly Measured[], pick: (out: OutputResponse) => Curve | null) {
  return items.flatMap(({ label, out }, i): PlotSeries[] => {
    const curve = pick(out);
    return curve === null ? [] : [{ key: label, label, color: SERIES[i] ?? SERIES[0], ...curve }];
  });
}

/** Bars 0, 1, 2, ... against `y` (null when there is no curve). */
function byBar(y: readonly number[] | null): Curve | null {
  return y === null ? null : { x: y.map((_, k) => k), y };
}

function byPeriod(out: OutputResponse, pick: 'magnitudeDb' | 'groupDelay'): Curve | null {
  return out.frequency === null ? null : { x: out.frequency.period, y: out.frequency[pick] };
}

/**
 * Filter view: the measured impulse, step and frequency response of one output, optionally next
 * to another moving average, with the lag / noise table.
 */
export function FilterView({ spec, params, output }: FilterViewProps) {
  const id = useId();
  const registry = useIndicatorList().data ?? [];
  const add = useIndicatorStore((s) => s.add);
  const [outputName, setOutputName] = useState<string | null>(output ?? null);
  const [compareId, setCompareId] = useState('');
  const length = typeof params['length'] === 'number' ? params['length'] : 20;
  const [compareLength, setCompareLength] = useState(String(length));
  // Validation shows on blur and clears as soon as the user edits again.
  const [lengthBlurred, setLengthBlurred] = useState(false);

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
    return primary.isSuccess ? (
      <p className={styles.note} role="status">
        {spec.shortName} has no linear output to measure (it is not a filter of the price).
      </p>
    ) : (
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
  // A placeholder is the previous comparison's data: never show it under the new label.
  const other = compare.isPlaceholderData ? undefined : compare.data?.outputs[0];
  if (compareSpec !== undefined && other !== undefined && otherParams !== null) {
    const suffix = 'length' in otherParams ? ` ${String(otherParams['length'])}` : '';
    items.push({ label: `${compareSpec.shortName}${suffix}`, out: other });
  }
  const lengthParam = compareSpec?.params.find((p) => p.name === 'length');
  const lengthError = lengthBlurred && otherParams === null;
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
        {lengthParam !== undefined && (
          <label className={styles.control}>
            <span>Length</span>
            <input
              className={styles.length}
              type="number"
              inputMode="numeric"
              value={compareLength}
              aria-invalid={lengthError}
              aria-describedby={lengthError ? `${id}-length-error` : undefined}
              onChange={(e) => {
                setCompareLength(e.target.value);
                setLengthBlurred(false);
              }}
              onBlur={() => {
                setLengthBlurred(true);
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
      {lengthError && lengthParam !== undefined && (
        <p id={`${id}-length-error`} className={styles.error} role="alert">
          Enter a whole number from {lengthParam.min ?? 1} to {lengthParam.max ?? '∞'}.
        </p>
      )}

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

      {compare.isError && compareSpec !== undefined && (
        <p className={styles.note} role="alert">
          Could not measure {compareSpec.shortName}: {compare.error.message}
        </p>
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
              <td key={m.label}>{percent(overshoot(m.out))}</td>
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
          series={series(linear, (o) => byBar(o.impulse))}
          stems={taps <= MAX_STEMS}
          formatY={(v) => v.toFixed(4)}
        />
      )}
      <ResponsePlot
        title="Step response"
        xLabel="bars after the step"
        series={series(items, (o) => byBar(o.step))}
        reference={selected.dcGain ?? 1}
        formatY={(v) => v.toFixed(3)}
      />
      {linear.length > 0 && (
        <>
          <ResponsePlot
            title="Magnitude |H| (dB) by cycle length"
            xLabel="period (bars)"
            series={series(linear, (o) => byPeriod(o, 'magnitudeDb'))}
            periodAxis
            yDomain={DB_RANGE}
            reference={0}
            formatY={(v) => `${v.toFixed(1)} dB`}
          />
          <ResponsePlot
            title="Group delay by cycle length"
            xLabel="period (bars)"
            series={series(linear, (o) => byPeriod(o, 'groupDelay'))}
            periodAxis
            formatY={(v) => `${v.toFixed(2)} bars`}
          />
        </>
      )}
    </div>
  );
}
