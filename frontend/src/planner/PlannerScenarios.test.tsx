import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { TaxPresets } from '../api/planner.ts';
import { sanitizeHome, usePlannerHomeStore } from '../store/plannerHomeStore.ts';
import { sanitizePersisted, usePlannerStore } from '../store/plannerStore.ts';
import { TAX_PRESETS } from '../test/plannerHomeBody.ts';
import { jsonResponse, renderWithQuery, stubApi } from '../test/render.tsx';
import { PlannerScenarios } from './PlannerScenarios.tsx';
import { captureScenario } from './scenarioState.ts';

const PRESETS = TAX_PRESETS as TaxPresets;
const URL = '/api/planner/scenarios';
const body = (init: RequestInit | undefined): Record<string, unknown> =>
  JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>;

beforeEach(() => {
  usePlannerStore.setState({ ...sanitizePersisted(null) });
  usePlannerHomeStore.setState({ ...sanitizeHome(null) });
});

/** A backend with the scenarios in `saved`, recording what is sent to it. */
function backend(saved: Record<string, { revision: number; state: unknown }>) {
  const calls: [string, string, unknown][] = [];
  const doc = (name: string) => ({ name, updated_at: '2026-11-26T10:00:00Z', ...saved[name] });
  const one = (name: string) => (_url: URL, init: RequestInit | undefined) => {
    const method = init?.method ?? 'GET';
    calls.push([method, name, method === 'PUT' ? body(init) : _url.search]);
    if (method === 'DELETE') {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- a test double
      delete saved[name];
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (method === 'PUT') {
      const sent = body(init);
      saved[name] = { revision: (saved[name]?.revision ?? 0) + 1, state: sent['state'] };
    }
    return jsonResponse(doc(name));
  };
  stubApi({
    '/api/planner/tax-presets': { body: TAX_PRESETS },
    [URL]: () =>
      jsonResponse({
        scenarios: Object.keys(saved).map((name) => ({
          name,
          revision: saved[name]?.revision,
          updated_at: '2026-11-26T10:00:00Z',
        })),
      }),
    [`${URL}/Haifa`]: one('Haifa'),
    [`${URL}/New%20one`]: one('New one'),
  });
  return calls;
}

describe('PlannerScenarios', () => {
  it('saves the planner under a new name and lists it', async () => {
    const user = userEvent.setup();
    const calls = backend({});
    renderWithQuery(<PlannerScenarios />);
    expect(await screen.findByText('No saved scenario yet.')).toBeVisible();
    const save = screen.getByRole('button', { name: 'Save scenario' });
    expect(save).toBeDisabled(); // nothing to save it under yet
    usePlannerStore.getState().update({ end: '2030-01-01' });
    // A name the backend cannot keep is refused here, with the reason.
    const field = screen.getByRole('textbox', { name: 'Scenario name' });
    await user.type(field, 'a/b');
    await user.click(save);
    expect(screen.getByRole('alert')).toHaveTextContent('without "/"');
    expect(calls).toEqual([]);
    await user.clear(field);
    await user.type(field, 'New one');
    await user.click(save);
    const picker = await screen.findByRole('combobox', { name: 'Saved scenario' });
    expect(within(picker).getByRole('option', { name: 'New one' })).toBeInTheDocument();
    const [method, name, sent] = calls.at(-1) ?? [];
    expect([method, name]).toEqual(['PUT', 'New one']);
    expect(sent).toMatchObject({
      revision: 0,
      state: { version: 1, market: { a: { end: '2030-01-01' } } },
    });
    expect(screen.getByRole('status')).toHaveTextContent('Saved “New one”');
    // Enter in the name field saves too (it would submit the Compare form around it).
    await user.type(field, '{Enter}');
    await vi.waitFor(() => {
      expect(calls).toHaveLength(2);
    });
    expect(calls.at(-1)?.[2]).toMatchObject({ revision: 1 });
  });

  it('replaces a scenario of the same name, from the revision it read', async () => {
    const user = userEvent.setup();
    const calls = backend({ Haifa: { revision: 3, state: captureScenario(PRESETS) } });
    renderWithQuery(<PlannerScenarios />);
    await screen.findByRole('option', { name: 'Haifa' });
    await user.type(screen.getByRole('textbox', { name: 'Scenario name' }), 'Haifa');
    // The button says what it will do to the one that is there.
    await user.click(screen.getByRole('button', { name: 'Replace “Haifa”' }));
    await screen.findByText('Saved “Haifa”');
    expect(calls.at(-1)?.[2]).toMatchObject({ revision: 3 });
  });

  it('loads a scenario into both tabs', async () => {
    const user = userEvent.setup();
    usePlannerStore.getState().update({ end: '2033-03-03' });
    usePlannerHomeStore.getState().update({ price: 4_444_444 });
    const state = captureScenario(PRESETS);
    usePlannerStore.setState({ ...sanitizePersisted(null) });
    usePlannerHomeStore.setState({ ...sanitizeHome(null) });
    backend({ Haifa: { revision: 1, state } });
    renderWithQuery(<PlannerScenarios />);
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Saved scenario' }),
      'Haifa',
    );
    await user.click(screen.getByRole('button', { name: 'Load scenario' }));
    await screen.findByText('Loaded “Haifa”');
    expect(usePlannerStore.getState().form.end).toBe('2033-03-03');
    expect(usePlannerHomeStore.getState().home.price).toBe(4_444_444);
    // Its name is ready for saving it again after a change.
    expect(screen.getByRole('textbox', { name: 'Scenario name' })).toHaveValue('Haifa');
  });

  it('deletes only after the name is confirmed, and says why a load failed', async () => {
    const user = userEvent.setup();
    const calls = backend({ Haifa: { revision: 2, state: { version: 9 } } });
    renderWithQuery(<PlannerScenarios />);
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Saved scenario' }),
      'Haifa',
    );
    await user.click(screen.getByRole('button', { name: 'Load scenario' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/newer version/);

    await user.click(screen.getByRole('button', { name: 'Delete scenario' }));
    expect(calls.some(([method]) => method === 'DELETE')).toBe(false);
    expect(screen.getByRole('button', { name: 'Delete “Haifa”' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('button', { name: 'Delete “Haifa”' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete scenario' }));
    await user.click(screen.getByRole('button', { name: 'Delete “Haifa”' }));
    expect(await screen.findByText('No saved scenario yet.')).toBeVisible();
    expect(calls.at(-1)).toEqual(['DELETE', 'Haifa', '?revision=2']);
  });
});
