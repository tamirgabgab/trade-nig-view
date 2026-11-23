import { Camera } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { selectModalOpen, useUiStore } from '../store/uiStore.ts';
import { ActionMenu } from './ActionMenu.tsx';
import styles from './ChartTypeMenu.module.css';
import { IconButton } from './IconButton.tsx';
import { usePresence } from './usePresence.ts';

/** Camera button: a menu to copy the chart image (Alt+S) or save it as a PNG. */
export function SnapshotMenu() {
  const requestSnapshot = useUiStore((s) => s.requestSnapshot);
  const modalOpen = useUiStore(selectModalOpen);
  const [open, setOpen] = useState(false);
  const menu = usePresence(open ? true : null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Alt+S copies the chart from anywhere (no dialog open).
  useEffect(() => {
    if (modalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // code, not key: Option+S on a Mac types "ß".
      if (!event.altKey || event.ctrlKey || event.metaKey || event.code !== 'KeyS') return;
      event.preventDefault();
      requestSnapshot('copy');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [modalOpen, requestSnapshot]);

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
