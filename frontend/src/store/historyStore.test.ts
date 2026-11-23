import { newDrawing } from '../drawings/manager.ts';
import { useChartStore } from './chartStore.ts';
import { useDrawingStore } from './drawingStore.ts';
import { MERGE_MS, recordHistory, useHistoryStore } from './historyStore.ts';
import { useIndicatorStore } from './indicatorStore.ts';

const line = (id: string) =>
  newDrawing(
    'trend_line',
    [
      { time: 1, price: 10 },
      { time: 2, price: 11 },
    ],
    id,
  );

let clock = 0;
let stop: () => void;

beforeEach(() => {
  useChartStore.setState(useChartStore.getInitialState());
  useIndicatorStore.setState(useIndicatorStore.getInitialState());
  useDrawingStore.setState(useDrawingStore.getInitialState(), true);
  useDrawingStore.getState().load('AAPL', 1, []);
  useHistoryStore.setState({ past: [], future: [] });
  clock = 0;
  stop = recordHistory(() => clock);
});

afterEach(() => {
  stop();
});

const later = () => {
  clock += MERGE_MS + 1;
};
const history = () => useHistoryStore.getState();

describe('history', () => {
  it('undoes and redoes symbol switches, indicators and drawings in one order', () => {
    useDrawingStore.getState().add(line('a'));
    later();
    useIndicatorStore.getState().add('ema', { length: 9 });
    later();
    useChartStore.getState().setSymbol('NVDA');
    expect(history().past.map((e) => e.kind)).toEqual(['drawings', 'indicators', 'chart']);

    history().undo();
    expect(useChartStore.getState().symbol).toBe('AAPL');
    history().undo();
    expect(useIndicatorStore.getState().instances).toEqual([]);
    history().undo();
    expect(useDrawingStore.getState().drawings).toEqual([]);

    history().redo();
    expect(useDrawingStore.getState().drawings.map((d) => d.id)).toEqual(['a']);
    history().redo();
    expect(useIndicatorStore.getState().instances).toHaveLength(1);
    // Undo/redo does not add steps of its own.
    expect(history().past).toHaveLength(2);
    expect(history().future).toHaveLength(1);
  });

  it('merges quick changes of one kind (a drag) into one step; a new change drops the redo', () => {
    useDrawingStore.getState().add(line('a'));
    later();
    for (const price of [12, 13, 14]) {
      clock += 100;
      useDrawingStore.getState().update('a', (d) => ({
        ...d,
        points: [d.points[0] ?? { time: 1, price: 10 }, { time: 2, price }],
      }));
    }
    expect(history().past).toHaveLength(2);
    history().undo();
    expect(useDrawingStore.getState().drawings[0]?.points[1]?.price).toBe(11);
    later();
    useDrawingStore.getState().add(line('b'));
    expect(history().future).toEqual([]);
  });

  it('waits while the drawings of a symbol switched back to are loading', () => {
    useDrawingStore.getState().add(line('a'));
    useDrawingStore.getState().unload();
    history().undo();
    expect(history().past).toHaveLength(1); // not applied yet
    useDrawingStore.getState().load('AAPL', 2, [line('a')]);
    expect(history().past).toHaveLength(1); // a load is not a step
    history().undo();
    expect(useDrawingStore.getState().drawings).toEqual([]);
  });
});
