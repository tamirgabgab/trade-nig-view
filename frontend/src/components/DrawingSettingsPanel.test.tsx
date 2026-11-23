import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { newDrawing } from '../drawings/manager.ts';
import { useDrawingStore } from '../store/drawingStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { DrawingSettingsPanel } from './DrawingSettingsPanel.tsx';

const line = newDrawing('horizontal_line', [{ time: 1, price: 10 }], 'a');

beforeEach(() => {
  useDrawingStore.setState(useDrawingStore.getInitialState(), true);
  useDrawingStore.getState().load('AAPL', 1, [line]);
  useUiStore.setState(useUiStore.getInitialState());
  useUiStore.getState().openDrawingSettings('a');
});

describe('DrawingSettingsPanel', () => {
  it('edits the anchor price, and follows a drag made on the chart', async () => {
    const user = userEvent.setup();
    render(<DrawingSettingsPanel />);
    const price = screen.getByRole('spinbutton');
    expect(price).toHaveValue(10);

    await user.clear(price);
    await user.type(price, '12.5');
    expect(useDrawingStore.getState().drawings[0]?.points[0]?.price).toBe(12.5);

    await user.tab();
    act(() => {
      useDrawingStore.getState().update('a', (d) => ({
        ...d,
        points: [{ time: 1, price: 20 }],
      }));
    });
    expect(price).toHaveValue(20);
  });
});
