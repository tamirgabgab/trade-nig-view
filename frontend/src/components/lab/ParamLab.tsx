import { useState } from 'react';

import { useIndicatorList, type Params } from '../../api/indicators.ts';
import { useLab, type LabSource, type Scenario } from '../../api/lab.ts';
import { formatPrice } from '../formatNumber.ts';
import styles from './Lab.module.css';
import { chartLines, missingIndicator, sliderRange, withDefaults } from './labModel.ts';
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
  const registry = useIndicatorList();
  const spec = registry.data?.find((s) => s.id === block.indicator);
  const param = spec?.params.find((p) => p.name === block.vary);
  const base = withDefaults(spec, block.params);
  const [value, setValue] = useState<number | null>(null);
  const [source, setSource] = useState<LabSource>({
    kind: 'synthetic',
    scenario: block.scenario ?? 'random_walk',
    seed: 1,
    bars: 300,
  });
  // Only the reader's choice is debounced: the default applies at once, once the registry is in.
  const fallback = typeof base[block.vary] === 'number' ? (base[block.vary] as number) : 0;
  const shown = value ?? fallback;
  const settled = useDebounced(value) ?? fallback;
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
  const { min, max, step } = sliderRange(param, shown, block);
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
          step={step}
          value={shown}
          onChange={(event) => {
            setValue(Number(event.target.value));
          }}
        />
        <output className={styles.value}>{shown}</output>
      </label>
      <LabOutcome lab={lab} missing={missingIndicator(registry, spec, block.indicator)}>
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
