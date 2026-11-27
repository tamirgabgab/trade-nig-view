import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { MarketRequest } from '../api/planner.ts';
import { DEFAULT_SIMULATION, type SimulationSettings } from '../planner/simulation.ts';

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

/** The planner compares two options; each has a market form and an apartment form of its own. */
export type Slot = 'a' | 'b';
export const SLOTS: readonly Slot[] = ['a', 'b'];

/** What an option is made of in the comparison (its mix is always its own Market tab's). */
export interface OptionContents {
  /** It buys its Apartment tab's apartment. */
  home: boolean;
  /** It makes its own Market tab's deposits, on top of matching the other option. */
  deposits: boolean;
}

/** The Compare tab's own settings (percentages in %, dates as 'YYYY-MM-DD' or ''). */
export interface CompareSettings {
  /** Off an apartment's value in a forced sale. */
  discount: number;
  firstStart: string;
  lastStart: string;
  /** Months between two starts of the history study. */
  step: number;
  followRates: boolean;
  simulation: SimulationSettings;
}

/** The Withdraw tab's inputs (percentages in %, money in shekels). */
export interface WithdrawSettings {
  /** The account grows as the Market tab's mix did, or by an assumed yearly return. */
  returns: 'mix' | 'assumed';
  /** The assumed yearly return, in %. */
  yearly: number;
  start: string;
  years: number;
  capital: number;
  /** The share of the capital that is cost; the rest is gain not yet taxed. */
  costShare: number;
  rule: 'fixed' | 'percent';
  /** A fixed rule: net a month, in shekels of the first day. */
  amount: number;
  indexed: boolean;
  /** A percent rule: the share of the account sold a year. */
  percent: number;
}

export const DEFAULT_WITHDRAW: WithdrawSettings = {
  returns: 'mix',
  yearly: 5,
  start: '2015-01-02',
  years: 10,
  capital: 1_000_000,
  costShare: 50,
  rule: 'fixed',
  amount: 4_000,
  indexed: true,
  percent: 4,
};

const DEFAULT_CONTENTS: Record<Slot, OptionContents> = {
  a: { home: true, deposits: false },
  b: { home: false, deposits: false },
};
const DEFAULT_COMPARE: CompareSettings = {
  discount: 10,
  firstStart: '',
  lastStart: '',
  step: 1,
  followRates: true,
  simulation: DEFAULT_SIMULATION,
};

interface PlannerData {
  /**
   * Option B is option A: one set of forms serves both, and `other` (and the other apartment)
   * is not read. Unticked, option B has forms of its own.
   */
  same: boolean;
  /** The option the Market tab shows (always A while the two are the same). */
  slot: Slot;
  /** The form of the option on screen. */
  form: PlannerForm;
  /** The form of the other option. */
  other: PlannerForm;
  contents: Record<Slot, OptionContents>;
  compare: CompareSettings;
  withdraw: WithdrawSettings;
}

interface PlannerState extends PlannerData {
  /** Counts the scenarios loaded: the tabs drop the results of the forms that were replaced. */
  loads: number;
  /** The question "replace option B with option A?" is open (in both tabs: it is one). */
  joining: boolean;
  /** Replace part of the form on screen (the inflation is one for both options). */
  update: (changes: Partial<PlannerForm>) => void;
  /** Show another option's form. */
  swap: (slot: Slot) => void;
  /** Overwrite the other option with the one on screen. */
  copyToOther: () => void;
  setSame: (same: boolean) => void;
  /** The defaults, for the option on screen only. */
  reset: () => void;
  setContents: (slot: Slot, changes: Partial<OptionContents>) => void;
  setCompare: (changes: Partial<CompareSettings>) => void;
  setWithdraw: (changes: Partial<WithdrawSettings>) => void;
}

/** The two options of a store that keeps one on screen and the other aside. */
export function bySlot<T>(slot: Slot, shown: T, other: T): Record<Slot, T> {
  return slot === 'a' ? { a: shown, b: other } : { a: other, b: shown };
}
export const formsOf = (s: Pick<PlannerData, 'slot' | 'form' | 'other'>) =>
  bySlot(s.slot, s.form, s.other);
/** The two options as a comparison reads them: option A twice while the two are the same. */
export const linked = <T>(same: boolean, pair: Record<Slot, T>): Record<Slot, T> =>
  same ? { a: pair.a, b: pair.a } : pair;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** `saved`'s fields where they are of the kind `defaults` has, the defaults elsewhere. */
export function sameKinds<T extends object>(defaults: T, saved: unknown): T {
  const from = isRecord(saved) ? saved : {};
  return Object.fromEntries(
    Object.entries(defaults).map(([key, value]) => [
      key,
      isRecord(value)
        ? sameKinds(value, from[key])
        : typeof from[key] === typeof value
          ? from[key]
          : value,
    ]),
  ) as T;
}

