import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from './App.tsx';
import { HEALTH_OK, QUOTES, renderWithQuery, stubApi, SYMBOLS } from './test/render.tsx';

beforeEach(() => {
  stubApi({
    '/api/health': { body: HEALTH_OK },
    '/api/symbols': { body: SYMBOLS },
    '/api/quotes': { body: QUOTES },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App shell', () => {
  it('renders the five layout regions', () => {
    renderWithQuery(<App />);

    expect(screen.getByRole('toolbar', { name: 'Chart toolbar' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Drawing tools' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Chart' })).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Watchlist and details' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('contentinfo', { name: 'Chart range and scale' })).toBeInTheDocument();
  });

  it('gives every button an accessible name', () => {
    renderWithQuery(<App />);

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAccessibleName();
    }
  });

  it('selects one drawing tool at a time', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    const toolbar = screen.getByRole('navigation', { name: 'Drawing tools' });
    const cursor = within(toolbar).getByRole('button', { name: 'Cross cursor' });
    const fib = within(toolbar).getByRole('button', { name: 'Gann and Fibonacci tools' });

    expect(cursor).toHaveAttribute('aria-pressed', 'true');
    await user.click(fib);

    expect(fib).toHaveAttribute('aria-pressed', 'true');
    expect(cursor).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles magnet mode', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    const magnet = screen.getByRole('button', { name: 'Magnet mode' });

    await user.click(magnet);
    expect(magnet).toHaveAttribute('aria-pressed', 'true');
    await user.click(magnet);
    expect(magnet).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps log and percent scale mutually exclusive', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    const log = screen.getByRole('button', { name: 'log' });
    const percent = screen.getByRole('button', { name: '%' });

    await user.click(log);
    await user.click(percent);

    expect(percent).toHaveAttribute('aria-pressed', 'true');
    expect(log).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks exactly one visible-range button as selected', async () => {
    const user = userEvent.setup();
    renderWithQuery(<App />);
    const group = screen.getByRole('group', { name: 'Visible range' });

    await user.click(within(group).getByRole('button', { name: '5Y' }));

    const pressed = within(group)
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed.map((button) => button.textContent)).toEqual(['5Y']);
  });

  it('lists watchlist sections from the API', async () => {
    renderWithQuery(<App />);
    const table = await within(screen.getByRole('complementary')).findByRole('table');

    for (const title of ['Indices', 'Stocks', 'Forex']) {
      expect(within(table).getByText(title)).toBeInTheDocument();
    }
    expect(within(table).getByText('AAPL')).toBeInTheDocument();
  });
});
