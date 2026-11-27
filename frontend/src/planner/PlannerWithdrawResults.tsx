import { useState } from 'react';

import type { WithdrawResult, WithdrawSummary } from '../api/planner.ts';
import panel from '../components/IndicatorSettingsPanel.module.css';
import styles from './Planner.module.css';
import { PlannerCards, type PlannerCard } from './PlannerCards.tsx';
import { plainPercent, shekels } from './plannerFormat.ts';
import { PlannerHeading } from './PlannerHeading.tsx';
import { PlannerTable, type PlannerColumn } from './PlannerTable.tsx';
import { PlannerWithdrawChart } from './PlannerWithdrawChart.tsx';
import { byYear, type WithdrawYear } from './withdraw.ts';

/** How long a plan of `months` is, in words. */
const span = (months: number) =>
  months % 12 === 0 ? `${String(months / 12)} years` : `${String(months)} months`;

const YEARS: PlannerColumn<WithdrawYear>[] = [
  [
    'Year',
    (y) => (y.months === 12 ? String(y.year) : `${String(y.year)} (${String(y.months)} months)`),
  ],
  ['Taken, net', (y) => shekels(y.net)],
  ['Taken, real', (y) => shekels(y.netReal)],
  ['Tax', (y) => shekels(y.tax)],
  ['Fees and commissions', (y) => shekels(y.costs)],
  ['Balance at its end', (y) => shekels(y.balance)],
];

/**
 * A withdrawal plan: the headline its rule calls for (a fixed amount: how long it lasts; a
 * percent: the income), the plan at the two bounds of the tax, the chart and the years.
 */
export function PlannerWithdrawResults({
  result,
  fixed,
}: {
  result: WithdrawResult;
  /** The rule the plan was run with: a fixed amount (true) or a percent. */
  fixed: boolean;
}) {
  const [real, setReal] = useState(true);
  const { summary: s, rows } = result;
  const first = rows[1]?.net ?? 0;
  const lastNet = rows.at(-1)?.net ?? 0;
  const left: PlannerCard = [
    'Left at the end',
    shekels(s.balance),
    `In shekels of the first day: ${shekels(s.balance_real)}. Sold then, after the commission and the tax: ${shekels(s.liquidation)}`,
  ];
  const lasts: PlannerCard =
    s.depleted_month === null
      ? ['Lasts', `All ${span(result.months)}`, 'Every month was paid in full']
      : [
          'The money ends',
          s.depleted_on ?? '',
          `Month ${String(s.depleted_month)} is the first not paid in full: ${String(s.months_paid)} months were`,
        ];
  const totals: PlannerCard[] = [
    ['Taken, net', shekels(s.taken), `In shekels of the first day: ${shekels(s.taken_real)}`],
    ['Tax paid', shekels(s.tax), 'On the gains of the sales, as they were made'],
    ['Fees and commissions', shekels(s.fees + s.commissions)],
  ];
  const cards: PlannerCard[] = fixed
    ? [lasts, left, ...totals]
    : [
        ['Income, first month', shekels(first), 'What is left of the sale after tax and costs'],
        [
          'Lowest month, real',
          shekels(s.lowest_net_real),
          'The smallest monthly income, in shekels of the first day',
        ],
        ['Income, last month', shekels(lastNet)],
        left,
        ...totals,
      ];
  const lasting = (b: WithdrawSummary) =>
    b.depleted_on === null ? 'All of it' : `Until ${b.depleted_on}`;
  const bounds: PlannerColumn<[string, WithdrawSummary]>[] = [
    ['Cost share', ([label]) => label],
    ...(fixed
      ? ([
          ['Lasts', ([, b]) => lasting(b)],
          ['Left at the end', ([, b]) => shekels(b.balance)],
        ] satisfies PlannerColumn<[string, WithdrawSummary]>[])
      : ([
          ['Taken, net', ([, b]) => shekels(b.taken)],
          ['Lowest month, real', ([, b]) => shekels(b.lowest_net_real)],
        ] satisfies PlannerColumn<[string, WithdrawSummary]>[])),
    ['Tax paid', ([, b]) => shekels(b.tax)],
  ];
  return (
    <>
      <h2 className={styles.heading}>
        Withdrawals: {result.start} to {result.end}
      </h2>
      <PlannerCards cards={cards} />
      {result.warnings.map((warning) => (
        <p key={warning} className={styles.warning}>
          {warning}
        </p>
      ))}
      <h2 className={styles.heading}>The tax, between its two bounds</h2>
      <PlannerTable
        label="Tax bounds"
        columns={bounds}
        rows={[
          ['0%: everything sold is gain', result.floor],
          [`${plainPercent(s.cost_share)}: as entered`, s],
          ['100%: only growth is gain', result.ceiling],
        ]}
      />
      <p className={styles.note}>
        The purchases behind the capital are not known, so the cost share stands for them. At 0%
        every sale is all gain: the least that can reach the hand. At 100% the capital was bought on
        the first day and only growth since then is taxed: the most.{' '}
        {fixed
          ? 'A fixed net amount needs a larger sale the more of it is taxed, so the bounds differ in how long the money lasts.'
          : 'A percent sells the same whatever the cost share, so the balance is one and the bounds differ only in the income.'}
      </p>
      <h2 className={styles.heading}>Over time</h2>
      <label className={panel.check}>
        <input
          type="checkbox"
          checked={real}
          onChange={(event) => {
            setReal(event.target.checked);
          }}
        />
        In shekels of the first day
      </label>
      <PlannerWithdrawChart rows={rows} real={real} depleted={s.depleted_month} />
      <PlannerHeading
        csv="withdrawals"
        rows={rows}
        fields={[
          'month',
          'date',
          'prices',
          'due',
          'sold',
          'commission',
          'tax',
          'fee',
          'net',
          'net_real',
          'balance',
          'balance_floor',
          'balance_ceiling',
          'net_floor',
          'net_ceiling',
        ]}
      >
        By year
      </PlannerHeading>
      <div className={styles.scroll}>
        <PlannerTable label="Withdrawals by year" columns={YEARS} rows={byYear(rows)} />
      </div>
      <p className={styles.note}>
        Every month, on its date: the account fee, the sale and its tax together. A loss is carried
        forward and set against later gains. The file holds a row a month. The numbers are a model,
        not advice.
      </p>
    </>
  );
}
