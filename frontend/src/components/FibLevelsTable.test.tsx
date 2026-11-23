import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FibLevel } from '../drawings/types.ts';
import { FibLevelsTable } from './FibLevelsTable.tsx';

const LEVELS: FibLevel[] = [
  { value: 0, color: '#787b86', visible: true },
  { value: 0.618, color: '#089981', visible: true },
];

describe('FibLevelsTable', () => {
  it('hides a level, edits a ratio and a colour, and ignores an invalid ratio', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FibLevelsTable levels={LEVELS} onChange={onChange} />);

    await user.click(screen.getByRole('checkbox', { name: 'Show Level 2' }));
    expect(onChange).toHaveBeenLastCalledWith([LEVELS[0], { ...LEVELS[1], visible: false }]);

    const ratio = screen.getByRole('spinbutton', { name: 'Level 2 ratio' });
    await user.clear(ratio);
    await user.type(ratio, '0.65');
    expect(onChange).toHaveBeenLastCalledWith([LEVELS[0], { ...LEVELS[1], value: 0.65 }]);

    onChange.mockClear();
    await user.clear(ratio);
    await user.type(ratio, '12');
    expect(ratio).toHaveAttribute('aria-invalid', 'true');
    expect(onChange).not.toHaveBeenCalledWith([LEVELS[0], { ...LEVELS[1], value: 12 }]);

    fireEvent.change(screen.getByLabelText('Level 1 color'), { target: { value: '#ff0000' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...LEVELS[0], color: '#ff0000' }, LEVELS[1]]);
  });
});
