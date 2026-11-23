import { useEffect } from 'react';

import { selectModalOpen, useUiStore } from '../store/uiStore.ts';
import { isBareKeyOutsideField } from './keyTarget.ts';

/** True for `?` typed outside a text field. */
export function opensShortcuts(event: KeyboardEvent): boolean {
  return event.key === '?' && isBareKeyOutsideField(event);
}

/** `?` anywhere outside a text field opens the keyboard shortcuts dialog. */
export function useShortcutsHotkey(): void {
  const setOpen = useUiStore((s) => s.setShortcutsOpen);
  const blocked = useUiStore(selectModalOpen);
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
