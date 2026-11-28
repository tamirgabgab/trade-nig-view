import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { niceTicks, scale } from '../components/plotScale.ts';
import styles from './Planner.module.css';
import { PlannerField } from './PlannerField.tsx';
import { percent } from './plannerFormat.ts';
import { bins, intervalProbability, quantile } from './sampleStats.ts';
import { useChartWidth } from './useChartWidth.ts';

const PANEL = 84;
const GAP = 16;
const TOP = 18;
const AXIS = 24;
const SIDE = 10;
const H = TOP + 2 * PANEL + GAP + AXIS;
const BINS = 40;
const STEPS = 100;

interface PlannerHistogramProps {
  /** The two samples, world by world, in the units shown. */
  x: readonly number[];
  y: readonly number[];
  /** The names of the two options, x first. */
  names: [string, string];
  /** What is measured, for the labels: "end value, real". */
  measure: string;
  format: (value: number) => string;
  /** The step of the two number fields. */
  step: number;
}

/**
 * The distributions of the two options, one above the other on one axis, with two handles
 * a and b: for each option, the share of the simulated worlds that end between them (a handle
 * on an end of the axis counts the tail beyond it too). The handles are sliders (drag, or the
 * arrow keys); the fields under the chart set them exactly.
 */
export function PlannerHistogram({ x, y, names, measure, format, step }: PlannerHistogramProps) {
  const [box, W] = useChartWidth();
  const pooled = useMemo(() => [...x, ...y].sort((p, q) => p - q), [x, y]);
  // The outer half percent on each side would flatten everything else: it joins the end bins.
  const lo = quantile(pooled, 0.005);
  const hi = Math.max(quantile(pooled, 0.995), lo + step);
  const [[a, b], setRange] = useState<[number, number]>(() => [
    quantile(pooled, 0.25),
    quantile(pooled, 0.75),
  ]);
  const svg = useRef<SVGSVGElement>(null);
  /** The handle the current drag moves (null until its first move decides). */
  const dragged = useRef<0 | 1 | null>(null);
  const px = scale([lo, hi], [SIDE, W - SIDE]);
  const counts = [bins(x, lo, hi, BINS), bins(y, lo, hi, BINS)] as const;
  const tallest = Math.max(...counts[0], ...counts[1], 1);
  const width = (hi - lo) / BINS;
  const clamp = (value: number) => Math.min(Math.max(value, lo), hi);
  const move = (which: 0 | 1, value: number) => {
    setRange(([low, high]) =>
      which === 0 ? [Math.min(clamp(value), high), high] : [low, Math.max(clamp(value), low)],
    );
  };
  const drag = (which: 0 | 1) => (event: PointerEvent<SVGGElement>) => {
    const box = svg.current?.getBoundingClientRect();
    if (box === undefined || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const at = ((event.clientX - box.left) / box.width) * W;
    const value = lo + ((at - SIDE) / (W - 2 * SIDE)) * (hi - lo);
    // Where the two handles meet, b is the one on top: a drag to the left is meant for a.
    dragged.current ??= which === 1 && a >= b && value < a ? 0 : which;
    move(dragged.current, value);
  };
  const keys = (which: 0 | 1, value: number) => (event: KeyboardEvent<SVGGElement>) => {
    const unit = ((hi - lo) / STEPS) * (event.shiftKey ? 10 : 1);
    const next = {
      ArrowLeft: value - unit,
      ArrowDown: value - unit,
      ArrowRight: value + unit,
      ArrowUp: value + unit,
      PageDown: value - 10 * unit,
      PageUp: value + 10 * unit,
      Home: lo,
      End: hi,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    move(which, next);
  };
  // The end bars also hold everything beyond the axis.
  const span = (index: number, from: number) =>
    index === 0
      ? `at ${format(from + width)} or below`
      : index === BINS - 1
        ? `at ${format(from)} or above`
        : `from ${format(from)} to ${format(from + width)}`;
  const handle = (which: 0 | 1, value: number, name: string) => (
    <g
      className={styles.handle}
      role="slider"
      tabIndex={0}
      aria-label={name}
      aria-orientation="horizontal"
      aria-valuemin={lo}
      aria-valuemax={hi}
      aria-valuenow={value}
      aria-valuetext={format(value)}
      transform={`translate(${px(clamp(value)).toFixed(1)} 0)`}
      onPointerDown={(event) => {
        dragged.current = null;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={drag(which)}
      onKeyDown={keys(which, value)}
    >
      {/* A wide invisible target: the line itself is too thin to grab. */}
      <rect x={-9} y={0} width={18} height={H - AXIS} fill="transparent" />
      <line y1={12} y2={H - AXIS} />
      <rect className={styles.grip} x={-7} y={0} width={14} height={14} rx={3} />
      <text x={0} y={11} textAnchor="middle">
        {which === 0 ? 'a' : 'b'}
      </text>
    </g>
  );
  // The end bars hold the tails, so a handle on an end counts everything beyond it too.
  const open = [a <= lo, b >= hi] as const;
  const from = open[0] ? -Infinity : a;
  const to = open[1] ? Infinity : b;
  const chances = [intervalProbability(x, from, to), intervalProbability(y, from, to)] as const;
  const where = open[0]
    ? open[1]
      ? 'anywhere'
      : `at ${format(b)} or below`
    : open[1]
      ? `at ${format(a)} or above`
      : `between ${format(a)} and ${format(b)}`;
  // The fields show what their step can type: whole shekels, or hundredths of a percent.
  const typed = (value: number) => Number(value.toFixed(step < 1 ? 2 : 0));

  return (
    <figure className={`${styles.histogram ?? ''} ${styles.draggable ?? ''}`} ref={box}>
      <svg
        ref={svg}
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        role="group"
        aria-label={`Distribution of the ${measure}: ${names[0]} above, ${names[1]} below`}
      >
        <rect
          className={styles.between}
          x={px(clamp(a))}
          width={Math.max(px(clamp(b)) - px(clamp(a)), 0)}
          y={TOP}
          height={H - AXIS - TOP}
        />
        {counts.map((series, row) => {
          const base = TOP + PANEL + row * (PANEL + GAP);
          const bar = scale([0, tallest], [0, PANEL - 16]);
          return (
            <g key={row} className={row === 0 ? styles.seriesX : styles.seriesY}>
              <line className={styles.baseline} x1={SIDE} x2={W - SIDE} y1={base} y2={base} />
              {series.map((count, index) => {
                const from = lo + index * width;
                return (
                  <rect
                    key={index}
                    x={px(from) + 1}
                    width={Math.max(px(from + width) - px(from) - 2, 1)}
                    y={base - bar(count)}
                    height={bar(count)}
                    rx={1}
                  >
                    <title>{`${names[row] ?? ''}: ${String(count)} worlds ${span(index, from)}`}</title>
                  </rect>
                );
              })}
              <rect className={styles.swatch} x={SIDE} y={base - PANEL + 2} width={8} height={8} />
              <text className={styles.seriesName} x={SIDE + 12} y={base - PANEL + 10}>
                {names[row]}
              </text>
            </g>
          );
        })}
        {niceTicks(lo, hi, 6).map((tick) => (
          <text key={tick} className={styles.axisTick} x={px(tick)} y={H - 7} textAnchor="middle">
            {format(tick)}
          </text>
        ))}
        {handle(0, a, 'Lower bound a')}
        {handle(1, b, 'Upper bound b')}
      </svg>
      <div className={styles.grid}>
        <PlannerField
          label="Lower bound a"
          value={typed(a)}
          min={-Number.MAX_SAFE_INTEGER}
          max={b}
          step={step}
          onChange={(value) => {
            move(0, value);
          }}
        />
        <PlannerField
          label="Upper bound b"
          value={typed(b)}
          min={a}
          step={step}
          onChange={(value) => {
            move(1, value);
          }}
        />
      </div>
      {chances.map((chance, row) => (
        <p key={row} className={styles.chance}>
          {names[row]}: <strong>{percent(chance.p)}</strong> of the worlds end {where} (95% interval
          of the simulation: {percent(chance.low)} to {percent(chance.high)})
        </p>
      ))}
    </figure>
  );
}
