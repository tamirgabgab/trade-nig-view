import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CsvButton } from './CsvButton.tsx';

describe('CsvButton', () => {
  it('hands the browser a CSV file of the rows under the given name', async () => {
    const user = userEvent.setup();
    const blobs: Blob[] = [];
    // jsdom has no object URLs of its own.
    URL.createObjectURL = (blob: Blob) => {
      blobs.push(blob);
      return 'blob:test';
    };
    const revoke = vi.fn();
    URL.revokeObjectURL = revoke;
    const clicked: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(`${this.download}|${this.href}`);
    });
    render(
      <CsvButton
        name="deposits"
        headers={['date', 'amount']}
        rows={() => [
          ['2020-01-15', 1000],
          ['2020-02-15', 1500.5],
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Download deposits as CSV' }));
    expect(clicked).toEqual(['deposits.csv|blob:test']);
    expect(blobs[0]?.type).toBe('text/csv;charset=utf-8');
    // Reading a blob as text drops the byte-order mark: it is checked in the bytes.
    const bytes = new Uint8Array((await blobs[0]?.arrayBuffer()) ?? new ArrayBuffer(0));
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(await blobs[0]?.text()).toBe('date,amount\r\n2020-01-15,1000\r\n2020-02-15,1500.5\r\n');
    // The URL lives until the browser has started the download.
    expect(revoke).not.toHaveBeenCalled();
    await vi.waitFor(
      () => {
        expect(revoke).toHaveBeenCalledWith('blob:test');
      },
      { timeout: 2000 },
    );
    click.mockRestore();
  });
});
