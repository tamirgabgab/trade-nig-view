import { useUiStore } from './uiStore.ts';

afterEach(() => {
  useUiStore.setState(useUiStore.getInitialState());
});

describe('forgetIndicator', () => {
  it('closes the panels and drops the focus of a removed indicator only', () => {
    useUiStore.setState({
      settingsFor: 'rsi-1',
      learnFor: null,
      legendFocus: 'ema-2',
      emphasis: 'rsi-1',
    });
    useUiStore.getState().forgetIndicator('rsi-1');
    expect(useUiStore.getState()).toMatchObject({
      settingsFor: null,
      legendFocus: 'ema-2',
      emphasis: null,
    });
  });

  it('forgets every indicator without a uid (remove all)', () => {
    useUiStore.setState({ learnFor: 'ema-2', legendFocus: 'ema-2' });
    useUiStore.getState().forgetIndicator();
    expect(useUiStore.getState()).toMatchObject({ learnFor: null, legendFocus: null });
  });

  it('keeps a learn page opened from the index when every indicator goes', () => {
    useUiStore.setState({ learnFor: 'page:combinations', legendFocus: 'ema-2' });
    useUiStore.getState().forgetIndicator();
    expect(useUiStore.getState()).toMatchObject({
      learnFor: 'page:combinations',
      legendFocus: null,
    });
  });
});
