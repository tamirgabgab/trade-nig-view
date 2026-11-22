import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from '../App.tsx';
import { useChartStore } from '../store/chartStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import {
  AAPL_BARS,
  barsBody,
  HEALTH_OK,
  QUOTES,
  renderWithQuery,
  stubApi,
  SYMBOLS,
} from '../test/render.tsx';

vi.mock('../chart/ChartEngine.ts', () => import('../test/fakeChartEngine.ts'));

beforeEach(() => {
  useChartStore.setState(useChartStore.getInitialState());
  useUiStore.setState(useUiStore.getInitialState());
  stubApi({
    '/api/health': { body: HEALTH_OK },
    '/api/symbols': { body: SYMBOLS },
    '/api/quotes': { body: QUOTES },
    '/api/bars': { body: barsBody('AAPL', '1D', AAPL_BARS) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function options(): string[] {
  return within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((o) => o.textContent);
}

describe('SymbolSearchDialog', () => {
  it('opens when a letter is typed on the page, seeded with that letter', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    await screen.findAllByText('TSLA');

    await user.keyboard('t');

    const dialog = screen.getByRole('dialog', { name: 'Symbol search' });
    const input = within(dialog).getByRole('combobox', { name: 'Symbol' });
    expect(input).toHaveValue('T');
    expect(input).toHaveFocus();
    expect(options()[0]).toContain('TSLA');
  });

  it('filters, moves with the arrows and picks with Enter', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    await user.click(screen.getByRole('button', { name: /Symbol search/ }));
    const input = await screen.findByRole('combobox', { name: 'Symbol' });
    await waitFor(() => {
      expect(options()).toHaveLength(SYMBOLS.length);
    });

    await user.type(input, 'a');
    // AAPL is a ticker prefix; TSLA ("Tesla, Inc.") and others merely contain an "A".
    expect(options()[0]).toContain('AAPL');
    const active = () => input.getAttribute('aria-activedescendant');
    const first = active();
    await user.keyboard('{ArrowDown}');
    expect(active()).not.toBe(first);
    await user.keyboard('{ArrowUp}');
    expect(active()).toBe(first);

    await user.clear(input);
    await user.type(input, 'tes');
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useChartStore.getState().symbol).toBe('TSLA');
  });

  it('picks a symbol with the mouse', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    await user.click(screen.getByRole('button', { name: /Symbol search/ }));
    await waitFor(() => {
      expect(options()).toHaveLength(SYMBOLS.length);
    });

    await user.click(within(screen.getByRole('listbox')).getByText('British Pound / US Dollar'));
    expect(useChartStore.getState().symbol).toBe('GBPUSD=X');
  });

  it('closes on Escape and gives focus back to the symbol button', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    const button = screen.getByRole('button', { name: /Symbol search/ });
    await user.click(button);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(useChartStore.getState().symbol).toBe('AAPL');
  });

  it('closes on a click outside and says when nothing matches', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    await user.click(screen.getByRole('button', { name: /Symbol search/ }));
    const input = screen.getByRole('combobox', { name: 'Symbol' });
    await waitFor(() => {
      expect(options()).toHaveLength(SYMBOLS.length);
    });

    await user.type(input, 'qqqq');
    expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent(
      'No symbol matches “QQQQ”',
    );

    const backdrop = screen.getByRole('dialog').parentElement;
    if (backdrop === null) throw new Error('no backdrop');
    await user.pointer({ keys: '[MouseLeft]', target: backdrop });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not open while typing in a text field', async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <>
        <input aria-label="Other field" />
        <App />
      </>,
    );
    await user.type(screen.getByRole('textbox', { name: 'Other field' }), 'abc');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
