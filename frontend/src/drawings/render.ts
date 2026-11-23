import { withAlpha } from '../chart/theme.ts';
import { HANDLE_RADIUS, handles, strokes, textBox, type Size } from './shapes.ts';
import type { Drawing, LineStyle, Point } from './types.ts';

const DASHES: Record<LineStyle, number[]> = { solid: [], dashed: [6, 4], dotted: [1.5, 3] };
const RECT_FILL_ALPHA = 0.12;

export interface DrawState {
  selected: boolean;
  hovered: boolean;
  /** Colour of handle centres (the chart background). */
  background: string;
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
      ctx.fillStyle = withAlpha(color, RECT_FILL_ALPHA);
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
  } else {
    ctx.beginPath();
    for (const [s, e] of strokes(drawing, pts, size)) {
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
