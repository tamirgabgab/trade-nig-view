import type { StoreApi } from 'zustand';

import { isBareKeyOutsideField } from '../components/keyTarget.ts';
import type { DrawingState } from '../store/drawingStore.ts';
import { DEFAULT_FIB_LEVELS } from './fib.ts';
import { snapAngle } from './geometry.ts';
import { hitTest, type Hit, type Size } from './shapes.ts';
import { magnetPrice } from './snap.ts';
import {
  DEFAULT_STYLE,
  POINT_COUNT,
  type Anchor,
  type Drawing,
  type DrawingType,
  type DrawingView,
  type Point,
} from './types.ts';

/** What the manager needs from the chart (ChartEngine implements it). */
export interface ChartSurface {
  element(): HTMLElement;
  project(anchor: Anchor): Point | null;
  unproject(point: Point): { anchor: Anchor; logical: number } | null;
  barAt(
    logical: number,
  ): { time: string | number; open: number; high: number; low: number; close: number } | undefined;
  priceToY(price: number): number | null;
  paneSize(): Size;
  setPanZoom(enabled: boolean): void;
  setDrawings(view: DrawingView): void;
}

export interface DrawingCallbacks {
  /** A modal dialog is open, or a click picks the replay start: input is not for drawings. */
  blocked: () => boolean;
  /** Double-click on a drawing, or a new text label: open its settings panel. */
  openSettings: (id: string) => void;
  /** A drawing was deleted (Del): offer Undo. */
  removed: (label: string, undo: () => void) => void;
  /** A new drawing was finished (a Statistics range opens its panel). */
  created?: (drawing: Drawing) => void;
}

/** A click that moves less than this (CSS px) is a click, not a drag. */
const CLICK_SLOP = 4;
/** Line tools that Shift snaps to 45 degrees. */
const ANGLE_TOOLS: ReadonlySet<DrawingType> = new Set([
  'trend_line',
  'ray',
  'extended_line',
  'parallel_channel',
]);

export const TOOL_LABELS: Record<DrawingType, string> = {
  trend_line: 'Trend line',
  ray: 'Ray',
  extended_line: 'Extended line',
  horizontal_line: 'Horizontal line',
  horizontal_ray: 'Horizontal ray',
  vertical_line: 'Vertical line',
  rectangle: 'Rectangle',
  text: 'Text',
  fib_retracement: 'Fib retracement',
  fib_extension: 'Trend-based Fib extension',
  parallel_channel: 'Parallel channel',
  price_range: 'Price range',
  date_range: 'Date range',
  date_price_range: 'Date and price range',
  return_range: 'Return',
  stats_range: 'Statistics',
  trade_plan: 'Trade plan',
};

/** Thin lines for the tools whose look comes from fills and labels. */
const THIN: ReadonlySet<DrawingType> = new Set([
  'rectangle',
  'fib_retracement',
  'fib_extension',
  'price_range',
  'date_range',
  'date_price_range',
  'return_range',
  'stats_range',
  'trade_plan',
]);

function defaultProps(type: DrawingType): Drawing['props'] {
  switch (type) {
    case 'text':
      return { text: 'Text', font_size: 14 };
    case 'rectangle':
      return { fill: true };
    case 'fib_retracement':
    case 'fib_extension':
      return { levels: DEFAULT_FIB_LEVELS.map((level) => ({ ...level })) };
    case 'return_range':
      return { unit: 'year' };
    case 'stats_range':
      return { returns: 'log', basis: 'close' };
    case 'trade_plan':
      return { account: 10_000, risk_pct: 1 };
    default:
      return {};
  }
}

/** A new drawing of `type` at `points`, with the tool's default style and props. */
export function newDrawing(type: DrawingType, points: Anchor[], id: string): Drawing {
  return {
    id,
    type,
    points,
    style: { ...DEFAULT_STYLE, ...(THIN.has(type) ? { line_width: 1 } : {}) },
    props: defaultProps(type),
    locked: false,
    hidden: false,
    z: 0,
    created_at: '',
    updated_at: '',
  };
}

interface Creating {
  drawing: Drawing;
  /** Anchors placed by clicks so far (the rest follow the pointer). */
  placed: number;
  down: Point;
  dragged: boolean;
}

interface Dragging {
  id: string;
  hit: Hit;
  start: Point;
  original: Drawing;
}

/**
 * Drawing interaction on the chart: draw with the active tool (click-click or drag), hover,
 * select, move, resize by the handles, Shift for 45 degrees, the magnet, Del and Esc. The state
 * lives in the drawing store; the manager turns pointer and key events into store changes and
 * shows the store (plus the drawing being drawn) on the chart.
 */
