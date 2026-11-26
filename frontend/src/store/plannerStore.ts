import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { MarketRequest } from '../api/planner.ts';

type Fill = NonNullable<MarketRequest['fill']>;
type Taxes = NonNullable<MarketRequest['taxes']>;
type Inflation = NonNullable<MarketRequest['inflation']>;

export interface PlannerAsset {
  symbol: string;
  weight: number;
  currency: 'USD' | 'ILS';
  /** Assumed yearly dividend yield in %, for price-only series. */
  dividendYield: number;
}

export interface PlannerDeposit {
  date: string;
  amount: number;
  /** 'HH:MM' local time of the purchase, or '' when unknown. */
  time: string;
}

export interface PlannerRecurring {
  start: string;
  amount: number;
  everyMonths: number;
  count: number;
  indexed: boolean;
}

/** The market side's inputs (percentages in %, money in shekels). */
export interface PlannerForm {
  assets: PlannerAsset[];
  useFx: boolean;
  deposits: PlannerDeposit[];
  recurring: PlannerRecurring[];
  end: string;
  fees: { deposit: number; buy: number; sell: number; management: number; monthly: number };
  taxes: { gains: number; dividend: number; base: NonNullable<Taxes['base']> };
  fill: {
    mode: NonNullable<Fill['mode']>;
    granularity: NonNullable<Fill['granularity']>;
    random: boolean;
  };
  inflation: {
    mode: NonNullable<Inflation['mode']>;
    mean: number;
    sd: number;
    persistence: number;
    random: boolean;
  };
}

export const DEFAULT_FORM: PlannerForm = {
  assets: [{ symbol: 'SPY', weight: 100, currency: 'USD', dividendYield: 0 }],
  useFx: true,
  deposits: [{ date: '2015-01-02', amount: 10_000, time: '' }],
  recurring: [{ start: '2015-02-01', amount: 1500, everyMonths: 1, count: 119, indexed: false }],
  end: '2025-01-02',
  fees: { deposit: 0, buy: 0, sell: 0, management: 0, monthly: 0 },
  taxes: { gains: 25, dividend: 25, base: 'nominal' },
  fill: { mode: 'close', granularity: 'medium', random: false },
  inflation: { mode: 'assumed', mean: 2.5, sd: 0, persistence: 0, random: false },
};

/** The seed of "draw at random": fixed, so a run can be repeated. */
const SEED = 1;
/** Deposit times are typed in Israel time. */
const DEPOSIT_TIME_ZONE = 'Asia/Jerusalem';

/** The API request of a form (rows without a ticker or an amount are left out). */
export function toRequest(form: PlannerForm): MarketRequest {
  return {
    assets: form.assets
      .filter((a) => a.symbol.trim() !== '')
      .map((a) => ({
        symbol: a.symbol.trim().toUpperCase(),
        weight: a.weight,
        currency: a.currency,
        dividend_yield_pct: a.dividendYield,
      })),
    use_fx: form.useFx,
    timezone: DEPOSIT_TIME_ZONE,
    deposits: form.deposits
      .filter((d) => d.date !== '' && d.amount > 0)
      .map((d) => ({ date: d.date, amount: d.amount, time: d.time === '' ? null : d.time })),
    recurring: form.recurring
      .filter((r) => r.start !== '' && r.amount > 0)
      .map((r) => ({
        start: r.start,
        amount: r.amount,
        every_months: r.everyMonths,
        count: r.count,
        indexed: r.indexed,
      })),
    end: form.end,
    fees: {
      deposit_pct: form.fees.deposit,
      buy_pct: form.fees.buy,
      sell_pct: form.fees.sell,
      management_pct: form.fees.management,
      monthly_fee: form.fees.monthly,
    },
    taxes: {
      gains_pct: form.taxes.gains,
      dividend_pct: form.taxes.dividend,
      base: form.taxes.base,
    },
    fill: {
      mode: form.fill.mode,
      granularity: form.fill.granularity,
      seed: form.fill.random ? SEED : null,
    },
    inflation: {
      mode: form.inflation.mode,
      mean_pct: form.inflation.mean,
      sd_pct: form.inflation.sd,
      persistence: form.inflation.persistence,
      seed: form.inflation.random ? SEED : null,
    },
  };
}

interface PlannerState {
  form: PlannerForm;
  /** Replace part of the form. */
  update: (changes: Partial<PlannerForm>) => void;
  reset: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A saved form from an older version (or a damaged one) falls back to the defaults. */
export function sanitizePersisted(persisted: unknown): { form: PlannerForm } {
  const form = isRecord(persisted) ? persisted['form'] : null;
  const ok =
    isRecord(form) &&
    Array.isArray(form['assets']) &&
    Array.isArray(form['deposits']) &&
    Array.isArray(form['recurring']) &&
    (Object.keys(DEFAULT_FORM) as (keyof PlannerForm)[]).every((key) => key in form);
  return { form: ok ? (form as unknown as PlannerForm) : DEFAULT_FORM };
}

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set) => ({
      form: DEFAULT_FORM,
      update: (changes) => {
        set((s) => ({ form: { ...s.form, ...changes } }));
      },
      reset: () => {
        set({ form: DEFAULT_FORM });
      },
    }),
    {
      name: 'chartlab.planner',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ form: s.form }),
      migrate: (persisted) => sanitizePersisted(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
    },
  ),
);
