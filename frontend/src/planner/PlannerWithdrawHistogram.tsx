import { niceTicks, scale } from '../components/plotScale.ts';
import styles from './Planner.module.css';
import { wholePercent } from './plannerFormat.ts';
import { bins, quantile } from './sampleStats.ts';

const W = 640;
const TOP = 34;
const PLOT = 120;
const AXIS = 24;
const SIDE = 10;
/** The column of the realizations that ran out, left of the histogram. */
const APART = 64;
const H = TOP + PLOT + AXIS;
const BINS = 24;

interface PlannerWithdrawHistogramProps {
  /** What is left of each realization that lasted, in the unit shown. */
  values: readonly number[];
  /** How many ran out: counted apart, not in the first bin. */
  ranOut: number;
  /** What there was on the first day, in the same unit. */
  start: number;
  /** "starts" or "worlds". */
  noun: string;
  /** "as a percent of the start" or "in shekels". */
  unit: string;
  format: (value: number) => string;
}

/**
 * What is left at the end, over all the realizations of a plan: one bar a range, the ones that
 * ran out as a bar of their own on the same scale, and marks at the median and at the start.
 */
export function PlannerWithdrawHistogram({
  values,
  ranOut,
  start,
  noun,
  unit,
  format,
}: PlannerWithdrawHistogramProps) {
  const total = values.length + ranOut;
  const sorted = [...values].sort((a, b) => a - b);
  // The outer half percent on each side would flatten everything else: it joins the end bins.
  // With none that lasted the axis still runs from nothing to the start.
  const none = sorted.length === 0;
  const lo = none ? 0 : Math.min(quantile(sorted, 0.005), 0);
  const most = none ? Math.abs(start) : quantile(sorted, 0.995);
  const hi = Math.max(most, lo + Math.max(Math.abs(start), 1) * 0.01);
  const counts = none ? [] : bins(sorted, lo, hi, BINS);
  const tallest = Math.max(...counts, ranOut, 1);
  const left = SIDE + (ranOut > 0 ? APART : 0);
  const px = scale([lo, hi], [left, W - SIDE]);
  const py = scale([0, tallest], [TOP + PLOT, TOP]);
  const width = (hi - lo) / BINS;
  const of = (count: number) =>
    `${String(count)} of ${String(total)} (${wholePercent(count / total)})`;
  const median = none ? null : quantile(sorted, 0.5);
  // A mark's label goes right of its line, or left when the line is near the right edge, the two
  // on two rows. Two marks close together put their labels outward on one row instead, the left
  // one leftward, when both fit inside the chart.
  const marks: [value: number, text: string, row: number, left: boolean][] = [];
  const shown = start > lo && start < hi;
  const edge = (value: number) => px(value) > W * 0.7;
  const medianText = median === null ? '' : `Median ${format(median)}`;
  // shortcut: a label's width from its length at the 12 px font, not measured; measure if a font
  // much wider than the system one is ever used.
  const wide = (text: string) => 7 * text.length + 4;
  const [low, high] =
    median !== null && median < start ? [median, start] : [start, median ?? start];
  const [lowText, highText] =
    low === median ? [medianText, 'The start'] : ['The start', medianText];
  const outward =
    median !== null &&
    shown &&
    Math.abs(px(start) - px(median)) < 120 &&
    px(low) - wide(lowText) >= left &&
    px(high) + wide(highText) <= W - SIDE;
  if (median !== null) {
    marks.push([median, medianText, 0, outward ? median === low : edge(median)]);
  }
  if (shown) {
    marks.push([
      start,
      'The start',
      outward ? 0 : 1,
      outward ? start === low && start !== median : edge(start),
    ]);
  }

  return (
    <figure className={styles.histogram}>
      <svg
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        role="img"
        aria-label={`What is left, ${unit}, over ${String(total)} ${noun}`}
      >
        {ranOut > 0 && (
          <g className={styles.ranOut}>
            <rect x={SIDE} width={APART - 22} y={py(ranOut)} height={TOP + PLOT - py(ranOut)}>
              <title>{`Ran out before the end: ${of(ranOut)}`}</title>
            </rect>
            <text className={styles.seriesName} x={SIDE} y={12}>
              {`Ran out: ${of(ranOut)}`}
            </text>
          </g>
        )}
        <g className={styles.seriesX}>
          {counts.map((count, index) => {
            const from = lo + index * width;
            return (
              count > 0 && (
                <rect
                  key={from}
                  x={px(from) + 1}
                  width={Math.max(px(from + width) - px(from) - 2, 1)}
                  y={py(count)}
                  height={TOP + PLOT - py(count)}
                >
                  <title>{`${format(from)} to ${format(from + width)}: ${of(count)}`}</title>
                </rect>
              )
            );
          })}
        </g>
        <line className={styles.baseline} x1={SIDE} x2={W - SIDE} y1={TOP + PLOT} y2={TOP + PLOT} />
        {marks.map(([value, text, row, left]) => (
          <g key={text} className={styles.mark}>
            <line x1={px(value)} x2={px(value)} y1={TOP - 6 + row * 14} y2={TOP + PLOT} />
            <text
              x={px(value)}
              y={TOP - 10 + row * 14}
              dx={left ? -4 : 4}
              textAnchor={left ? 'end' : 'start'}
            >
              {text}
            </text>
          </g>
        ))}
        {niceTicks(lo, hi, 6).map((tick) => (
          <text
            key={tick}
            className={styles.axisTick}
            x={px(tick)}
            y={H - 7}
            textAnchor={px(tick) > W - 40 ? 'end' : px(tick) < left + 20 ? 'start' : 'middle'}
          >
            {format(tick)}
          </text>
        ))}
      </svg>
      <figcaption className={styles.note}>
        {median === null
          ? `None of the ${String(total)} ${noun} lasted.`
          : `${ranOut > 0 ? `Of the ${String(sorted.length)} that lasted, the` : 'The'} median is ${format(median)}; nine in ten are between ${format(quantile(sorted, 0.05))} and ${format(quantile(sorted, 0.95))}.`}
      </figcaption>
    </figure>
  );
}
