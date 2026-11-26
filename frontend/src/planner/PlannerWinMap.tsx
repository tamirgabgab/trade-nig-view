import type { StudyResult } from '../api/planner.ts';
import styles from './Planner.module.css';
import { percent, points, shekels } from './plannerFormat.ts';

type WinMap = StudyResult['win_map'];
type Cell = NonNullable<WinMap['rows'][number]['cells'][number]>;

/** Yearly-return gaps (as fractions) from which a cell gets the next stronger tint. */
const STEPS = [0.01, 0.025, 0.05];
const WIN = [styles.win1, styles.win2, styles.win3, styles.win4];
const LOSE = [styles.lose1, styles.lose2, styles.lose3, styles.lose4];

/** The gap a cell shows: x's yearly return minus y's (null when either has none). */
function gap(cell: Cell): number | null {
  return cell.x_xirr === null || cell.y_xirr === null ? null : cell.x_xirr - cell.y_xirr;
}

function tint(cell: Cell): string | undefined {
  const value = gap(cell);
  // A gap that shows as 0.00 is a tie: no winner's colour.
  if (value === null || points(value) === '0.00') return undefined;
  const level = STEPS.filter((step) => Math.abs(value) >= step).length;
  return (value > 0 ? WIN : LOSE)[level];
}

interface PlannerWinMapProps {
  map: WinMap;
  /** The names of the two options, x first. */
  names: [string, string];
}

/**
 * Who wins by start year and horizon: each cell is x's yearly return minus y's in percentage
 * points, tinted by the winner. The sign carries the winner too, so the colour is not needed.
 */
export function PlannerWinMap({ map, names }: PlannerWinMapProps) {
  const [x, y] = names;
  return (
    <>
      <table className={styles.map} aria-label="Win map">
        <thead>
          <tr>
            <th scope="col">Start</th>
            {map.horizons_years.map((years) => (
              <th key={years} scope="col">
                {years} y
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {map.rows.map((row) => (
            <tr key={row.start}>
              <th scope="row">{row.start.slice(0, 4)}</th>
              {row.cells.map((cell, index) => {
                const value = cell === null ? null : gap(cell);
                return cell === null || value === null ? (
                  <td
                    key={index}
                    className={styles.empty}
                    title={cell === null ? 'Cannot run on the data' : 'No money was put in'}
                  >
                    —
                  </td>
                ) : (
                  <td
                    key={index}
                    className={tint(cell)}
                    title={`${x} ${percent(cell.x_xirr)} a year, ${y} ${percent(cell.y_xirr)}: ${shekels(cell.difference)} at the end`}
                  >
                    {points(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.note}>
        Each cell: the yearly return of {x.toLowerCase()} minus that of {y.toLowerCase()}, in
        percentage points, for a plan that starts in that year and runs that long. Green and a plus
        sign: {x.toLowerCase()} wins. Hover a cell for both returns.
      </p>
    </>
  );
}
