import { useState } from 'react';

import type { OptionRisk, SimulationResult } from '../api/planner.ts';
import styles from './Planner.module.css';
import { CsvButton } from './CsvButton.tsx';
import { PlannerCards, type PlannerCard } from './PlannerCards.tsx';
import { inline, percent, shekels } from './plannerFormat.ts';
import { PlannerHistogram } from './PlannerHistogram.tsx';
import { PlannerSelect } from './PlannerSelect.tsx';
import { PlannerTable, type PlannerColumn } from './PlannerTable.tsx';

type Measure = 'wealth_real' | 'wealth' | 'xirr_real' | 'xirr';
const MEASURES: readonly (readonly [Measure, string])[] = [
  ['wealth_real', 'End value, real'],
  ['wealth', 'End value'],
  ['xirr_real', 'Yearly return, real'],
  ['xirr', 'Yearly return'],
];
const DOMINANCE: Record<SimulationResult['dominance'], (x: string, y: string) => string> = {
  x_first: (x, y) => `${x} over ${inline(y)}, first order`,
  y_first: (x, y) => `${y} over ${inline(x)}, first order`,
  x_second: (x, y) => `${x} over ${inline(y)}, second order`,
  y_second: (x, y) => `${y} over ${inline(x)}, second order`,
  equal: () => 'The two are the same',
  none: () => 'Neither dominates',
};
/** The columns of the worlds' file: what each option ends at, world by world. */
const SAMPLES = [
  'x_wealth',
  'y_wealth',
  'x_wealth_real',
  'y_wealth_real',
  'x_xirr',
  'y_xirr',
  'x_xirr_real',
  'y_xirr_real',
] as const satisfies readonly (keyof SimulationResult['samples'])[];
const share = (value: number | null) => (value === null ? '—' : percent(value));
const ratio = (value: number | null) => (value === null ? '—' : value.toFixed(2));

type Row = [label: string, cell: (risk: OptionRisk) => string, note?: string];
const ROWS: Row[] = [
  ['Median end value, real', (r) => shekels(r.wealth_real.p50)],
  ['5% percentile, real', (r) => shekels(r.wealth_real.p5), 'One world in twenty ends below it'],
  ['CVaR 5%, real', (r) => shekels(r.wealth_real.cvar5), 'The mean of the worst 5% of worlds'],
  ['Ends below the money put in', (r) => percent(r.shortfall)],
  ['Median yearly return, real', (r) => percent(r.xirr_real.p50)],
  ['Regret, mean', (r) => shekels(r.regret_mean), 'What the other option would have added'],
  ['Regret, 95% percentile', (r) => shekels(r.regret_p95)],
  [
    'Certainty equivalent',
    (r) => (r.certainty_equivalent === null ? 'Ruin' : shekels(r.certainty_equivalent)),
    'The sure real end value worth as much as this spread',
  ],
  ['Ends with nothing or a debt', (r) => percent(r.ruin)],
  ['Apartment below its loan at some point', (r) => share(r.negative_equity)],
  ['A payment above the share of income', (r) => share(r.stress)],
  ['Worst payment over income, median', (r) => share(r.stress_median)],
  ['Time the account is below its deposits', (r) => share(r.under_water)],
  ['Max drawdown, median', (r) => percent(r.drawdown_median)],
  ['Max drawdown, 95% percentile', (r) => percent(r.drawdown_p95)],
  ['Sharpe of the yearly returns', (r) => ratio(r.sharpe)],
  ['Sortino of the yearly returns', (r) => ratio(r.sortino)],
];

