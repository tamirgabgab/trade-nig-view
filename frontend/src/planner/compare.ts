import type { BettermentSpec, ScenarioRequest, TaxBracket } from '../api/planner.ts';
import { toHomeRequest, type HomeForm } from '../store/plannerHomeStore.ts';
import { toRequest, type PlannerForm } from '../store/plannerStore.ts';

/**
 * The comparison of the two tabs: the Apartment tab's apartment (x) against the same money in
 * the Market tab's mix (y). With `ownAccount` the apartment's side also makes the Market tab's
 * deposits, and the market side mirrors those too.
 */
export function toScenario(
  form: PlannerForm,
  home: HomeForm,
  taxes: { purchase: TaxBracket[]; betterment: BettermentSpec },
  ownAccount: boolean,
  /** Off the apartment's value in a forced sale, in %. */
  forcedDiscount = 10,
): ScenarioRequest {
  const { end, inflation, ...apartment } = toHomeRequest(home, form.inflation, taxes);
  const market = toRequest(form);
  const mix = {
    assets: market.assets,
    use_fx: market.use_fx,
    fees: market.fees,
    taxes: market.taxes,
    fill: market.fill,
  };
  const deposits = { deposits: market.deposits ?? [], recurring: market.recurring ?? [] };
  return {
    x: { home: apartment, market: ownAccount ? { ...mix, ...deposits } : null },
    y: { market: mix },
    end,
    inflation,
    forced_discount_pct: forcedDiscount,
  };
}
