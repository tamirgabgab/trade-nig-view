import { useCallback, useId, useRef, useState } from 'react';

import { usePresence } from './usePresence.ts';

/**
 * The state of a button that opens an ActionMenu: open or not, the menu's presence (exit
 * animation), the wrapper (the menu's anchor) and `close`, which can give the focus back to the
 * button (Esc) or not (a click elsewhere).
 */
export function useMenuButton() {
  const [open, setOpen] = useState(false);
  const menu = usePresence(open ? true : null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) wrapperRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);
  return { open, setOpen, menu, wrapperRef, menuId, close };
}
