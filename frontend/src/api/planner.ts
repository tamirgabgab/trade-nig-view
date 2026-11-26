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
  const { summary, tracks, schedule, path, stress, warnings } = body;
  if (
    !isRecord(summary) ||
    !Array.isArray(tracks) ||
    !Array.isArray(stress) ||
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

/** POST /api/planner/run and /api/planner/study: two options on the same money. */
export type ScenarioRequest = Schemas['ScenarioRequest'];
export type StudyRequest = Schemas['StudyRequest'];
export type ScenarioResult = Schemas['RunResponse'];
export type StudyResult = Schemas['StudyResponse'];

/** Checks the shape the page relies on (both options, the lists, what the answer rests on). */
export function parseScenario(body: unknown): ScenarioResult {
  if (
    !isRecord(body) ||
    !isRecord(body['x']) ||
    !isRecord(body['y']) ||
    !isRecord(body['breakeven']) ||
    !isRecord(body['average']) ||
    !Array.isArray(body['average']['points']) ||
    !Array.isArray(body['sensitivity']) ||
    !isRecord(body['lead']) ||
    !isRecord(body['liquidity']) ||
    !isRecord(body['liquidity']['x']) ||
    !isRecord(body['liquidity']['y']) ||
    !Array.isArray(body['warnings']) ||
    typeof body['difference'] !== 'number'
  ) {
    throw new Error('Unexpected /api/planner/run response');
  }
  return body as unknown as ScenarioResult;
}

export function parseStudy(body: unknown): StudyResult {
  if (
    !isRecord(body) ||
    !isRecord(body['summary']) ||
    !isRecord(body['win_map']) ||
    !Array.isArray(body['win_map']['rows']) ||
    !Array.isArray(body['windows']) ||
    !Array.isArray(body['warnings'])
  ) {
    throw new Error('Unexpected /api/planner/study response');
  }
  return body as unknown as StudyResult;
}

export const runScenario = (request: ScenarioRequest) =>
  apiPost('/planner/run', request, parseScenario);

export const studyScenario = (request: StudyRequest) =>
  apiPost('/planner/study', request, parseStudy);

/** POST /api/planner/simulate: the scenario over many simulated worlds. */
export type SimulateRequest = Schemas['SimulateRequest'];
export type SimulationResult = Schemas['SimulateResponse'];
export type OptionRisk = Schemas['OptionRisk'];

/** Checks the shape the page relies on (both options and the samples of every measure). */
export function parseSimulation(body: unknown): SimulationResult {
  const samples = isRecord(body) ? body['samples'] : null;
  if (
    !isRecord(body) ||
    !isRecord(body['x']) ||
    !isRecord(body['y']) ||
    !isRecord(samples) ||
    !Object.values(samples).every(Array.isArray) ||
    !Array.isArray(body['split']) ||
    !Array.isArray(body['warnings'])
  ) {
    throw new Error('Unexpected /api/planner/simulate response');
  }
  return body as unknown as SimulationResult;
}

export const simulateScenario = (request: SimulateRequest) =>
  apiPost('/planner/simulate', request, parseSimulation);
