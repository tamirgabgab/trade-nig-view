import type { WithdrawRequest, WithdrawRow } from '../api/planner.ts';
import { toRequest, type PlannerForm, type WithdrawSettings } from '../store/plannerStore.ts';

/** The request of the Withdraw tab: its settings, and the Market form's mix, fees and taxes. */
export function toWithdraw(settings: WithdrawSettings, form: PlannerForm): WithdrawRequest {
  const market = toRequest(form);
  return {
    start: settings.start,
    months: Math.round(settings.years * 12),
    capital: settings.capital,
    cost_share_pct: settings.costShare,
    rule: {
      kind: settings.rule,
      amount: settings.amount,
      indexed: settings.indexed,
      percent: settings.percent,
    },
    returns: { mode: settings.returns, yearly_pct: settings.yearly },
    market: {
      assets: market.assets,
      use_fx: market.use_fx,
      fees: market.fees,
      taxes: market.taxes,
      fill: market.fill,
    },
    inflation: market.inflation,
  };
}

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
  /** Account fees and sell commissions. */
  costs: number;
  balance: number;
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
    });
    year.months += 1;
    year.net += row.net;
    year.netReal += row.net_real;
    year.tax += row.tax;
    year.costs += row.fee + row.commission;
    year.balance = row.balance;
  }
  return years;
}
