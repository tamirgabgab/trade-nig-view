import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useChartStore } from '../store/chartStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { jsonResponse, renderWithQuery, stubApi, SYMBOLS } from '../test/render.tsx';
import { SyntheticSymbolDialog } from './SyntheticSymbolDialog.tsx';

const STORED = {
  symbol: 'SYN:WALK',
  revision: 3,
  last_date: '2018-11-01',
  definition: {
    kind: 'scenario',
    name: 'WALK',
    full_name: 'Random walk, seed 7',
    scenario: 'random_walk',
    seed: 7,
    first_date: '2015-01-02',
    first_price: 50,
    bars: 1000,
    currency: 'ILS',
  },
};
const REFERENCES = {
  layouts: ['Chart'],
  compared_in: [],
  watchlists: ['W'],
  drawings: 2,
  scenarios: [],
};

const PARAMETRIC = {
  kind: 'parametric',
  name: 'STAT',
  full_name: 'Skewed',
  seed: 3,
  first_date: '2015-01-02',
  first_price: 100,
  bars: 1000,
  currency: 'USD',
  mean_pct: 7,
  vol_pct: 18,
  distribution: 'skew_normal',
  df: 5,
  skew: -2,
  exact: false,
  memory: 0,
  jumps_per_year: 0,
  jump_mean_pct: -5,
  jump_sd_pct: 5,
  garch_alpha: 0,
  garch_beta: 0,
};
const PREVIEW = {
  edges: [-0.02, -0.01, 0, 0.01, 0.02],
  counts: [10, 400, 480, 9],
  curve_x: [-0.02, 0, 0.02],
  curve_counts: [5, 450, 5],
  mean_pct: 6.8,
  vol_pct: 18.2,
  skewness: 0.01,
  excess_kurtosis: 4.2,
  family_skewness: 0,
  family_excess_kurtosis: null,
  floored: 0,
};

const SEQUENCE = {
  total_return_pct: 250.0,
  max_drawdown_pct: -45.2,
  worst_year: 2008,
  worst_year_pct: -38.1,
  longest_losing_streak: 9,
};
const SHUFFLE_PREVIEW = {
  start: '2001-12-24',
  end: '2026-11-20',
  bars: 6500,
  blocks: 310,
  dates: ['2001-12-24', '2014-06-02', '2026-11-20'],
  source_close: [1.2, 20, 23.5],
  copy_close: [1.2, 6, 23.5],
  source_measures: SEQUENCE,
  copy_measures: { ...SEQUENCE, max_drawdown_pct: -61.7, worst_year: 2011 },
};

let calls: { method: string; path: string; body: unknown }[] = [];

function api(putStatus = 200) {
  calls = [];
  stubApi({
    '/api/synthetic/SYN%3AWALK': (url, init) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, path: url.pathname, body: init?.body ?? null });
      if (method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }));
      return jsonResponse(STORED);
    },
    '/api/synthetic/SYN%3AWALK/references': { body: REFERENCES },
    '/api/symbols': { body: SYMBOLS },
    '/api/synthetic/shuffle/preview': (url, init) => {
      calls.push({ method: 'POST', path: url.pathname, body: init?.body ?? null });
      return jsonResponse(SHUFFLE_PREVIEW);
    },
    '/api/synthetic/preview': (url, init) => {
      calls.push({ method: 'POST', path: url.pathname, body: init?.body ?? null });
      return jsonResponse(PREVIEW);
    },
    '/api/synthetic/SYN%3ANEW1': (url, init) => {
      calls.push({ method: init?.method ?? 'GET', path: url.pathname, body: init?.body ?? null });
      return putStatus === 200
        ? jsonResponse({ ...STORED, symbol: 'SYN:NEW1', revision: 1 })
        : jsonResponse(
            { detail: 'taken', code: 'revision_conflict', title: 'Conflict', status: putStatus },
            putStatus,
          );
    },
  });
}

beforeEach(() => {
  useChartStore.setState(useChartStore.getInitialState());
  useUiStore.setState(useUiStore.getInitialState());
});