/** A simulation: who wins, how each option is spread, and the risks on the way. */
export function PlannerSimulation({
  result,
  names,
  run,
}: {
  result: SimulationResult;
  names: [string, string];
  /** The number of the simulation that gave `result`: a new one restarts the handles. */
  run: number;
}) {
  const [x, y] = names;
  const [measure, setMeasure] = useState<Measure>('wealth_real');
  const model = result.market;
  const history = result.history;
  const cards: PlannerCard[] = [
    [`P(${inline(x)} > ${inline(y)})`, percent(result.p_win), 'A tie counts as half'],
    ['Median difference', shekels(result.median_difference), `${x} minus ${inline(y)}`],
    ['Median difference, real', shekels(result.median_difference_real)],
    [
      'Dominance',
      DOMINANCE[result.dominance](x, y),
      'First order: better for everyone who prefers more. Second order: for every risk-averse investor. On the real end values.',
    ],
  ];
  if (model) {
    cards.push([
      'Modelled market',
      `${percent(model.mean)} a year, σ ${percent(model.sd)}`,
      model.estimated ? 'Estimated from the mix’s history' : 'As entered',
    ]);
  }
  if (history) {
    cards.push([
      'History resampled',
      `${String(history.months)} months`,
      `${history.first} to ${history.last}`,
    ]);
    cards.push([
      'Independent terms in it, about',
      history.effective.toFixed(1),
      'The worlds are many, but they are cut from this much history',
    ]);
  }
  const columns: PlannerColumn<Row>[] = [
    ['Risk', ([label]) => label],
    [x, ([, cell]) => cell(result.x)],
    [y, ([, cell]) => cell(result.y)],
  ];
  const returns = measure.startsWith('xirr');
  const samples = result.samples;
  // Returns are shown in percent, so the handles and their fields are in percent too.
  const shown = (values: number[]) => (returns ? values.map((v) => v * 100) : values);
  return (
    <>
      <h2 className={styles.heading}>
        Simulation: {result.runs.toLocaleString('en-US')} worlds,{' '}
        {result.method === 'bootstrap' ? 'block bootstrap' : 'Monte Carlo'}
      </h2>
      <PlannerCards cards={cards} />
      {result.warnings.map((warning) => (
        <p key={warning} className={styles.warning}>
          {warning}
        </p>
      ))}
      <div className={styles.headingRow}>
        <h2 className={styles.heading}>Distribution</h2>
        <CsvButton
          name="simulation samples"
          headers={['world', ...SAMPLES]}
          rows={() =>
            samples.x_wealth.map((_, world) => [
              world + 1,
              ...SAMPLES.map((field) => samples[field][world] ?? null),
            ])
          }
        />
      </div>
      <div className={styles.grid}>
        <PlannerSelect label="Measure" value={measure} options={MEASURES} onChange={setMeasure} />
      </div>
      <PlannerHistogram
        // New data or another measure: the handles start again at the quartiles.
        key={`${measure}:${String(run)}`}
        x={shown(samples[`x_${measure}`])}
        y={shown(samples[`y_${measure}`])}
        names={names}
        measure={(MEASURES.find(([id]) => id === measure)?.[1] ?? '').toLowerCase()}
        format={returns ? (v) => `${v.toFixed(1)}%` : shekels}
        step={returns ? 0.1 : 1000}
      />
      <p className={styles.note}>
        The interval is the simulation’s own error: it shrinks with more worlds, and says nothing of
        how little history there is to draw them from. The values outside the middle 99% are in the
        first and the last bar.
      </p>
      <h2 className={styles.heading}>The same money in both</h2>
      <PlannerTable
        label="Split"
        columns={[
          [`Share in ${inline(x)}`, (row) => `${String(Math.round(row.weight * 100))}%`],
          ['Median end value, real', (row) => shekels(row.p50)],
          ['5% percentile', (row) => shekels(row.p5)],
          ['CVaR 5%', (row) => shekels(row.cvar5)],
        ]}
        rows={result.split}
      />
      <p className={styles.note}>
        Both options put in the same money, so a share of it in each ends at that share of each end
        value, world by world. A middle row with a higher 5% percentile than both ends means holding
        both lowers the risk. An indication only: half an apartment cannot be bought.
      </p>
      <h2 className={styles.heading}>Risk</h2>
      <div className={styles.scroll}>
        <PlannerTable label="Risk" columns={columns} rows={ROWS} />
      </div>
      <p className={styles.note}>
        Net worth on the way is before any exit cost or tax: the apartment’s value less its loan,
        plus the account’s market value. Regret, dominance and the certainty equivalent are on the
        real end values. Sharpe and Sortino are against a return of zero, on yearly returns of the
        net worth with the money put in taken out; a last part of a year is left out.
      </p>
    </>
  );
}
