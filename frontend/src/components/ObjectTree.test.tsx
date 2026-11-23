import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { newDrawing } from '../drawings/manager.ts';
import { useChartDataStore } from '../store/chartDataStore.ts';
import { useDrawingStore } from '../store/drawingStore.ts';
import { useIndicatorStore } from '../store/indicatorStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { ObjectTree } from './ObjectTree.tsx';

beforeEach(() => {
  useUiStore.setState(useUiStore.getInitialState());
  useIndicatorStore.setState(useIndicatorStore.getInitialState());
  const uid = useIndicatorStore.getState().add('ema', { length: 9 });
  const instance = useIndicatorStore.getState().instances[0];
  if (instance === undefined) throw new Error('no instance');
  useChartDataStore.getState().setData({
    bars: [],
    decimals: 2,
    hasVolume: true,
    gaps: [],
    views: [
      {
        instance: { ...instance, uid },
        spec: undefined,
        params: {},
        label: 'EMA 9',
        outputs: [],
        error: null,
        isFetching: false,
      },
    ],
  });
  useDrawingStore.setState(useDrawingStore.getInitialState(), true);
  useDrawingStore
    .getState()
    .load('AAPL', 1, [
      newDrawing('horizontal_line', [{ time: 1, price: 10 }], 'h'),
      { ...newDrawing('text', [{ time: 1, price: 12 }], 't'), props: { text: 'Breakout' } },
    ]);
});

describe('ObjectTree', () => {
  it('lists indicators and drawings; hides, locks, selects and removes them', async () => {
    const user = userEvent.setup();
    render(<ObjectTree />);

    await user.click(screen.getByRole('button', { name: 'Hide EMA 9' }));
    expect(useIndicatorStore.getState().instances[0]?.visible).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Settings of EMA 9' }));
    expect(useUiStore.getState().settingsFor).not.toBeNull();

    // Newest drawing first.
    await user.click(screen.getByRole('button', { name: 'Text “Breakout”' }));
    expect(useDrawingStore.getState().selectedId).toBe('t');
    await user.click(screen.getByRole('button', { name: 'Hide Horizontal line' }));
    await user.click(screen.getByRole('button', { name: 'Lock Horizontal line' }));
    expect(useDrawingStore.getState().drawings[0]).toMatchObject({ hidden: true, locked: true });
    // A hidden drawing can be shown again from here.
    await user.click(screen.getByRole('button', { name: 'Show Horizontal line' }));
    expect(useDrawingStore.getState().drawings[0]?.hidden).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Remove Horizontal line' }));
    expect(useDrawingStore.getState().drawings.map((d) => d.id)).toEqual(['t']);
    expect(useUiStore.getState().toast?.message).toBe('Removed Horizontal line');
  });
});
