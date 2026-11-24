import { withAlpha } from '../chart/theme.ts';
import { formatPrice } from '../components/formatNumber.ts';
import { rangeLabel, type Span } from './measure.ts';
import {
  channelOffset,
  fibLines,
  HANDLE_RADIUS,
  handles,
  isRange,
  strokes,
  textBox,
  type PriceToY,
  type Size,
} from './shapes.ts';
import type { Anchor, Drawing, LineStyle, Point } from './types.ts';

const DASHES: Record<LineStyle, number[]> = { solid: [], dashed: [6, 4], dotted: [1.5, 3] };
const FILL_ALPHA = 0.12;
const FONT = "12px system-ui, -apple-system, 'Segoe UI', sans-serif";

/** What the renderer needs from the chart besides the anchors' pixels. */
export interface DrawState {
  selected: boolean;
  hovered: boolean;
  /** Colour of handle centres (the chart background). */
  background: string;
  priceToY: PriceToY;
  /** Price decimals of the symbol (labels). */
  decimals: number;
  /** Bars and volume between two anchors (range tools). */
  span: (a: Anchor, b: Anchor) => Span | null;
}

function segment(ctx: CanvasRenderingContext2D, a: Point, b: Point): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/** A line from `a` to `b` with an arrow head at `b`. */
function arrow(ctx: CanvasRenderingContext2D, a: Point, b: Point): void {
  segment(ctx, a, b);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  for (const turn of [-1, 1]) {
    ctx.lineTo(b.x - 7 * Math.cos(angle + turn * 0.5), b.y - 7 * Math.sin(angle + turn * 0.5));
    ctx.moveTo(b.x, b.y);
  }
  ctx.stroke();
}

function drawFib(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  pts: readonly Point[],
  state: DrawState,
): void {
  const lines = fibLines(drawing, pts, state.priceToY);
  // Bands between neighbouring levels, in the upper level's colour.
  for (let i = 1; i < lines.length; i += 1) {
    const lo = lines[i - 1];
    const hi = lines[i];
    if (lo === undefined || hi === undefined) continue;
    ctx.fillStyle = withAlpha(hi.level.color, FILL_ALPHA);
    ctx.fillRect(hi.x1, Math.min(lo.y, hi.y), hi.x2 - hi.x1, Math.abs(hi.y - lo.y));
  }
  ctx.font = FONT;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const { level, price, y, x1, x2 } of lines) {
    ctx.strokeStyle = level.color;
    segment(ctx, { x: x1, y }, { x: x2, y });
    ctx.fillStyle = level.color;
    ctx.fillText(`${String(level.value)} (${formatPrice(price, state.decimals)})`, x1 - 6, y);
  }
  // The trend the levels are drawn from, dashed.
  ctx.strokeStyle = drawing.style.line_color;
  ctx.lineWidth = 1;
  ctx.setLineDash(DASHES.dashed);
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a !== undefined && b !== undefined) segment(ctx, a, b);
  }
}

function drawChannel(ctx: CanvasRenderingContext2D, pts: readonly Point[], color: string): void {
  const [a, b] = pts;
  if (a === undefined || b === undefined) return;
  const dy = channelOffset(pts);
  ctx.fillStyle = withAlpha(color, FILL_ALPHA);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(b.x, b.y + dy);
  ctx.lineTo(a.x, a.y + dy);
  ctx.closePath();
  ctx.fill();
  segment(ctx, a, b);
  segment(ctx, { x: a.x, y: a.y + dy }, { x: b.x, y: b.y + dy });
  ctx.setLineDash(DASHES.dashed);
  ctx.lineWidth = 1;
  segment(ctx, { x: a.x, y: a.y + dy / 2 }, { x: b.x, y: b.y + dy / 2 });
}

function drawRange(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  pts: readonly Point[],
  state: DrawState,
): void {
  const [a, b] = pts;
  const [from, to] = drawing.points;
  if (a === undefined || b === undefined || from === undefined || to === undefined) return;
  const color = drawing.style.line_color;
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  ctx.fillStyle = withAlpha(color, FILL_ALPHA);
  ctx.fillRect(left, top, right - left, bottom - top);

  // A statistics range is a span of time (like a date range); a return range is two prices at
  // two times (like a date and price range).
  const timeOnly = drawing.type === 'date_range' || drawing.type === 'stats_range';
  if (!timeOnly) {
    arrow(ctx, { x: mid.x, y: a.y }, { x: mid.x, y: b.y });
    if (drawing.type === 'price_range') {
      segment(ctx, { x: left, y: a.y }, { x: right, y: a.y });
      segment(ctx, { x: left, y: b.y }, { x: right, y: b.y });
    }
  }
  if (drawing.type !== 'price_range') {
    arrow(ctx, { x: a.x, y: mid.y }, { x: b.x, y: mid.y });
    if (timeOnly) {
      segment(ctx, { x: a.x, y: top }, { x: a.x, y: bottom });
      segment(ctx, { x: b.x, y: top }, { x: b.x, y: bottom });
    }
  }

  // The label sits past the second anchor: below the box when it points down, else above.
  const lines = rangeLabel(drawing, state.decimals, state.span(from, to));
  ctx.font = FONT;
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 12;
  const height = lines.length * 16 + 6;
  const y = b.y >= a.y ? bottom + 6 : top - 6 - height;
  ctx.fillStyle = color;
  ctx.fillRect(mid.x - width / 2, y, width, height);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillText(line, mid.x, y + 4 + i * 16);
  });
}

/** Paint one drawing in CSS-pixel space (the caller scales the context for the device ratio). */
export function drawDrawing(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  pts: readonly Point[],
  size: Size,
  state: DrawState,
): void {
  const { line_color: color, line_width: width, line_style: style } = drawing.style;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width + (state.hovered && !state.selected ? 1 : 0);
  ctx.setLineDash(DASHES[style]);
  ctx.lineCap = 'round';

  const [a, b] = pts;
  if (drawing.type === 'rectangle' && a !== undefined && b !== undefined) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    if (drawing.props.fill !== false) {
      ctx.fillStyle = withAlpha(color, FILL_ALPHA);
      ctx.fillRect(x, y, w, h);
    }
    ctx.strokeRect(x, y, w, h);
  } else if (drawing.type === 'text' && a !== undefined) {
    const fontSize = drawing.props.font_size ?? 14;
    ctx.font = `${String(fontSize)}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(drawing.props.text ?? '', a.x + 4, a.y + fontSize * 0.2);
    if (state.selected || state.hovered) {
      const box = textBox(drawing, a);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(box.a.x, box.a.y, box.b.x - box.a.x, box.b.y - box.a.y);
    }
  } else if (drawing.type === 'fib_retracement' || drawing.type === 'fib_extension') {
    drawFib(ctx, drawing, pts, state);
  } else if (drawing.type === 'parallel_channel') {
    drawChannel(ctx, pts, color);
  } else if (isRange(drawing)) {
    drawRange(ctx, drawing, pts, state);
  } else {
    ctx.beginPath();
    for (const [s, e] of strokes(drawing, pts, size, state.priceToY)) {
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(e.x, e.y);
    }
    ctx.stroke();
  }

  if (state.selected) {
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    for (const h of handles(drawing, pts)) {
      ctx.beginPath();
      ctx.arc(h.x, h.y, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = state.background;
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  }
  ctx.restore();
}
