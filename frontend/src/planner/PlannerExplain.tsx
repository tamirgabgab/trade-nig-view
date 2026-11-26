import type { ScenarioResult } from '../api/planner.ts';
import styles from './Planner.module.css';
import { PlannerCards, type PlannerCard } from './PlannerCards.tsx';
import { inline, percent, plainPercent, points, shekels } from './plannerFormat.ts';
import { PlannerHeading } from './PlannerHeading.tsx';
import { PlannerLeadChart } from './PlannerLeadChart.tsx';
import { PlannerTable, type PlannerColumn } from './PlannerTable.tsx';
import { PlannerTornado } from './PlannerTornado.tsx';
import { PlannerLearn } from './PlannerLearn.tsx';

type Decomposition = NonNullable<ScenarioResult['decomposition']>;
type Liquidity = ScenarioResult['liquidity']['x'];
type Row<T> = [label: string, cell: (of: T) => string];

const SOURCES: Row<Decomposition>[] = [
  ['Appreciation', (d) => points(d.appreciation)],
  ['Rent', (d) => points(d.rent)],
  ['Mortgage leverage', (d) => points(d.leverage)],
  ['Costs and taxes', (d) => points(d.costs)],
  ['The apartment’s yearly return', (d) => percent(d.total)],
];
const money = (value: number | null) => (value === null ? '—' : shekels(value));
/** Two decimals, with a real minus sign. */
const fixed = (value: number) => value.toFixed(2).replace('-', '−');

/**
 * What the comparison's answer depends on: the apartment's return by source, each input moved
 * both ways, who leads over the exit months, and what a forced sale would leave.
 */
export function PlannerExplain({
  result,
  names,
}: {
  result: ScenarioResult;
  names: [string, string];
}) {
  const [x, y] = names;
  const { decomposition, lead, liquidity, correlation } = result;
  const leader = lead.leader === null ? 'A tie' : lead.leader === 'x' ? x : y;
  const cards: PlannerCard[] = [
    ['Leads at the end', leader],
    [
      'Stays ahead from',
      lead.since_months === null ? '—' : `Month ${String(lead.since_months)}`,
      `Sold in any later month checked (one every ${String(lead.step_months)}), it is still ahead`,
    ],
    [`Exit months ${inline(x)} leads`, percent(lead.x_share), 'A tie counts as half'],
  ];
  if (correlation) {
    cards.push([
      'Dwelling prices and the market',
      fixed(correlation.value),
      `The correlation of their yearly returns over ${String(correlation.years)} years; 95% interval ${fixed(correlation.low)} to ${fixed(correlation.high)}`,
    ]);
  }
  const off = `−${plainPercent(liquidity.discount)}`;
  const rows: Row<Liquidity>[] = [
    ['Cash at once', (l) => shekels(l.cash)],
    ['Apartment, sold normally', (l) => money(l.apartment)],
    [`Apartment, forced sale at ${off}`, (l) => money(l.forced)],
    ['End value with a forced sale', (l) => shekels(l.wealth_forced)],
  ];
  const liquidityColumns: PlannerColumn<Row<Liquidity>>[] = [
    ['What', ([label]) => label],
    [x, ([, cell]) => cell(liquidity.x)],
    [y, ([, cell]) => cell(liquidity.y)],
  ];
  return (
    <>
      <h2 className={styles.heading}>What the answer depends on</h2>
      <PlannerLearn page="what-the-answer-depends-on">What the answer depends on</PlannerLearn>
      {decomposition && (
        <>
          <PlannerTable
            label="Apartment return"
            columns={[
              ['Source', ([label]) => label],
              ['Points of yearly return', ([, cell]) => cell(decomposition)],
            ]}
            rows={SOURCES}
          />
          <p className={styles.note}>
            {result.x.home && result.y.home ? `Of ${inline(x)} only: the` : 'The'} apartment alone,
            by where its return comes from. Each source’s share is what it adds when switched on,
            averaged over every order of switching the four on (the Shapley value), so the four add
            up to the return, to the rounding shown. The mortgage’s share can be negative even when
            borrowing pays: it also counts the orders in which the apartment does not yet earn its
            rent or its appreciation, where a loan only costs.
          </p>
        </>
      )}
      {!decomposition && (result.x.home ?? result.y.home) && (
        <p className={styles.note}>
          The apartment’s return cannot be shared between its sources: with no money put down (or a
          return beyond measure) it has no yearly rate.
        </p>
      )}
      <PlannerHeading
        csv="sensitivity"
        rows={result.sensitivity}
        fields={['input', 'step', 'down', 'up']}
      >
        One input moved
      </PlannerHeading>
      <PlannerTornado moves={result.sensitivity} names={names} />
      <p className={styles.note}>
        The change of {inline(x)} minus {inline(y)} at the end when one input moves and the rest
        stay as entered. The path in use is tilted, not replaced; a rate does not go below zero, so
        a move down can be smaller than the move up.
      </p>
      <PlannerHeading
        csv="exit months"
        rows={result.average.points}
        fields={['months', 'date', 'x', 'y', 'x_forced', 'y_forced']}
      >
        Who leads, and from when
      </PlannerHeading>
      <PlannerCards cards={cards} />
      <p className={styles.note}>
        An exit is checked every {lead.step_months} month{lead.step_months === 1 ? '' : 's'}: the
        chart shows what each option would end at if everything were sold then.
        {correlation &&
          ` The correlation is of the yearly returns of the dwelling price index and of the market mix in shekels over ${String(correlation.years)} years; its 95% interval is ${fixed(correlation.low)} to ${fixed(correlation.high)}, so read it as rough.`}
      </p>
      <PlannerLeadChart
        points={result.average.points}
        lead={lead}
        names={names}
        discount={liquidity.discount}
      />
      <h2 className={styles.heading}>Liquidity</h2>
      <PlannerTable label="Liquidity" columns={liquidityColumns} rows={rows} />
      <p className={styles.note}>
        At the end of the plan. An account is cash within days; an apartment takes months to sell,
        or sells at once below its value. The betterment tax is recomputed on the lower price.
      </p>
    </>
  );
}
