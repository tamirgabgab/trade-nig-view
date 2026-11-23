import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SearchDialog } from './SearchDialog.tsx';

const WORDS = ['alpha', 'alpine', 'beta'];
const search = (query: string) => [
  { label: 'Words', items: query === '' ? [] : WORDS.filter((w) => w.startsWith(query)) },
];

describe('SearchDialog', () => {
  it('keeps a valid selection after arrows on an empty list, and picks with Enter', async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchDialog
        title="Words"
        icon={null}
        inputLabel="Word"
        listLabel="Words"
        placeholder=""
        search={search}
        itemKey={(w) => w}
        renderItem={(w) => w}
        onPick={onPick}
        onClose={() => undefined}
        status={(_, count) => (count === 0 ? 'Nothing' : null)}
      />,
    );
    await user.keyboard('{ArrowUp}{ArrowDown}');
    await user.keyboard('al');
    expect(screen.getByRole('option', { name: 'alpha' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onPick).toHaveBeenCalledWith('alpine');
    // Option ids are unique by position.
    const ids = screen.getAllByRole('option').map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
