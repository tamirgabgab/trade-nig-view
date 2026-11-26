import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { PlannerNumber } from './PlannerNumber.tsx';

function Field({ onValue }: { onValue: (value: number) => void }) {
  const [value, setValue] = useState(5);
  return (
    <PlannerNumber
      label="Commission"
      value={value}
      max={100}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

describe('PlannerNumber', () => {
  it('applies a typed number in range at once', async () => {
    const user = userEvent.setup();
    const seen: number[] = [];
    render(<Field onValue={(v) => seen.push(v)} />);
    const input = screen.getByRole('spinbutton', { name: 'Commission' });
    await user.clear(input);
    await user.type(input, '25');
    expect(seen.at(-1)).toBe(25);
    await user.tab();
    expect(input).toHaveValue(25);
  });

  it('restores the value from before the edit when the text left behind is out of range', async () => {
    const user = userEvent.setup();
    const seen: number[] = [];
    render(<Field onValue={(v) => seen.push(v)} />);
    const input = screen.getByRole('spinbutton', { name: 'Commission' });
    await user.clear(input);
    await user.type(input, '250'); // 2 and 25 are in range, 250 is not
    await user.tab();
    expect(seen.at(-1)).toBe(5);
    expect(input).toHaveValue(5);
    // The same for a field left empty.
    await user.clear(input);
    await user.tab();
    expect(input).toHaveValue(5);
  });
});
