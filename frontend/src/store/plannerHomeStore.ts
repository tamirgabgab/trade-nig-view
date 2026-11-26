import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { BettermentSpec, HomeRequest, TaxBracket, TaxPresets } from '../api/planner.ts';
import type { PlannerForm } from './plannerStore.ts';

type TrackRequest = NonNullable<HomeRequest['tracks']>[number];
type Repayment = NonNullable<TrackRequest['repayment']>;

/** The track types a bank offers: the rate's kind, with or without CPI linkage. */
export type TrackType = 'fixed' | 'fixed_linked' | 'prime' | 'variable' | 'variable_linked';

export interface HomeTrack {
  /** Relative share of the loan. */
  share: number;
  years: number;
  type: TrackType;
  /** Yearly %: the rate (fixed), the first period's (variable), the spread on prime. */
  rate: number;
  repayment: Repayment;
  graceMonths: number;
  /** In the grace (or until the balloon) the interest accrues instead of being paid. */
  graceFull: boolean;
  resetYears: number;
}

/**
 * A tax table: a built-in one by its id, a saved one as `saved:<name>`, or `none`. `edited`
 * holds the user's changes to it until they are saved under a name.
 */
export interface TaxChoice<T> {
  preset: string;
  edited: T | null;
}

/** The apartment side's inputs (percentages in %, money in shekels). */
export interface HomeForm {
  start: string;
  end: string;
  price: number;
  equity: number;
  tracks: HomeTrack[];
  rates: { mode: 'assumed' | 'historical'; base: number; shock: number; shockAfterMonths: number };
  value: {
    mode: 'assumed' | 'historical';
    series: string;
    mean: number;
    sd: number;
    random: boolean;
  };
  rent: {
    mode: 'none' | 'live' | 'rent_out';
    monthly: number;
    growth: 'cpi' | 'value' | 'fixed';
    growthPct: number;
    vacancy: number;
    tax: number;
  };
  costs: {
    lawyer: number;
    broker: number;
    renovation: number;
    maintenance: number;
    insurance: number;
    selling: number;
    earlyRepayment: number;
  };
  purchaseTax: TaxChoice<TaxBracket[]>;
  betterment: TaxChoice<BettermentSpec>;
}

/** The rate a track starts with when its type is chosen (a spread for prime). */
export const TRACK_RATE: Record<TrackType, number> = {
  fixed: 4.6,
  fixed_linked: 3.3,
  prime: -0.5,
  variable: 4.4,
  variable_linked: 3.2,
};

export function newTrack(type: TrackType, share: number): HomeTrack {
  return {
    share,
    years: 25,
    type,
    rate: TRACK_RATE[type],
    repayment: 'spitzer',
    graceMonths: 0,
    graceFull: false,
    resetYears: 5,
  };
}

export const DEFAULT_HOME: HomeForm = {
  start: '2015-01-15',
  end: '2025-01-15',
  price: 2_000_000,
  equity: 600_000,
  tracks: [newTrack('fixed', 34), newTrack('prime', 33), newTrack('variable_linked', 33)],
  rates: { mode: 'assumed', base: 4, shock: 0, shockAfterMonths: 24 },
  value: { mode: 'assumed', series: 'dwelling', mean: 3, sd: 0, random: false },
  rent: { mode: 'live', monthly: 5500, growth: 'cpi', growthPct: 3, vacancy: 4, tax: 10 },
  costs: {
    lawyer: 0.6,
    broker: 2.4,
    renovation: 0,
    maintenance: 0.5,
    insurance: 1500,
    selling: 2.4,
    earlyRepayment: 0,
  },
  purchaseTax: { preset: 'single_home_2026', edited: null },
  betterment: { preset: 'single_home', edited: null },
};

export const NO_TAX = 'none';
const SAVED = 'saved:';
export const savedKey = (name: string) => `${SAVED}${name}`;
/** The name of a saved table's key, or null for a built-in one. */
export const savedName = (preset: string) =>
  preset.startsWith(SAVED) ? preset.slice(SAVED.length) : null;

/** Tax tables the user saved under a name (in the API's shape, as the presets come). */
export interface SavedTaxes {
  purchase: Record<string, TaxBracket[]>;
  betterment: Record<string, BettermentSpec>;
}

/**
 * The two tax tables a form stands for, or null while a table it names is not there (the
 * built-in ones are not loaded yet, or a saved one was deleted).
 */
export function resolveTaxes(
  home: HomeForm,
  saved: SavedTaxes,
  presets: TaxPresets | undefined,
): { purchase: TaxBracket[]; betterment: BettermentSpec } | null {
  const pick = <T>(choice: TaxChoice<T>, own: Record<string, T>, builtIn: T | undefined) => {
    const name = savedName(choice.preset);
    return choice.edited ?? (name === null ? builtIn : own[name]);
  };
  const purchase = pick(
    home.purchaseTax,
    saved.purchase,
    home.purchaseTax.preset === NO_TAX
      ? []
      : presets?.purchase.find((p) => p.id === home.purchaseTax.preset)?.brackets,
  );
  const betterment = pick(
    home.betterment,
    saved.betterment,
    presets?.betterment.find((p) => p.id === home.betterment.preset)?.spec,
  );
  return purchase === undefined || betterment === undefined ? null : { purchase, betterment };
}

