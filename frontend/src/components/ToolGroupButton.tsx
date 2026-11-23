import { ChevronRight } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { useDrawingStore } from '../store/drawingStore.ts';
import { ActionMenu } from './ActionMenu.tsx';
import type { ToolGroup } from './drawingTools.ts';
import { IconButton } from './IconButton.tsx';
import styles from './ToolGroupButton.module.css';
import { usePresence } from './usePresence.ts';

const ICON_SIZE = 20;

/**
 * One group of the left toolbar: the button draws with the group's last tool; the small arrow
 * opens the group's tools.
 */
export function ToolGroupButton({ group }: { group: ToolGroup }) {
  const activeTool = useDrawingStore((s) => s.tool);
  const last = useDrawingStore((s) => s.lastTool[group.id]);
  const setTool = useDrawingStore((s) => s.setTool);
  const [open, setOpen] = useState(false);
  const menu = usePresence(open ? true : null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) wrapperRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);

  if (group.comingIn !== undefined) {
    return (
      <IconButton
        label={group.label}
        icon={<group.icon size={ICON_SIZE} strokeWidth={1.5} />}
        tooltipSide="right"
        comingIn={group.comingIn}
      />
    );
  }

  const current = group.tools.find((t) => t.type === last) ?? group.tools[0];
  if (current === undefined) return null;
  const active = group.tools.some((t) => t.type === activeTool);

  return (
    <div ref={wrapperRef} className={styles.group}>
      <IconButton
        label={current.label}
        {...(current.shortcut === undefined ? {} : { shortcut: current.shortcut })}
        icon={<current.icon size={ICON_SIZE} strokeWidth={1.5} />}
        pressed={active}
        tooltipSide="right"
        onClick={() => {
          setTool(activeTool === current.type ? null : current.type, group.id);
        }}
      />
      {group.tools.length > 1 && (
        <button
          type="button"
          className={styles.more}
          aria-label={`${group.label}: all tools`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          <ChevronRight size={10} aria-hidden="true" />
        </button>
      )}
      {menu.shown && (
        <ActionMenu
          key={menu.key}
          label={group.label}
          attrs={menu.attrs}
          anchor={wrapperRef}
          style={{ top: 0, left: 'calc(100% + 6px)' }}
          initialActive={Math.max(group.tools.indexOf(current), 0)}
          onClose={close}
          items={group.tools.map((t) => ({
            label: t.label,
            radio: true,
            checked: t.type === activeTool,
            icon: <t.icon size={16} strokeWidth={1.5} aria-hidden="true" />,
            ...(t.shortcut === undefined ? {} : { shortcut: t.shortcut }),
            onSelect: () => {
              setTool(t.type, group.id);
            },
          }))}
        />
      )}
    </div>
  );
}
