import type { BettermentSpec, ScenarioRequest, TaxBracket } from '../api/planner.ts';
import { toHomeRequest, type HomeForm } from '../store/plannerHomeStore.ts';
import {
  toRequest,
  type OptionContents,
  type PlannerForm,
  type Slot,
} from '../store/plannerStore.ts';

export interface HomeTaxes {
  purchase: TaxBracket[];
  betterment: BettermentSpec;
}

/** The two options as their tabs hold them, and what each one contains. */
export interface ComparedOptions {
  market: Record<Slot, PlannerForm>;
  home: Record<Slot, HomeForm>;
  taxes: Record<Slot, HomeTaxes>;
  contents: Record<Slot, OptionContents>;
  /** Off an apartment's value in a forced sale, in %. */
  discount: number;
}

/**
 * The comparison of option A (x) with option B (y). An option always holds its own Market tab's
 * mix, where the money it has to match is invested; its apartment and its own deposits only
 * when it contains them. Each apartment is sold on its own "Sold on"; the comparison ends on the
 * later sale (an earlier one's money waits in its option's mix), or on option A's market end
 * without an apartment. The inflation is the planner's one.
 */
export function toScenario(options: ComparedOptions): ScenarioRequest {
  const { market, home, taxes, contents, discount } = options;
  const build = (slot: Slot) => {
    const account = toRequest(market[slot]);
    const { end, inflation, ...apartment } = toHomeRequest(
      home[slot],
      market[slot].inflation,
      taxes[slot],
    );
    const option: ScenarioRequest['x'] = {
      ...(contents[slot].home ? { home: apartment, sold_on: end } : {}),
      market: {
        assets: account.assets,
        use_fx: account.use_fx,
        fees: account.fees,
        taxes: account.taxes,
        fill: account.fill,
        ...(contents[slot].deposits
          ? { deposits: account.deposits ?? [], recurring: account.recurring ?? [] }
          : {}),
      },
    };
    return { option, end: contents[slot].home ? end : null, inflation };
  };
  const [a, b] = [build('a'), build('b')];
  // 'YYYY-MM-DD' strings sort as dates.
  const sales = [a.end, b.end].filter((end): end is string => end !== null).sort();
  return {
    x: a.option,
    y: b.option,
    end: sales.at(-1) ?? market.a.end,
    inflation: a.inflation,
    forced_discount_pct: discount,
  };
}

/** What the results call the two options: by what each contains, lettered when both are alike. */
export function optionNames(contents: Record<Slot, OptionContents>): [string, string] {
  const name = ({ home, deposits }: OptionContents) =>
    home ? (deposits ? 'Apartment and account' : 'Apartment') : 'Market';
  const [a, b] = [name(contents.a), name(contents.b)];
  return a === b ? [`${a} A`, `${b} B`] : [a, b];
}