/** The seed of "draw a path": fixed, so a run can be repeated. */
const SEED = 1;

/** The API request of a form, its two tax tables and the planner's shared inflation. */
export function toHomeRequest(
  home: HomeForm,
  inflation: PlannerForm['inflation'],
  taxes: { purchase: TaxBracket[]; betterment: BettermentSpec },
): HomeRequest {
  return {
    start: home.start,
    end: home.end,
    price: home.price,
    equity: home.equity,
    tracks: home.tracks.map((t) => ({
      share: t.share,
      months: Math.round(t.years * 12),
      kind: t.type === 'prime' ? 'prime' : t.type.startsWith('fixed') ? 'fixed' : 'variable',
      rate_pct: t.rate,
      linked: t.type.endsWith('_linked'),
      reset_years: t.resetYears,
      repayment: t.repayment,
      grace_months: t.repayment === 'grace' ? t.graceMonths : 0,
      grace_full: t.graceFull,
    })),
    rates: {
      mode: home.rates.mode,
      base_pct: home.rates.base,
      shock_pct: home.rates.shock,
      shock_after_months: home.rates.shockAfterMonths,
    },
    purchase: {
      tax_brackets: taxes.purchase,
      lawyer_pct: home.costs.lawyer,
      broker_pct: home.costs.broker,
      renovation: home.costs.renovation,
    },
    owner: { maintenance_pct: home.costs.maintenance, insurance: home.costs.insurance },
    rent: {
      mode: home.rent.mode,
      monthly: home.rent.monthly,
      growth: home.rent.growth,
      growth_pct: home.rent.growthPct,
      vacancy_pct: home.rent.vacancy,
      tax_pct: home.rent.tax,
    },
    value: {
      mode: home.value.mode,
      series: home.value.series,
      mean_pct: home.value.mean,
      sd_pct: home.value.sd,
      seed: home.value.random ? SEED : null,
    },
    sale: {
      costs_pct: home.costs.selling,
      early_repayment_pct: home.costs.earlyRepayment,
      betterment: taxes.betterment,
    },
    inflation: {
      mode: inflation.mode,
      mean_pct: inflation.mean,
      sd_pct: inflation.sd,
      persistence: inflation.persistence,
      seed: inflation.random ? SEED : null,
    },
  };
}

interface HomeState {
  home: HomeForm;
  saved: SavedTaxes;
  /** Replace part of the form. */
  update: (changes: Partial<HomeForm>) => void;
  reset: () => void;
  /** Keep the form's current purchase-tax table under a name and select it. */
  savePurchaseTax: (name: string, table: TaxBracket[]) => void;
  saveBetterment: (name: string, spec: BettermentSpec) => void;
  /** Forget a saved table; a form that used it falls back to the default one. */
  deleteSaved: (kind: keyof SavedTaxes, name: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const NO_SAVED: SavedTaxes = { purchase: {}, betterment: {} };

/** A saved state from an older version (or a damaged one) falls back to the defaults. */
export function sanitizeHome(persisted: unknown): { home: HomeForm; saved: SavedTaxes } {
  const home = isRecord(persisted) ? persisted['home'] : null;
  const saved = isRecord(persisted) ? persisted['saved'] : null;
  const homeOk =
    isRecord(home) &&
    Array.isArray(home['tracks']) &&
    (Object.keys(DEFAULT_HOME) as (keyof HomeForm)[]).every((key) => key in home);
  const savedOk = isRecord(saved) && isRecord(saved['purchase']) && isRecord(saved['betterment']);
  return {
    home: homeOk ? (home as unknown as HomeForm) : DEFAULT_HOME,
    saved: savedOk ? (saved as unknown as SavedTaxes) : NO_SAVED,
  };
}

export const usePlannerHomeStore = create<HomeState>()(
  persist(
    (set) => ({
      home: DEFAULT_HOME,
      saved: NO_SAVED,
      update: (changes) => {
        set((s) => ({ home: { ...s.home, ...changes } }));
      },
      reset: () => {
        set({ home: DEFAULT_HOME });
      },
      savePurchaseTax: (name, table) => {
        set((s) => ({
          saved: { ...s.saved, purchase: { ...s.saved.purchase, [name]: table } },
          home: { ...s.home, purchaseTax: { preset: savedKey(name), edited: null } },
        }));
      },
      saveBetterment: (name, spec) => {
        set((s) => ({
          saved: { ...s.saved, betterment: { ...s.saved.betterment, [name]: spec } },
          home: { ...s.home, betterment: { preset: savedKey(name), edited: null } },
        }));
      },
      deleteSaved: (kind, name) => {
        set((s) => {
          const rest = Object.fromEntries(
            Object.entries(s.saved[kind]).filter(([key]) => key !== name),
          );
          const field = kind === 'purchase' ? 'purchaseTax' : 'betterment';
          const used = s.home[field].preset === savedKey(name);
          return {
            saved: { ...s.saved, [kind]: rest },
            home: used ? { ...s.home, [field]: DEFAULT_HOME[field] } : s.home,
          };
        });
      },
    }),
    {
      name: 'chartlab.planner.home',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ home: s.home, saved: s.saved }),
      migrate: (persisted) => sanitizeHome(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizeHome(persisted) }),
    },
  ),
);
