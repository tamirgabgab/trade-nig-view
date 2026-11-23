import { newDrawing } from '../drawings/manager.ts';
import { useDrawingStore } from './drawingStore.ts';

const line = newDrawing(
  'trend_line',
  [
    { time: 1, price: 10 },
    { time: 2, price: 11 },
  ],
  'a',
);

beforeEach(() => {
  useDrawingStore.setState(useDrawingStore.getInitialState(), true);
  useDrawingStore.getState().load('AAPL', 1, [line]);
});

describe('drawingStore', () => {
  it('restores a removed drawing on its own symbol only', () => {
    const removed = useDrawingStore.getState().remove('a');
    expect(removed).toMatchObject({ index: 0, symbol: 'AAPL' });
    if (removed === null) return;

    useDrawingStore.getState().load('MSFT', 1, []);
    useDrawingStore.getState().restore(removed);
    expect(useDrawingStore.getState().drawings).toEqual([]);

    useDrawingStore.getState().load('AAPL', 2, []);
    useDrawingStore.getState().restore(removed);
    expect(useDrawingStore.getState().drawings).toEqual([line]);
  });

  it('unloads the symbol, and hiding all drops the selection', () => {
    useDrawingStore.getState().select('a');
    useDrawingStore.getState().toggle('hideAll');
    expect(useDrawingStore.getState().selectedId).toBeNull();

    useDrawingStore.getState().unload();
    expect(useDrawingStore.getState()).toMatchObject({ symbol: null, drawings: [] });
  });
});
