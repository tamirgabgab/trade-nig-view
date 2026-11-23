import { useEffect } from 'react';

import { useUiStore } from '../store/uiStore.ts';

/** True for `?` typed outside a text field. */
export function opensShortcuts(event: KeyboardEvent): boolean {
  if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.defaultPrevented) return false;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return true;
  if (target.isContentEditable) return false;
  return !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** `?` anywhere outside a text field opens the keyboard shortcuts dialog. */
export function useShortcutsHotkey(): void {
  const setOpen = useUiStore((s) => s.setShortcutsOpen);
  const blocked = useUiStore((s) => s.shortcutsOpen || s.indicatorsDialog || s.symbolSearch.open);
  useEffect(() => {
    if (blocked) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!opensShortcuts(event)) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [setOpen, blocked]);
}
