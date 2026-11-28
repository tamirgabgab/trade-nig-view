import type { ScenarioResult } from '../api/planner.ts';
import { extent, niceTicks, scale } from '../components/plotScale.ts';
import styles from './Planner.module.css';
import { plainPercent, shekels } from './plannerFormat.ts';
import { useChartWidth } from './useChartWidth.ts';

type Point = ScenarioResult['average']['points'][number];
type Series = 'x' | 'y' | 'x_forced' | 'y_forced';

/** The line and the legend key of each series. */
const LINE: Record<Series, string | undefined> = {
  x: styles.lineX,
  y: styles.lineY,
  x_forced: styles.lineXForced,
  y_forced: styles.lineYForced,
};
const KEY: Record<Series, string | undefined> = {
  x: styles.keyLineX,
  y: styles.keyLineY,
  x_forced: styles.keyXForced,
  y_forced: styles.keyYForced,
};

const H = 240;
const LEFT = 10;
/** The names at the lines' ends; narrower on a narrow chart, which keeps 130 px to plot. */
const RIGHT_MAX = 160;
/** The least distance between the two names at the lines' ends. */
const LINE_GAP = 14;
const TOP = 18;
const AXIS = 24;
/** Plans shorter than this many months get their axis in months. */
const SHORT_PLAN = 48;

interface PlannerLeadChartProps {
  points: readonly Point[];
  lead: ScenarioResult['lead'];
  /** The names of the two options, x first. */
  names: [string, string];
  /** The forced sale's discount, as a fraction. */
  discount: number;
}

/**
 * What each option would end at if everything were sold in each exit month, the apartment's
 * side also in a forced sale, and the month from which the leader at the end stays ahead.
 */
export function PlannerLeadChart({ points, lead, names, discount }: PlannerLeadChartProps) {
  const [box, W] = useChartWidth();
  const RIGHT = Math.max(Math.min(RIGHT_MAX, W - 130), 0);
  const off = `forced sale at −${plainPercent(discount)}`;
  const label: Record<Series, string> = {
    x: names[0],
    y: names[1],
    x_forced: `${names[0]}, ${off}`,
    y_forced: `${names[1]}, ${off}`,
  };
  // Forced lines under the others, and only where a discount makes them differ.
  const drawn = (['x_forced', 'y_forced', 'x', 'y'] as const).filter(
    (series) =>
      !series.endsWith('forced') || (discount > 0 && points.some((p) => p[series] !== null)),
  );
  const values = drawn.flatMap((series) => points.map((p) => p[series]));
  const last = points.at(-1)?.months ?? 1;
  const px = scale([0, last], [LEFT, W - RIGHT]);
  const [low, high] = extent(values, 0.06);
  const py = scale([low, high], [H - AXIS, TOP]);
  const line = (series: Series) =>
    points
      .filter((p) => p[series] !== null)
      .map((p) => `${px(p.months).toFixed(1)},${py(p[series] ?? 0).toFixed(1)}`)
      .join(' ');
  const leader = lead.leader === null ? null : names[lead.leader === 'x' ? 0 : 1];
  // Whole years on the axis; a plan too short for a few of them is marked in months.
  const whole = (values: number[]) => values.filter((v) => Number.isInteger(v));
  const ticks: [number, string][] =
    last >= SHORT_PLAN
      ? whole(niceTicks(0, last / 12, 6)).map((year) => [year * 12, `Year ${String(year)}`])
      : whole(niceTicks(0, last, 6)).map((month) => [month, `Month ${String(month)}`]);
  // The names at the lines' ends, pushed apart when the two options end close together.
  const end = points.at(-1);
  const ends: [Series, number][] =
    end === undefined
      ? []
      : (['x', 'y'] as const)
          .map((series): [Series, number] => [series, py(end[series])])
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
        aria-label={`End value by exit month: ${names[0]} and ${names[1]}`}
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
        {ticks.map(([months, text]) => (
          <text
            key={months}
            className={styles.axisTick}
            x={px(months)}
            y={H - 7}
            textAnchor="middle"
          >
            {text}
          </text>
        ))}
        {leader !== null && lead.since_months !== null && (
          <g className={styles.mark}>
            <line x1={px(lead.since_months)} x2={px(lead.since_months)} y1={TOP} y2={H - AXIS} />
            <text
              x={px(lead.since_months)}
              y={TOP - 5}
              textAnchor={lead.since_months > last / 2 ? 'end' : 'start'}
            >
              {`${leader} leads from month ${String(lead.since_months)}`}
            </text>
          </g>
        )}
        {drawn.map((series) => (
          <g key={series} className={LINE[series]}>
            <polyline data-series={series} points={line(series)} />
            {points.map((p) => {
              const value = p[series];
              return value === null ? null : (
                <circle key={p.months} cx={px(p.months)} cy={py(value)} r={5}>
                  <title>{`${label[series]} after ${String(p.months)} months (${p.date}): ${shekels(value)}`}</title>
                </circle>
              );
            })}
          </g>
        ))}
        {ends.map(([series, y]) => (
          <text key={series} className={styles.seriesName} x={px(last) + 8} y={y + 4}>
            {label[series]}
          </text>
        ))}
      </svg>
      <figcaption className={styles.legend}>
        {drawn.map((series) => (
          <span key={series} className={KEY[series]}>
            {label[series]}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