describe('SyntheticSymbolDialog', () => {
  it('creates a symbol and opens the chart on it', async () => {
    api();
    const user = userEvent.setup();
    renderWithQuery(<SyntheticSymbolDialog />);
    useUiStore.getState().openModal('synthetic', '');
    const dialog = await screen.findByRole('dialog', { name: 'New synthetic symbol' });

    await user.type(within(dialog).getByLabelText('Name'), 'new1');
    await user.type(within(dialog).getByLabelText('Full name'), 'My walk');
    await user.click(within(dialog).getByRole('button', { name: 'Create symbol' }));

    await vi.waitFor(() => {
      expect(useChartStore.getState().symbol).toBe('SYN:NEW1');
    });
    const put = calls.find((c) => c.method === 'PUT');
    const body = JSON.parse(String(put?.body)) as {
      revision: number;
      definition: Record<string, unknown>;
    };
    expect(body.revision).toBe(0);
    expect(body.definition).toMatchObject({
      kind: 'scenario',
      name: 'NEW1',
      full_name: 'My walk',
      scenario: 'random_walk',
      bars: 2500,
      currency: 'ILS',
    });
    expect(useUiStore.getState().modal).toBeNull();
  });

  it('checks the name before sending, and says when it is taken', async () => {
    api(409);
    const user = userEvent.setup();
    renderWithQuery(<SyntheticSymbolDialog />);
    useUiStore.getState().openModal('synthetic', '');
    const dialog = await screen.findByRole('dialog', { name: 'New synthetic symbol' });
    await user.type(within(dialog).getByLabelText('Full name'), 'x');

    await user.type(within(dialog).getByLabelText('Name'), '1a');
    await user.click(within(dialog).getByRole('button', { name: 'Create symbol' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/starting with a letter/);
    expect(calls).toHaveLength(0);

    await user.clear(within(dialog).getByLabelText('Name'));
    await user.type(within(dialog).getByLabelText('Name'), 'new1');
    await user.click(within(dialog).getByRole('button', { name: 'Create symbol' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'SYN:NEW1 exists already: choose another name.',
    );
  });

  it('edits in place: the name stays, what points at it is listed', async () => {
    api();
    const user = userEvent.setup();
    renderWithQuery(<SyntheticSymbolDialog />);
    useUiStore.getState().openModal('synthetic', 'SYN:WALK');
    const dialog = await screen.findByRole('dialog', { name: 'Edit SYN:WALK' });

    const name = await within(dialog).findByLabelText('Name');
    expect(name).toHaveValue('WALK');
    expect(name).toHaveAttribute('readonly');
    expect(await within(dialog).findByRole('note')).toHaveTextContent(
      'Saving changes its bars everywhere it is used: layout Chart; watchlist W; 2 drawings.',
    );
    await user.clear(within(dialog).getByLabelText('Seed'));
    await user.type(within(dialog).getByLabelText('Seed'), '8');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => {
      expect(calls.some((c) => c.method === 'PUT')).toBe(true);
    });
    const body = JSON.parse(String(calls.find((c) => c.method === 'PUT')?.body)) as {
      revision: number;
      definition: { seed: number; name: string };
    };
    expect(body.revision).toBe(3);
    expect(body.definition).toMatchObject({ seed: 8, name: 'WALK' });
  });

  it('saves a copy under a new name', async () => {
    api();
    const user = userEvent.setup();
    renderWithQuery(<SyntheticSymbolDialog />);
    useUiStore.getState().openModal('synthetic', 'SYN:WALK');
    const dialog = await screen.findByRole('dialog', { name: 'Edit SYN:WALK' });
    await user.click(await within(dialog).findByRole('button', { name: 'Save as copy…' }));
    const name = within(dialog).getByLabelText('Name');
    expect(name).toHaveValue('');
    expect(name).not.toHaveAttribute('readonly');
    await user.type(name, 'new1');
    await user.click(within(dialog).getByRole('button', { name: 'Save copy' }));
    await vi.waitFor(() => {
      expect(useChartStore.getState().symbol).toBe('SYN:NEW1');
    });
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.path).toBe('/api/synthetic/SYN%3ANEW1');
    expect(JSON.parse(String(put?.body))).toMatchObject({
      revision: 0,
      definition: { name: 'NEW1', seed: 7, first_date: '2015-01-02' },
    });
  });

  it('deletes after a confirmation, and the chart leaves the deleted symbol', async () => {
    api();
    useChartStore.setState({ symbol: 'SYN:WALK', compare: [] });
    const user = userEvent.setup();
    renderWithQuery(<SyntheticSymbolDialog />);
    useUiStore.getState().openModal('syntheticDelete', 'SYN:WALK');
    const dialog = await screen.findByRole('dialog', { name: 'Edit SYN:WALK' });
    expect(
      await within(dialog).findByText(/Points at it: layout Chart; watchlist W; 2 drawings/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete SYN:WALK' }));

    await vi.waitFor(() => {
      expect(useChartStore.getState().symbol).toBe('AAPL');
    });
    expect(calls.find((c) => c.method === 'DELETE')?.path).toBe('/api/synthetic/SYN%3AWALK');
  });

  it('keeps Delete off until it knows what points at it, and says when it cannot know', async () => {
    let answer: (response: Response) => void = () => undefined;
    stubApi({
      '/api/synthetic/SYN%3AWALK': { body: STORED },
      '/api/synthetic/SYN%3AWALK/references': () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    });
    renderWithQuery(<SyntheticSymbolDialog />);
    useUiStore.getState().openModal('syntheticDelete', 'SYN:WALK');
    const dialog = await screen.findByRole('dialog', { name: 'Edit SYN:WALK' });
    expect(await within(dialog).findByText(/Checking what points at it/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Delete SYN:WALK' })).toBeDisabled();

    answer(new Response('{"detail":"boom"}', { status: 500 }));
    expect(await within(dialog).findByText(/What points at it is not known/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Delete SYN:WALK' })).toBeEnabled();
  });

  it('starts an edit from what is stored now, not from an earlier visit', async () => {
    let seed = 7;
    stubApi({
      '/api/synthetic/SYN%3AWALK': () =>
        jsonResponse({ ...STORED, definition: { ...STORED.definition, seed } }),
      '/api/synthetic/SYN%3AWALK/references': { body: REFERENCES },
    });
    renderWithQuery(<SyntheticSymbolDialog />);
    useUiStore.getState().openModal('synthetic', 'SYN:WALK');
    let dialog = await screen.findByRole('dialog', { name: 'Edit SYN:WALK' });
    expect(await within(dialog).findByLabelText('Seed')).toHaveValue(7);
    useUiStore.getState().closeModal('synthetic');
    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    seed = 8; // saved meanwhile
    useUiStore.getState().openModal('synthetic', 'SYN:WALK');
    dialog = await screen.findByRole('dialog', { name: 'Edit SYN:WALK' });
    expect(await within(dialog).findByLabelText('Seed')).toHaveValue(8);
  });

  it('creates a dwelling-price symbol: its own fields, a causal one with its lag', async () => {
    api();
    const user = userEvent.setup();
    renderWithQuery(<SyntheticSymbolDialog />);
    useUiStore.getState().openModal('synthetic', '');
    const dialog = await screen.findByRole('dialog', { name: 'New synthetic symbol' });
    await user.type(within(dialog).getByLabelText('Name', { exact: true }), 'new1');
    await user.type(within(dialog).getByLabelText('Full name'), 'Tel Aviv homes');
    await user.selectOptions(within(dialog).getByLabelText('Kind'), 'dwelling');
    expect(within(dialog).queryByLabelText('Bars (days)')).toBeNull();
    expect(within(dialog).queryByLabelText('Publication lag (months)')).toBeNull();
    await user.selectOptions(within(dialog).getByLabelText('Index'), 'dwelling_telaviv');
    await user.selectOptions(within(dialog).getByLabelText('Between months'), 'causal');
    await user.clear(within(dialog).getByLabelText('Publication lag (months)'));
    await user.type(within(dialog).getByLabelText('Publication lag (months)'), '3');
    // The name and the full name typed under the other kind are kept.
    expect(within(dialog).getByLabelText('Name', { exact: true })).toHaveValue('NEW1');
    await user.click(within(dialog).getByRole('button', { name: 'Create symbol' }));

    await vi.waitFor(() => {
      expect(useChartStore.getState().symbol).toBe('SYN:NEW1');
    });
    const put = calls.find((c) => c.method === 'PUT');
    expect(JSON.parse(String(put?.body))).toMatchObject({
      revision: 0,
      definition: {
        kind: 'dwelling',
        name: 'NEW1',
        full_name: 'Tel Aviv homes',
        series: 'dwelling_telaviv',
        noise_pct: 0.2,
        causal: true,
        lag_months: 3,
        first_price: 100,
      },
    });
  });

  it("creates a parametric symbol: its statistics, the family's own field, a preview", async () => {
    api();
    const user = userEvent.setup();
    renderWithQuery(<SyntheticSymbolDialog />);
    useUiStore.getState().openModal('synthetic', '');
    const dialog = await screen.findByRole('dialog', { name: 'New synthetic symbol' });
    await user.type(within(dialog).getByLabelText('Name', { exact: true }), 'new1');
    await user.type(within(dialog).getByLabelText('Full name'), 'Fat tails');
    await user.clear(within(dialog).getByLabelText('Bars (days)'));
    await user.type(within(dialog).getByLabelText('Bars (days)'), '1000');
    await user.selectOptions(within(dialog).getByLabelText('Kind'), 'parametric');
    // The length typed under the lab scenario is kept.
    expect(within(dialog).getByLabelText('Bars (days)')).toHaveValue(1000);
    expect(within(dialog).getByLabelText('Expected return (% a year)')).toHaveValue(7);
    expect(within(dialog).queryByLabelText('Degrees of freedom ν')).toBeNull();
    await user.selectOptions(within(dialog).getByLabelText('Distribution'), 'student_t');
    await user.clear(within(dialog).getByLabelText('Degrees of freedom ν'));
    await user.type(within(dialog).getByLabelText('Degrees of freedom ν'), '4');
    await user.selectOptions(within(dialog).getByLabelText('Mean and σ'), 'exact');
    await user.click(within(dialog).getByText('Layers: memory, jumps, GARCH'));
    await user.clear(within(dialog).getByLabelText('Jumps a year λ'));
    await user.type(within(dialog).getByLabelText('Jumps a year λ'), '2');

    const preview = await within(dialog).findByRole('region', { name: 'Preview' });
    expect(within(preview).getByRole('img')).toBeInTheDocument();
    expect(within(preview).getByRole('row', { name: /Excess kurtosis/ })).toHaveTextContent('∞');
    await vi.waitFor(() => {
      const previews = calls.filter((c) => c.path === '/api/synthetic/preview');
      expect(JSON.parse(String(previews.at(-1)?.body))).toMatchObject({
        distribution: 'student_t',
        df: 4,
        bars: 1000,
      });
    });
    // A statistic out of range: no preview, and why.
    await user.clear(within(dialog).getByLabelText('Volatility σ (% a year)'));
    await user.type(within(dialog).getByLabelText('Volatility σ (% a year)'), '0');
    expect(within(dialog).queryByRole('region', { name: 'Preview' })).toBeNull();
    expect(within(dialog).getByText(/No preview: Volatility/)).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Volatility σ (% a year)'));
    await user.type(within(dialog).getByLabelText('Volatility σ (% a year)'), '25');
    await user.click(within(dialog).getByRole('button', { name: 'Create symbol' }));

    await vi.waitFor(() => {
      expect(useChartStore.getState().symbol).toBe('SYN:NEW1');
    });
    const put = calls.find((c) => c.method === 'PUT');
    expect(JSON.parse(String(put?.body))).toMatchObject({
      revision: 0,
      definition: {
        kind: 'parametric',
        name: 'NEW1',
        full_name: 'Fat tails',
        bars: 1000,
        mean_pct: 7,
        vol_pct: 25,
        distribution: 'student_t',
        df: 4,
        exact: true,
        jumps_per_year: 2,
        garch_alpha: 0,
      },
    });
  });

  it('keeps the layers open while one is retyped, and a hidden family field valid', async () => {
    api();
    const user = userEvent.setup();
    renderWithQuery(<SyntheticSymbolDialog />);
    useUiStore.getState().openModal('synthetic', '');
    const dialog = await screen.findByRole('dialog', { name: 'New synthetic symbol' });
    await user.selectOptions(within(dialog).getByLabelText('Kind'), 'parametric');
    await user.click(within(dialog).getByText('Layers: memory, jumps, GARCH'));
    const jumps = within(dialog).getByLabelText('Jumps a year λ');
    await user.clear(jumps);
    await user.type(jumps, '2');
    await user.clear(jumps);
    expect(within(dialog).getByLabelText('Jumps a year λ')).toBeVisible();
    await user.type(jumps, '0');
    // ν typed out of range, then the family left: ν is hidden, so it goes back to its default.
    await user.selectOptions(
      within(dialog).getByLabelText('Distribution', { exact: true }),
      'student_t',
    );
    await user.clear(within(dialog).getByLabelText('Degrees of freedom ν'));
    expect(within(dialog).getByText(/No preview: Degrees of freedom/)).toBeInTheDocument();
    await user.selectOptions(
      within(dialog).getByLabelText('Distribution', { exact: true }),
      'normal',
    );
    expect(within(dialog).queryByText(/No preview/)).toBeNull();
    await user.selectOptions(
      within(dialog).getByLabelText('Distribution', { exact: true }),
      'student_t',
    );
    expect(within(dialog).getByLabelText('Degrees of freedom ν')).toHaveValue(5);
  });

  it('edits a stored parametric symbol from its values, its layers unfolded', async () => {
    stubApi({
      '/api/synthetic/SYN%3ASTAT': {
        body: {
          symbol: 'SYN:STAT',
          revision: 1,
          last_date: '2018-11-01',
          definition: {
            ...PARAMETRIC,
            garch_alpha: 0.05,
            garch_beta: 0.9,
          },
        },
      },
      '/api/synthetic/SYN%3ASTAT/references': { body: { ...REFERENCES, layouts: [] } },
      // A Student-t with 3 degrees of freedom or fewer has no skewness.
      '/api/synthetic/preview': { body: { ...PREVIEW, family_skewness: null } },
    });
    renderWithQuery(<SyntheticSymbolDialog />);
    useUiStore.getState().openModal('synthetic', 'SYN:STAT');
    const dialog = await screen.findByRole('dialog', { name: 'Edit SYN:STAT' });
    expect(await within(dialog).findByLabelText('Skew α')).toHaveValue(-2);
    expect(within(dialog).getByLabelText('Kind')).toHaveValue('parametric');
    expect(within(dialog).getByLabelText('GARCH β (persistence)')).toBeVisible();
    expect(within(dialog).getByLabelText('Bars (days)')).toHaveValue(1000);
    const preview = await within(dialog).findByRole('region', { name: 'Preview' });
    expect(within(preview).getByRole('row', { name: /^Skewness/ })).toHaveTextContent('none');
  });

  it('creates a shuffled copy: the range fills in, a preview, then the copy next to its source', async () => {
    api();
    const user = userEvent.setup();
    renderWithQuery(<SyntheticSymbolDialog />);
    useUiStore.getState().openModal('synthetic', '');
    const dialog = await screen.findByRole('dialog', { name: 'New synthetic symbol' });
    await user.type(within(dialog).getByLabelText('Name', { exact: true }), 'new1');
    await user.type(within(dialog).getByLabelText('Full name'), 'Apple shuffled');
    await user.selectOptions(within(dialog).getByLabelText('Kind'), 'shuffle');
    // A copy starts at its source's first price: no field for one.
    expect(within(dialog).queryByLabelText('First price')).toBeNull();
    expect(within(dialog).queryByLabelText('Bars (days)')).toBeNull();
    await user.selectOptions(within(dialog).getByLabelText('Source'), 'AAPL');
    await vi.waitFor(() => {
      expect(within(dialog).getByLabelText('From')).toHaveValue('2001-12-24');
    });
    expect(within(dialog).getByLabelText('To')).toHaveValue('2026-11-20');
    await user.clear(within(dialog).getByLabelText('Block (days)'));
    await user.type(within(dialog).getByLabelText('Block (days)'), '63');
    const preview = await within(dialog).findByRole('region', { name: 'Preview' });
    expect(within(preview).getByRole('img')).toBeInTheDocument();
    expect(within(preview).getByRole('row', { name: /Deepest drawdown/ })).toHaveTextContent(
      '-45.2 %-61.7 %',
    );
    await vi.waitFor(() => {
      const asked = calls.filter((c) => c.path === '/api/synthetic/shuffle/preview');
      expect(JSON.parse(String(asked.at(-1)?.body))).toMatchObject({
        source: 'AAPL',
        start: '2001-12-24',
        block_days: 63,
      });
    });
    await user.click(within(dialog).getByRole('button', { name: 'Create symbol' }));

    await vi.waitFor(() => {
      expect(useChartStore.getState().symbol).toBe('SYN:NEW1');
    });
    expect(useChartStore.getState().compare).toEqual(['AAPL']);
    const put = calls.find((c) => c.method === 'PUT');
    const sent = JSON.parse(String(put?.body)) as { definition: Record<string, unknown> };
    expect(sent.definition).toMatchObject({
      kind: 'shuffle',
      name: 'NEW1',
      source: 'AAPL',
      start: '2001-12-24',
      end: '2026-11-20',
      block_days: 63,
    });
    expect(sent.definition).not.toHaveProperty('first_price');
  });

  it('edits a stored copy from its values, and blocks a range that ends today', async () => {
    stubApi({
      '/api/symbols': { body: SYMBOLS },
      '/api/synthetic/SYN%3ACP': {
        body: {
          symbol: 'SYN:CP',
          revision: 1,
          last_date: '2019-12-31',
          definition: {
            kind: 'shuffle',
            name: 'CP',
            full_name: 'Copy',
            source: 'AAPL',
            start: '2010-01-04',
            end: '2019-12-31',
            block_days: 21,
            seed: 4,
            currency: 'USD',
            has_volume: true,
            decimals: 2,
          },
        },
      },
      '/api/synthetic/SYN%3ACP/references': { body: { ...REFERENCES, layouts: [] } },
      '/api/synthetic/shuffle/preview': { body: SHUFFLE_PREVIEW },
    });
    const user = userEvent.setup();
    renderWithQuery(<SyntheticSymbolDialog />);
    useUiStore.getState().openModal('synthetic', 'SYN:CP');
    const dialog = await screen.findByRole('dialog', { name: 'Edit SYN:CP' });
    expect(await within(dialog).findByLabelText('Source')).toHaveValue('AAPL');
    expect(within(dialog).getByLabelText('From')).toHaveValue('2010-01-04');
    expect(within(dialog).getByLabelText('Block (days)')).toHaveValue(21);
    await user.clear(within(dialog).getByLabelText('To'));
    await user.type(within(dialog).getByLabelText('To'), new Date().toISOString().slice(0, 10));
    expect(
      within(dialog).getByText(/No preview: The last date is before today/),
    ).toBeInTheDocument();
  });

  it('reads the learn page inside the dialog and comes back to the form as it was', async () => {
    stubApi({
      '/api/learn/synthetic-symbols': {
        body: {
          slug: 'synthetic-symbols',
          markdown:
            '# Synthetic symbols\n\nHow they are built. See [the ledger](learn:rent-or-buy).',
        },
      },
      '/api/learn/rent-or-buy': {
        body: { slug: 'rent-or-buy', markdown: '# Rent or buy\n\nThe ledger itself.' },
      },
    });
    const user = userEvent.setup();
    renderWithQuery(<SyntheticSymbolDialog />);
    useUiStore.getState().openModal('synthetic', '');
    const dialog = await screen.findByRole('dialog', { name: 'New synthetic symbol' });
    await user.type(within(dialog).getByLabelText('Full name'), 'Kept');
    await user.click(within(dialog).getByRole('button', { name: 'How it is built' }));
    expect(await within(dialog).findByText(/How they are built/)).toBeInTheDocument();
    // A link to another learn page shows it here, not in the drawer under the dialog.
    await user.click(within(dialog).getByRole('link', { name: 'the ledger' }));
    expect(await within(dialog).findByText('The ledger itself.')).toBeInTheDocument();
    expect(useUiStore.getState().learnFor).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Back to the form' }));
    expect(within(dialog).getByLabelText('Full name')).toHaveValue('Kept');
  });
});
