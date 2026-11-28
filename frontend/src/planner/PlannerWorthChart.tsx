import type { ScenarioResult } from '../api/planner.ts';
import { extent, niceTicks, scale } from '../components/plotScale.ts';
import styles from './Planner.module.css';
import { shekels } from './plannerFormat.ts';
import { useChartWidth } from './useChartWidth.ts';

const H = 220;
const LEFT = 10;
const RIGHT = 160;
const TOP = 12;
const AXIS = 24;
/** The least distance between the two names at the lines' ends. */
const LINE_GAP = 14;
const DAY_MS = 86_400_000;

type Path = ScenarioResult['paths']['x'];

const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

/**
 * Each option's net worth along the plan as it runs (its apartment's value less the loan, plus
 * its account's market value; before any exit cost or tax), next to the lead chart's what-if
 * exits: for two market accounts, their two paths.
 */
export function PlannerWorthChart({
  paths,
  names,
}: {
  paths: ScenarioResult['paths'];
  names: [string, string];
}) {
  const [box, W] = useChartWidth();
  const series: [Path, string, string | undefined][] = [
    [paths.x, names[0], styles.lineX],
    [paths.y, names[1], styles.lineY],
  ];
  const all = [...paths.x, ...paths.y];
  if (all.length === 0) return null;
  const days = all.map((p) => dayOf(p.date));
  const first = Math.min(...days);
  const last = Math.max(...days, first + 1);
  const px = scale([first, last], [LEFT, W - RIGHT]);
  const [low, high] = extent(
    all.map((p) => p.worth),
    0.06,
  );
  const py = scale([low, high], [H - AXIS, TOP]);
  const firstYear = new Date(first * DAY_MS).getUTCFullYear();
  const lastYear = new Date(last * DAY_MS).getUTCFullYear();
  const years = niceTicks(firstYear, lastYear, Math.max(2, Math.round(W / 110))).filter(
    (year) => Number.isInteger(year) && dayOf(`${String(year)}-01-01`) >= first,
  );
  // The names at the lines' ends, pushed apart when the two end close together.
  const ends = series
    .map(([path, name]): [string, number] => [name, py(path.at(-1)?.worth ?? 0)])
    .sort((p, q) => p[1] - q[1]);
  const [upper, lower] = ends;
  if (upper !== undefined && lower !== undefined && lower[1] - upper[1] < LINE_GAP) {
    const middle = (upper[1] + lower[1]) / 2;
    upper[1] = middle - LINE_GAP / 2;
    lower[1] = middle + LINE_GAP / 2;
  }
  return (
    <figure className={styles.histogram} ref={box}>
      <svg
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        role="img"
        aria-label={`Net worth along the plan: ${names[0]} and ${names[1]}`}
      >
        <line className={styles.baseline} x1={LEFT} x2={W - RIGHT} y1={H - AXIS} y2={H - AXIS} />
        {niceTicks(low, high, 3)
          .filter((value) => py(value) > TOP + 8 && py(value) < H - AXIS - 8)
          .map((value) => (
            <g key={value} className={styles.grid}>
              <line x1={LEFT} x2={W - RIGHT} y1={py(value)} y2={py(value)} />
              <text className={styles.axisTick} x={LEFT} y={py(value) - 4}>
                {shekels(value)}
              </text>
            </g>
          ))}
        {years.map((year) => (
          <text
            key={year}
            className={styles.axisTick}
            x={px(dayOf(`${String(year)}-01-01`))}
            y={H - 7}
            textAnchor="middle"
          >
            {year}
          </text>
        ))}
        {series.map(([path, name, line]) => (
          <g key={name} className={line}>
            <polyline
              points={path
                .map((p) => `${px(dayOf(p.date)).toFixed(1)},${py(p.worth).toFixed(1)}`)
                .join(' ')}
            >
              <title>{`${name}: ${shekels(path.at(-1)?.worth ?? 0)} on ${path.at(-1)?.date ?? ''}`}</title>
            </polyline>
          </g>
        ))}
        {ends.map(([name, y]) => (
          <text key={name} className={styles.seriesName} x={px(last) + 8} y={y + 4}>
            {name}
          </text>
        ))}
      </svg>
      <figcaption className={styles.legend}>
        <span className={styles.keyLineX}>{names[0]}</span>
        <span className={styles.keyLineY}>{names[1]}</span>
      </figcaption>
    </figure>
  );
}
