import { Lock, LockOpen, Minus, Settings2, Trash2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { TOOL_LABELS } from '../drawings/manager.ts';
import type { LineStyle } from '../drawings/types.ts';
import { useDrawingStore } from '../store/drawingStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { ActionMenu } from './ActionMenu.tsx';
import styles from './DrawingFloatToolbar.module.css';
import { IconButton } from './IconButton.tsx';
import { usePresence } from './usePresence.ts';

const LINE_STYLES: { id: LineStyle; label: string }[] = [
  { id: 'solid', label: 'Solid line' },
  { id: 'dashed', label: 'Dashed line' },
  { id: 'dotted', label: 'Dotted line' },
];

/**
 * Small toolbar at the top of the chart while a drawing is selected: colour, width, line style,
 * settings, lock and delete. The full settings are in the side panel.
 */
export function DrawingFloatToolbar() {
  const drawing = useDrawingStore((s) =>
    s.tool === null ? s.drawings.find((d) => d.id === s.selectedId) : undefined,
  );
  const update = useDrawingStore((s) => s.update);
  const remove = useDrawingStore((s) => s.remove);
  const restore = useDrawingStore((s) => s.restore);
  const openSettings = useUiStore((s) => s.openDrawingSettings);
  const showToast = useUiStore((s) => s.showToast);
  const [menu, setMenu] = useState<'width' | 'style' | null>(null);
  const presence = usePresence(menu);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setMenu(null);
  }, []);

  if (drawing === undefined) return null;
  const label = TOOL_LABELS[drawing.type];
  const isText = drawing.type === 'text';

  return (
    <div ref={ref} className={styles.bar} role="toolbar" aria-label={`${label} toolbar`}>
      <label className={styles.swatch} title="Color">
        <span className={styles.chip} style={{ background: drawing.style.line_color }} />
        <input
          type="color"
          aria-label="Color"
          value={drawing.style.line_color}
          onChange={(event) => {
            const line_color = event.target.value;
            update(drawing.id, (d) => ({ ...d, style: { ...d.style, line_color } }));
          }}
        />
      </label>
      {!isText && (
        <>
          <IconButton
            label="Line width"
            text={`${String(drawing.style.line_width)}px`}
            pressed={menu === 'width'}
            onClick={() => {
              setMenu(menu === 'width' ? null : 'width');
            }}
          />
          <IconButton
            label="Line style"
            icon={<Minus size={16} />}
            pressed={menu === 'style'}
            onClick={() => {
              setMenu(menu === 'style' ? null : 'style');
            }}
          />
        </>
      )}
      <IconButton
        label="Edit settings"
        icon={<Settings2 size={16} />}
        onClick={() => {
          openSettings(drawing.id);
        }}
      />
      <IconButton
        label={drawing.locked ? 'Unlock' : 'Lock'}
        icon={drawing.locked ? <Lock size={16} /> : <LockOpen size={16} />}
        pressed={drawing.locked}
        onClick={() => {
          update(drawing.id, (d) => ({ ...d, locked: !d.locked }));
        }}
      />
      <IconButton
        label={`Delete ${label}`}
        shortcut="Del"
        icon={<Trash2 size={16} />}
        onClick={() => {
          openSettings(null);
          const removed = remove(drawing.id);
          if (removed !== null) {
            showToast(`Removed ${label}`, () => {
              restore(removed);
            });
          }
        }}
      />
      {presence.shown !== null && (
        <ActionMenu
          key={presence.key}
          label={presence.shown === 'width' ? 'Line width' : 'Line style'}
          attrs={presence.attrs}
          anchor={ref}
          onClose={close}
          items={
            presence.shown === 'width'
              ? [1, 2, 3, 4].map((w) => ({
                  label: `${String(w)}px`,
                  radio: true,
                  checked: drawing.style.line_width === w,
                  onSelect: () => {
                    update(drawing.id, (d) => ({ ...d, style: { ...d.style, line_width: w } }));
                  },
                }))
              : LINE_STYLES.map((s) => ({
                  label: s.label,
                  radio: true,
                  checked: drawing.style.line_style === s.id,
                  onSelect: () => {
                    update(drawing.id, (d) => ({ ...d, style: { ...d.style, line_style: s.id } }));
                  },
                }))
          }
        />
      )}
    </div>
  );
}
