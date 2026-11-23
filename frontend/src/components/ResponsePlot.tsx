import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { extent, nearestIndex, niceTicks, PERIOD_TICKS, scale } from './plotScale.ts';
import styles from './ResponsePlot.module.css';

export interface PlotSeries {
  key: string;
  label: string;
  /** CSS colour of the marks (a categorical token). */
  color: string;
  /** Ascending x values. */
  x: readonly number[];
  y: readonly (number | null)[];
}

interface ResponsePlotProps {
  title: string;
  xLabel: string;
  series: readonly PlotSeries[];
  /** Log x axis with period ticks (frequency plots). */
  periodAxis?: boolean;
  /** Draw each point as a stem from 0 (impulse responses with few taps). */
  stems?: boolean;
  /** Fixed y range; values outside are clipped. Default: the data's extent. */
  yDomain?: readonly [number, number] | undefined;
  /** A hairline reference level (e.g. the step response's final value). */
  reference?: number | undefined;
  formatY: (value: number) => string;
}

const W = 520;
const H = 176;
const M = { left: 44, right: 12, top: 10, bottom: 30 };
const X0 = M.left;
const X1 = W - M.right;
const Y0 = H - M.bottom;
const Y1 = M.top;
const STEM_OFFSET = 2.5;

function formatTick(value: number): string {
  return Math.abs(value) >= 1000 ? value.toExponential(0) : String(Number(value.toPrecision(3)));
}

/** A small SVG line (or stem) plot with a crosshair readout on hover and arrow keys. */
export function ResponsePlot({
  title,
  xLabel,
  series,
  periodAxis = false,
  stems = false,
  yDomain,
  reference,
  formatY,
}: ResponsePlotProps) {
  const titleId = useId();
  const [active, setActive] = useState<number | null>(null);
  // The hover / arrow-key cursor walks the longest series, so every series' tail can be read.
  const first = series.reduce<PlotSeries | undefined>(
    (a, s) => (a === undefined || s.x.length > a.x.length ? s : a),
    undefined,
  );
  if (first === undefined || first.x.length === 0) return null;

  const allX = series.flatMap((s) => s.x);
  const xDomain: [number, number] = periodAxis
    ? [PERIOD_TICKS[0] ?? 2, PERIOD_TICKS.at(-1) ?? 200]
    : [Math.min(...allX), Math.max(...allX, Math.min(...allX) + 1)];
  const yRange =
    yDomain ??
    extent([...series.flatMap((s) => s.y), ...(reference === undefined ? [] : [reference]), 0]);
  const sx = scale(xDomain, [X0, X1], periodAxis);
  const sy = scale(yRange, [Y0, Y1]);
  const clampY = (v: number) => Math.min(Math.max(sy(v), Y1), Y0);
  const xTicks = periodAxis ? PERIOD_TICKS : niceTicks(xDomain[0], xDomain[1], 6);
  const yTicks = niceTicks(yRange[0], yRange[1], 4);

  const path = (s: PlotSeries) => {
    let d = '';
    let pen = false;
    s.x.forEach((x, i) => {
      const y = s.y[i];
      if (y === null || y === undefined) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${sx(x).toFixed(1)},${clampY(y).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const activeX = active === null ? null : first.x[active];
  const readout =
    activeX === null || activeX === undefined
      ? null
      : series.map((s) => {
          // Past a series' last point (a short kernel next to a long one) it has no value.
          const value =
            activeX > (s.x.at(-1) ?? -Infinity) ? null : s.y[nearestIndex(s.x, activeX)];
          return { s, value: value ?? null };
        });

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    const fraction = Math.min(Math.max((px - X0) / (X1 - X0), 0), 1);
    const x = periodAxis
      ? xDomain[0] * (xDomain[1] / xDomain[0]) ** fraction
      : xDomain[0] + fraction * (xDomain[1] - xDomain[0]);
    setActive(nearestIndex(first.x, x));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const last = first.x.length - 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      setActive((i) => Math.min(Math.max((i ?? (delta > 0 ? -1 : last + 1)) + delta, 0), last));
    } else if (event.key === 'Escape' && active !== null) {
      event.stopPropagation();
      setActive(null);
    }
  };

  return (
    <figure className={styles.figure} aria-labelledby={titleId}>
      <figcaption id={titleId} className={styles.title}>
        {title}
      </figcaption>
      <div
        className={styles.frame}
        tabIndex={0}
        role="group"
        aria-label={`${title}: use the arrow keys to read values`}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setActive(null);
        }}
      >
        <svg
          className={styles.svg}
          viewBox={`0 0 ${String(W)} ${String(H)}`}
          role="img"
          aria-label={title}
          onPointerMove={onPointerMove}
          onPointerLeave={() => {
            setActive(null);
          }}
        >
          {yTicks.map((t) => (
            <g key={`y${String(t)}`}>
              <line className={styles.grid} x1={X0} x2={X1} y1={sy(t)} y2={sy(t)} />
              <text className={styles.tick} x={X0 - 6} y={sy(t)} textAnchor="end" dy="0.32em">
                {formatTick(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text
              key={`x${String(t)}`}
              className={styles.tick}
              x={sx(t)}
              y={Y0 + 14}
              textAnchor="middle"
            >
              {formatTick(t)}
            </text>
          ))}
          <text className={styles.axisLabel} x={X1} y={H - 2} textAnchor="end">
            {xLabel}
          </text>
          <line className={styles.axis} x1={X0} x2={X1} y1={clampY(0)} y2={clampY(0)} />
          {reference !== undefined && (
            <line
              className={styles.reference}
              x1={X0}
              x2={X1}
              y1={clampY(reference)}
              y2={clampY(reference)}
            />
          )}
          {series.map((s, si) =>
            stems ? (
              <g key={s.key} stroke={s.color} className={styles.stems}>
                {s.x.map((x, i) => {
                  const y = s.y[i];
                  if (y === null || y === undefined) return null;
                  const cx = sx(x) + (series.length > 1 ? (si ? 1 : -1) * STEM_OFFSET : 0);
                  return <line key={x} x1={cx} x2={cx} y1={clampY(0)} y2={clampY(y)} />;
                })}
              </g>
            ) : (
              <path key={s.key} className={styles.line} stroke={s.color} d={path(s)} />
            ),
          )}
          {activeX !== null && activeX !== undefined && (
            <line className={styles.crosshair} x1={sx(activeX)} x2={sx(activeX)} y1={Y1} y2={Y0} />
          )}
        </svg>
        {readout !== null && activeX !== undefined && activeX !== null && (
          <div
            className={[styles.tooltip, sx(activeX) > W * 0.6 ? styles.flip : ''].join(' ')}
            style={{ left: `${String((sx(activeX) / W) * 100)}%` }}
            role="status"
          >
            <div className={styles.tooltipX}>
              {xLabel} {formatTick(activeX)}
            </div>
            {readout.map(({ s, value }) => (
              <div key={s.key} className={styles.tooltipRow}>
                <span className={styles.key} style={{ background: s.color }} />
                <strong>{value === null ? '—' : formatY(value)}</strong>
                <span className={styles.tooltipLabel}>{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
