import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useChartStore } from '../store/chartStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { jsonResponse, renderWithQuery, stubApi } from '../test/render.tsx';
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

  it('reads the learn page inside the dialog and comes back to the form as it was', async () => {
    stubApi({
      '/api/learn/synthetic-symbols': {
        body: { slug: 'synthetic-symbols', markdown: '# Synthetic symbols\n\nHow they are built.' },
      },
    });
    const user = userEvent.setup();
    renderWithQuery(<SyntheticSymbolDialog />);
    useUiStore.getState().openModal('synthetic', '');
    const dialog = await screen.findByRole('dialog', { name: 'New synthetic symbol' });
    await user.type(within(dialog).getByLabelText('Full name'), 'Kept');
    await user.click(within(dialog).getByRole('button', { name: 'How it is built' }));
    expect(await within(dialog).findByText('How they are built.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Back to the form' }));
    expect(within(dialog).getByLabelText('Full name')).toHaveValue('Kept');
  });
});