/** A market form as it was stored, or null for one of an older version or a damaged one. */
export function readForm(form: unknown): PlannerForm | null {
  const ok =
    isRecord(form) &&
    Array.isArray(form['assets']) &&
    Array.isArray(form['deposits']) &&
    Array.isArray(form['recurring']) &&
    (Object.keys(DEFAULT_FORM) as (keyof PlannerForm)[]).every((key) => key in form);
  return ok ? (form as unknown as PlannerForm) : null;
}

export const readSlot = (slot: unknown): Slot => (slot === 'b' ? 'b' : 'a');

export function readContents(contents: unknown): Record<Slot, OptionContents> {
  const from = isRecord(contents) ? contents : {};
  return {
    a: sameKinds(DEFAULT_CONTENTS.a, from['a']),
    b: sameKinds(DEFAULT_CONTENTS.b, from['b']),
  };
}

export const readCompare = (compare: unknown) => sameKinds(DEFAULT_COMPARE, compare);

/** Stored Withdraw settings; a field the tab could not show or send falls back to its default. */
export function readWithdraw(stored: unknown): WithdrawSettings {
  const read = sameKinds(DEFAULT_WITHDRAW, stored);
  const ok: { [K in keyof WithdrawSettings]?: boolean } = {
    // Stored text, whatever its type says: only the tab's own choices pass.
    returns: ['mix', 'assumed'].includes(read.returns),
    rule: ['fixed', 'percent'].includes(read.rule),
    start: /^\d{4}-\d{2}-\d{2}$/.test(read.start),
    years: read.years >= 1 && read.years <= 100,
    capital: read.capital > 0,
    costShare: read.costShare >= 0 && read.costShare <= 100,
    amount: read.amount > 0,
    percent: read.percent > 0 && read.percent <= 1200,
  };
  const bad = Object.entries(ok).filter(([, fine]) => !fine);
  return {
    ...read,
    ...Object.fromEntries(
      bad.map(([key]) => [key, DEFAULT_WITHDRAW[key as keyof WithdrawSettings]]),
    ),
  };
}

/**
 * A stored state, each damaged part replaced by its default. One of before there were two
 * options (version 1: a form alone) becomes option A, with option B the same as it.
 */
export function sanitizePersisted(persisted: unknown): PlannerData {
  const from = isRecord(persisted) ? persisted : {};
  const same = from['same'] !== false;
  const shown = readForm(from['form']) ?? DEFAULT_FORM;
  const aside = 'other' in from ? (readForm(from['other']) ?? DEFAULT_FORM) : shown;
  // While the two are the same it is option A that is on screen, whatever was stored.
  const { a, b } = bySlot(readSlot(from['slot']), shown, aside);
  const slot = same ? 'a' : readSlot(from['slot']);
  return {
    same,
    slot,
    form: slot === 'a' ? a : b,
    other: slot === 'a' ? b : a,
    contents: readContents(from['contents']),
    compare: readCompare(from['compare']),
    withdraw: readWithdraw(from['withdraw']),
  };
}

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set) => ({
      ...sanitizePersisted(null),
      loads: 0,
      joining: false,
      update: (changes) => {
        set((s) => ({
          form: { ...s.form, ...changes },
          other: changes.inflation ? { ...s.other, inflation: changes.inflation } : s.other,
        }));
      },
      swap: (slot) => {
        set((s) => (s.slot === slot ? s : { slot, form: s.other, other: s.form }));
      },
      copyToOther: () => {
        set((s) => ({ other: s.form }));
      },
      setSame: (same) => {
        set({ same });
      },
      reset: () => {
        // The inflation is one for both options, so it goes back to its default in both.
        set((s) => ({
          form: DEFAULT_FORM,
          other: { ...s.other, inflation: DEFAULT_FORM.inflation },
        }));
      },
      setContents: (slot, changes) => {
        set((s) => ({ contents: { ...s.contents, [slot]: { ...s.contents[slot], ...changes } } }));
      },
      setCompare: (changes) => {
        set((s) => ({ compare: { ...s.compare, ...changes } }));
      },
      setWithdraw: (changes) => {
        set((s) => ({ withdraw: { ...s.withdraw, ...changes } }));
      },
    }),
    {
      name: 'chartlab.planner',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ same, slot, form, other, contents, compare, withdraw }) => ({
        same,
        slot,
        form,
        other,
        contents,
        compare,
        withdraw,
      }),
      migrate: (persisted) => sanitizePersisted(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
    },
  ),
);
