import { Command as CommandIcon } from 'lucide-react';

import { filterCommands, type Command } from './commands.ts';
import styles from './IndicatorsDialog.module.css';
import { SearchDialog, type SearchGroup } from './SearchDialog.tsx';
import { usePaletteCommands } from './usePaletteCommands.ts';
import type { OverlayAttrs } from './usePresence.ts';

function grouped(commands: readonly Command[]): SearchGroup<Command>[] {
  const byGroup = new Map<string, Command[]>();
  for (const c of commands) byGroup.set(c.group, [...(byGroup.get(c.group) ?? []), c]);
  return [...byGroup].map(([label, items]) => ({ label, items }));
}

/** The palette's search (mounted only while open, so its store subscriptions are too). */
export function CommandPaletteSearch({
  attrs,
  onClose,
}: {
  attrs: OverlayAttrs;
  onClose: () => void;
}) {
  const commands = usePaletteCommands();
  return (
    <SearchDialog
      title="Command palette"
      icon={<CommandIcon size={16} />}
      inputLabel="Search commands"
      listLabel="Commands"
      placeholder="Symbol, indicator or action, e.g. NVDA, rsi, light"
      attrs={attrs}
      search={(query) => grouped(filterCommands(commands, query))}
      itemKey={(command) => command.id}
      renderItem={(command) => (
        <>
          <span className={styles.name}>{command.label}</span>
          <span className={styles.short}>{command.hint}</span>
        </>
      )}
      onPick={(command) => {
        onClose();
        command.run();
      }}
      onClose={onClose}
      status={(query, count) =>
        count === 0
          ? `Nothing matches “${query.trim()}”. Try a ticker, an indicator or a word like “log”.`
          : null
      }
    />
  );
}
