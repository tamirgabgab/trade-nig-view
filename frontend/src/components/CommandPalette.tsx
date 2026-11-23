import { useUiStore } from '../store/uiStore.ts';
import { CommandPaletteSearch } from './CommandPaletteSearch.tsx';
import { usePresence } from './usePresence.ts';

/** Ctrl+K: one search over symbols, indicators and actions; Enter runs the selected one. */
export function CommandPalette() {
  const open = useUiStore((s) => s.modal === 'palette');
  const closeModal = useUiStore((s) => s.closeModal);
  const { shown, attrs, key } = usePresence(open ? true : null);
  if (shown === null) return null;
  return (
    <CommandPaletteSearch
      key={key}
      attrs={attrs}
      onClose={() => {
        closeModal('palette');
      }}
    />
  );
}
