import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { IconButton } from './IconButton.tsx';

describe('IconButton', () => {
  it('uses the label as accessible name and tooltip, with the shortcut', () => {
    render(<IconButton label="Trend line" shortcut="Alt+T" />);
    const button = screen.getByRole('button', { name: 'Trend line' });

    expect(button).toHaveAttribute('data-tooltip', 'Trend line (Alt+T)');
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Alt+T');
  });

  it('calls onClick when enabled', async () => {
    const onClick = vi.fn();
    render(<IconButton label="Save" onClick={onClick} />);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('stays focusable but inert when the feature is coming later', async () => {
    const onClick = vi.fn();
    render(<IconButton label="Replay" comingIn="R7" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Replay' });

    await userEvent.tab();
    expect(button).toHaveFocus();
    await userEvent.click(button);

    expect(onClick).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('data-tooltip', 'Replay — coming in R7');
  });

  it('exposes toggle state through aria-pressed', () => {
    render(<IconButton label="Magnet" pressed />);

    expect(screen.getByRole('button', { name: 'Magnet' })).toHaveAttribute('aria-pressed', 'true');
  });
});
