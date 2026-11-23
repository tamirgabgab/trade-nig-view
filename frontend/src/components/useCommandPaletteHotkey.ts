import { useEffect } from 'react';

import { selectModalOpen, useUiStore } from '../store/uiStore.ts';

/** True for Ctrl+K (Cmd+K on a Mac), also inside text fields, as in most apps. */
export function opensPalette(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k';
}

/** Ctrl+K opens the command palette when no other dialog is open. */
export function useCommandPaletteHotkey(): void {
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const blocked = useUiStore(selectModalOpen);
  useEffect(() => {
    if (blocked) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!opensPalette(event)) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [setOpen, blocked]);
}
