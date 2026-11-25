import { useDrawingStore } from '../store/drawingStore.ts';
import { DrawingManager, type ChartSurface } from './manager.ts';
import type { Anchor, DrawingView, Point } from './types.ts';

/** A plain linear chart: x = time * 10 px, y = 200 - price. */
const zoomTo = vi.fn();

function surface(): ChartSurface & { view: DrawingView | null; panZoom: boolean } {
  const element = document.createElement('div');
  const s = {
    view: null as DrawingView | null,
    panZoom: true,
    element: () => element,
    project: (a: Anchor): Point => ({ x: a.time * 10, y: 200 - a.price }),
    unproject: (p: Point) => ({ anchor: { time: p.x / 10, price: 200 - p.y }, logical: p.x / 10 }),
    barAt: () => undefined,
    priceToY: (price: number) => 200 - price,
    paneSize: () => ({ width: 800, height: 400 }),
    setPanZoom: (enabled: boolean) => {
      s.panZoom = enabled;
    },
    setDrawings: (view: DrawingView) => {
      s.view = view;
    },
    zoomTo,
  };
  return s;
}

function fire(target: EventTarget, type: string, x: number, y: number, init: MouseEventInit = {}) {
  target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, ...init }));
}

/** A click (down + up) at (x, y) on the chart. */
function click(el: HTMLElement, x: number, y: number, init: MouseEventInit = {}) {
  fire(el, 'pointerdown', x, y, init);
  fire(window, 'pointerup', x, y, init);
}

const store = useDrawingStore;
let chart: ReturnType<typeof surface>;
let manager: DrawingManager;
const callbacks = { blocked: vi.fn(() => false), openSettings: vi.fn(), removed: vi.fn() };

beforeEach(() => {
  store.setState({ ...useDrawingStore.getInitialState(), symbol: 'AAPL' }, true);
  chart = surface();
  manager = new DrawingManager(chart, store, callbacks);
});

afterEach(() => {
  manager.dispose();
  vi.clearAllMocks();
});

