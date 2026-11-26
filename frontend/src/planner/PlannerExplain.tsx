import type { ScenarioResult } from '../api/planner.ts';
import styles from './Planner.module.css';
import { PlannerCards, type PlannerCard } from './PlannerCards.tsx';
import { percent, points, shekels } from './plannerFormat.ts';
import { PlannerLeadChart } from './PlannerLeadChart.tsx';
import { PlannerTable, type PlannerColumn } from './PlannerTable.tsx';
import { PlannerTornado } from './PlannerTornado.tsx';

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
    [`Exit months ${x.toLowerCase()} leads`, percent(lead.x_share), 'A tie counts as half'],
  ];
  if (correlation) {
    cards.push([
      'Dwelling prices and the market',
      correlation.value.toFixed(2),
      `The correlation of their yearly returns over ${String(correlation.years)} years; 95% interval ${correlation.low.toFixed(2)} to ${correlation.high.toFixed(2)}`,
    ]);
  }
  const off = `−${String(Math.round(liquidity.discount * 100))}%`;
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
            The apartment alone, by where its return comes from. Each source’s share is what it adds
            when switched on, averaged over every order of switching the four on (the Shapley
            value), so the four add up to the return. The mortgage’s share can be negative even when
            borrowing pays: it also counts the orders in which the apartment does not yet earn its
            rent or its appreciation.
          </p>
        </>
      )}
      <h2 className={styles.heading}>One input moved</h2>
      <PlannerTornado moves={result.sensitivity} names={names} />
      <p className={styles.note}>
        The change of {x.toLowerCase()} minus {y.toLowerCase()} at the end when one input moves and
        the rest stay as entered. The path in use is tilted, not replaced; a rate does not go below
        zero, so a move down can be smaller than the move up.
      </p>
      <h2 className={styles.heading}>Who leads, and from when</h2>
      <PlannerCards cards={cards} />
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
