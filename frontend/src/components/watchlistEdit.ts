import type { WatchlistSection } from '../api/watchlists.ts';

/**
 * Pure edits of a watchlist's sections (R6): each returns new sections and leaves the input
 * as is. A symbol appears at most once in a list, so moving or adding it first takes it out.
 */

const without = (sections: readonly WatchlistSection[], symbol: string) =>
  sections.map((s) => ({ ...s, symbols: s.symbols.filter((x) => x !== symbol) }));

/** Put `symbol` into section `section`, before `before` (or at the end when null). */
export function moveSymbol(
  sections: readonly WatchlistSection[],
  symbol: string,
  section: number,
  before: string | null,
): WatchlistSection[] {
  if (symbol === before) return [...sections];
  return without(sections, symbol).map((s, i) => {
    if (i !== section) return s;
    const at = before === null ? -1 : s.symbols.indexOf(before);
    const symbols = [...s.symbols];
    symbols.splice(at < 0 ? symbols.length : at, 0, symbol);
    return { ...s, symbols };
  });
}

/** Add `symbol` at the end of the last section (or a new "Symbols" section in an empty list). */
export function addSymbol(
  sections: readonly WatchlistSection[],
  symbol: string,
): WatchlistSection[] {
  if (sections.some((s) => s.symbols.includes(symbol))) return [...sections];
  if (sections.length === 0) return [{ title: 'Symbols', symbols: [symbol] }];
  return moveSymbol(sections, symbol, sections.length - 1, null);
}

export function removeSymbol(
  sections: readonly WatchlistSection[],
  symbol: string,
): WatchlistSection[] {
  return without(sections, symbol);
}

export function addSection(
  sections: readonly WatchlistSection[],
  title: string,
): WatchlistSection[] {
  return [...sections, { title, symbols: [] }];
}

export function renameSection(
  sections: readonly WatchlistSection[],
  index: number,
  title: string,
): WatchlistSection[] {
  return sections.map((s, i) => (i === index ? { ...s, title } : s));
}

/** Remove a section; its symbols join the section above it (or below, for the first one). */
export function removeSection(
  sections: readonly WatchlistSection[],
  index: number,
): WatchlistSection[] {
  const gone = sections[index];
  if (gone === undefined || sections.length === 1) return [...sections];
  const into = index === 0 ? 1 : index - 1;
  return sections
    .map((s, i) => (i === into ? { ...s, symbols: [...s.symbols, ...gone.symbols] } : s))
    .filter((_, i) => i !== index);
}
