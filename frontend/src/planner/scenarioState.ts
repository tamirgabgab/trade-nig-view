import type { TaxPresets } from '../api/planner.ts';
import {
  homesOf,
  readHome,
  resolveTaxes,
  savedName,
  usePlannerHomeStore,
  type HomeForm,
} from '../store/plannerHomeStore.ts';
import {
  formsOf,
  isRecord,
  linked,
  readCompare,
  readContents,
  readForm,
  usePlannerStore,
  withdrawsOf,
  type CompareSettings,
  type OptionContents,
  type PlannerForm,
  type Slot,
} from '../store/plannerStore.ts';

const VERSION = 1;

/** Everything a comparison is made of, as it is saved under a name. */
export interface ScenarioState {
  version: typeof VERSION;
  /** Option B is option A (then `b` holds the same as `a`). */
  same: boolean;
  market: Record<Slot, PlannerForm>;
  home: Record<Slot, HomeForm>;
  contents: Record<Slot, OptionContents>;
  compare: CompareSettings;
}

/**
 * The planner as it stands. An apartment that names a saved tax table carries the table itself
 * (as an edit of it): a saved table can change or go later, and a scenario must not with it.
 * A built-in table is named only: its id says which year's it is.
 */
export function captureScenario(presets: TaxPresets | undefined): ScenarioState {
  const market = usePlannerStore.getState();
  const homes = usePlannerHomeStore.getState();
  const withTables = (home: HomeForm): HomeForm => {
    const taxes = resolveTaxes(home, homes.saved, presets);
    if (taxes === null) return home;
    const own = <T>(choice: HomeForm['purchaseTax' | 'betterment'], table: T) =>
      savedName(choice.preset) === null ? choice : { preset: choice.preset, edited: table };
    return {
      ...home,
      purchaseTax: own(home.purchaseTax, taxes.purchase) as HomeForm['purchaseTax'],
      betterment: own(home.betterment, taxes.betterment) as HomeForm['betterment'],
    };
  };
  const { a, b } = linked(market.same, homesOf(homes));
  return {
    version: VERSION,
    same: market.same,
    market: linked(market.same, formsOf(market)),
    home: { a: withTables(a), b: withTables(b) },
    contents: market.contents,
    compare: market.compare,
  };
}

/** A saved state, checked: it throws with a message for the page when it cannot be used. */
export function parseScenarioState(value: unknown): ScenarioState {
  const state = isRecord(value) ? value : {};
  const version = state['version'];
  if (typeof version === 'number' && version > VERSION) {
    throw new Error('This scenario was saved by a newer version of ChartLab.');
  }
  const pair = <T>(of: unknown, read: (form: unknown) => T | null): Record<Slot, T> | null => {
    const [a, b] = isRecord(of) ? [read(of['a']), read(of['b'])] : [null, null];
    return a === null || b === null ? null : { a, b };
  };
  const market = pair(state['market'], readForm);
  const home = pair(state['home'], readHome);
  if (version !== VERSION || market === null || home === null) {
    throw new Error('This is not a planner scenario.');
  }
  return {
    version: VERSION,
    same: state['same'] !== false,
    market,
    home,
    contents: readContents(state['contents']),
    compare: readCompare(state['compare']),
  };
}

/** Put a scenario into the three tabs, option A on screen. */
export function applyScenario(state: ScenarioState): void {
  usePlannerStore.setState((s) => ({
    loads: s.loads + 1,
    same: state.same,
    slot: 'a',
    // A scenario does not hold the Withdraw settings: each option keeps its own.
    withdraw: withdrawsOf(s).a,
    withdrawOther: withdrawsOf(s).b,
    form: state.market.a,
    other: state.market.b,
    contents: state.contents,
    compare: state.compare,
  }));
  usePlannerHomeStore.setState({ slot: 'a', home: state.home.a, other: state.home.b });
}
