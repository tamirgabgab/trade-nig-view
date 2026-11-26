import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DEFAULT_HOME, usePlannerHomeStore } from '../store/plannerHomeStore.ts';
import { HOME_RESULT, TAX_PRESETS } from '../test/plannerHomeBody.ts';
import { jsonResponse, renderWithQuery, stubApi } from '../test/render.tsx';
import { PlannerHome } from './PlannerHome.tsx';

beforeEach(() => {
  usePlannerHomeStore.setState({ home: DEFAULT_HOME, saved: { purchase: {}, betterment: {} } });
});

describe('PlannerHome', () => {
  it('runs only once the tax tables are there, with the picked tables in the request', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    stubApi({
      '/api/planner/tax-presets': { body: TAX_PRESETS },
      '/api/planner/home': (_url, init) => {
        sent.push(JSON.parse(typeof init?.body === 'string' ? init.body : '{}'));
        return jsonResponse(HOME_RESULT);
      },
    });
    renderWithQuery(<PlannerHome hidden={false} />);
    const run = screen.getByRole('button', { name: 'Run' });
    expect(run).toBeDisabled();
    expect(screen.getByText('Loading the tax tables…')).toBeInTheDocument();

    const table = await screen.findByRole('combobox', { name: 'Purchase tax table' });
    expect(run).toBeEnabled();
    await user.selectOptions(table, 'additional_home_2026');
    await user.click(screen.getByRole('checkbox', { name: /^Single home: exempt/ }));
    await user.click(run);

    const cards = await screen.findByText('First payment', { selector: 'dt' });
    expect(cards.parentElement).toHaveTextContent('₪3,636');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      purchase: { tax_brackets: TAX_PRESETS.purchase[1]?.brackets },
      sale: { betterment: { rate_pct: 25, single_home: false, ceiling: 5_008_000 } },
    });
    expect(screen.getByText(/^Changed: save it/)).toBeInTheDocument();
    expect(screen.getByText('After the last published CPI it is held flat')).toBeVisible();
    const schedule = screen.getByRole('table', { name: 'Mortgage schedule' });
    expect(within(schedule).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('Yearly return, real').parentElement).toHaveTextContent('—');
  });

  it('shows why a plan cannot run and drops the earlier results', async () => {
    const user = userEvent.setup();
    let fail = false;
    stubApi({
      '/api/planner/tax-presets': { body: TAX_PRESETS },
      '/api/planner/home': () =>
        fail
          ? jsonResponse({ detail: 'The equity cannot exceed the price', status: 422 }, 422)
          : jsonResponse(HOME_RESULT),
    });
    renderWithQuery(<PlannerHome hidden={false} />);
    await screen.findByRole('combobox', { name: 'Purchase tax table' });
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByRole('table', { name: 'Mortgage tracks' });
    fail = true;
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The equity cannot exceed');
    expect(screen.queryByRole('table', { name: 'Mortgage tracks' })).not.toBeInTheDocument();
  });

  it('never runs without the tax tables', async () => {
    stubApi({ '/api/planner/tax-presets': { status: 503, body: { detail: 'down' } } });
    renderWithQuery(<PlannerHome hidden={false} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
  });
});
