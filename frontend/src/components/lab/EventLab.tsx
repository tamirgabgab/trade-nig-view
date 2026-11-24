import { useState } from 'react';

import { useIndicatorList, type Params } from '../../api/indicators.ts';
import { useLab, type LabSource, type Op, type LabInterval, type Scenario } from '../../api/lab.ts';
import { formatPrice } from '../formatNumber.ts';
import styles from './Lab.module.css';
import { buildRules, chartLines, missingIndicator, OP_LABEL, withDefaults } from './labModel.ts';
import { LabOutcome } from './LabOutcome.tsx';
import { MiniChart } from './MiniChart.tsx';
import { SourcePicker } from './SourcePicker.tsx';
import { StudyCard } from './StudyCard.tsx';
import { useDebounced } from './useDebounced.ts';

export interface EventBlock {
  kind: 'event';
  indicator: string;
  params?: Params;
  output: string;
  op: Op;
  /** The threshold the output is compared with (e.g. 30). */
  value: number;
  /** Threshold slider range. */
  range?: [number, number];
  horizon?: number;
  scenario?: Scenario;
  /** '1h' starts the widget on hourly bars in sessions (VWAP). */
  interval?: LabInterval;
}

/**
 * "What happened after the signal?": an event study of one rule (output vs threshold), with the
 * threshold, the comparison and the horizon adjustable, on a random or a real series.
 */
export function EventLab({ block }: { block: EventBlock }) {
  const registry = useIndicatorList();
  const spec = registry.data?.find((s) => s.id === block.indicator);
  const params = withDefaults(spec, block.params);
  const [threshold, setThreshold] = useState(block.value);
  const [op, setOp] = useState<Op>(block.op);
  const [horizon, setHorizon] = useState(block.horizon ?? 10);
  const [source, setSource] = useState<LabSource>({
    kind: 'synthetic',
    scenario: block.scenario ?? 'range',
    seed: 1,
    bars: 1000,
    interval: block.interval ?? '1D',
  });
  const rule = useDebounced({ threshold, op, horizon });
  const { indicators, conditions } = buildRules([
    {
      label: '',
      left: { indicator: { id: block.indicator, params }, output: block.output },
      op: rule.op,
      right: { value: rule.threshold },
    },
  ]);
  const lab = useLab(
    spec === undefined ? null : { source, indicators, conditions, horizon: rule.horizon },
  );
  const [lo, hi] = block.range ?? [0, 100];
  const { overlays, pane } = chartLines(
    spec,
    lab.data?.indicators[0],
    [block.output],
    lab.data?.volume,
  );
  const name = spec?.shortName ?? block.indicator;

  return (
    <section className={styles.lab} aria-label={`${name}: event study`}>
      <SourcePicker source={source} onChange={setSource} />
      <div className={styles.controls}>
        <span>
          {name} {spec?.outputs.find((o) => o.name === block.output)?.label ?? block.output}
        </span>
        <select
          className={styles.select}
          aria-label="Comparison"
          value={op}
          onChange={(event) => {
            setOp(event.target.value as Op);
          }}
        >
          {(Object.keys(OP_LABEL) as Op[]).map((o) => (
            <option key={o} value={o}>
              {OP_LABEL[o]}
            </option>
          ))}
        </select>
        <label className={styles.slider}>
          <span className="visually-hidden">Threshold</span>
          <input
            type="range"
            min={lo}
            max={hi}
            step={(hi - lo) / 100}
            value={threshold}
            onChange={(event) => {
              setThreshold(Number(event.target.value));
            }}
          />
          <output className={styles.value}>{Number(threshold.toPrecision(4))}</output>
        </label>
        <label className={styles.slider}>
          <span>Look ahead</span>
          <input
            type="range"
            min={1}
            max={60}
            value={horizon}
            onChange={(event) => {
              setHorizon(Number(event.target.value));
            }}
          />
          <output className={styles.value}>{horizon} bars</output>
        </label>
      </div>
      <LabOutcome lab={lab} missing={missingIndicator(registry, spec, block.indicator)}>
        {(data) => (
          <>
            <MiniChart
              title={`Signals: ${name} ${OP_LABEL[rule.op]} ${String(Number(rule.threshold.toPrecision(4)))}`}
              time={data.time}
              close={data.close}
              overlays={overlays}
              pane={pane === null ? null : { ...pane, levels: [rule.threshold] }}
              markers={data.study?.eventIndex ?? []}
              formatValue={(v) => formatPrice(v, 2)}
            />
            {data.study !== null && <StudyCard study={data.study} />}
          </>
        )}
      </LabOutcome>
    </section>
  );
}
