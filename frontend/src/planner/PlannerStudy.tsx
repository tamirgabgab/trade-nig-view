import type { StudyResult } from '../api/planner.ts';
import styles from './Planner.module.css';
import { PlannerCards, type PlannerCard } from './PlannerCards.tsx';
import { PlannerHeading } from './PlannerHeading.tsx';
import { inline, percent, shekels } from './plannerFormat.ts';
import { PlannerWinMap } from './PlannerWinMap.tsx';

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
    [`P(${inline(x)} > ${inline(y)})`, percent(s.p_win), 'A tie counts as half'],
    ['Median difference', shekels(s.median_difference), `${x} minus ${inline(y)}`],
    ['Median difference, real', shekels(s.median_difference_real), 'In shekels of each start'],
    [`${x}: median yearly return`, percent(s.x_xirr), `Real: ${percent(s.x_xirr_real)}`],
    [`${y}: median yearly return`, percent(s.y_xirr), `Real: ${percent(s.y_xirr_real)}`],
  ];
  return (
    <>
      <PlannerHeading
        csv="history windows"
        rows={result.windows}
        fields={['start', 'x_wealth', 'y_wealth', 'x_xirr', 'y_xirr']}
      >
        History: {s.windows} starts, {s.first} to {s.last}
      </PlannerHeading>
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
