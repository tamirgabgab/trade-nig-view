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

const same = () => screen.getByRole('checkbox', { name: 'Option B is the same as option A' });
const option = (letter: string) => screen.getByRole('radio', { name: `Option ${letter}` });

describe('PlannerSlot', () => {
  it('starts with one set of forms for both options', () => {
    render(<PlannerSlot />);
    expect(same()).toBeChecked();
    expect(screen.getByRole('radiogroup', { name: 'Option being edited' })).toBeVisible();
    expect(option('A')).toBeChecked();
    expect([option('A'), option('B')].every((radio) => (radio as HTMLInputElement).disabled)).toBe(
      true,
    );
  });

  it('gives option B forms of its own, starting as a copy of option A', async () => {
    const user = userEvent.setup();
    render(<PlannerSlot />);
    usePlannerStore.getState().update({ end: '2030-01-01' });
    usePlannerHomeStore.getState().update({ price: 1_000_000 });
    await user.click(same());
    expect(usePlannerStore.getState().same).toBe(false);
    expect(formsOf(usePlannerStore.getState()).b.end).toBe('2030-01-01');
    expect(homesOf(usePlannerHomeStore.getState()).b.price).toBe(1_000_000);

    // One switch for both tabs.
    await user.click(option('B'));
    expect([usePlannerStore.getState().slot, usePlannerHomeStore.getState().slot]).toEqual([
      'b',
      'b',
    ]);
    expect(option('B')).toBeChecked();
    usePlannerStore.getState().update({ end: '2040-01-01' });
    expect(formsOf(usePlannerStore.getState()).a.end).toBe('2030-01-01');
  });

  it('goes back to option A when the two are made the same again', async () => {
    const user = userEvent.setup();
    render(<PlannerSlot />);
    await user.click(same());
    await user.click(option('B'));
    usePlannerHomeStore.getState().update({ price: 3_000_000 });
    // Option B's forms differ from A's: they are not replaced without a yes.
    await user.click(same());
    expect(usePlannerStore.getState().same).toBe(false);
    // The question takes the focus on its safe answer, and gives it back to the box.
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName(
      /Replace option B with option A\?$/,
    );
    expect(screen.getByRole('button', { name: 'Keep both options' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(homesOf(usePlannerHomeStore.getState()).b.price).toBe(3_000_000);
    expect(same()).not.toBeChecked();
    expect(same()).toHaveFocus();
    expect(usePlannerStore.getState().joining).toBe(false);
    await user.click(same());
    await user.click(screen.getByRole('button', { name: 'Replace option B with option A' }));
    expect(usePlannerStore.getState()).toMatchObject({ same: true, slot: 'a' });
    expect(usePlannerHomeStore.getState()).toMatchObject({
      slot: 'a',
      home: DEFAULT_HOME,
    });
    expect(usePlannerStore.getState().form).toEqual(DEFAULT_FORM);
    expect(option('B')).toBeDisabled();
    // Apart again, option B is a new copy of option A: its earlier edits are gone.
    await user.click(same());
    expect(homesOf(usePlannerHomeStore.getState()).b.price).toBe(DEFAULT_HOME.price);
    // Two options that are alike are joined without a question.
    await user.click(same());
    expect(screen.queryByRole('button', { name: 'Keep both options' })).not.toBeInTheDocument();
    expect(usePlannerStore.getState().same).toBe(true);
  });

  it('moves between the two with the arrow keys, like any radio group', async () => {
    const user = userEvent.setup();
    render(<PlannerSlot />);
    await user.click(same());
    option('A').focus();
    await user.keyboard('{ArrowRight}');
    expect(usePlannerStore.getState().slot).toBe('b');
    expect(option('B')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(usePlannerStore.getState().slot).toBe('a');
  });
});
