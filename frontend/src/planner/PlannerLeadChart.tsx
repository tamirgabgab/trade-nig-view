import type { ScenarioResult } from '../api/planner.ts';
import { extent, niceTicks, scale } from '../components/plotScale.ts';
import styles from './Planner.module.css';
import { shekels } from './plannerFormat.ts';

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

const W = 640;
const H = 240;
const LEFT = 10;
const RIGHT = 110;
const TOP = 18;
const AXIS = 24;

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
  const off = `forced sale at −${String(Math.round(discount * 100))}%`;
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
  const py = scale(extent(values, 0.06), [H - AXIS, TOP]);
  const line = (series: Series) =>
    points
      .filter((p) => p[series] !== null)
      .map((p) => `${px(p.months).toFixed(1)},${py(p[series] ?? 0).toFixed(1)}`)
      .join(' ');
  const leader = lead.leader === null ? null : names[lead.leader === 'x' ? 0 : 1];

  return (
    <figure className={styles.histogram}>
      <svg
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        role="img"
        aria-label={`End value by exit month: ${names[0]} and ${names[1]}`}
      >
        <line className={styles.baseline} x1={LEFT} x2={W - RIGHT} y1={H - AXIS} y2={H - AXIS} />
        {niceTicks(0, last / 12, 6).map((year) => (
          <text
            key={year}
            className={styles.axisTick}
            x={px(year * 12)}
            y={H - 7}
            textAnchor="middle"
          >
            {`Year ${String(year)}`}
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
        {(['x', 'y'] as const).map((series) => {
          const end = points.at(-1);
          return end === undefined ? null : (
            <text
              key={series}
              className={styles.seriesName}
              x={px(end.months) + 8}
              y={py(end[series]) + 4}
            >
              {label[series]}
            </text>
          );
        })}
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