describe('DrawingManager', () => {
  it('places the picked icon with one click, and draws an XABCD with five', () => {
    const el = chart.element();
    store.getState().setIconName('flag');
    store.getState().setTool('icon', 'icons');
    click(el, 100, 100);
    expect(store.getState().drawings[0]).toMatchObject({ type: 'icon', props: { icon: 'flag' } });
    store.getState().setTool('xabcd', 'patterns');
    for (const [x, y] of [
      [100, 150],
      [200, 50],
      [300, 120],
      [400, 80],
      [500, 160],
    ] as const)
      click(el, x, y);
    const xabcd = store.getState().drawings[1];
    expect(xabcd?.type).toBe('xabcd');
    expect(xabcd?.points.map((p) => p.price)).toEqual([50, 150, 80, 120, 40]);
  });

  it('erases the clicked drawing with Undo and stays on; Esc turns it off', () => {
    const el = chart.element();
    store.getState().setTool('horizontal_line', 'lines');
    click(el, 100, 100);
    expect(store.getState().drawings).toHaveLength(1);
    store.getState().setPointerTool('eraser');
    click(el, 400, 300); // nothing there
    expect(store.getState().drawings).toHaveLength(1);
    click(el, 400, 100);
    expect(store.getState().drawings).toHaveLength(0);
    expect(callbacks.removed).toHaveBeenCalledWith('Horizontal line', expect.any(Function));
    expect(store.getState().pointerTool).toBe('eraser');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(store.getState().pointerTool).toBeNull();
  });

  it('zooms into a dragged box once, showing it dashed, then goes back to the cursor', () => {
    const el = chart.element();
    store.getState().setPointerTool('zoom');
    fire(el, 'pointerdown', 100, 100);
    expect(chart.panZoom).toBe(false);
    fire(el, 'pointermove', 300, 250);
    expect(chart.view?.draft).toMatchObject({
      type: 'rectangle',
      style: { line_style: 'dashed' },
      points: [
        { time: 10, price: 100 },
        { time: 30, price: -50 },
      ],
    });
    fire(window, 'pointerup', 300, 250);
    expect(zoomTo).toHaveBeenCalledWith({ x: 100, y: 100 }, { x: 300, y: 250 });
    expect(chart.view?.draft).toBeNull();
    expect(store.getState().pointerTool).toBeNull();
    expect(chart.panZoom).toBe(true);
    // A click without a box zooms nothing and keeps the tool.
    store.getState().setPointerTool('zoom');
    click(el, 50, 50);
    expect(zoomTo).toHaveBeenCalledTimes(1);
    expect(store.getState().pointerTool).toBe('zoom');
  });

  it('draws a trend line with two clicks, then selects it and goes back to the cursor', () => {
    const el = chart.element();
    store.getState().setTool('trend_line', 'lines');
    click(el, 100, 100);
    expect(chart.panZoom).toBe(false); // the chart does not pan while drawing
    fire(el, 'pointermove', 300, 50);
    expect(chart.view?.draft?.points).toEqual([
      { time: 10, price: 100 },
      { time: 30, price: 150 },
    ]);
    click(el, 300, 50);

    const [line] = store.getState().drawings;
    expect(line?.type).toBe('trend_line');
    expect(line?.points).toEqual([
      { time: 10, price: 100 },
      { time: 30, price: 150 },
    ]);
    expect(store.getState()).toMatchObject({ tool: null, selectedId: line?.id });
    expect(chart.panZoom).toBe(true);
  });

  it('draws by dragging, and Shift keeps the line at 45 degrees', () => {
    const el = chart.element();
    store.getState().setTool('trend_line', 'lines');
    fire(el, 'pointerdown', 100, 100);
    fire(el, 'pointermove', 200, 95, { shiftKey: true });
    fire(window, 'pointerup', 200, 95, { shiftKey: true });
    const [line] = store.getState().drawings;
    expect(line?.points[1]?.price).toBeCloseTo(100); // snapped horizontal
  });

  it('moves a selected line by dragging it, and resizes it by a handle', () => {
    const el = chart.element();
    store.getState().setTool('trend_line', 'lines');
    click(el, 100, 100);
    click(el, 300, 100);

    fire(el, 'pointerdown', 200, 100); // on the line
    fire(el, 'pointermove', 200, 80);
    fire(window, 'pointerup', 200, 80);
    expect(store.getState().drawings[0]?.points.map((p) => p.price)).toEqual([120, 120]);

    fire(el, 'pointerdown', 300, 80); // the second handle
    fire(el, 'pointermove', 400, 60);
    fire(window, 'pointerup', 400, 60);
    expect(store.getState().drawings[0]?.points[1]).toEqual({ time: 40, price: 140 });
  });

  it('does not move a locked drawing, deletes with Del (with undo), Esc cancels a draft', () => {
    const el = chart.element();
    store.getState().setTool('horizontal_line', 'lines');
    click(el, 100, 100);
    const id = store.getState().drawings[0]?.id ?? '';
    store.getState().update(id, (d) => ({ ...d, locked: true }));

    fire(el, 'pointerdown', 500, 100);
    fire(el, 'pointermove', 500, 50);
    fire(window, 'pointerup', 500, 50);
    expect(store.getState().drawings[0]?.points[0]?.price).toBe(100);
    expect(store.getState().selectedId).toBe(id);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(store.getState().drawings).toEqual([]);
    expect(callbacks.removed).toHaveBeenCalledWith('Horizontal line', expect.any(Function));

    store.getState().setTool('trend_line', 'lines');
    click(el, 100, 100);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(chart.view?.draft).toBeNull();
    expect(store.getState().drawings).toEqual([]);
  });

  it('opens the settings of a new text label and of a double-clicked drawing', () => {
    const el = chart.element();
    store.getState().setTool('text', 'annotations');
    click(el, 100, 100);
    const id = store.getState().drawings[0]?.id;
    expect(callbacks.openSettings).toHaveBeenCalledWith(id);
    fire(el, 'dblclick', 110, 105);
    expect(callbacks.openSettings).toHaveBeenCalledTimes(2);
  });

  it('ignores a release that did not start on the chart, and keys while a dialog is open', () => {
    const el = chart.element();
    store.getState().setTool('trend_line', 'lines');
    // A toolbar click: only the release reaches the window. No draft starts or ends.
    fire(window, 'pointerup', 100, 100);
    expect(chart.view?.draft ?? null).toBeNull();

    click(el, 100, 100);
    callbacks.blocked.mockReturnValue(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(chart.view?.draft).not.toBeNull();
    callbacks.blocked.mockReturnValue(false);
  });

  it('drops a half-drawn line when the tool changes, and restores pan and zoom', () => {
    const el = chart.element();
    store.getState().setTool('trend_line', 'lines');
    fire(el, 'pointerdown', 100, 100);
    expect(chart.panZoom).toBe(false);
    store.getState().setTool(null, 'lines');
    expect(chart.view?.draft ?? null).toBeNull();
    expect(chart.panZoom).toBe(true);
    expect(store.getState().drawings).toEqual([]);
  });

  it('does nothing before a symbol is loaded', () => {
    store.setState({ symbol: null });
    store.getState().setTool('horizontal_line', 'lines');
    click(chart.element(), 100, 100);
    expect(store.getState().drawings).toEqual([]);
    expect(chart.panZoom).toBe(true);
  });

  it('draws a three-point channel by clicks, and by a drag then a click', () => {
    const el = chart.element();
    store.getState().setTool('parallel_channel', 'lines');
    click(el, 100, 100);
    click(el, 300, 100);
    expect(store.getState().drawings).toEqual([]);
    click(el, 200, 60);
    expect(store.getState().drawings[0]?.points).toEqual([
      { time: 10, price: 100 },
      { time: 30, price: 100 },
      { time: 20, price: 140 },
    ]);

    store.getState().setTool('fib_extension', 'fib');
    fire(el, 'pointerdown', 100, 150);
    fire(el, 'pointermove', 200, 50);
    fire(window, 'pointerup', 200, 50);
    expect(store.getState().drawings).toHaveLength(1); // waits for the third anchor
    fire(el, 'pointermove', 250, 100);
    click(el, 250, 100);
    const ext = store.getState().drawings[1];
    expect(ext?.points.map((a) => a.price)).toEqual([50, 150, 100]);
    expect(ext?.props.levels?.length).toBeGreaterThan(0);
  });

  it("moves a channel's width handle freely, even with Shift", () => {
    const el = chart.element();
    store.getState().setTool('parallel_channel', 'lines');
    click(el, 100, 100);
    click(el, 300, 100);
    click(el, 200, 60);
    // Selected after drawing; its third handle is at (200, 60).
    fire(el, 'pointerdown', 200, 60, { shiftKey: true });
    fire(el, 'pointermove', 260, 40, { shiftKey: true });
    fire(window, 'pointerup', 260, 40, { shiftKey: true });
    expect(store.getState().drawings[0]?.points[2]).toEqual({ time: 26, price: 160 });
  });
});
