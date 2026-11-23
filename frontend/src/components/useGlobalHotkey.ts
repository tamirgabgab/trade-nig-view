import { useEffect, useRef } from 'react';

import { selectModalOpen, useUiStore } from '../store/uiStore.ts';

/**
 * Run `action` for key presses that `match`, anywhere on the page, while no modal dialog is open
 * (so dialogs never stack). The key's default is prevented.
 */
export function useGlobalHotkey(
  match: (event: KeyboardEvent) => boolean,
  action: (event: KeyboardEvent) => void,
): void {
  const blocked = useUiStore(selectModalOpen);
  const latest = useRef({ match, action });
  useEffect(() => {
    latest.current = { match, action };
  });
  useEffect(() => {
    if (blocked) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!latest.current.match(event)) return;
      event.preventDefault();
      latest.current.action(event);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [blocked]);
}
