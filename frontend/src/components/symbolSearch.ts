import type { SymbolInfo } from '../api/market.ts';
import { isBareKeyOutsideField } from './keyTarget.ts';

export interface SymbolGroup {
  group: string;
  symbols: SymbolInfo[];
}

/**
 * Match rank of `info` for an upper-cased query (lower is better, null = no match):
 * 0 exact ticker, 1 ticker prefix, 2 name word prefix, 3 substring of ticker or name.
 */
export function matchRank(info: SymbolInfo, query: string): number | null {
  if (query === '') return 3;
  const tickers = [info.display.toUpperCase(), info.symbol.toUpperCase()];
  const name = info.name.toUpperCase();
  if (tickers.includes(query)) return 0;
  if (tickers.some((t) => t.startsWith(query))) return 1;
  if (name.split(/[\s.,/&-]+/).some((word) => word.startsWith(query))) return 2;
  if (tickers.some((t) => t.includes(query)) || name.includes(query)) return 3;
  return null;
}

/**
 * Symbols matching `query`, grouped by watchlist section in universe order; inside a section the
 * best matches come first (stable for equal ranks).
 */
export function searchSymbols(symbols: readonly SymbolInfo[], query: string): SymbolGroup[] {
  const q = query.trim().toUpperCase();
  const groups = new Map<string, { info: SymbolInfo; rank: number; order: number }[]>();
  symbols.forEach((info, order) => {
    const rank = matchRank(info, q);
    if (rank === null) return;
    const list = groups.get(info.group) ?? [];
    list.push({ info, rank, order });
    groups.set(info.group, list);
  });
  return [...groups].map(([group, list]) => ({
    group,
    symbols: list.sort((a, b) => a.rank - b.rank || a.order - b.order).map((m) => m.info),
  }));
}

/** True when a key press on the page should open symbol search (a letter or digit, no modifier). */
export function opensSymbolSearch(event: KeyboardEvent): boolean {
  return /^[a-z0-9]$/i.test(event.key) && isBareKeyOutsideField(event);
}
