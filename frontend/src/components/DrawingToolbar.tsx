import {
  ChevronRight,
  Crosshair,
  Eraser,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Magnet,
  PencilLine,
  Trash2,
  ZoomIn,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { useDrawingStore } from '../store/drawingStore.ts';
import { useIndicatorStore } from '../store/indicatorStore.ts';
import { useUiStore, type Modal } from '../store/uiStore.ts';
import { ActionMenu, type MenuItem } from './ActionMenu.tsx';
import { plural } from './formatNumber.ts';
import { TOOL_GROUPS } from './drawingTools.ts';
import { IconButton } from './IconButton.tsx';
import groupStyles from './ToolGroupButton.module.css';
import { ToolGroupButton } from './ToolGroupButton.tsx';
import styles from './Toolbar.module.css';
import { usePresence } from './usePresence.ts';

const ICON_SIZE = 20;
const icon = (Icon: typeof Crosshair) => <Icon size={ICON_SIZE} strokeWidth={1.5} />;

/** Left vertical toolbar: cursor, drawing tool groups, magnet, drawing mode, lock, hide. */
export function DrawingToolbar({ className }: { className?: string | undefined }) {
  const s = useDrawingStore();
  const [magnetMenu, setMagnetMenu] = useState(false);
  const menu = usePresence(magnetMenu ? true : null);
  const magnetRef = useRef<HTMLDivElement>(null);
  const closeMagnet = useCallback(() => {
    setMagnetMenu(false);
  }, []);
  const [trashMenu, setTrashMenu] = useState(false);
  const trash = usePresence(trashMenu ? true : null);
  const trashRef = useRef<HTMLDivElement>(null);
  const closeTrash = useCallback(() => {
    setTrashMenu(false);
  }, []);
  const drawingCount = s.drawings.length;
  const indicatorCount = useIndicatorStore((st) => st.instances.length);
  const openModal = useUiStore((st) => st.openModal);
  const removals: { show: boolean; label: string; modal: Modal }[] = [
    {
      show: drawingCount > 0,
      label: `Remove ${plural(drawingCount, 'drawing')}…`,
      modal: 'removeDrawings',
    },
    {
      show: indicatorCount > 0,
      label: `Remove ${plural(indicatorCount, 'indicator')}…`,
      modal: 'removeIndicators',
    },
    {
      show: drawingCount > 0 && indicatorCount > 0,
      label: 'Remove all…',
      modal: 'removeEverything',
    },
  ];
  const trashItems: MenuItem[] = removals
    .filter((item) => item.show)
    .map(({ label, modal }) => ({
      label,
      divider: modal === 'removeEverything',
      onSelect: () => {
        openModal(modal);
      },
    }));

  return (
    <nav className={[styles.bar, styles.vertical, className].join(' ')} aria-label="Drawing tools">
      <IconButton
        label="Cross cursor"
        icon={icon(Crosshair)}
        pressed={s.tool === null && s.pointerTool === null}
        tooltipSide="right"
        onClick={() => {
          s.setPointerTool(null);
        }}
      />
      {TOOL_GROUPS.map((group) => (
        <ToolGroupButton key={group.id} group={group} />
      ))}
      <IconButton
        label="Eraser (click a drawing to remove it)"
        icon={icon(Eraser)}
        tooltipSide="right"
        pressed={s.pointerTool === 'eraser'}
        onClick={() => {
          s.setPointerTool(s.pointerTool === 'eraser' ? null : 'eraser');
        }}
      />
      <span className={styles.separator} aria-hidden="true" />
      <IconButton
        label="Zoom in (drag a box)"
        icon={icon(ZoomIn)}
        tooltipSide="right"
        pressed={s.pointerTool === 'zoom'}
        onClick={() => {
          s.setPointerTool(s.pointerTool === 'zoom' ? null : 'zoom');
        }}
      />
      <span className={styles.separator} aria-hidden="true" />
      <div ref={magnetRef} className={groupStyles.group}>
        <IconButton
          label={s.magnet === 'strong' ? 'Strong magnet' : 'Magnet mode'}
          icon={icon(Magnet)}
          pressed={s.magnet !== 'off'}
          tooltipSide="right"
          onClick={() => {
            s.setMagnet(s.magnet === 'off' ? 'weak' : 'off');
          }}
        />
        <button
          type="button"
          className={groupStyles.more}
          aria-label="Magnet: weak or strong"
          aria-haspopup="menu"
          aria-expanded={magnetMenu}
          onClick={() => {
            setMagnetMenu(!magnetMenu);
          }}
        >
          <ChevronRight size={10} aria-hidden="true" />
        </button>
        {menu.shown && (
          <ActionMenu
            key={menu.key}
            label="Magnet"
            attrs={menu.attrs}
            anchor={magnetRef}
            style={{ top: 0, left: 'calc(100% + 6px)' }}
            onClose={closeMagnet}
            items={[
              {
                label: 'Weak magnet (near a price)',
                radio: true,
                checked: s.magnet === 'weak',
                onSelect: () => {
                  s.setMagnet('weak');
                },
              },
              {
                label: 'Strong magnet (always)',
                radio: true,
                checked: s.magnet === 'strong',
                onSelect: () => {
                  s.setMagnet('strong');
                },
              },
            ]}
          />
        )}
      </div>
      <IconButton
        label="Stay in drawing mode"
        icon={icon(PencilLine)}
        pressed={s.stayInDrawing}
        tooltipSide="right"
        onClick={() => {
          s.toggle('stayInDrawing');
        }}
      />
      <IconButton
        label={s.lockAll ? 'Unlock all drawings' : 'Lock all drawings'}
        icon={s.lockAll ? icon(Lock) : icon(LockOpen)}
        pressed={s.lockAll}
        tooltipSide="right"
        onClick={() => {
          s.toggle('lockAll');
        }}
      />
      <IconButton
        label={s.hideAll ? 'Show all drawings' : 'Hide all drawings'}
        shortcut="Alt+Shift+H"
        icon={s.hideAll ? icon(EyeOff) : icon(Eye)}
        pressed={s.hideAll}
        tooltipSide="right"
        onClick={() => {
          s.toggle('hideAll');
        }}
      />
      <div ref={trashRef} className={groupStyles.group}>
        <IconButton
          label={trashItems.length === 0 ? 'Nothing to remove' : 'Remove objects'}
          icon={icon(Trash2)}
          tooltipSide="right"
          aria-haspopup={trashItems.length === 0 ? undefined : 'menu'}
          aria-expanded={trashItems.length === 0 ? undefined : trashMenu}
          aria-disabled={trashItems.length === 0 || undefined}
          onClick={() => {
            if (trashItems.length > 0) setTrashMenu(!trashMenu);
          }}
        />
        {trash.shown && (
          <ActionMenu
            key={trash.key}
            label="Remove objects"
            attrs={trash.attrs}
            anchor={trashRef}
            style={{ bottom: 0, left: 'calc(100% + 6px)' }}
            onClose={closeTrash}
            items={trashItems}
          />
        )}
      </div>
    </nav>
  );
}
