import type { ScenarioResult } from '../api/planner.ts';
import { scale } from '../components/plotScale.ts';
import styles from './Planner.module.css';
import { inline, signedShekels } from './plannerFormat.ts';
import { PlannerTable, type PlannerColumn } from './PlannerTable.tsx';

type Move = ScenarioResult['sensitivity'][number];

const INPUTS: Record<Move['input'], string> = {
  appreciation: 'Apartment appreciation',
  mortgage_rates: 'Mortgage rates',
  rent: 'Rent',
  market_return: 'Market return',
  taxes: 'Capital-gains and betterment tax',
};

/** The size of a move in words: "1 point a year", "10%", "5 points". */
function unit(move: Move): string {
  const size = Math.round(move.step * 100);
  if (move.input === 'rent') return `${String(size)}%`;
  const points = `${String(size)} point${size === 1 ? '' : 's'}`;
  return move.input === 'appreciation' || move.input === 'market_return'
    ? `${points} a year`
    : points;
}

const W = 640;
const LABEL = 250;
const ROW = 30;
const TOP = 6;
const AXIS = 22;
const SIDE = 10;
const effect = (move: Move) => Math.max(Math.abs(move.down ?? 0), Math.abs(move.up ?? 0));
const signed = (value: number | null) => (value === null ? '—' : signedShekels(value));

const COLUMNS: PlannerColumn<Move>[] = [
  ['Input', (move) => `${INPUTS[move.input]}, ${unit(move)}`],
  ['Moved down', (move) => signed(move.down)],
  ['Moved up', (move) => signed(move.up)],
];

interface PlannerTornadoProps {
  moves: readonly Move[];
  /** The names of the two options, x first. */
  names: [string, string];
}

/**
 * The sensitivity of the comparison: each input moved down and up by its step, everything else
 * as entered, as the change of "x minus y" at the end. The largest effect is on top; the table
 * holds the same numbers.
 */
export function PlannerTornado({ moves, names }: PlannerTornadoProps) {
  if (moves.length === 0) {
    return <p className={styles.note}>No input of this comparison can be moved.</p>;
  }
  const rows = [...moves].sort((p, q) => effect(q) - effect(p));
  const widest = Math.max(...rows.map(effect), 1);
  const px = scale([-widest, widest], [LABEL, W - SIDE]);
  const height = TOP + rows.length * ROW + AXIS;
  const what = `${inline(names[0])} minus ${inline(names[1])}`;
  return (
    <>
      <figure className={styles.histogram}>
        <svg
          viewBox={`0 0 ${String(W)} ${String(height)}`}
          role="img"
          aria-label={`How ${what} changes when one input moves`}
        >
          {rows.map((move, row) => {
            const y = TOP + row * ROW;
            const bars = [
              [move.down, 'down', styles.moveDown],
              [move.up, 'up', styles.moveUp],
            ] as const;
            return (
              <g key={move.input}>
                <text className={styles.seriesName} x={0} y={y + ROW / 2 + 4}>
                  {INPUTS[move.input]}
                </text>
                {bars.map(([value, way, series], index) =>
                  value === null ? null : (
                    <g key={way} className={series}>
                      <rect
                        x={Math.min(px(0), px(value))}
                        width={Math.max(Math.abs(px(value) - px(0)), 1)}
                        y={y + 4 + index * 11}
                        height={9}
                        rx={1}
                      >
                        <title>{`${INPUTS[move.input]} ${way} ${unit(move)}: ${signedShekels(value)}`}</title>
                      </rect>
                    </g>
                  ),
                )}
              </g>
            );
          })}
          <line className={styles.baseline} x1={px(0)} x2={px(0)} y1={TOP} y2={height - AXIS + 4} />
          {[-widest, 0, widest].map((tick) => (
            <text
              key={tick}
              className={styles.axisTick}
              x={px(tick)}
              y={height - 5}
              textAnchor={tick < 0 ? 'start' : tick > 0 ? 'end' : 'middle'}
            >
              {signedShekels(tick)}
            </text>
          ))}
        </svg>
        <figcaption className={styles.legend}>
          <span className={styles.keyDown}>Moved down</span>
          <span className={styles.keyUp}>Moved up</span>
        </figcaption>
      </figure>
      <PlannerTable label="Sensitivity" columns={COLUMNS} rows={rows} />
    </>
  );
}
