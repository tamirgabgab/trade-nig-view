import { niceTicks, scale } from '../components/plotScale.ts';
import styles from './Planner.module.css';

const W = 640;
const TOP = 12;
const PLOT = 130;
const AXIS = 24;
const SIDE = 10;
const H = TOP + PLOT + AXIS;

export interface BandPoint {
  /** Years from the start. */
  year: number;
  value: number;
  /** Ranges around the value, the widest first. */
  bands: readonly (readonly [number, number])[];
}

interface PlannerBandChartProps {
  /** The accessible name of the chart. */
  label: string;
  points: readonly BandPoint[];
  /** The top of the scale (the bottom is zero); the highest band by default. */
  top?: number;
  format: (value: number) => string;
  /** The legend: the line, then each band. */
  legend: readonly string[];
}

/** A line over the years with bands around it: a share still paying, an income fan. */
export function PlannerBandChart({ label, points, top, format, legend }: PlannerBandChartProps) {
  const last = points.at(-1)?.year ?? 1;
  const first = points[0]?.year ?? 0;
  const highest = top ?? Math.max(...points.flatMap((p) => [p.value, ...p.bands.flat()]), 1) * 1.06;
  const px = scale([first, Math.max(last, first + 1e-9)], [SIDE, W - SIDE]);
  const py = scale([0, highest], [TOP + PLOT, TOP]);
  const at = (year: number, value: number) => `${px(year).toFixed(1)},${py(value).toFixed(1)}`;
  const slot = (W - 2 * SIDE) / Math.max(points.length - 1, 1);
  const depth = points[0]?.bands.length ?? 0;

  return (
    <figure className={styles.histogram}>
      <svg viewBox={`0 0 ${String(W)} ${String(H)}`} role="img" aria-label={label}>
        <g className={styles.lineX}>
          {niceTicks(0, highest, 3)
            .filter((value) => value > 0 && py(value) > TOP + 8)
            .map((value) => (
              <g key={value} className={styles.grid}>
                <line x1={SIDE} x2={W - SIDE} y1={py(value)} y2={py(value)} />
                <text className={styles.axisTick} x={W - SIDE} y={py(value) - 4} textAnchor="end">
                  {format(value)}
                </text>
              </g>
            ))}
          <line
            className={styles.baseline}
            x1={SIDE}
            x2={W - SIDE}
            y1={TOP + PLOT}
            y2={TOP + PLOT}
          />
          {Array.from({ length: depth }, (_, band) => (
            <polygon
              key={band}
              className={styles.band}
              points={[
                ...points.map((p) => at(p.year, p.bands[band]?.[1] ?? p.value)),
                ...points.toReversed().map((p) => at(p.year, p.bands[band]?.[0] ?? p.value)),
              ].join(' ')}
            />
          ))}
          <polyline points={points.map((p) => at(p.year, p.value)).join(' ')} />
          {points.map((p) => (
            // A column a point to hover: the line itself is too thin a target.
            <rect
              key={p.year}
              className={styles.hover}
              x={px(p.year) - slot / 2}
              width={slot}
              y={TOP}
              height={PLOT}
            >
              <title>
                {`Year ${String(Number(p.year.toFixed(2)))}: ${format(p.value)}` +
                  p.bands.map(([low, high]) => `; ${format(low)} to ${format(high)}`).join('')}
              </title>
            </rect>
          ))}
        </g>
        {niceTicks(first, last, 6)
          .filter((year) => Number.isInteger(year))
          .map((year) => (
            <text
              key={year}
              className={styles.axisTick}
              x={px(year)}
              y={H - 7}
              textAnchor={year === first ? 'start' : year === last ? 'end' : 'middle'}
            >
              {`Year ${String(year)}`}
            </text>
          ))}
      </svg>
      <figcaption className={styles.legend}>
        {legend.map((text, index) => (
          <span key={text} className={index === 0 ? styles.keyLineX : styles.keyBand}>
            {text}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
