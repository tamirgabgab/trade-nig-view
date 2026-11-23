import { useEffect } from 'react';

import { selectModalOpen, useUiStore } from '../store/uiStore.ts';
import { opensIndicators } from './indicatorSearch.ts';

/** `/` anywhere outside a text field opens the indicators dialog, as on TradingView. */
export function useIndicatorsHotkey(): void {
  const setOpen = useUiStore((s) => s.setIndicatorsDialog);
  const blocked = useUiStore(selectModalOpen);
  useEffect(() => {
    if (blocked) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!opensIndicators(event)) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [setOpen, blocked]);
}
