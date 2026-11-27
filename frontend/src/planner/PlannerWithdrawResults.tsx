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
const span = (months: number) => {
  const [count, unit] = months % 12 === 0 ? [months / 12, 'year'] : [months, 'month'];
  return `${String(count)} ${unit}${count === 1 ? '' : 's'}`;
};

const SALE = {
  planned: 'On the date set',
  empty: 'When the account could not pay the month',
  forced: 'Forced: the account could not pay its costs',
} as const;

/** What became of the apartment in one run. */
const fate = (b: WithdrawSummary) =>
  b.home_sale === null
    ? 'Kept'
    : `${b.home_sale === 'forced' ? 'Forced sale' : 'Sold'} on ${b.home_sold_on ?? ''}`;

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
const HOME_YEARS: PlannerColumn<WithdrawYear>[] = [
  ['Apartment, cash', (y) => shekels(y.homeCash)],
  ['Apartment at its end', (y) => shekels(y.home)],
];

/**
 * A withdrawal plan: the headline its rule calls for (a fixed amount: how long it lasts; a
 * percent: the income), the plan at the two bounds of the tax, the chart and the years.
 */
export function PlannerWithdrawResults({
  result,
  fixed,
  home,
}: {
  result: WithdrawResult;
  /** The rule the plan was run with: a fixed amount (true) or a percent. */
  fixed: boolean;
  /** It was run with an apartment. */
  home: boolean;
}) {
  const [real, setReal] = useState(true);
  const { summary: s, rows } = result;
  const first = rows[1]?.net ?? 0;
  const lastNet = rows.at(-1)?.net ?? 0;
  const left: PlannerCard = [
    'Left at the end',
    shekels(s.balance),
    home
      ? `The account; in shekels of the first day: ${shekels(s.balance_real)}`
      : `In shekels of the first day: ${shekels(s.balance_real)}. Sold then, after the commission and the tax: ${shekels(s.liquidation)}`,
  ];
  const apartment: PlannerCard[] = home
    ? [
        [
          'The apartment',
          fate(s),
          s.home_sale === null
            ? `Its sale at the end would leave ${shekels(s.home_worth)}`
            : `${SALE[s.home_sale]}; ${shekels(s.invested)} went into the account in all`,
        ],
        [
          'Net worth at the end',
          shekels(s.liquidation),
          `What selling the account and the apartment then would leave, after their costs and taxes; in shekels of the first day: ${shekels(s.liquidation_real)}`,
        ],
      ]
    : [];
  const lasts: PlannerCard =
    s.depleted_month === null
      ? [
          'Lasts',
          `All ${span(result.months)}`,
          s.short_months === 0
            ? 'Every month was paid in full'
            : `${span(s.short_months)} not paid in full, the first on ${s.first_short_on ?? ''}; the others were`,
        ]
      : [
          'The money ends',
          s.depleted_on ?? '',
          `From month ${String(s.depleted_month)} no month is paid in full again: ${span(s.months_paid)} were`,
        ];
  const totals: PlannerCard[] = [
    ['Taken, net', shekels(s.taken), `In shekels of the first day: ${shekels(s.taken_real)}`],
    ['Tax paid', shekels(s.tax), 'On the gains of the sales, as they were made'],
    ['Fees and commissions', shekels(s.fees + s.commissions)],
  ];
  const cards: PlannerCard[] = fixed
    ? [lasts, left, ...apartment, ...totals]
    : [
        // A percent ends only when the fees take what is left: then that comes first.
        ...(s.depleted_month === null ? [] : [lasts]),
        ['Income, first month', shekels(first), 'What is left of the sale after tax and costs'],
        [
          'Lowest month, real',
          shekels(s.lowest_net_real),
          'The smallest monthly income, in shekels of the first day',
        ],
        ['Income, last month', shekels(lastNet)],
        left,
        ...apartment,
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
    ...(home
      ? ([['The apartment', ([, b]) => fate(b)]] satisfies PlannerColumn<
          [string, WithdrawSummary]
        >[])
      : []),
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
        {home &&
          ' With an apartment, the bounds may also differ in when it is sold; and a percent that must sell more for its costs than its twelfth has a balance that depends on the cost share too.'}
      </p>
      {result.reversed !== null && (
        <>
          <h2 className={styles.heading}>The order of the months</h2>
          <PlannerTable
            label="The months in reverse order"
            columns={[
              ['Order', ([label]) => label],
              ...(fixed
                ? ([['Lasts', ([, b]) => lasting(b)]] satisfies PlannerColumn<
                    [string, WithdrawSummary]
                  >[])
                : ([
                    ['Lowest month, real', ([, b]) => shekels(b.lowest_net_real)],
                  ] satisfies PlannerColumn<[string, WithdrawSummary]>[])),
              ['Left at the end', ([, b]) => shekels(b.balance)],
              ['Taken, net', ([, b]) => shekels(b.taken)],
            ]}
            rows={[
              ['As it happened', s],
              ['In reverse', result.reversed],
            ]}
          />
          <p className={styles.note}>
            The same months of the market, last first; the CPI{home ? ' and the apartment' : ''} as
            they were.{' '}
            {fixed
              ? 'A fixed amount sells more units after a fall, so bad years first cost more than the same years last: the order of the returns matters when money is taken out.'
              : home
                ? 'A percent of the account alone ends with the same balance in either order; an apartment’s sale or costs change what is sold, so here the two can differ.'
                : 'A percent ends with the same balance in either order; what it paid on the way differs.'}
          </p>
        </>
      )}
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
      <PlannerWithdrawChart rows={rows} real={real} depleted={s.depleted_month} home={home} />
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
          ...(home ? (['home', 'home_cash', 'invested'] as const) : []),
        ]}
      >
        By year
      </PlannerHeading>
      <div className={styles.scroll}>
        <PlannerTable
          label="Withdrawals by year"
          columns={home ? [...YEARS, ...HOME_YEARS] : YEARS}
          rows={byYear(rows)}
        />
      </div>
      <p className={styles.note}>
        Every month, on its date: the account fee, the sale and its tax together. A loss is carried
        forward and set against later gains. The file holds a row a month. The numbers are a model,
        not advice.
      </p>
    </>
  );
}
