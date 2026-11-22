import type { SymbolInfo } from '../api/market.ts';
import { matchRank, opensSymbolSearch, searchSymbols } from './symbolSearch.ts';

const info = (symbol: string, display: string, name: string, group: string): SymbolInfo => ({
  symbol,
  display,
  name,
  group,
  type: 'stock',
  exchange: 'NASDAQ',
  hasVolume: true,
  decimals: 2,
});

const UNIVERSE = [
  info('^GSPC', 'SPX', 'S&P 500 Index', 'Indices'),
  info('^NDX', 'NDX', 'Nasdaq 100 Index', 'Indices'),
  info('AAPL', 'AAPL', 'Apple Inc.', 'Stocks'),
  info('NVDA', 'NVDA', 'NVIDIA Corporation', 'Stocks'),
  info('AMD', 'AMD', 'Advanced Micro Devices', 'Stocks'),
  info('GBPUSD=X', 'GBPUSD', 'British Pound / US Dollar', 'Forex'),
];

describe('matchRank', () => {
  it('ranks exact ticker, ticker prefix, name word prefix, then substring', () => {
    expect(matchRank(UNIVERSE[3] as SymbolInfo, 'NVDA')).toBe(0);
    expect(matchRank(UNIVERSE[3] as SymbolInfo, 'NV')).toBe(1);
    expect(matchRank(UNIVERSE[0] as SymbolInfo, '^GS')).toBe(1); // provider symbol counts too
    expect(matchRank(UNIVERSE[4] as SymbolInfo, 'MICRO')).toBe(2);
    expect(matchRank(UNIVERSE[2] as SymbolInfo, 'PL')).toBe(3);
    expect(matchRank(UNIVERSE[2] as SymbolInfo, 'XYZ')).toBeNull();
  });
});

describe('searchSymbols', () => {
  it('returns every symbol grouped in universe order for an empty query', () => {
    const groups = searchSymbols(UNIVERSE, '  ');
    expect(groups.map((g) => g.group)).toEqual(['Indices', 'Stocks', 'Forex']);
    expect(groups.flatMap((g) => g.symbols)).toHaveLength(UNIVERSE.length);
  });

  it('is case-insensitive and puts the best match of each group first', () => {
    const groups = searchSymbols(UNIVERSE, 'nd');
    // NDX: ticker prefix (rank 1) before SPX, whose name "S&P 500 Index" merely contains "ND";
    // GBPUSD matches through "Pound".
    expect(groups.map((g) => [g.group, g.symbols.map((s) => s.display)])).toEqual([
      ['Indices', ['NDX', 'SPX']],
      ['Forex', ['GBPUSD']],
    ]);
  });

  it('matches names and drops empty groups', () => {
    const groups = searchSymbols(UNIVERSE, 'dollar');
    expect(groups).toEqual([{ group: 'Forex', symbols: [UNIVERSE[5]] }]);
    expect(searchSymbols(UNIVERSE, 'zzz')).toEqual([]);
  });
});

describe('opensSymbolSearch', () => {
  const press = (key: string, init: KeyboardEventInit = {}, target?: HTMLElement) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    if (target !== undefined) Object.defineProperty(event, 'target', { value: target });
    return opensSymbolSearch(event);
  };

  it('opens on a letter or digit typed outside text fields', () => {
    expect(press('a')).toBe(true);
    expect(press('7', {}, document.createElement('button'))).toBe(true);
  });

  it('ignores shortcuts, other keys and typing into fields', () => {
    expect(press('a', { ctrlKey: true })).toBe(false);
    expect(press('a', { altKey: true })).toBe(false);
    expect(press('a', { metaKey: true })).toBe(false);
    expect(press('/')).toBe(false);
    expect(press('Enter')).toBe(false);
    expect(press('a', {}, document.createElement('input'))).toBe(false);
    expect(press('a', {}, document.createElement('textarea'))).toBe(false);
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(press('a', {}, editable)).toBe(false);
  });
});
