import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DEFAULT_HOME, usePlannerHomeStore } from '../store/plannerHomeStore.ts';
import { PlannerHomeTracks } from './PlannerHomeTracks.tsx';

beforeEach(() => {
  usePlannerHomeStore.setState({ home: DEFAULT_HOME });
});

const tracks = () => usePlannerHomeStore.getState().home.tracks;

describe('PlannerHomeTracks', () => {
  it('relabels the rate and resets it when the type changes', async () => {
    const user = userEvent.setup();
    render(<PlannerHomeTracks />);
    // Track 1 is fixed at 4.6%; as prime the same field is a spread, so 4.6 must not stay.
    expect(screen.getByRole('spinbutton', { name: 'Track 1 rate %' })).toHaveValue(4.6);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Track 1 type' }), 'prime');
    expect(screen.getByRole('spinbutton', { name: 'Track 1 spread on prime %' })).toHaveValue(-0.5);
    expect(tracks()[0]).toMatchObject({ type: 'prime', rate: -0.5 });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Track 1 type' }), 'variable');
    expect(screen.getByRole('spinbutton', { name: 'Track 1 first rate %' })).toHaveValue(4.4);
  });

  it('enables the grace and reset fields only where they apply', async () => {
    const user = userEvent.setup();
    render(<PlannerHomeTracks />);
    const grace = screen.getByRole('spinbutton', { name: 'Track 1 grace months' });
    const full = screen.getByRole('checkbox', { name: /^Track 1: the interest accrues/ });
    expect(grace).toBeDisabled();
    expect(full).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: /^Track 1 rate resets/ })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: /^Track 3 rate resets/ })).toBeEnabled();
    const repayment = screen.getByRole('combobox', { name: 'Track 1 repayment' });
    await user.selectOptions(repayment, 'grace');
    expect(grace).toBeEnabled();
    expect(full).toBeEnabled();
    await user.selectOptions(repayment, 'balloon');
    expect(grace).toBeDisabled();
    expect(full).toBeEnabled();
  });

  it('holds up to three tracks and disables the rate assumptions on actual rates', async () => {
    const user = userEvent.setup();
    render(<PlannerHomeTracks />);
    const add = screen.getByRole('button', { name: 'Add track' });
    expect(add).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Remove track 2' }));
    expect(tracks().map((t) => t.type)).toEqual(['fixed', 'variable_linked']);
    expect(add).toBeEnabled();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Bank of Israel rate' }),
      'historical',
    );
    expect(screen.getByRole('spinbutton', { name: 'Assumed rate %' })).toBeDisabled();
  });
});
