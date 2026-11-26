import type { ScenarioResult, StudyResult } from '../api/planner.ts';
import styles from './Planner.module.css';
import { PlannerCards, type PlannerCard } from './PlannerCards.tsx';
import { percent, points, shekels } from './plannerFormat.ts';
import { PlannerWinMap } from './PlannerWinMap.tsx';

const NONE = 'None in range';

interface ScenarioProps {
  result: ScenarioResult;
  names: [string, string];
  /** The apartment's monthly rent, for the breakeven rent. */
  rent: number;
}

/** One scenario: what each option is worth at the end, and the breakeven rates. */
export function PlannerScenario({ result, names, rent }: ScenarioProps) {
  const [x, y] = names;
  const b = result.breakeven;
  const cards: PlannerCard[] = [
    ['Put in by each', shekels(result.spent), 'Both options spend it, on the same days'],
    [`${x}: worth at the end`, shekels(result.x.wealth), 'In cash, after every cost and tax'],
    [`${y}: worth at the end`, shekels(result.y.wealth), 'In cash, after every cost and tax'],
    [`${x} minus ${y.toLowerCase()}`, shekels(result.difference)],
    [
      `${x} minus ${y.toLowerCase()}, real`,
      shekels(result.difference_real),
      'In shekels of the first day',
    ],
    [`${x}: yearly return`, percent(result.x.xirr), `Real: ${percent(result.x.xirr_real)}`],
    [`${y}: yearly return`, percent(result.y.xirr), `Real: ${percent(result.y.xirr_real)}`],
    [
      `${x}: net worth averaged over time`,
      shekels(result.average.x),
      'The end value when the exit month is drawn evenly up to the end',
    ],
    [`${y}: net worth averaged over time`, shekels(result.average.y)],
  ];
  const breakeven: PlannerCard[] = [
    [
      'Apartment appreciation',
      b.appreciation === null ? NONE : `${percent(b.appreciation)} a year`,
    ],
    ['Market return', b.market_return === null ? NONE : `${percent(b.market_return)} a year`],
    [
      'Mortgage rates',
      b.mortgage_shift === null ? NONE : `${points(b.mortgage_shift)} points`,
      'Added to the rate of every track',
    ],
    ['Rent', b.rent_scale === null ? NONE : `${shekels(rent * b.rent_scale)} a month`],
  ];
  return (
    <>
      <h2 className={styles.heading}>
        {x} against {y.toLowerCase()}: {result.start} to {result.end}
      </h2>
      <PlannerCards cards={cards} />
      {result.warnings.map((warning) => (
        <p key={warning} className={styles.warning}>
          {warning}
        </p>
      ))}
      <h2 className={styles.heading}>Breakeven rates</h2>
      <PlannerCards cards={breakeven} />
      <p className={styles.note}>
        The value of one input at which the two options end equal, everything else as entered.
        Compare each with what you expect: no forecast is made here.
      </p>
    </>
  );
}

/** The same scenario over every start history allows, and the win map. */
export function PlannerStudy({ result, names }: { result: StudyResult; names: [string, string] }) {
  const [x, y] = names;
  const s = result.summary;
  const cards: PlannerCard[] = [
    ['Windows', String(s.windows), `Starts from ${s.first} to ${s.last}`],
    [
      'Independent terms, about',
      s.effective.toFixed(1),
      'Overlapping windows share most of their history: this is how many separate terms it holds',
    ],
    [`P(${x.toLowerCase()} > ${y.toLowerCase()})`, percent(s.p_win), 'A tie counts as half'],
    ['Median difference', shekels(s.median_difference), `${x} minus ${y.toLowerCase()}`],
    ['Median difference, real', shekels(s.median_difference_real), 'In shekels of each start'],
    [`${x}: median yearly return`, percent(s.x_xirr), `Real: ${percent(s.x_xirr_real)}`],
    [`${y}: median yearly return`, percent(s.y_xirr), `Real: ${percent(s.y_xirr_real)}`],
  ];
  return (
    <>
      <h2 className={styles.heading}>
        History: {s.windows} starts, {s.first} to {s.last}
      </h2>
      <PlannerCards cards={cards} />
      <p className={styles.note}>
        The {s.windows} windows overlap, so they hold only about {s.effective.toFixed(1)}{' '}
        independent terms of {Math.round(result.months / 12)} years: read the probability with that
        in mind. Every window uses the same amounts and the same rent; the betterment tax’s linear
        rule is off.
      </p>
      {result.before !== null && (
        <p className={styles.note}>Earlier starts cannot run: {result.before}.</p>
      )}
      {result.after !== null && (
        <p className={styles.note}>Later starts cannot run: {result.after}.</p>
      )}
      {result.warnings.map((warning) => (
        <p key={warning} className={styles.warning}>
          {warning}
        </p>
      ))}
      <h2 className={styles.heading}>Win map</h2>
      <PlannerWinMap map={result.win_map} names={names} />
    </>
  );
}
