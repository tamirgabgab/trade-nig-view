import { useState } from 'react';

import { useIndicatorList, type Params } from '../../api/indicators.ts';
import { useLab, type LabSource, type Scenario } from '../../api/lab.ts';
import { formatPrice } from '../formatNumber.ts';
import styles from './Lab.module.css';
import { chartLines, withDefaults } from './labModel.ts';
import { LabOutcome } from './LabOutcome.tsx';
import { MiniChart } from './MiniChart.tsx';
import { SourcePicker } from './SourcePicker.tsx';
import { useDebounced } from './useDebounced.ts';

export interface ParamBlock {
  kind: 'param';
  indicator: string;
  params?: Params;
  /** The param the slider moves (e.g. "length"). */
  vary: string;
  /** Slider range; default: the param's own min/max, capped at 200. */
  min?: number;
  max?: number;
  scenario?: Scenario;
  caption?: string;
}

/** "Move one parameter and watch": a slider for one param, a mini chart, any data source. */
export function ParamLab({ block }: { block: ParamBlock }) {
  const spec = useIndicatorList().data?.find((s) => s.id === block.indicator);
  const param = spec?.params.find((p) => p.name === block.vary);
  const base = withDefaults(spec, block.params);
  const [value, setValue] = useState<number | null>(null);
  const [source, setSource] = useState<LabSource>({
    kind: 'synthetic',
    scenario: block.scenario ?? 'random_walk',
    seed: 1,
    bars: 300,
  });
  const shown = value ?? (typeof base[block.vary] === 'number' ? (base[block.vary] as number) : 14);
  const settled = useDebounced(shown);
  const lab = useLab(
    spec === undefined
      ? null
      : {
          source,
          indicators: [{ id: spec.id, params: { ...base, [block.vary]: settled } }],
          conditions: [],
          horizon: 10,
        },
  );
  const min = block.min ?? param?.min ?? 1;
  const max = block.max ?? Math.min(param?.max ?? 200, 200);
  const { overlays, pane } = chartLines(spec, lab.data?.indicators[0]);

  return (
    <section
      className={styles.lab}
      aria-label={`${spec?.shortName ?? block.indicator}: try ${block.vary}`}
    >
      <SourcePicker source={source} onChange={setSource} />
      <label className={styles.slider}>
        <span>{param?.label ?? block.vary}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={param?.step ?? (param?.type === 'int' ? 1 : 0.1)}
          value={shown}
          onChange={(event) => {
            setValue(Number(event.target.value));
          }}
        />
        <output className={styles.value}>{shown}</output>
      </label>
      <LabOutcome lab={lab}>
        {(data) => (
          <MiniChart
            title={
              block.caption ??
              `${spec?.shortName ?? block.indicator} with ${param?.label ?? block.vary} = ${String(settled)}`
            }
            time={data.time}
            close={data.close}
            overlays={overlays}
            pane={pane}
            formatValue={(v) => formatPrice(v, 2)}
          />
        )}
      </LabOutcome>
    </section>
  );
}
