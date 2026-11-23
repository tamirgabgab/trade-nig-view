import { CATEGORY_LABELS, type IndicatorInfo } from '../api/indicators.ts';

export interface IndicatorGroup {
  label: string;
  indicators: IndicatorInfo[];
}

function rank(spec: IndicatorInfo, q: string): number {
  const short = spec.shortName.toLowerCase();
  const name = spec.name.toLowerCase();
  if (short === q || spec.id === q) return 0;
  if (short.startsWith(q) || name.startsWith(q)) return 1;
  if (name.split(/[\s()/-]+/).some((word) => word.startsWith(q))) return 2;
  if (name.includes(q) || spec.description.toLowerCase().includes(q)) return 3;
  return -1;
}

/**
 * Registry entries matching `query` (short name, name or description), grouped by category in
 * the registry's category order; within a group, better matches first, then by name.
 */
export function searchIndicators(specs: readonly IndicatorInfo[], query: string): IndicatorGroup[] {
  const q = query.trim().toLowerCase();
  const groups: IndicatorGroup[] = [];
  for (const [category, label] of Object.entries(CATEGORY_LABELS)) {
    const matches = specs
      .filter((spec) => spec.category === category)
      .map((spec) => ({ spec, rank: q === '' ? 0 : rank(spec, q) }))
      .filter((m) => m.rank >= 0)
      .sort((a, b) => a.rank - b.rank || a.spec.name.localeCompare(b.spec.name))
      .map((m) => m.spec);
    if (matches.length > 0) groups.push({ label, indicators: matches });
  }
  return groups;
}

/** True for a plain `/` typed outside a text field (opens the indicators dialog). */
export function opensIndicators(event: KeyboardEvent): boolean {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.defaultPrevented) return false;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return true;
  if (target.isContentEditable) return false;
  return !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
