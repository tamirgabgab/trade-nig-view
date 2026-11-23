import { MAX_INSTANCES, sanitizePersisted, useIndicatorStore } from './indicatorStore.ts';

beforeEach(() => {
  localStorage.clear();
  useIndicatorStore.setState(useIndicatorStore.getInitialState());
});

describe('indicator store', () => {
  it('adds instances with unique uids and edits them', () => {
    const store = useIndicatorStore.getState();
    const a = store.add('ema', { length: 9 });
    const b = store.add('ema', { length: 9 });
    expect(a).not.toBe(b);

    useIndicatorStore.getState().setParams(a, { length: 50 });
    useIndicatorStore.getState().setStyle(a, 'ma', { color: '#123456', lineWidth: 3 });
    useIndicatorStore.getState().toggleVisible(b);
    const [first, second] = useIndicatorStore.getState().instances;
    expect(first).toMatchObject({ params: { length: 50 }, styles: { ma: { lineWidth: 3 } } });
    expect(second?.visible).toBe(false);

    useIndicatorStore.getState().resetStyles(a);
    useIndicatorStore.getState().remove(b);
    expect(useIndicatorStore.getState().instances).toEqual([
      { uid: a, id: 'ema', params: { length: 50 }, styles: {}, visible: true },
    ]);
  });

  it('never reuses a uid after a removal', () => {
    const a = useIndicatorStore.getState().add('sma', {});
    useIndicatorStore.getState().remove(a);
    expect(useIndicatorStore.getState().add('sma', {})).not.toBe(a);
  });

  it('stops at the instance limit', () => {
    for (let i = 0; i < MAX_INSTANCES + 3; i += 1) useIndicatorStore.getState().add('sma', {});
    expect(useIndicatorStore.getState().instances).toHaveLength(MAX_INSTANCES);
  });

  it('remembers the instances in localStorage', () => {
    useIndicatorStore.getState().add('wma', { length: 30 });
    const saved = JSON.parse(localStorage.getItem('chartlab.indicators') ?? '{}') as {
      state?: { instances?: unknown[] };
    };
    expect(saved.state?.instances).toHaveLength(1);
  });

  it('drops malformed saved instances and values', () => {
    expect(
      sanitizePersisted({
        seq: 4,
        instances: [
          { uid: 'a', id: 'ema', params: { length: 5, bad: { x: 1 } }, styles: {} },
          { uid: 'a', id: 'sma' },
          { uid: '', id: 'sma' },
          'junk',
          {
            uid: 'b',
            id: 'sma',
            visible: false,
            styles: { ma: { color: 'red', lineWidth: 2 }, up: { color: '#00ff00', lineWidth: 9 } },
          },
        ],
      }),
    ).toEqual({
      seq: 4,
      instances: [
        { uid: 'a', id: 'ema', params: { length: 5 }, styles: {}, visible: true },
        {
          uid: 'b',
          id: 'sma',
          params: {},
          styles: { up: { color: '#00ff00', lineWidth: 4 } },
          visible: false,
        },
      ],
    });
    expect(sanitizePersisted(null)).toEqual({ instances: [], seq: 0 });
  });
});
