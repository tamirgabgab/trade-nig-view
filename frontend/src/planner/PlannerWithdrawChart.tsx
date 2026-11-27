import type { WithdrawRow } from '../api/planner.ts';
import { extent, niceTicks, scale } from '../components/plotScale.ts';
import styles from './Planner.module.css';
import { shekels } from './plannerFormat.ts';

const W = 640;
const SIDE = 10;
const TITLE = 18;
const BALANCE = 150;
const INCOME = 90;
const GAP = 12;
const AXIS = 24;
const H = 2 * TITLE + BALANCE + GAP + INCOME + AXIS;
/** Plans shorter than this many months get their axis in months. */
const SHORT_PLAN = 48;

interface Panel {
  title: string;
  top: number;
  height: number;
  value: (row: WithdrawRow) => number;
  floor: (row: WithdrawRow) => number;
  ceiling: (row: WithdrawRow) => number;
  /** The start row holds nothing for this panel (no income on the first day). */
  fromStart: boolean;
  /** A second line: the account with the apartment. */
  total?: (row: WithdrawRow) => number;
}

interface PlannerWithdrawChartProps {
  rows: readonly WithdrawRow[];
  /** In shekels of the first day, not in the shekels of each month. */
  real: boolean;
  /** The first month a fixed amount was not paid in full. */
  depleted: number | null;
  /** The plan has an apartment: the balance panel adds the account with it. */
  home: boolean;
}

/**
 * The plan over time: the account's balance above and the month's income below, on one time
 * axis and each on its own scale. The band around a line is the same plan at the two bounds of
 * the tax (a cost share of 0 and of 100 %). With an apartment, a second line above is the account
 * and what the apartment's sale would leave.
 */
export function PlannerWithdrawChart({ rows, real, depleted, home }: PlannerWithdrawChartProps) {
  const last = rows.at(-1)?.month ?? 1;
  const px = scale([0, last], [SIDE, W - SIDE]);
  const deflate = (row: WithdrawRow) => (real ? row.prices : 1);
  const panels: Panel[] = [
    {
      title: real ? 'Balance, in shekels of the first day' : 'Balance',
      top: TITLE,
      height: BALANCE,
      value: (row) => row.balance / deflate(row),
      floor: (row) => row.balance_floor / deflate(row),
      ceiling: (row) => row.balance_ceiling / deflate(row),
      fromStart: true,
      ...(home ? { total: (row: WithdrawRow) => (row.balance + row.home) / deflate(row) } : {}),
    },
    {
      title: real ? 'Income a month, in shekels of the first day' : 'Income a month',
      top: 2 * TITLE + BALANCE + GAP,
      height: INCOME,
      value: (row) => row.net / deflate(row),
      floor: (row) => row.net_floor / deflate(row),
      ceiling: (row) => row.net_ceiling / deflate(row),
      fromStart: false,
    },
  ];
  // Whole years on the axis; a plan too short for a few of them is marked in months.
  const whole = (values: number[]) => values.filter((v) => Number.isInteger(v));
  const ticks: [number, string][] =
    last >= SHORT_PLAN
      ? whole(niceTicks(0, last / 12, 6)).map((year) => [year * 12, `Year ${String(year)}`])
      : whole(niceTicks(0, last, 6)).map((month) => [month, `Month ${String(month)}`]);
  const slot = (W - 2 * SIDE) / Math.max(last, 1);

  return (
    <figure className={styles.histogram}>
      <svg
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        role="img"
        aria-label={`Balance and monthly income over ${String(last)} months`}
      >
        {panels.map((panel) => {
          const shown = panel.fromStart ? rows : rows.slice(1);
          const total = panel.total;
          const all = shown.flatMap((r) => [
            panel.value(r),
            panel.floor(r),
            panel.ceiling(r),
            total?.(r) ?? 0,
          ]);
          const [, high] = extent([...all, 0], 0.06);
          const py = scale([0, high], [panel.top + panel.height, panel.top]);
          const at = (row: WithdrawRow, of: (r: WithdrawRow) => number) =>
            `${px(row.month).toFixed(1)},${py(of(row)).toFixed(1)}`;
          const band = [
            ...shown.map((row) => at(row, panel.ceiling)),
            ...shown.toReversed().map((row) => at(row, panel.floor)),
          ].join(' ');
          const banded = shown.some((r) => Math.abs(panel.ceiling(r) - panel.floor(r)) > 0.5);
          return (
            <g key={panel.title} className={styles.lineX}>
              <text className={styles.seriesName} x={SIDE} y={panel.top - 5}>
                {panel.title}
              </text>
              {niceTicks(0, high, 3)
                .filter((value) => value > 0 && py(value) > panel.top + 8)
                .map((value) => (
                  <g key={value} className={styles.grid}>
                    <line x1={SIDE} x2={W - SIDE} y1={py(value)} y2={py(value)} />
                    <text
                      className={styles.axisTick}
                      x={W - SIDE}
                      y={py(value) - 4}
                      textAnchor="end"
                    >
                      {shekels(value)}
                    </text>
                  </g>
                ))}
              <line
                className={styles.baseline}
                x1={SIDE}
                x2={W - SIDE}
                y1={panel.top + panel.height}
                y2={panel.top + panel.height}
              />
              {banded && <polygon className={styles.band} points={band} />}
              <polyline points={shown.map((row) => at(row, panel.value)).join(' ')} />
              {total !== undefined && (
                <g className={styles.lineY}>
                  <polyline points={shown.map((row) => at(row, total)).join(' ')} />
                </g>
              )}
              {shown.map((row) => (
                // A column a month to hover: the line itself is too thin a target.
                <rect
                  key={row.month}
                  className={styles.hover}
                  x={px(row.month) - slot / 2}
                  width={slot}
                  y={panel.top}
                  height={panel.height}
                >
                  <title>
                    {`Month ${String(row.month)} (${row.date}): ${shekels(panel.value(row))}` +
                      (banded
                        ? `; between ${shekels(panel.floor(row))} and ${shekels(panel.ceiling(row))} at the tax bounds`
                        : '') +
                      (total === undefined ? '' : `; with the apartment ${shekels(total(row))}`)}
                  </title>
                </rect>
              ))}
            </g>
          );
        })}
        {depleted !== null && (
          <g className={styles.mark}>
            <line x1={px(depleted)} x2={px(depleted)} y1={TITLE} y2={H - AXIS} />
            <text
              x={px(depleted)}
              y={TITLE + 28}
              dx={depleted > last / 2 ? -6 : 6}
              textAnchor={depleted > last / 2 ? 'end' : 'start'}
            >
              {`The money ends in month ${String(depleted)}`}
            </text>
          </g>
        )}
        {ticks.map(([months, text]) => (
          <text
            key={months}
            className={styles.axisTick}
            x={px(months)}
            y={H - 7}
            // The first and the last label stay inside the chart.
            textAnchor={months === 0 ? 'start' : months === last ? 'end' : 'middle'}
          >
            {text}
          </text>
        ))}
      </svg>
      <figcaption className={styles.legend}>
        <span className={styles.keyLineX}>The plan at its cost share</span>
        <span className={styles.keyBand}>Between the tax bounds (cost share 0% to 100%)</span>
        {home && (
          <span className={styles.keyLineY}>
            The account and the apartment (what its sale leaves)
          </span>
        )}
      </figcaption>
    </figure>
  );
}
