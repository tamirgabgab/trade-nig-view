import { Trash2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { DEFAULT_FIB_LEVELS } from '../drawings/fib.ts';
import { TOOL_LABELS } from '../drawings/manager.ts';
import { RETURN_UNITS } from '../drawings/measure.ts';
import type { Drawing, LineStyle, ReturnUnit } from '../drawings/types.ts';
import { useDrawingStore } from '../store/drawingStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { FibLevelsTable } from './FibLevelsTable.tsx';
import styles from './IndicatorSettingsPanel.module.css';
import { restoreFocus, usePresence } from './usePresence.ts';

const WIDTHS = [1, 2, 3, 4] as const;
const LINE_STYLES: { id: LineStyle; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
];

/**
 * Side panel of the selected drawing (double-click it, or the floating toolbar's settings):
 * style, text, anchor prices and lock. Every change applies at once.
 */
export function DrawingSettingsPanel() {
  const id = useUiStore((s) => s.drawingSettingsFor);
  const open = useUiStore((s) => s.openDrawingSettings);
  const showToast = useUiStore((s) => s.showToast);
  const drawing = useDrawingStore((s) => s.drawings.find((d) => d.id === id));
  const update = useDrawingStore((s) => s.update);
  const remove = useDrawingStore((s) => s.remove);
  const restore = useDrawingStore((s) => s.restore);
  const presence = usePresence(drawing ?? null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  // Another drawing's settings: start from its own prices.
  const [draftsFor, setDraftsFor] = useState(id);
  if (draftsFor !== id) {
    setDraftsFor(id);
    setDrafts({});
  }
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const shown = presence.shown;

  // Focus the first field on open (the text of a new label); give focus back on close.
  const present = shown !== null;
  useEffect(() => {
    if (!present) return;
    const previous = document.activeElement;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>('input, select')?.focus();
    return () => {
      restoreFocus(previous, panel);
    };
  }, [present]);

  if (shown === null) return null;
  const close = () => {
    open(null);
  };
  const change = (patch: (d: Drawing) => Drawing) => {
    update(shown.id, patch);
  };
  const label = TOOL_LABELS[shown.type];

  return (
    <aside
      ref={panelRef}
      key={presence.key}
      className={styles.panel}
      {...presence.attrs}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      }}
    >
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {label}
        </h2>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Close settings"
          onClick={close}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.body}>
        {shown.type === 'text' && (
          <section aria-labelledby={`${titleId}-text`}>
            <h3 id={`${titleId}-text`} className={styles.section}>
              Text
            </h3>
            <div className={styles.field}>
              <label htmlFor={`${titleId}-content`} className={styles.label}>
                Text
              </label>
              <input
                id={`${titleId}-content`}
                className={styles.control}
                maxLength={500}
                value={shown.props.text ?? ''}
                onChange={(event) => {
                  const text = event.target.value;
                  change((d) => ({ ...d, props: { ...d.props, text } }));
                }}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={`${titleId}-size`} className={styles.label}>
                Font size
              </label>
              <select
                id={`${titleId}-size`}
                className={styles.control}
                value={shown.props.font_size ?? 14}
                onChange={(event) => {
                  const font_size = Number(event.target.value);
                  change((d) => ({ ...d, props: { ...d.props, font_size } }));
                }}
              >
                {[10, 12, 14, 18, 24, 32].map((size) => (
                  <option key={size} value={size}>
                    {size}px
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}
        <section aria-labelledby={`${titleId}-style`}>
          <h3 id={`${titleId}-style`} className={styles.section}>
            Style
          </h3>
          <div className={styles.styleRow}>
            <span className={styles.label}>Color</span>
            <input
              type="color"
              className={styles.color}
              aria-label="Color"
              value={shown.style.line_color}
              onChange={(event) => {
                const line_color = event.target.value;
                change((d) => ({ ...d, style: { ...d.style, line_color } }));
              }}
            />
            {shown.type !== 'text' && (
              <select
                className={styles.control}
                aria-label="Line width"
                value={shown.style.line_width}
                onChange={(event) => {
                  const line_width = Number(event.target.value);
                  change((d) => ({ ...d, style: { ...d.style, line_width } }));
                }}
              >
                {WIDTHS.map((w) => (
                  <option key={w} value={w}>
                    {w}px
                  </option>
                ))}
              </select>
            )}
          </div>
          {shown.type !== 'text' && (
            <div className={styles.field}>
              <label htmlFor={`${titleId}-line`} className={styles.label}>
                Line style
              </label>
              <select
                id={`${titleId}-line`}
                className={styles.control}
                value={shown.style.line_style}
                onChange={(event) => {
                  const line_style = event.target.value as LineStyle;
                  change((d) => ({ ...d, style: { ...d.style, line_style } }));
                }}
              >
                {LINE_STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {shown.type === 'rectangle' && (
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={shown.props.fill !== false}
                onChange={(event) => {
                  const fill = event.target.checked;
                  change((d) => ({ ...d, props: { ...d.props, fill } }));
                }}
              />
              Fill the inside
            </label>
          )}
        </section>
        {shown.type === 'return_range' && (
          <section aria-label="Equivalent return">
            <div className={styles.field}>
              <label htmlFor={`${titleId}-unit`} className={styles.label}>
                Return per
              </label>
              <select
                id={`${titleId}-unit`}
                className={styles.control}
                value={shown.props.unit ?? 'year'}
                onChange={(event) => {
                  const unit = event.target.value as ReturnUnit;
                  change((d) => ({ ...d, props: { ...d.props, unit } }));
                }}
              >
                {RETURN_UNITS.map((u) => (
                  <option key={u.unit} value={u.unit}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}
        {shown.type === 'stats_range' && (
          <section aria-label="Statistics">
            <div className={styles.field}>
              <label htmlFor={`${titleId}-returns`} className={styles.label}>
                Returns
              </label>
              <select
                id={`${titleId}-returns`}
                className={styles.control}
                value={shown.props.returns ?? 'log'}
                onChange={(event) => {
                  const returns = event.target.value as 'log' | 'simple';
                  change((d) => ({ ...d, props: { ...d.props, returns } }));
                }}
              >
                <option value="log">Log</option>
                <option value="simple">Simple</option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor={`${titleId}-basis`} className={styles.label}>
                From
              </label>
              <select
                id={`${titleId}-basis`}
                className={styles.control}
                value={shown.props.basis ?? 'close'}
                onChange={(event) => {
                  const basis = event.target.value as 'close' | 'open';
                  change((d) => ({ ...d, props: { ...d.props, basis } }));
                }}
              >
                <option value="close">Previous close to close</option>
                <option value="open">Open to close (within the bar)</option>
              </select>
            </div>
          </section>
        )}
        {(shown.type === 'fib_retracement' || shown.type === 'fib_extension') && (
          <section aria-labelledby={`${titleId}-levels`}>
            <h3 id={`${titleId}-levels`} className={styles.section}>
              Levels
            </h3>
            <FibLevelsTable
              key={shown.id}
              levels={shown.props.levels ?? DEFAULT_FIB_LEVELS}
              onChange={(levels) => {
                change((d) => ({ ...d, props: { ...d.props, levels } }));
              }}
            />
          </section>
        )}
        <section aria-labelledby={`${titleId}-points`}>
          <h3 id={`${titleId}-points`} className={styles.section}>
            Coordinates
          </h3>
          {shown.points.map((point, index) => (
            <div key={index} className={styles.field}>
              <label htmlFor={`${titleId}-p${String(index)}`} className={styles.label}>
                {shown.points.length > 1 ? `Price ${String(index + 1)}` : 'Price'}
              </label>
              <input
                id={`${titleId}-p${String(index)}`}
                className={styles.control}
                type="number"
                step="any"
                // The typed text while editing; otherwise the live price (it follows drags).
                value={drafts[index] ?? String(point.price)}
                onChange={(event) => {
                  const text = event.target.value;
                  setDrafts((d) => ({ ...d, [index]: text }));
                  const price = Number(text);
                  if (text === '' || !Number.isFinite(price)) return;
                  change((d) => ({
                    ...d,
                    points: d.points.map((p, i) => (i === index ? { ...p, price } : p)),
                  }));
                }}
                onBlur={() => {
                  setDrafts((d) =>
                    Object.fromEntries(Object.entries(d).filter(([key]) => key !== String(index))),
                  );
                }}
              />
            </div>
          ))}
          <p className={styles.note}>
            {new Date((shown.points[0]?.time ?? 0) * 1000)
              .toISOString()
              .slice(0, 16)
              .replace('T', ' ')}{' '}
            UTC
          </p>
        </section>
        <section aria-labelledby={`${titleId}-visibility`}>
          <h3 id={`${titleId}-visibility`} className={styles.section}>
            Lock
          </h3>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={shown.locked}
              onChange={(event) => {
                const locked = event.target.checked;
                change((d) => ({ ...d, locked }));
              }}
            />
            Lock (cannot be moved)
          </label>
        </section>
      </div>
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => {
            close();
            const removed = remove(shown.id);
            if (removed !== null) {
              showToast(`Removed ${label}`, () => {
                restore(removed);
              });
            }
          }}
        >
          <Trash2 size={14} aria-hidden="true" /> Delete
        </button>
        <button type="button" className={styles.primary} onClick={close}>
          Close
        </button>
      </div>
    </aside>
  );
}
