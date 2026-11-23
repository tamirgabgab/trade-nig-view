import { useEffect } from 'react';

import { selectModalOpen, useUiStore } from '../store/uiStore.ts';
import { opensSymbolSearch } from './symbolSearch.ts';

/**
 * Opens symbol search when a letter or digit is typed anywhere outside a text field (the typed
 * key becomes the first character of the query), as on TradingView.
 */
export function useSymbolSearchHotkey(): void {
  const open = useUiStore((s) => s.openSymbolSearch);
  const isOpen = useUiStore(selectModalOpen);
  useEffect(() => {
    if (isOpen) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!opensSymbolSearch(event)) return;
      event.preventDefault();
      open(event.key.toUpperCase());
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, isOpen]);
}
