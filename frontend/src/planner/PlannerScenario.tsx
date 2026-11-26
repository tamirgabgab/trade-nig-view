import type { ScenarioResult } from '../api/planner.ts';
import styles from './Planner.module.css';
import { PlannerCards, type PlannerCard } from './PlannerCards.tsx';
import { percent, points, shekels } from './plannerFormat.ts';

const NONE = 'None in range';

/** Where an option's end value comes from (all in cash, after every cost and tax). */
function parts(option: ScenarioResult['x']): string {
  const home = option.home ? `the apartment ${shekels(option.home.net_worth)}` : null;
  const account = option.account ? `the account ${shekels(option.account.net_value)}` : null;
  const held = [home, account].filter((part) => part !== null).join(', ');
  return `In cash, after every cost and tax: ${held}, less the bills of the last day. Of the money put in, ${shekels(option.topped_up)} matched the other option.`;
}

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
    [`${x}: worth at the end`, shekels(result.x.wealth), parts(result.x)],
    [`${y}: worth at the end`, shekels(result.y.wealth), parts(result.y)],
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
