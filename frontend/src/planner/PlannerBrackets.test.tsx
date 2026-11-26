import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import type { TaxBracket } from '../api/planner.ts';
import { PlannerBrackets } from './PlannerBrackets.tsx';

let rows: TaxBracket[] = [];

function Table({ start }: { start: TaxBracket[] }) {
  const [value, setValue] = useState(start);
  return (
    <PlannerBrackets
      label="Tax"
      rows={value}
      onChange={(next) => {
        rows = next;
        setValue(next);
      }}
    />
  );
}

describe('PlannerBrackets', () => {
  it('starts a table with one open slice and adds bounded ones under it', async () => {
    const user = userEvent.setup();
    render(<Table start={[]} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const add = screen.getByRole('button', { name: 'Add Tax bracket' });
    await user.click(add);
    expect(rows).toEqual([{ up_to: null, rate_pct: 0 }]);
    await user.click(add);
    await user.click(add);
    expect(rows.map((r) => r.up_to)).toEqual([1_000_000, 2_000_000, null]);
  });

  it('keeps the last slice open when rows are removed or edited', async () => {
    const user = userEvent.setup();
    render(
      <Table
        start={[
          { up_to: 1_000_000, rate_pct: 0 },
          { up_to: 2_000_000, rate_pct: 5 },
          { up_to: null, rate_pct: 10 },
        ]}
      />,
    );
    expect(screen.getByText('and above')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove Tax bracket 3' }));
    expect(rows).toEqual([
      { up_to: 1_000_000, rate_pct: 0 },
      { up_to: null, rate_pct: 5 },
    ]);
    const rate = screen.getByRole('spinbutton', { name: 'Tax bracket 2 rate %' });
    await user.clear(rate);
    await user.type(rate, '8');
    expect(rows[1]).toEqual({ up_to: null, rate_pct: 8 });
  });
});
