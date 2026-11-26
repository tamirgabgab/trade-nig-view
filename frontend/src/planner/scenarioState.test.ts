import type { TaxPresets } from '../api/planner.ts';
import {
  DEFAULT_HOME,
  sanitizeHome,
  savedKey,
  usePlannerHomeStore,
} from '../store/plannerHomeStore.ts';
import { DEFAULT_FORM, sanitizePersisted, usePlannerStore } from '../store/plannerStore.ts';
import { TAX_PRESETS } from '../test/plannerHomeBody.ts';
import { applyScenario, captureScenario, parseScenarioState } from './scenarioState.ts';

const PRESETS = TAX_PRESETS as TaxPresets;
const MINE = [{ up_to: null, rate_pct: 6 }];

beforeEach(() => {
  usePlannerStore.setState({ ...sanitizePersisted(null) });
  usePlannerHomeStore.setState({ ...sanitizeHome(null) });
});

describe('a saved scenario', () => {
  it('holds both options, what each contains and the comparison’s settings', () => {
    usePlannerStore.getState().update({ end: '2030-01-01' });
    usePlannerStore.getState().setContents('b', { home: true });
    usePlannerStore.getState().setCompare({ discount: 20 });
    usePlannerHomeStore.getState().swap('b');
    usePlannerHomeStore.getState().update({ price: 3_000_000 });
    const state = captureScenario(PRESETS);
    expect(state.version).toBe(1);
    expect([state.market.a.end, state.market.b.end]).toEqual(['2030-01-01', DEFAULT_FORM.end]);
    expect([state.home.a.price, state.home.b.price]).toEqual([DEFAULT_HOME.price, 3_000_000]);
    expect(state.contents.b).toEqual({ home: true, deposits: false });
    expect(state.compare.discount).toBe(20);
  });

  it('carries its tax tables themselves, not their names', () => {
    usePlannerHomeStore.getState().savePurchaseTax('Mine', MINE);
    const state = captureScenario(PRESETS);
    // The saved table can be edited or deleted later: the scenario keeps what it was run with.
    expect(state.home.a.purchaseTax).toEqual({ preset: savedKey('Mine'), edited: MINE });
    expect(state.home.a.betterment.edited).toEqual(PRESETS.betterment[0]?.spec);
    expect(state.home.b.purchaseTax.edited).toEqual(PRESETS.purchase[0]?.brackets);
  });

  it('comes back as it was saved, through JSON, with option A in front', () => {
    usePlannerStore.getState().swap('b');
    usePlannerStore.getState().update({ useFx: false });
    usePlannerHomeStore.getState().swap('b');
    usePlannerHomeStore.getState().update({ price: 3_000_000 });
    const saved: unknown = JSON.parse(JSON.stringify(captureScenario(PRESETS)));
    usePlannerStore.setState({ ...sanitizePersisted(null) });
    usePlannerHomeStore.setState({ ...sanitizeHome(null) });

    applyScenario(parseScenarioState(saved));
    const market = usePlannerStore.getState();
    const home = usePlannerHomeStore.getState();
    expect([market.slot, home.slot]).toEqual(['a', 'a']);
    expect([market.form.useFx, market.other.useFx]).toEqual([true, false]);
    expect([home.home.price, home.other.price]).toEqual([DEFAULT_HOME.price, 3_000_000]);
  });

  it('refuses what is not a scenario of this version', () => {
    const state = captureScenario(PRESETS);
    expect(() => parseScenarioState({ ...state, version: 2 })).toThrow(/newer version/);
    expect(() => parseScenarioState({ version: 1 })).toThrow(/not a planner scenario/);
    expect(() => parseScenarioState({ ...state, market: { a: state.market.a } })).toThrow(
      /not a planner scenario/,
    );
    expect(() => parseScenarioState(null)).toThrow(/not a planner scenario/);
  });
});
