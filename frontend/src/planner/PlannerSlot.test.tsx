import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  DEFAULT_HOME,
  homesOf,
  sanitizeHome,
  usePlannerHomeStore,
} from '../store/plannerHomeStore.ts';
import {
  DEFAULT_FORM,
  formsOf,
  sanitizePersisted,
  usePlannerStore,
} from '../store/plannerStore.ts';
import { PlannerSlot } from './PlannerSlot.tsx';

beforeEach(() => {
  usePlannerStore.setState({ ...sanitizePersisted(null) });
  usePlannerHomeStore.setState({ ...sanitizeHome(null) });
});

describe('PlannerSlot', () => {
  it('switches both tabs’ forms between option A and option B', async () => {
    const user = userEvent.setup();
    render(<PlannerSlot />);
    const group = screen.getByRole('radiogroup', { name: 'Option being edited' });
    expect(group).toBeVisible();
    const [a, b] = screen.getAllByRole('radio');
    expect([a, b].map((r) => r?.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    usePlannerStore.getState().update({ end: '2030-01-01' });
    usePlannerHomeStore.getState().update({ price: 1_000_000 });

    await user.click(screen.getByRole('radio', { name: 'Option B' }));
    expect(usePlannerStore.getState().slot).toBe('b');
    expect(usePlannerHomeStore.getState().slot).toBe('b');
    expect(usePlannerStore.getState().form.end).toBe(DEFAULT_FORM.end);
    expect(usePlannerHomeStore.getState().home.price).toBe(DEFAULT_HOME.price);
    expect(screen.getByRole('radio', { name: 'Option B' })).toHaveAttribute('aria-checked', 'true');
  });

  it('copies the option on screen over the other one, apartment and market together', async () => {
    const user = userEvent.setup();
    render(<PlannerSlot />);
    usePlannerStore.getState().update({ end: '2030-01-01' });
    usePlannerHomeStore.getState().update({ price: 1_000_000 });
    await user.click(screen.getByRole('button', { name: 'Copy to option B' }));
    expect(formsOf(usePlannerStore.getState()).b.end).toBe('2030-01-01');
    expect(homesOf(usePlannerHomeStore.getState()).b.price).toBe(1_000_000);
    await user.click(screen.getByRole('radio', { name: 'Option B' }));
    expect(screen.getByRole('button', { name: 'Copy to option A' })).toBeVisible();
  });

  it('moves between the two with the arrow keys, like any radio group', async () => {
    const user = userEvent.setup();
    render(<PlannerSlot />);
    screen.getByRole('radio', { name: 'Option A' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(usePlannerStore.getState().slot).toBe('b');
    expect(screen.getByRole('radio', { name: 'Option B' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(usePlannerStore.getState().slot).toBe('a');
  });
});