export class DrawingManager {
  private creating: Creating | null = null;
  private dragging: Dragging | null = null;
  private shift = false;
  /** The primary button went down on the price pane (its release is ours). */
  private down = false;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly surface: ChartSurface,
    private readonly store: StoreApi<DrawingState>,
    private readonly callbacks: DrawingCallbacks,
  ) {
    const el = surface.element();
    el.addEventListener('pointerdown', this.onPointerDown, true);
    el.addEventListener('pointermove', this.onPointerMove, true);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('dblclick', this.onDoubleClick, true);
    window.addEventListener('pointerup', this.onPointerUp, true);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.unsubscribe = store.subscribe((s) => {
      // Another tool or the cursor picked meanwhile (toolbar, Esc): drop the half-drawn one.
      if (this.creating !== null && s.tool !== this.creating.drawing.type) this.cancelCreating();
      this.render();
    });
    this.render();
  }

  dispose(): void {
    if (this.creating !== null || this.dragging !== null) this.surface.setPanZoom(true);
    const el = this.surface.element();
    el.removeEventListener('pointerdown', this.onPointerDown, true);
    el.removeEventListener('pointermove', this.onPointerMove, true);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('dblclick', this.onDoubleClick, true);
    window.removeEventListener('pointerup', this.onPointerUp, true);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.unsubscribe();
  }

  /** Show the store's drawings plus the one being drawn. */
  render(): void {
    const s = this.store.getState();
    this.surface.setDrawings({
      drawings: s.drawings,
      selectedId: s.selectedId,
      hoverId: s.hoverId,
      draft: this.creating?.drawing ?? null,
      hideAll: s.hideAll,
    });
  }

  // ---------------------------------------------------------------- geometry helpers

  /** Pointer position on the price pane, or null outside it (axes, other panes). */
  private local(event: MouseEvent): Point | null {
    const rect = this.surface.element().getBoundingClientRect();
    const p = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const { width, height } = this.surface.paneSize();
    return p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height ? p : null;
  }

  /** The anchor at `p` (with the magnet, and Shift's 45 degrees from `from`). */
  private anchorAt(p: Point, from: Point | null, type: DrawingType): Anchor | null {
    const at = this.shift && from !== null && ANGLE_TOOLS.has(type) ? snapAngle(from, p) : p;
    const hit = this.surface.unproject(at);
    if (hit === null) return null;
    const { magnet } = this.store.getState();
    const bar = this.surface.barAt(hit.logical);
    if (magnet === 'off' || bar === undefined) return hit.anchor;
    return {
      // The magnet also moves the anchor onto the bar's open time.
      time: typeof bar.time === 'number' ? bar.time : Date.parse(`${bar.time}T00:00:00Z`) / 1000,
      price: magnetPrice(hit.anchor.price, at.y, bar, magnet, (price) =>
        this.surface.priceToY(price),
      ),
    };
  }

  private pixels(drawing: Drawing): Point[] | null {
    const pts = drawing.points.map((a) => this.surface.project(a));
    return pts.some((p) => p === null) ? null : (pts as Point[]);
  }

  /** The top-most drawing under `p` (the selected one's handles first). */
  private hitAt(p: Point): { drawing: Drawing; hit: Hit } | null {
    const { drawings, selectedId, hideAll } = this.store.getState();
    if (hideAll) return null;
    const size = this.surface.paneSize();
    const selected = drawings.find((d) => d.id === selectedId);
    const order = [...drawings].reverse();
    if (selected !== undefined) order.unshift(selected);
    for (const drawing of order) {
      if (drawing.hidden) continue;
      const pts = this.pixels(drawing);
      if (pts === null) continue;
      const hit = hitTest(drawing, pts, p, size, drawing.id === selectedId, (price) =>
        this.surface.priceToY(price),
      );
      if (hit !== null) return { drawing, hit };
    }
    return null;
  }

  // ---------------------------------------------------------------- events

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.callbacks.blocked()) return;
    const p = this.local(event);
    const s = this.store.getState();
    // Outside the price pane, or before this symbol's drawings are loaded: not ours.
    if (p === null || s.symbol === null) return;
    this.down = true;

    if (s.tool !== null) {
      if (this.creating === null) {
        const anchor = this.anchorAt(p, null, s.tool);
        if (anchor === null) return;
        this.surface.setPanZoom(false);
        const id = crypto.randomUUID();
        const points = Array.from({ length: POINT_COUNT[s.tool] }, () => anchor);
        this.creating = {
          drawing: newDrawing(s.tool, points, id),
          placed: 1,
          down: p,
          dragged: false,
        };
      } else {
        // The click places the next anchor where it is (also without a move first, e.g. touch).
        this.follow(this.creating, p);
        this.creating.placed += 1;
      }
      this.render();
      return;
    }

    const found = this.hitAt(p);
    if (found === null) {
      if (s.selectedId !== null) s.select(null);
      return;
    }
    s.select(found.drawing.id);
    if (!s.lockAll && !found.drawing.locked) {
      this.dragging = { id: found.drawing.id, hit: found.hit, start: p, original: found.drawing };
      this.surface.setPanZoom(false);
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.shift = event.shiftKey;
    const p = this.local(event);
    const s = this.store.getState();
    const el = this.surface.element();

    if (this.creating !== null) {
      if (p === null) return;
      const { down } = this.creating;
      // Drawing by dragging: only while the button is held (moving between two clicks is not).
      if (this.down && Math.hypot(p.x - down.x, p.y - down.y) > CLICK_SLOP) {
        this.creating.dragged = true;
      }
      this.follow(this.creating, p);
      this.render();
      return;
    }

    if (this.dragging !== null) {
      if (p === null) return;
      this.drag(p);
      return;
    }

    if (s.tool !== null) {
      el.style.cursor = p === null ? '' : 'crosshair';
      return;
    }
    const found = p === null ? null : this.hitAt(p);
    s.hover(found?.drawing.id ?? null);
    el.style.cursor =
      found === null
        ? ''
        : found.hit.kind === 'handle'
          ? 'pointer'
          : s.lockAll || found.drawing.locked
            ? 'default'
            : 'move';
  };

  /** Move the anchors not placed yet to `p`. */
  private follow(creating: Creating, p: Point): void {
    const { drawing, placed } = creating;
    // Shift's 45 degrees apply to the line from the first anchor (not a channel's width).
    const first =
      placed < 2 ? this.surface.project(drawing.points[0] ?? { time: 0, price: 0 }) : null;
    const anchor = this.anchorAt(p, first, drawing.type);
    if (anchor === null) return;
    creating.drawing = {
      ...drawing,
      points: drawing.points.map((a, i) => (i < placed ? a : anchor)),
    };
  }

  private drag(p: Point): void {
    const drag = this.dragging;
    if (drag === null) return;
    const { original, hit, start } = drag;
    const pts = this.pixels(original);
    if (pts === null) return;
    let points: Anchor[] | null;
    if (hit.kind === 'handle') {
      // Shift's 45 degrees: from the other end of the line (a channel's width handle has none).
      const other = hit.index >= 2 ? null : (pts[hit.index === 0 ? 1 : 0] ?? null);
      const anchor = this.anchorAt(p, other, original.type);
      points =
        anchor === null ? null : original.points.map((a, i) => (i === hit.index ? anchor : a));
    } else {
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      const moved = pts.map(
        (q) => this.surface.unproject({ x: q.x + dx, y: q.y + dy })?.anchor ?? null,
      );
      points = moved.some((a) => a === null) ? null : (moved as Anchor[]);
    }
    if (points !== null) {
      const next = points;
      this.store.getState().update(drag.id, (d) => ({ ...d, points: next }));
    }
  }

  private readonly onPointerUp = (): void => {
    // A release whose press was not on the pane (a toolbar click) is not ours.
    if (!this.down) return;
    this.down = false;
    if (this.creating !== null) {
      // A drag places the second anchor on release; a three-point tool then waits for a click.
      if (this.creating.dragged) {
        this.creating.dragged = false;
        this.creating.placed = Math.max(this.creating.placed, 2);
      }
      const { drawing, placed } = this.creating;
      if (POINT_COUNT[drawing.type] === 1 || placed >= POINT_COUNT[drawing.type]) this.finish();
      return;
    }
    if (this.dragging !== null) {
      this.dragging = null;
      this.surface.setPanZoom(true);
    }
  };

  private cancelCreating(): void {
    this.creating = null;
    this.surface.setPanZoom(true);
  }

  private finish(): void {
    const creating = this.creating;
    if (creating === null) return;
    this.creating = null;
    this.surface.setPanZoom(true);
    const s = this.store.getState();
    s.add(creating.drawing);
    s.select(creating.drawing.id);
    if (!s.stayInDrawing) s.setTool(null);
    if (creating.drawing.type === 'text') this.callbacks.openSettings(creating.drawing.id);
    this.callbacks.created?.(creating.drawing);
  }

  private readonly onPointerLeave = (): void => {
    if (this.dragging === null && this.creating === null) this.store.getState().hover(null);
  };

  private readonly onDoubleClick = (event: MouseEvent): void => {
    const p = this.local(event);
    const found = p === null ? null : this.hitAt(p);
    if (found === null) return;
    event.stopPropagation();
    this.callbacks.openSettings(found.drawing.id);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.shift = event.shiftKey;
    if (!isBareKeyOutsideField(event) || this.callbacks.blocked()) return;
    const s = this.store.getState();
    if (event.key === 'Escape') {
      if (this.creating !== null) {
        this.cancelCreating();
        this.render();
      } else if (s.tool !== null) {
        s.setTool(null);
      } else if (s.selectedId !== null) {
        s.select(null);
      } else {
        return;
      }
      event.preventDefault();
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && s.selectedId !== null) {
      event.preventDefault();
      const removed = s.remove(s.selectedId);
      if (removed !== null) {
        this.callbacks.removed(TOOL_LABELS[removed.drawing.type], () => {
          this.store.getState().restore(removed);
        });
      }
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.shift = event.shiftKey;
  };
}
