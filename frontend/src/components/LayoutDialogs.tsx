import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { deleteLayout, fetchLayouts } from '../api/layouts.ts';
import { useLayoutStore } from '../store/layoutStore.ts';
import { openLayout, saveAs } from '../store/layoutSync.ts';
import { useUiStore } from '../store/uiStore.ts';
import styles from './LayoutDialogs.module.css';
import { ModalShell } from './ModalShell.tsx';
import { NameDialog } from './NameDialog.tsx';
import { usePresence } from './usePresence.ts';

/** The layout dialogs of the layout menu: rename, make a copy, open (with delete). */
export function LayoutDialogs() {
  const modal = useUiStore((s) => s.modal);
  const closeModal = useUiStore((s) => s.closeModal);
  const name = useLayoutStore((s) => s.name);
  const naming = usePresence(modal === 'layoutRename' || modal === 'layoutCopy' ? modal : null);
  const list = usePresence(modal === 'layouts' ? true : null);

  return (
    <>
      {naming.shown !== null && (
        <NameDialog
          key={naming.key}
          attrs={naming.attrs}
          title={naming.shown === 'layoutRename' ? 'Rename layout' : 'Make a copy'}
          label="Layout name"
          initial={naming.shown === 'layoutRename' ? name : `${name} copy`}
          submitLabel={naming.shown === 'layoutRename' ? 'Rename layout' : 'Save copy'}
          onSubmit={async (next) => {
            if (next === name) return null;
            const done = await saveAs(next, { replace: naming.shown === 'layoutRename' });
            return done ? null : `A layout named “${next}” already exists.`;
          }}
          onClose={() => {
            closeModal(naming.shown ?? 'layoutRename');
          }}
        />
      )}
      {list.shown !== null && (
        <OpenLayoutDialog
          key={list.key}
          attrs={list.attrs}
          onClose={() => {
            closeModal('layouts');
          }}
        />
      )}
    </>
  );
}

function OpenLayoutDialog({
  attrs,
  onClose,
}: {
  attrs: ReturnType<typeof usePresence>['attrs'];
  onClose: () => void;
}) {
  const active = useLayoutStore((s) => s.name);
  const query = useQuery({ queryKey: ['layouts'], queryFn: ({ signal }) => fetchLayouts(signal) });
  const client = useQueryClient();
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <ModalShell title="Open layout" attrs={attrs} onClose={onClose}>
      <div className={styles.body}>
        {query.isPending && <p className={styles.note}>Loading layouts…</p>}
        {query.isError && (
          <p className={styles.note} role="alert">
            Could not load the layouts: {query.error.message}
          </p>
        )}
        {query.data?.length === 0 && <p className={styles.note}>No saved layouts yet.</p>}
        <ul className={styles.list} aria-label="Layouts">
          {query.data?.map((layout) => (
            <li
              key={layout.name}
              className={styles.row}
              aria-current={layout.name === active || undefined}
            >
              {confirming === layout.name ? (
                <>
                  <span className={styles.ask}>Delete “{layout.name}”?</span>
                  <button
                    type="button"
                    className={styles.danger}
                    onClick={() => {
                      void deleteLayout(layout.name, layout.revision).then(() => {
                        setConfirming(null);
                        void client.invalidateQueries({ queryKey: ['layouts'] });
                      });
                    }}
                  >
                    Delete layout
                  </button>
                  <button
                    type="button"
                    className={styles.cancel}
                    onClick={() => {
                      setConfirming(null);
                    }}
                  >
                    Keep
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.open}
                    onClick={() => {
                      onClose();
                      void openLayout(layout.name);
                    }}
                  >
                    <span className={styles.name}>{layout.name}</span>
                    <span className={styles.meta}>
                      {layout.symbol} · {layout.interval}
                      {layout.name === active ? ' · open' : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.icon}
                    aria-label={`Delete layout ${layout.name}`}
                    title={layout.name === active ? 'The open layout cannot be deleted' : 'Delete'}
                    disabled={layout.name === active}
                    onClick={() => {
                      setConfirming(layout.name);
                    }}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </ModalShell>
  );
}
