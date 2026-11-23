import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useUiStore } from '../store/uiStore.ts';
import { renderWithQuery } from '../test/render.tsx';
import { snapshotFileName } from './snapshot.ts';
import { SnapshotMenu } from './SnapshotMenu.tsx';
import { useAppHotkeys } from './useAppHotkeys.ts';

function Harness() {
  useAppHotkeys();
  return <SnapshotMenu />;
}

afterEach(() => {
  useUiStore.setState(useUiStore.getInitialState());
});

describe('SnapshotMenu', () => {
  it('asks for a download or a copy from the menu, and a copy with Alt+S', async () => {
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    const camera = screen.getByRole('button', { name: 'Take a snapshot' });

    await user.click(camera);
    await user.click(screen.getByRole('menuitem', { name: 'Download PNG' }));
    expect(useUiStore.getState().snapshot).toEqual({ seq: 1, mode: 'download' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(camera).toHaveFocus();

    await user.keyboard('{Alt>}s{/Alt}');
    expect(useUiStore.getState().snapshot).toEqual({ seq: 2, mode: 'copy' });

    await user.click(camera);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // A second press on the camera closes the menu (it does not reopen it).
    await user.click(camera);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(camera);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('names the file after the symbol, interval and date', () => {
    expect(snapshotFileName('GC1!', '1D', new Date('2026-11-23T10:00:00Z'))).toBe(
      'GC1!_1D_2026-11-23.png',
    );
    expect(snapshotFileName('BRK.B/x', '4h', new Date('2026-11-23T10:00:00Z'))).toBe(
      'BRK.B_x_4h_2026-11-23.png',
    );
  });
});
