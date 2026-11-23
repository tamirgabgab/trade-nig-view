import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { extent, niceTicks, scale } from '../plotScale.ts';
import styles from './MiniChart.module.css';

export interface MiniLine {
  key: string;
  label: string;
  /** CSS colour (the indicator output's colour). */
  color: string;
  values: readonly (number | null)[];
  /** Draw `shift` bars to the left (pivots). */
  shift?: number;
}

export interface MiniPane {
  lines: readonly MiniLine[];
  /** Dashed horizontal levels (RSI 30/70). */
  levels?: readonly number[];
  /** Fixed y range (RSI 0–100). */
  domain?: readonly [number, number];
}

interface MiniChartProps {
  title: string;
  time: readonly (string | number)[];
  close: readonly number[];
  /** Lines over the price (averages, bands). */
  overlays?: readonly MiniLine[];
  /** A pane below the price (oscillators). */
  pane?: MiniPane | null;
  /** Bars to mark on the price (event-study signals). */
  markers?: readonly number[];
  formatValue: (value: number) => string;
}

const W = 560;
const PRICE_H = 150;
const PANE_H = 96;
const GAP = 10;
const M = { left: 48, right: 8, top: 8, bottom: 20 };

function path(
  values: readonly (number | null)[],
  x: (i: number) => number,
  y: (v: number) => number,
  shift = 0,
) {
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i - shift).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

const timeLabel = (t: string | number | undefined) =>
  t === undefined
    ? ''
    : typeof t === 'string'
      ? t
      : new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ');

/**
 * A small SVG chart for the learn pages: close price (with overlays and event markers) and an
 * optional indicator pane, with a crosshair readout on hover and arrow keys.
 */
export function MiniChart({
  title,
  time,
  close,
  overlays = [],
  pane = null,
  markers = [],
  formatValue,
}: MiniChartProps) {
  const titleId = useId();
  const [active, setActive] = useState<number | null>(null);
  const n = close.length;
  const height = M.top + PRICE_H + (pane === null ? 0 : GAP + PANE_H) + M.bottom;
  const x = scale([0, Math.max(n - 1, 1)], [M.left, W - M.right]);
  const priceDomain = extent([...close, ...overlays.flatMap((l) => l.values)]);
  const py = scale(priceDomain, [M.top + PRICE_H, M.top]);
  const paneTop = M.top + PRICE_H + GAP;
  const paneDomain = pane?.domain ?? extent(pane?.lines.flatMap((l) => l.values) ?? []);
  const qy = scale(paneDomain, [paneTop + PANE_H, paneTop]);

  const at = active ?? n - 1;
  const readout = [
    `${timeLabel(time[at])}  close ${formatValue(close[at] ?? Number.NaN)}`,
    ...[...overlays, ...(pane?.lines ?? [])].map((l) => {
      const v = l.values[at + (l.shift ?? 0)];
      return `${l.label} ${v === null || v === undefined ? '—' : formatValue(v)}`;
    }),
  ].join('   ');

  const onPointer = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const fx = ((event.clientX - box.left) / box.width) * W;
    const i = Math.round(((fx - M.left) / (W - M.left - M.right)) * (n - 1));
    setActive(Math.min(Math.max(i, 0), n - 1));
  };
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const step = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowLeft') setActive(Math.max(at - step, 0));
    else if (event.key === 'ArrowRight') setActive(Math.min(at + step, n - 1));
    else return;
    event.preventDefault();
  };

  return (
    <figure className={styles.figure}>
      <figcaption id={titleId} className={styles.caption}>
        {title}
      </figcaption>
      <p className={styles.readout} aria-live="off">
        {n === 0 ? 'No bars' : readout}
      </p>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${String(W)} ${String(height)}`}
        role="img"
        aria-labelledby={titleId}
        tabIndex={0}
        onPointerMove={onPointer}
        onPointerLeave={() => {
          setActive(null);
        }}
        onKeyDown={onKey}
      >
        {niceTicks(priceDomain[0], priceDomain[1], 4).map((t) => (
          <g key={`p${String(t)}`}>
            <line className={styles.grid} x1={M.left} x2={W - M.right} y1={py(t)} y2={py(t)} />
            <text className={styles.tick} x={M.left - 6} y={py(t)}>
              {formatValue(t)}
            </text>
          </g>
        ))}
        <path className={styles.price} d={path(close, x, py)} />
        {overlays.map((l) => (
          <path
            key={l.key}
            className={styles.line}
            stroke={l.color}
            d={path(l.values, x, py, l.shift)}
          />
        ))}
        {markers.map((i) => (
          <circle
            key={i}
            className={styles.marker}
            cx={x(i)}
            cy={py(close[i] ?? priceDomain[0])}
            r={3.5}
          />
        ))}
        {pane !== null && (
          <g>
            <rect
              className={styles.paneFrame}
              x={M.left}
              y={paneTop}
              width={W - M.left - M.right}
              height={PANE_H}
            />
            {(pane.levels ?? niceTicks(paneDomain[0], paneDomain[1], 3)).map((t) => (
              <g key={`q${String(t)}`}>
                <line
                  className={pane.levels ? styles.level : styles.grid}
                  x1={M.left}
                  x2={W - M.right}
                  y1={qy(t)}
                  y2={qy(t)}
                />
                <text className={styles.tick} x={M.left - 6} y={qy(t)}>
                  {formatValue(t)}
                </text>
              </g>
            ))}
            {pane.lines.map((l) => (
              <path
                key={l.key}
                className={styles.line}
                stroke={l.color}
                d={path(l.values, x, qy, l.shift)}
              />
            ))}
          </g>
        )}
        {active !== null && (
          <line
            className={styles.cursor}
            x1={x(active)}
            x2={x(active)}
            y1={M.top}
            y2={height - M.bottom}
          />
        )}
        <text className={styles.axis} x={M.left} y={height - 6}>
          {timeLabel(time[0])}
        </text>
        <text className={styles.axisEnd} x={W - M.right} y={height - 6}>
          {timeLabel(time[n - 1])}
        </text>
      </svg>
    </figure>
  );
}
