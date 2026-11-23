/** One entry of the Ctrl+K command palette. */
export interface Command {
  id: string;
  group: string;
  label: string;
  /** Short text on the right (ticker, shortcut, state). */
  hint?: string | undefined;
  /** Extra words the search matches (full names, synonyms). */
  keywords?: string;
  run: () => void;
}

/** Most entries shown at once (the list scrolls; typing narrows it). */
export const MAX_RESULTS = 60;

/**
 * Commands matching every word of `query` (in label, hint or keywords, any case), best first:
 * label starts with the query, then a word of the label starts with it, then anything else.
 * Within a rank the original order (and so the groups) is kept.
 */
export function filterCommands(commands: readonly Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (q === '') return commands.slice(0, MAX_RESULTS);
  const words = q.split(/\s+/);
  const ranked: { command: Command; rank: number; order: number }[] = [];
  commands.forEach((command, order) => {
    const label = command.label.toLowerCase();
    const text = `${label} ${command.hint ?? ''} ${command.keywords ?? ''}`.toLowerCase();
    if (!words.every((w) => text.includes(w))) return;
    const rank = label.startsWith(q) ? 0 : ` ${label}`.includes(` ${q}`) ? 1 : 2;
    ranked.push({ command, rank, order });
  });
  return ranked
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, MAX_RESULTS)
    .map((r) => r.command);
}
