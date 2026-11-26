import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { usePlannerStore } from '../store/plannerStore.ts';
import { PlannerAssets } from './PlannerAssets.tsx';

beforeEach(() => {
  usePlannerStore.getState().reset();
});

describe('PlannerAssets', () => {
  it('adds and removes rows; the last row cannot be removed', async () => {
    const user = userEvent.setup();
    render(<PlannerAssets />);
    expect(screen.getByRole('button', { name: 'Remove asset 1' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Add asset' }));
    await user.type(screen.getByRole('textbox', { name: 'Ticker 2' }), 'qqq');
    expect(usePlannerStore.getState().form.assets.map((a) => a.symbol)).toEqual(['SPY', 'QQQ']);
    await user.click(screen.getByRole('button', { name: 'Remove asset 1' }));
    expect(usePlannerStore.getState().form.assets.map((a) => a.symbol)).toEqual(['QQQ']);
  });

  it('prices a Tel Aviv ticker in shekels', async () => {
    const user = userEvent.setup();
    render(<PlannerAssets />);
    const ticker = screen.getByRole('textbox', { name: 'Ticker 1' });
    await user.clear(ticker);
    await user.type(ticker, 'teva.ta');
    expect(usePlannerStore.getState().form.assets[0]).toMatchObject({
      symbol: 'TEVA.TA',
      currency: 'ILS',
    });
    expect(screen.getByRole('combobox', { name: 'Currency 1' })).toHaveValue('ILS');
  });
});
