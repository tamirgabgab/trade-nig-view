import { fireEvent, render, screen, within } from '@testing-library/react';

import { DatePicker } from './DatePicker.tsx';

const DAYS = ['2023-12-29', '2024-01-02', '2024-01-03', '2024-01-05', '2024-02-01'];

function setup(value: string | undefined) {
  const pick = vi.fn();
  render(<DatePicker label="Start date" days={DAYS} value={value} onPick={pick} />);
  return pick;
}

describe('DatePicker', () => {
  it('shows the value as DD/MM/YYYY and opens on its month with only days with bars enabled', () => {
    setup('2024-01-03');
    fireEvent.click(screen.getByRole('button', { name: 'Start date: 03/01/2024' }));
    const month = screen.getByRole('group', { name: 'Jan 2024' });
    expect(within(month).getByRole('button', { name: '03/01/2024' })).toHaveFocus();
    expect(within(month).getByRole('button', { name: '03/01/2024' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(month).getByRole('button', { name: '02/01/2024' })).toBeEnabled();
    expect(within(month).getByRole('button', { name: '04/01/2024' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled();
  });

  it('picks a day by a click and closes', () => {
    const pick = setup('2024-01-03');
    fireEvent.click(screen.getByRole('button', { name: /^Start date/ }));
    fireEvent.click(screen.getByRole('button', { name: '05/01/2024' }));
    expect(pick).toHaveBeenCalledWith('2024-01-05');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves between days with bars by keys, across months, and closes on Esc', () => {
    setup('2024-01-03');
    fireEvent.click(screen.getByRole('button', { name: /^Start date/ }));
    const grid = () => screen.getByRole('group', { name: /\d{4}$/ });
    fireEvent.keyDown(grid(), { key: 'ArrowRight' }); // 04/01 has no bar: skipped
    expect(screen.getByRole('button', { name: '05/01/2024' })).toHaveFocus();
    fireEvent.keyDown(grid(), { key: 'PageDown' });
    expect(screen.getByRole('button', { name: '01/02/2024' })).toHaveFocus();
    fireEvent.keyDown(grid(), { key: 'PageUp' });
    fireEvent.keyDown(grid(), { key: 'PageUp' });
    expect(screen.getByRole('group', { name: 'Dec 2023' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
    fireEvent.keyDown(grid(), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Start date/ })).toHaveFocus();
  });

  it('jumps by the month and year selects, and opens on the last day without a value', () => {
    setup(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Start date: none' }));
    expect(screen.getByRole('button', { name: '01/02/2024' })).toHaveFocus();
    fireEvent.change(screen.getByRole('combobox', { name: 'Year' }), { target: { value: '2023' } });
    expect(screen.getByRole('group', { name: 'Dec 2023' })).toBeInTheDocument(); // Feb 2023: none
    fireEvent.change(screen.getByRole('combobox', { name: 'Year' }), { target: { value: '2024' } });
    expect(screen.getByRole('group', { name: 'Feb 2024' })).toBeInTheDocument(); // Dec 2024: none
    fireEvent.change(screen.getByRole('combobox', { name: 'Month' }), { target: { value: '1' } });
    expect(screen.getByRole('group', { name: 'Jan 2024' })).toBeInTheDocument();
  });
});
