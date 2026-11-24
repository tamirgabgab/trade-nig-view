import { useState } from 'react';

import { useIndicatorList } from '../../api/indicators.ts';
import {
  useLab,
  useLabs,
  type LabInterval,
  type LabSource,
  type Scenario,
  type Study,
} from '../../api/lab.ts';
import { formatPrice } from '../formatNumber.ts';
import styles from './Lab.module.css';
import { buildRules, chartLines, logToPercent, type RuleSpec } from './labModel.ts';
import { LabOutcome } from './LabOutcome.tsx';
import { MiniChart } from './MiniChart.tsx';
import { SourcePicker } from './SourcePicker.tsx';
import { StudyCard } from './StudyCard.tsx';

export interface ComboBlock {
  kind: 'combo';
  /** Candidate rules; up to three can be on at once. */
  rules: RuleSpec[];
  /** Indexes of the rules on at first. */
  on?: number[];
  horizon?: number;
  scenario?: Scenario;
  /** '1h' starts the widget on hourly bars in sessions (VWAP). */
  interval?: LabInterval;
}

export const MAX_RULES = 3;

const edgeText = (s: Study | null | undefined) => {
  if (s === null || s === undefined || s.edge === null) return '—';
  const v = logToPercent(s.edge);
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)} % (n = ${String(s.events.n)})`;
};

/**
 * Combining rules (trend filter + trigger + confirmation): switch up to three on, see the signals
 * of their AND and compare the edge of the combination with each rule alone.
 */
export function ComboLab({ block }: { block: ComboBlock }) {
  const registry = useIndicatorList();
  const specs = registry.data ?? [];
  const ready = registry.data !== undefined; // params are filled in from the registry first
  const [on, setOn] = useState<number[]>(block.on ?? [0]);
  const [source, setSource] = useState<LabSource>({
    kind: 'synthetic',
    scenario: block.scenario ?? 'reversal',
    seed: 1,
    bars: 1000,
    interval: block.interval ?? '1D',
  });
  const horizon = block.horizon ?? 10;
  const chosen = block.rules.filter((_, i) => on.includes(i));
  const request = buildRules(chosen, specs);
  const combined = useLab(chosen.length === 0 || !ready ? null : { source, ...request, horizon });
  // Each rule alone, for the comparison column.
  const alone = useLabs(
    ready ? block.rules.map((rule) => ({ source, ...buildRules([rule], specs), horizon })) : [],
  );
  const first = request.indicators[0];
  const { overlays, pane } = chartLines(
    specs.find((s) => s.id === first?.id),
    combined.data?.indicators[0],
  );

  return (
    <section className={styles.lab} aria-label="Combine rules">
      <SourcePicker source={source} onChange={setSource} />
      <table className={styles.stats}>
        <thead>
          <tr>
            <th scope="col">Rule</th>
            <th scope="col">Edge alone ({horizon} bars)</th>
          </tr>
        </thead>
        <tbody>
          {block.rules.map((rule, i) => (
            <tr key={rule.label}>
              <th scope="row">
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={on.includes(i)}
                    disabled={!on.includes(i) && on.length >= MAX_RULES}
                    onChange={(event) => {
                      setOn(event.target.checked ? [...on, i] : on.filter((j) => j !== i));
                    }}
                  />
                  {rule.label}
                </label>
              </th>
              <td>{edgeText(alone[i]?.data?.study)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {chosen.length === 0 ? (
        <p className={styles.note}>Switch on at least one rule.</p>
      ) : (
        <LabOutcome lab={combined}>
          {(data) => (
            <>
              <MiniChart
                title={`Signals where all ${String(chosen.length)} rule${chosen.length === 1 ? '' : 's'} hold`}
                time={data.time}
                close={data.close}
                overlays={overlays}
                pane={pane}
                markers={data.study?.eventIndex ?? []}
                formatValue={(v) => formatPrice(v, 2)}
              />
              {data.study !== null && <StudyCard study={data.study} />}
            </>
          )}
        </LabOutcome>
      )}
    </section>
  );
}
