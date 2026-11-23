import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useUiStore } from '../store/uiStore.ts';
import { renderWithQuery } from '../test/render.tsx';
import { ShortcutsDialog } from './ShortcutsDialog.tsx';
import { opensShortcuts } from './keyTarget.ts';
import { useAppHotkeys } from './useAppHotkeys.ts';

function Harness() {
  useAppHotkeys();
  return (
    <>
      <input aria-label="Field" />
      <button type="button">Chart</button>
      <ShortcutsDialog />
    </>
  );
}

afterEach(() => {
  useUiStore.setState(useUiStore.getInitialState());
});

describe('ShortcutsDialog', () => {
  it('opens with ?, lists the shortcuts, closes with Esc and gives focus back', async () => {
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    const chart = screen.getByRole('button', { name: 'Chart' });
    chart.focus();

    await user.keyboard('?');
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog).toHaveTextContent('Add an indicator');
    expect(dialog).toHaveTextContent('Trend line');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    // While it is open, typing does not stack a symbol search on top.
    await user.keyboard('a');
    expect(useUiStore.getState().modal).toBe('shortcuts');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(chart).toHaveFocus();
  });

  it('ignores ? typed in a text field or with a modifier', () => {
    const input = document.createElement('input');
    const key = (init: KeyboardEventInit, target: EventTarget = document.body) => {
      const event = new KeyboardEvent('keydown', { key: '?', ...init });
      Object.defineProperty(event, 'target', { value: target });
      return opensShortcuts(event);
    };
    expect(key({})).toBe(true);
    expect(key({}, input)).toBe(false);
    expect(key({ ctrlKey: true })).toBe(false);
  });
});
