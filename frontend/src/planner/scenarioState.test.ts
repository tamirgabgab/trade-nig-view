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
  usePlannerStore.setState({ ...sanitizePersisted(null), same: false });
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
    expect([state.version, state.same]).toEqual([1, false]);
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
    // A built-in table is named only, so a loaded scenario does not read as changed.
    expect(state.home.a.betterment).toEqual(DEFAULT_HOME.betterment);
    expect(state.home.b.purchaseTax).toEqual(DEFAULT_HOME.purchaseTax);
    const edited = { preset: 'single_home_2026', edited: MINE };
    usePlannerHomeStore.getState().update({ purchaseTax: edited });
    expect(captureScenario(PRESETS).home.a.purchaseTax).toEqual(edited);
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
    expect([market.same, market.slot, home.slot]).toEqual([false, 'a', 'a']);
    expect([market.form.useFx, market.other.useFx]).toEqual([true, false]);
    expect([home.home.price, home.other.price]).toEqual([DEFAULT_HOME.price, 3_000_000]);
  });

  it('holds option A twice while option B is the same as it', () => {
    usePlannerStore.setState({ same: true, other: { ...DEFAULT_FORM, useFx: false } });
    usePlannerHomeStore.setState({ other: { ...DEFAULT_HOME, price: 3_000_000 } });
    const state = captureScenario(PRESETS);
    expect([state.same, state.market.b.useFx, state.home.b.price]).toEqual([
      true,
      true,
      DEFAULT_HOME.price,
    ]);
    usePlannerStore.setState({ same: false });
    applyScenario(parseScenarioState(JSON.parse(JSON.stringify(state))));
    expect(usePlannerStore.getState().same).toBe(true);
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
