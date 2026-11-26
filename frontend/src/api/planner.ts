import { apiGet, apiPost, isRecord, type Schemas } from './client.ts';

/** POST /api/planner/market: the body (snake_case, as the backend declares it). */
export type MarketRequest = Schemas['MarketRequest'];
/** The market account's result: summary, a row per deposit, the value path. */
export type MarketResult = Schemas['MarketResponse'];
export type AssetDepth = Schemas['AssetDepth'];
export type DepositRow = Schemas['DepositOut'];
export type MarketSummary = Schemas['Summary'];

const SUMMARY_NUMBERS = [
  'deposited',
  'value',
  'proceeds',
  'gross_gain',
  'taxable_gain',
  'tax',
  'net_value',
  'net_gain',
  'deposit_fees',
  'commissions',
  'account_fees',
  'dividend_tax',
  'net_value_real',
  'inflation_yearly',
] as const satisfies readonly (keyof MarketSummary)[];

/** Checks the shape the page relies on (the lists and every summary number). */
export function parseMarket(body: unknown): MarketResult {
  if (!isRecord(body)) throw new Error('Unexpected /api/planner/market response');
  const { summary, deposits, assets, path, warnings } = body;
  if (
    !isRecord(summary) ||
    !Array.isArray(deposits) ||
    !Array.isArray(assets) ||
    !Array.isArray(path) ||
    !Array.isArray(warnings)
  ) {
    throw new Error('Unexpected /api/planner/market response');
  }
  for (const key of SUMMARY_NUMBERS) {
    if (typeof summary[key] !== 'number' || !Number.isFinite(summary[key])) {
      throw new Error(`Expected a finite number for ${key}`);
    }
  }
  // The lists and the summary were checked above; the rest follows the generated schema.
  return body as unknown as MarketResult;
}

export function parseDepths(body: unknown): AssetDepth[] {
  if (!Array.isArray(body) || !body.every(isRecord)) {
    throw new Error('Unexpected /api/planner/assets response');
  }
  return body as unknown as AssetDepth[];
}

export const runMarket = (request: MarketRequest) =>
  apiPost('/planner/market', request, parseMarket);

export const assetDepths = (assets: MarketRequest['assets']) =>
  apiPost('/planner/assets', { assets }, parseDepths);

/** POST /api/planner/home: an apartment bought with a mortgage and sold on one day. */
export type HomeRequest = Schemas['HomeRequest'];
export type HomeResult = Schemas['HomeResponse'];
export type HomeSummary = Schemas['HomeSummary'];
export type TaxPresets = Schemas['TaxPresets'];
/** One slice of a tax table: the rate up to a bound (null: no bound). */
export type TaxBracket = Schemas['BracketIn'];
export type BettermentSpec = Schemas['BettermentIn'];

/** Checks the shape the page relies on (the lists and the summary's numbers). */
export function parseHome(body: unknown): HomeResult {
  if (!isRecord(body)) throw new Error('Unexpected /api/planner/home response');
  const { summary, tracks, schedule, path, warnings } = body;
  if (
    !isRecord(summary) ||
    !Array.isArray(tracks) ||
    !Array.isArray(schedule) ||
    !Array.isArray(path) ||
    !Array.isArray(warnings)
  ) {
    throw new Error('Unexpected /api/planner/home response');
  }
  for (const [key, value] of Object.entries(summary)) {
    // Only the two returns may be null (no rate solves the flows).
    if (typeof value !== 'number' && !(value === null && key.startsWith('xirr'))) {
      throw new Error(`Expected a number for ${key}`);
    }
  }
  return body as unknown as HomeResult;
}

export function parseTaxPresets(body: unknown): TaxPresets {
  if (!isRecord(body) || !Array.isArray(body['purchase']) || !Array.isArray(body['betterment'])) {
    throw new Error('Unexpected /api/planner/tax-presets response');
  }
  return body as unknown as TaxPresets;
}

export const runHome = (request: HomeRequest) => apiPost('/planner/home', request, parseHome);

export const taxPresets = () => apiGet('/planner/tax-presets', parseTaxPresets);
