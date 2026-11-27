import type {
  WithdrawRealization,
  WithdrawRequest,
  WithdrawRow,
  WithdrawManyRequest,
  WithdrawSimulateRequest,
} from '../api/planner.ts';
import {
  toRequest,
  type PlannerForm,
  type WithdrawHome,
  type WithdrawSettings,
} from '../store/plannerStore.ts';

/** An included apartment in the API's units. */
function toHome(home: WithdrawHome): NonNullable<WithdrawRequest['home']> {
  return {
    value: home.value,
    growth: home.growth,
    growth_pct: home.growthPct,
    use: home.use,
    rent: home.rent,
    vacancy_pct: home.vacancy,
    rent_tax_pct: home.rentTax,
    maintenance_pct: home.maintenance,
    insurance: home.insurance,
    loan: home.loan,
    loan_rate_pct: home.loanRate,
    loan_months: Math.round(home.loanYears * 12),
    loan_linked: home.loanLinked,
    role: home.role,
    sell_after_months: Math.round(home.sellAfter * 12),
    selling_pct: home.selling,
    early_repayment_pct: home.earlyRepayment,
    betterment: home.betterment,
    // Sent as typed: one without the other is refused with its reason, never dropped unsaid.
    cost: home.cost > 0 ? home.cost : null,
    bought: home.bought === '' ? null : home.bought,
  };
}

/** The request of the Withdraw tab: its settings, and the Market form's mix, fees and taxes. */
export function toWithdraw(settings: WithdrawSettings, form: PlannerForm): WithdrawRequest {
  const market = toRequest(form);
  // From the Market tab's plan: its lots are the account, from its last day on, on its own mix.
  const plan = settings.source === 'plan';
  return {
    start: plan ? form.end : settings.start,
    months: Math.round(settings.years * 12),
    capital: plan ? 0 : settings.capital,
    plan: plan ? market : null,
    cost_share_pct: settings.costShare,
    rule: {
      kind: settings.rule,
      amount: settings.amount,
      indexed: settings.indexed,
      percent: settings.percent,
    },
    returns: { mode: plan ? 'mix' : settings.returns, yearly_pct: settings.yearly },
    market: {
      assets: market.assets,
      use_fx: market.use_fx,
      fees: market.fees,
      taxes: market.taxes,
    },
    inflation: market.inflation,
    home: settings.home.include ? toHome(settings.home) : null,
  };
}

/** The plan over every start of history. */
export const toWithdrawStudy = (
  settings: WithdrawSettings,
  form: PlannerForm,
): WithdrawManyRequest => ({
  ...toWithdraw(settings, form),
  sustain_pct: settings.many.sustain,
});

/** The plan over simulated worlds. */
export function toWithdrawSimulate(
  settings: WithdrawSettings,
  form: PlannerForm,
): WithdrawSimulateRequest {
  const { many } = settings;
  const assumed = settings.returns === 'assumed';
  // A modelled market: on an assumed return the mean is that return and only the volatility is
  // typed; on the mix both are estimated from it, or both typed.
  const typed = many.method === 'monte_carlo' && (assumed || !many.estimate);
  return {
    ...toWithdraw(settings, form),
    sustain_pct: many.sustain,
    method: many.method,
    // Whole numbers for the API, whatever was typed.
    runs: Math.round(many.runs),
    seed: Math.round(many.seed),
    block_months: Math.round(many.block),
    market_mean_pct: typed && !assumed ? many.mean : null,
    market_sd_pct: typed ? many.sd : null,
  };
}

/**
 * What is left of the realizations, as the histogram shows it (shekels or a share of what there
 * was on the first day; of the first day or nominal), and how many ran out. The ones that ran
 * out are counted apart: an account that ran out holds nothing. With an apartment (`all`) they
 * still hold its worth, so they stay among the values.
 */
export function leftValues(
  realizations: readonly WithdrawRealization[],
  startWorth: number,
  unit: { percent: boolean; real: boolean; all?: boolean },
): { values: number[]; ranOut: number } {
  const lasted = realizations.filter((r) => r.depleted_month === null);
  const scale = unit.percent ? startWorth : 1;
  return {
    values: (unit.all ? realizations : lasted).map(
      (r) => (unit.real ? r.left_real : r.left) / scale,
    ),
    ranOut: realizations.length - lasted.length,
  };
}

/** A plan's rule in words: `₪4,000 a month, net` or `5% of the account a year`. */
export const ruleLabel = (settings: WithdrawSettings) =>
  settings.rule === 'fixed'
    ? `₪${settings.amount.toLocaleString('en-US')} a month, net`
    : `${String(settings.percent)}% of the account a year`;

/** A form's mix in words: `SPY 60%, QQQ 40%`, the shares as the request will carry them. */
export function mixLabel(form: PlannerForm): string {
  const assets = toRequest(form).assets;
  const total = assets.reduce((sum, asset) => sum + asset.weight, 0) || 1;
  return assets
    .map((a) => `${a.symbol} ${String(Math.round((a.weight / total) * 100))}%`)
    .join(', ');
}

/** A year of the plan: its months added up, and the balance at its end. */
export interface WithdrawYear {
  year: number;
  months: number;
  net: number;
  netReal: number;
  tax: number;
  /** Account fees and commissions. */
  costs: number;
  balance: number;
  /** The apartment's cash in the year, and its worth at the year's end (0 once sold). */
  homeCash: number;
  home: number;
}

/** The monthly rows by year of the plan (the start row has no month of its own). */
export function byYear(rows: readonly WithdrawRow[]): WithdrawYear[] {
  const years: WithdrawYear[] = [];
  for (const row of rows) {
    if (row.month === 0) continue;
    const index = Math.floor((row.month - 1) / 12);
    const year = (years[index] ??= {
      year: index + 1,
      months: 0,
      net: 0,
      netReal: 0,
      tax: 0,
      costs: 0,
      balance: 0,
      homeCash: 0,
      home: 0,
    });
    year.months += 1;
    year.net += row.net;
    year.netReal += row.net_real;
    year.tax += row.tax;
    year.costs += row.fee + row.commission;
    year.balance = row.balance;
    year.homeCash += row.home_cash;
    year.home = row.home;
  }
  return years;
}
