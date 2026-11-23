import { useState } from 'react';

import type { IndicatorInfo, Params, ParamValue } from '../../api/indicators.ts';
import { useLab, type LabSource } from '../../api/lab.ts';
import { formatPrice } from '../formatNumber.ts';
import styles from './Lab.module.css';
import { chartLines, withDefaults } from './labModel.ts';
import { LabOutcome } from './LabOutcome.tsx';
import { MiniChart } from './MiniChart.tsx';
import { SourcePicker } from './SourcePicker.tsx';
import { useDebounced } from './useDebounced.ts';

const SLIDER_CAP = 200;

/**
 * The learn drawer's "Try it" tab: every parameter of the indicator as a live control, on a
 * random scenario or a real symbol, drawn by the same backend implementation as the chart.
 */
export function TryIt({ spec, initial }: { spec: IndicatorInfo; initial: Params }) {
  const [params, setParams] = useState<Params>(withDefaults(spec, initial));
  const [source, setSource] = useState<LabSource>({
    kind: 'synthetic',
    scenario: 'random_walk',
    seed: 1,
    bars: 400,
  });
  const settled = useDebounced(params);
  const lab = useLab({
    source,
    indicators: [{ id: spec.id, params: settled }],
    conditions: [],
    horizon: 10,
  });
  const { overlays, pane } = chartLines(spec, lab.data?.indicators[0]);
  const set = (name: string, value: ParamValue) => {
    setParams({ ...params, [name]: value });
  };

  return (
    <div className={styles.lab}>
      <SourcePicker source={source} onChange={setSource} />
      <div className={styles.controls}>
        {spec.params.map((p) => {
          const value = params[p.name];
          if (p.type === 'bool') {
            return (
              <label key={p.name} className={styles.check}>
                <input
                  type="checkbox"
                  checked={value === true}
                  onChange={(event) => {
                    set(p.name, event.target.checked);
                  }}
                />
                {p.label}
              </label>
            );
          }
          if (p.type === 'enum' || p.type === 'source') {
            return (
              <label key={p.name} className={styles.check}>
                {p.label}
                <select
                  className={styles.select}
                  value={String(value)}
                  onChange={(event) => {
                    set(p.name, event.target.value);
                  }}
                >
                  {p.options.map((o, i) => (
                    <option key={o} value={o}>
                      {p.optionLabels[i] ?? o}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          const min = p.min ?? 0;
          const max = Math.min(p.max ?? SLIDER_CAP, Math.max(SLIDER_CAP, min + 1));
          return (
            <label key={p.name} className={styles.slider}>
              <span>{p.label}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={p.step ?? (p.type === 'int' ? 1 : 0.1)}
                value={typeof value === 'number' ? value : min}
                onChange={(event) => {
                  set(p.name, Number(event.target.value));
                }}
              />
              <output className={styles.value}>{String(value)}</output>
            </label>
          );
        })}
      </div>
      <LabOutcome lab={lab}>
        {(data) => (
          <MiniChart
            title={spec.name}
            time={data.time}
            close={data.close}
            overlays={overlays}
            pane={pane}
            formatValue={(v) => formatPrice(v, 2)}
          />
        )}
      </LabOutcome>
    </div>
  );
}
