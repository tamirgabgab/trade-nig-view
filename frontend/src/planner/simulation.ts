import type { SimulateRequest } from '../api/planner.ts';

/** The settings of a simulation (percentages in %, money in shekels). */
export interface SimulationSettings {
  method: NonNullable<SimulateRequest['method']>;
  runs: number;
  blockMonths: number;
  /** Take the modelled market's mean and volatility from the mix's history. */
  estimate: boolean;
  mean: number;
  sd: number;
  correlation: number;
  /** Monthly net income on the first day; 0: the payment stress is not checked. */
  income: number;
  stressShare: number;
}

export const DEFAULT_SIMULATION: SimulationSettings = {
  method: 'bootstrap',
  runs: 1000,
  blockMonths: 12,
  estimate: true,
  mean: 7,
  sd: 16,
  correlation: 0,
  income: 0,
  stressShare: 40,
};

/** The part of a simulation's request these settings stand for. */
export function toSimulation(settings: SimulationSettings, followRates: boolean) {
  const modelled = settings.method === 'monte_carlo';
  return {
    method: settings.method,
    runs: Math.round(settings.runs),
    seed: 1,
    block_months: Math.round(settings.blockMonths),
    market_mean_pct: modelled && !settings.estimate ? settings.mean : null,
    market_sd_pct: modelled && !settings.estimate ? settings.sd : null,
    correlation: modelled ? settings.correlation : 0,
    follow_rates: followRates,
    income: settings.income > 0 ? settings.income : null,
    stress_share_pct: settings.stressShare,
    risk_aversion: 2,
  } satisfies Partial<SimulateRequest>;
}
