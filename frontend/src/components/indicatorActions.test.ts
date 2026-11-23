import { INDICATORS } from '../test/render.tsx';
import { parseIndicatorList } from '../api/indicators.ts';
import { MAX_INSTANCES, useIndicatorStore } from '../store/indicatorStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { addIndicator, removeIndicator } from './indicatorActions.ts';

const [ema] = parseIndicatorList(INDICATORS);

beforeEach(() => {
  useIndicatorStore.setState({ instances: [], seq: 0 });
  useUiStore.setState(useUiStore.getInitialState());
});

describe('indicator actions', () => {
  it('adds with emphasis, and says when the chart is full instead of failing silently', () => {
    if (ema === undefined) throw new Error('fixture');
    expect(addIndicator(ema)).toBe(true);
    expect(useUiStore.getState().emphasis).toBe(useIndicatorStore.getState().instances[0]?.uid);

    for (let i = 1; i < MAX_INSTANCES; i++) addIndicator(ema);
    expect(addIndicator(ema)).toBe(false);
    expect(useIndicatorStore.getState().instances).toHaveLength(MAX_INSTANCES);
    expect(useUiStore.getState().toast?.message).toMatch(/maximum/);
  });

  it('removes with an Undo that puts it back, and closes its settings panel', () => {
    if (ema === undefined) throw new Error('fixture');
    addIndicator(ema);
    const uid = useIndicatorStore.getState().instances[0]?.uid ?? '';
    useUiStore.getState().openSettings(uid);

    removeIndicator(uid, 'EMA 9');
    expect(useIndicatorStore.getState().instances).toEqual([]);
    expect(useUiStore.getState().settingsFor).toBeNull();
    useUiStore.getState().toast?.undo?.();
    expect(useIndicatorStore.getState().instances.map((i) => i.uid)).toEqual([uid]);
  });
});
