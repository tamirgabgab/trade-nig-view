import { useState } from 'react';

import type { WithdrawBound, WithdrawManyResult } from '../api/planner.ts';
import panel from '../components/IndicatorSettingsPanel.module.css';
import styles from './Planner.module.css';
import { PlannerBandChart } from './PlannerBandChart.tsx';
import { PlannerCards, type PlannerCard } from './PlannerCards.tsx';
import { plainPercent, shekels, wholePercent } from './plannerFormat.ts';
import { PlannerHeading } from './PlannerHeading.tsx';
import { PlannerTable, type PlannerColumn } from './PlannerTable.tsx';
import { PlannerWithdrawHistogram } from './PlannerWithdrawHistogram.tsx';
import { quantile } from './sampleStats.ts';
import { leftValues } from './withdraw.ts';

const rounded = (value: number) => String(Number(value.toFixed(1)));

/**
 * One withdrawal plan over many realizations (the starts of history, or simulated worlds): how
 * often it lasts, what is left as a histogram, the share still paying or the income over the
 * years, and the same at the two bounds of the tax.
 */
export function PlannerWithdrawMany({
  result,
  fixed,
  home,
}: {
  result: WithdrawManyResult;
  /** The rule the plan was run with: a fixed amount (true) or a percent. */
  fixed: boolean;
  /** It was run with an apartment. */
  home: boolean;
}) {
  const [asPercent, setAsPercent] = useState(true);
  const [real, setReal] = useState(true);
  const { realizations, bounds, count, start_worth: start, evidence, market } = result;
  const [floor, entered, ceiling] = bounds as [WithdrawBound, WithdrawBound, WithdrawBound];
  const windows = result.method === 'windows';
  const noun = windows ? 'starts' : 'worlds';
  const years = rounded(result.months / 12);
  const drawdowns = realizations.map((r) => r.drawdown).sort((a, b) => a - b);
  const { values, ranOut } = leftValues(realizations, start, {
    percent: asPercent,
    real,
    all: home,
  });
  const what = home ? 'net worth (the account and the apartment, sold)' : 'account';

  const cards: PlannerCard[] = [
    ...(fixed || entered.lasts < 1
      ? ([
          [
            'Lasts in',
            `${wholePercent(entered.lasts)} of the ${String(count)} ${noun}`,
            `At the tax bounds: ${wholePercent(floor.lasts)} to ${wholePercent(ceiling.lasts)}. One lasts when its last month is paid in full`,
          ],
        ] satisfies PlannerCard[])
      : []),
    ...(result.sustainable === null
      ? []
      : ([
          [
            'Sustainable amount',
            shekels(result.sustainable.amount),
            `The largest monthly amount that lasts in at least ${rounded(result.sustainable.target_pct)}% of the ${noun}, at the cost share entered`,
          ],
        ] satisfies PlannerCard[])),
    ...(fixed
      ? []
      : ([
          [
            'Median lowest month, real',
            shekels(entered.lowest_net_real),
            `The smallest monthly income of each of the ${noun}, in shekels of the first day; at the tax bounds ${shekels(floor.lowest_net_real)} to ${shekels(ceiling.lowest_net_real)}`,
          ],
        ] satisfies PlannerCard[])),
    [
      'Median left',
      wholePercent(entered.left_real / start),
      `${shekels(entered.left_real)} in shekels of the first day, of the ${shekels(start)} there was: the ${what}. Over all the ${noun}, the ones that ran out included`,
    ],
    ['Median taken, real', shekels(entered.taken_real), 'Net, in shekels of the first day'],
    [
      'Median worst fall',
      wholePercent(quantile(drawdowns, 0.5)),
      'The deepest fall of the net worth from its peak, in shekels of the first day',
    ],
    ...(evidence.independent === null
      ? []
      : ([
          [
            'Independent terms, about',
            evidence.independent.toFixed(1),
            `Separate terms of ${years} years in the history used`,
          ],
        ] satisfies PlannerCard[])),
  ];
  const columns: PlannerColumn<[string, WithdrawBound]>[] = [
    ['Cost share', ([label]) => label],
    ['Lasts in', ([, b]) => wholePercent(b.lasts)],
    ['Median left, real', ([, b]) => shekels(b.left_real)],
    ['Median taken, real', ([, b]) => shekels(b.taken_real)],
    ['Median lowest month, real', ([, b]) => shekels(b.lowest_net_real)],
  ];
  const first = realizations[0]?.start ?? '';
  const last = realizations.at(-1)?.start ?? '';

  return (
    <>
      <h2 className={styles.heading}>
        {windows
          ? `History: ${String(count)} starts, ${first} to ${last}`
          : `Simulation: ${String(count)} worlds, ${result.method === 'bootstrap' ? 'cut from history' : 'a modelled market'}`}
      </h2>
      <PlannerCards cards={cards} />
      {evidence.independent !== null && (
        <p className={styles.note}>
          {windows
            ? `The ${String(count)} starts overlap, so they`
            : `The worlds are cut from ${String(evidence.history_months ?? 0)} months of history, which`}{' '}
          hold only about {evidence.independent.toFixed(1)} separate terms of {years} years: read
          every share here with that in mind.
        </p>
      )}
      {market !== null && (
        <p className={styles.note}>
          The market is a model: it grows {rounded(market.mean_pct)}% a year with a volatility of{' '}
          {rounded(market.sd_pct)}%
          {market.estimated ? ', both estimated from the mix’s history' : ''}. Real markets fall
          harder than a model of this kind does.
        </p>
      )}
      {result.before !== null && result.before !== undefined && (
        <p className={styles.note}>Earlier starts cannot run: {result.before}.</p>
      )}
      {result.after !== null && result.after !== undefined && (
        <p className={styles.note}>Later starts cannot run: {result.after}.</p>
      )}
      {result.warnings.map((warning) => (
        <p key={warning} className={styles.warning}>
          {warning}
        </p>
      ))}
      <h2 className={styles.heading}>The tax, between its two bounds</h2>
      <PlannerTable
        label={`Tax bounds over the ${noun}`}
        columns={columns}
        rows={[
          ['0%: everything sold is gain', floor],
          [`${plainPercent(entered.cost_share)}: as entered`, entered],
          ['100%: only growth is gain', ceiling],
        ]}
      />
      <h2 className={styles.heading}>What is left at the end</h2>
      <label className={panel.check}>
        <input
          type="checkbox"
          checked={asPercent}
          onChange={(event) => {
            setAsPercent(event.target.checked);
          }}
        />
        As a percent of the start
      </label>
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
      <PlannerWithdrawHistogram
        values={values}
        // With an apartment the ones that ran out still hold its worth: they are in the bars.
        ranOut={home ? 0 : ranOut}
        start={asPercent ? 1 : start}
        noun={noun}
        unit={`${asPercent ? 'as a percent of the start' : 'in shekels'}${real ? ' (of the first day)' : ''}`}
        format={asPercent ? wholePercent : shekels}
      />
      <p className={styles.note}>
        One bar a range of what is left of the {what}, a count of the {noun} in it
        {ranOut === 0
          ? ''
          : home
            ? `; the ${String(ranOut)} that ran out before the end still hold the apartment’s worth, and are among the bars`
            : '; the ones that ran out before the end are the bar apart, on the same scale'}
        . At the cost share entered ({plainPercent(entered.cost_share)}).
      </p>
      {fixed ? (
        <>
          <h2 className={styles.heading}>Still paying, by year</h2>
          <PlannerBandChart
            label={`The share of the ${noun} still paying, over ${years} years`}
            points={result.survival.map((p) => ({
              year: p.month / 12,
              value: p.share,
              bands: [[p.floor, p.ceiling]],
            }))}
            top={1.06}
            format={wholePercent}
            legend={[
              `The share of the ${noun} still paying in full`,
              'Between the tax bounds (cost share 0% to 100%)',
            ]}
          />
        </>
      ) : (
        // A plan of one year has one point: no line to draw.
        result.income.length > 1 && (
          <>
            <h2 className={styles.heading}>The income, by year</h2>
            <PlannerBandChart
              label={`The monthly income by year, over ${String(count)} ${noun}`}
              points={result.income.map((y) => ({
                year: y.year,
                value: y.p50,
                bands: [
                  [y.p5, y.p95],
                  [y.p25, y.p75],
                ],
              }))}
              format={shekels}
              legend={[
                'The median monthly income of the year, in shekels of the first day',
                `Nine in ten of the ${noun}, and the middle half`,
              ]}
            />
          </>
        )
      )}
      <PlannerHeading
        csv={`withdrawal ${noun}`}
        rows={realizations}
        fields={[
          'start',
          'left',
          'left_real',
          'taken_real',
          'tax',
          'depleted_month',
          'lowest_net_real',
          'drawdown',
          'home_sold_month',
        ]}
      >
        {`Each of the ${String(count)} ${noun}, as a file`}
      </PlannerHeading>
    </>
  );
}
