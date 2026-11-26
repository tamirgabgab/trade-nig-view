import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { parseSimulation } from '../api/planner.ts';
import { SIMULATION_RESULT } from '../test/plannerCompareBody.ts';
import { PlannerSimulation } from './PlannerSimulation.tsx';
import { DEFAULT_SIMULATION, toSimulation } from './simulation.ts';

const card = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement;

describe('PlannerSimulation', () => {
  it('shows who wins, the history behind the worlds and the risk of each option', () => {
    const result = parseSimulation(SIMULATION_RESULT);
    render(<PlannerSimulation result={result} names={['Apartment', 'Market']} run={1} />);
    expect(
      screen.getByRole('heading', { name: 'Simulation: 4 worlds, block bootstrap' }),
    ).toBeVisible();
    expect(card('P(apartment > market)')).toHaveTextContent('25.00%');
    expect(card('Dominance')).toHaveTextContent('Market over apartment, second order');
    expect(card('History resampled')).toHaveTextContent('295 months');
    expect(card('Independent terms in it, about')).toHaveTextContent('2.5');
    expect(screen.queryByText('Modelled market')).not.toBeInTheDocument();
    expect(
      screen.getByText('Inflation has no spread: it is the same in every world'),
    ).toBeVisible();
    const risk = screen.getByRole('table', { name: 'Risk' });
    const cells = (label: string) =>
      within(within(risk).getByText(label).closest('tr') ?? risk)
        .getAllByRole('cell')
        .map((cell) => cell.textContent);
    expect(cells('CVaR 5%, real')).toEqual(['CVaR 5%, real', '₪800,000', '₪800,000']);
    expect(cells('Certainty equivalent')).toEqual(['Certainty equivalent', '₪1,800,000', 'Ruin']);
    // What an option does not have (a loan, a payment, an account) is a dash, not a zero.
    expect(cells('Apartment below its loan at some point').slice(1)).toEqual(['5.00%', '—']);
    expect(cells('Time the account is below its deposits').slice(1)).toEqual(['—', '30.00%']);
    expect(cells('Sharpe of the yearly returns').slice(1)).toEqual(['0.80', '—']);
  });

  it('switches the measure of the distribution, returns in percent', async () => {
    const user = userEvent.setup();
    const view = (run: number) => (
      <PlannerSimulation
        result={parseSimulation(SIMULATION_RESULT)}
        names={['Apartment', 'Market']}
        run={run}
      />
    );
    const { rerender } = render(view(1));
    const a = () => screen.getByRole('slider', { name: 'Lower bound a' });
    expect(Number(a().getAttribute('aria-valuenow'))).toBeGreaterThan(1_000_000);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Measure' }), 'xirr_real');
    // The pooled real returns run from -1 % to 5 %: the handle restarts inside them.
    expect(Number(a().getAttribute('aria-valuenow'))).toBeLessThan(5);
    expect(screen.getByText(/^Apartment:/, { selector: 'p' })).toHaveTextContent(
      /end between \d\.\d% and \d\.\d%/,
    );
    // The same numbers from a new simulation: the handles start again at the quartiles.
    const start = a().getAttribute('aria-valuenow');
    fireEvent.keyDown(a(), { key: 'Home' });
    expect(a().getAttribute('aria-valuenow')).not.toBe(start);
    rerender(view(2));
    expect(a().getAttribute('aria-valuenow')).toBe(start);
  });
});

describe('toSimulation', () => {
  it('sends the model only for a Monte Carlo that does not estimate it', () => {
    expect(toSimulation(DEFAULT_SIMULATION, true)).toMatchObject({
      method: 'bootstrap',
      runs: 1000,
      block_months: 12,
      market_mean_pct: null,
      correlation: 0,
      follow_rates: true,
      income: null,
      stress_share_pct: 40,
    });
    const modelled = { ...DEFAULT_SIMULATION, method: 'monte_carlo' as const, correlation: 0.3 };
    expect(toSimulation(modelled, false)).toMatchObject({
      market_mean_pct: null,
      market_sd_pct: null,
      correlation: 0.3,
      follow_rates: false,
    });
    const entered = { ...modelled, estimate: false, income: 20_000 };
    expect(toSimulation(entered, true)).toMatchObject({
      market_mean_pct: 7,
      market_sd_pct: 16,
      income: 20_000,
    });
  });
});
