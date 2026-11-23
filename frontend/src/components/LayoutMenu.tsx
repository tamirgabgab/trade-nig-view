import { ChevronDown } from 'lucide-react';

import { useLayoutStore } from '../store/layoutStore.ts';
import { saveLayoutNow } from '../store/layoutSync.ts';
import { useUiStore } from '../store/uiStore.ts';
import { ActionMenu } from './ActionMenu.tsx';
import menuStyles from './ActionMenu.module.css';
import styles from './LayoutMenu.module.css';
import { useMenuButton } from './useMenuButton.ts';

const STATUS: Record<string, string> = {
  loading: 'Loading…',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Not saved',
};

/** Top-right layout menu: the open layout's name and save state; save, rename, copy, open. */
export function LayoutMenu() {
  const name = useLayoutStore((s) => s.name);
  const status = useLayoutStore((s) => s.status);
  const openModal = useUiStore((s) => s.openModal);
  const { open, setOpen, menu, wrapperRef, menuId, close } = useMenuButton();

  return (
    <div ref={wrapperRef} className={menuStyles.wrapper}>
      <button
        type="button"
        className={styles.button}
        aria-label={`Layout: ${name} (${STATUS[status] ?? status})`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span className={styles.name}>{name}</span>
        <span className={styles.status} data-status={status}>
          {STATUS[status]}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {menu.shown && (
        <ActionMenu
          key={menu.key}
          id={menuId}
          label="Layout"
          attrs={menu.attrs}
          anchor={wrapperRef}
          style={{ right: 0, left: 'auto' }}
          onClose={close}
          items={[
            { label: 'Save layout', shortcut: 'Ctrl+S', onSelect: saveLayoutNow },
            {
              label: 'Rename…',
              onSelect: () => {
                openModal('layoutRename');
              },
            },
            {
              label: 'Make a copy…',
              onSelect: () => {
                openModal('layoutCopy');
              },
            },
            {
              label: 'Open layout…',
              divider: true,
              onSelect: () => {
                openModal('layouts');
              },
            },
          ]}
        />
      )}
    </div>
  );
}
