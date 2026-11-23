import { ChevronDown, Plus } from 'lucide-react';

import { useUiStore } from '../store/uiStore.ts';
import { useWatchlistStore } from '../store/watchlistStore.ts';
import { ActionMenu } from './ActionMenu.tsx';
import menuStyles from './ActionMenu.module.css';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { IconButton } from './IconButton.tsx';
import { NameDialog } from './NameDialog.tsx';
import { usePresence } from './usePresence.ts';
import type { useWatchlistEditor } from './useWatchlistEditor.ts';
import { addSection, renameSection } from './watchlistEdit.ts';
import styles from './WatchlistHeader.module.css';
import { useMenuButton } from './useMenuButton.ts';

type Editor = ReturnType<typeof useWatchlistEditor>;

/** The watchlist's own bar: pick, create, rename or delete a list; add a symbol or a section. */
export function WatchlistHeader({ editor }: { editor: Editor }) {
  const modal = useUiStore((s) => s.modal);
  const openModal = useUiStore((s) => s.openModal);
  const closeModal = useUiStore((s) => s.closeModal);
  const section = useWatchlistStore((s) => s.editingSection);
  const { open, setOpen, menu, wrapperRef, menuId, close } = useMenuButton();
  const naming = usePresence(
    modal === 'watchlistNew' ||
      modal === 'watchlistRename' ||
      modal === 'sectionAdd' ||
      modal === 'sectionRename'
      ? modal
      : null,
  );
  const deleting = usePresence(modal === 'watchlistDelete' ? true : null);
  const active = editor.active;
  const name = active?.name ?? 'Watchlist';
  const sections = active?.sections ?? [];

  const dialog = {
    watchlistNew: {
      title: 'Create a watchlist',
      label: 'List name',
      initial: '',
      submit: 'Create list',
    },
    watchlistRename: {
      title: 'Rename watchlist',
      label: 'List name',
      initial: name,
      submit: 'Rename list',
    },
    sectionAdd: {
      title: 'Add a section',
      label: 'Section title',
      initial: '',
      submit: 'Add section',
    },
    sectionRename: {
      title: 'Rename section',
      label: 'Section title',
      initial: sections[section]?.title ?? '',
      submit: 'Rename section',
    },
  } as const;

  return (
    <div className={styles.header}>
      <div ref={wrapperRef} className={menuStyles.wrapper}>
        <button
          type="button"
          className={styles.list}
          aria-label={`Watchlist: ${name}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => {
            setOpen(!open);
          }}
        >
          <span className={styles.name}>{name}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {menu.shown && (
          <ActionMenu
            key={menu.key}
            id={menuId}
            label="Watchlists"
            attrs={menu.attrs}
            anchor={wrapperRef}
            onClose={close}
            items={[
              ...editor.lists.map((list) => ({
                label: list.name,
                radio: true,
                checked: list.name === name,
                onSelect: () => {
                  editor.select(list.name);
                },
              })),
              {
                label: 'Create a new list…',
                divider: true,
                onSelect: () => {
                  openModal('watchlistNew');
                },
              },
              {
                label: 'Rename this list…',
                onSelect: () => {
                  openModal('watchlistRename');
                },
              },
              {
                label: 'Add a section…',
                onSelect: () => {
                  openModal('sectionAdd');
                },
              },
              {
                label: 'Delete this list…',
                onSelect: () => {
                  openModal('watchlistDelete');
                },
              },
            ]}
          />
        )}
      </div>
      <IconButton
        label="Add symbol to the watchlist"
        icon={<Plus size={18} />}
        tooltipSide="bottom-end"
        aria-haspopup="dialog"
        onClick={() => {
          openModal('watchlistAdd');
        }}
      />
      {naming.shown !== null && (
        <NameDialog
          key={naming.key}
          attrs={naming.attrs}
          title={dialog[naming.shown].title}
          label={dialog[naming.shown].label}
          initial={dialog[naming.shown].initial}
          submitLabel={dialog[naming.shown].submit}
          onSubmit={async (text) => {
            switch (naming.shown) {
              case 'watchlistNew':
                return editor.create(text);
              case 'watchlistRename':
                return editor.rename(text);
              case 'sectionAdd':
                if (sections.some((s) => s.title === text)) return `There is a section “${text}”.`;
                editor.edit((s) => addSection(s, text));
                return null;
              default:
                editor.edit((s) => renameSection(s, section, text));
                return null;
            }
          }}
          onClose={() => {
            closeModal(naming.shown ?? 'watchlistNew');
          }}
        />
      )}
      {deleting.shown !== null && (
        <ConfirmDialog
          title={`Delete the watchlist “${name}”?`}
          message={`This deletes the list and its ${String(sections.reduce((n, s) => n + s.symbols.length, 0))} symbols (the symbols stay available in search).`}
          confirmLabel="Delete list"
          onCancel={() => {
            closeModal('watchlistDelete');
          }}
          onConfirm={() => {
            closeModal('watchlistDelete');
            void editor.remove();
          }}
        />
      )}
    </div>
  );
}
