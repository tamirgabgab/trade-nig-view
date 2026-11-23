import { Eye, EyeOff, Lock, LockOpen, Settings2, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { TOOL_LABELS } from '../drawings/manager.ts';
import { useChartDataStore } from '../store/chartDataStore.ts';
import { useDrawingStore } from '../store/drawingStore.ts';
import { useIndicatorStore } from '../store/indicatorStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { removeIndicator } from './indicatorActions.ts';
import styles from './ObjectTree.module.css';

function Action({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={styles.action}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const ICON = 15;

/**
 * Every object on the chart (R6): its indicators and the symbol's drawings, each with show/hide,
 * settings or lock, and remove. A click on a drawing selects it on the chart; a double click
 * opens its settings.
 */
export function ObjectTree() {
  const views = useChartDataStore((s) => s.data?.views) ?? [];
  const toggleVisible = useIndicatorStore((s) => s.toggleVisible);
  const drawings = useDrawingStore((s) => s.drawings);
  const selectedId = useDrawingStore((s) => s.selectedId);
  const select = useDrawingStore((s) => s.select);
  const update = useDrawingStore((s) => s.update);
  const remove = useDrawingStore((s) => s.remove);
  const restore = useDrawingStore((s) => s.restore);
  const openSettings = useUiStore((s) => s.openSettings);
  const openDrawingSettings = useUiStore((s) => s.openDrawingSettings);
  const showToast = useUiStore((s) => s.showToast);

  return (
    <div className={styles.tree}>
      <section aria-labelledby="tree-indicators">
        <h3 id="tree-indicators" className={styles.heading}>
          Indicators
        </h3>
        {views.length === 0 ? (
          <p className={styles.empty}>No indicators. Press / to add one.</p>
        ) : (
          <ul className={styles.list}>
            {views.map((view) => {
              const { uid, visible } = view.instance;
              return (
                <li key={uid} className={styles.row} data-hidden={!visible || undefined}>
                  <span className={styles.name}>{view.label}</span>
                  <Action
                    label={`${visible ? 'Hide' : 'Show'} ${view.label}`}
                    onClick={() => {
                      toggleVisible(uid);
                    }}
                  >
                    {visible ? <Eye size={ICON} /> : <EyeOff size={ICON} />}
                  </Action>
                  <Action
                    label={`Settings of ${view.label}`}
                    onClick={() => {
                      openSettings(uid);
                    }}
                  >
                    <Settings2 size={ICON} />
                  </Action>
                  <Action
                    label={`Remove ${view.label}`}
                    onClick={() => {
                      removeIndicator(uid, view.label);
                    }}
                  >
                    <Trash2 size={ICON} />
                  </Action>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section aria-labelledby="tree-drawings">
        <h3 id="tree-drawings" className={styles.heading}>
          Drawings
        </h3>
        {drawings.length === 0 ? (
          <p className={styles.empty}>No drawings on this symbol.</p>
        ) : (
          <ul className={styles.list}>
            {[...drawings].reverse().map((drawing) => {
              const label =
                drawing.type === 'text' && drawing.props.text
                  ? `Text “${drawing.props.text}”`
                  : TOOL_LABELS[drawing.type];
              const { id, hidden, locked } = drawing;
              return (
                <li
                  key={id}
                  className={styles.row}
                  data-hidden={hidden || undefined}
                  aria-current={id === selectedId || undefined}
                >
                  <button
                    type="button"
                    className={styles.pick}
                    onClick={() => {
                      select(id);
                    }}
                    onDoubleClick={() => {
                      openDrawingSettings(id);
                    }}
                  >
                    {label}
                  </button>
                  <Action
                    label={`${hidden ? 'Show' : 'Hide'} ${label}`}
                    onClick={() => {
                      update(id, (d) => ({ ...d, hidden: !d.hidden }));
                    }}
                  >
                    {hidden ? <EyeOff size={ICON} /> : <Eye size={ICON} />}
                  </Action>
                  <Action
                    label={`${locked ? 'Unlock' : 'Lock'} ${label}`}
                    onClick={() => {
                      update(id, (d) => ({ ...d, locked: !d.locked }));
                    }}
                  >
                    {locked ? <Lock size={ICON} /> : <LockOpen size={ICON} />}
                  </Action>
                  <Action
                    label={`Remove ${label}`}
                    onClick={() => {
                      const removed = remove(id);
                      if (removed !== null)
                        showToast(`Removed ${label}`, () => {
                          restore(removed);
                        });
                    }}
                  >
                    <Trash2 size={ICON} />
                  </Action>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
