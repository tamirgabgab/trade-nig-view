import { Camera } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { useUiStore } from '../store/uiStore.ts';
import { ActionMenu } from './ActionMenu.tsx';
import styles from './ActionMenu.module.css';
import { IconButton } from './IconButton.tsx';
import { usePresence } from './usePresence.ts';

/** Camera button: a menu to copy the chart image (also Alt+S, in useAppHotkeys) or save a PNG. */
export function SnapshotMenu() {
  const requestSnapshot = useUiStore((s) => s.requestSnapshot);
  const [open, setOpen] = useState(false);
  const menu = usePresence(open ? true : null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) wrapperRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <IconButton
        label="Take a snapshot"
        icon={<Camera size={18} />}
        tooltipSide="left"
        aria-haspopup="menu"
        aria-expanded={open}
        pressed={open}
        onClick={() => {
          setOpen(!open);
        }}
      />
      {menu.shown && (
        <ActionMenu
          key={menu.key}
          label="Snapshot"
          attrs={menu.attrs}
          anchor={wrapperRef}
          style={{ left: 'auto', right: 0 }}
          onClose={close}
          items={[
            {
              label: 'Copy image',
              shortcut: 'Alt+S',
              onSelect: () => {
                requestSnapshot('copy');
              },
            },
            {
              label: 'Download PNG',
              onSelect: () => {
                requestSnapshot('download');
              },
            },
          ]}
        />
      )}
    </div>
  );
}
