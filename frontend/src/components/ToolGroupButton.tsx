import { ChevronRight } from 'lucide-react';

import { useDrawingStore } from '../store/drawingStore.ts';
import { ActionMenu } from './ActionMenu.tsx';
import type { ToolGroup } from './drawingTools.ts';
import { IconButton } from './IconButton.tsx';
import styles from './ToolGroupButton.module.css';
import { useMenuButton } from './useMenuButton.ts';

const ICON_SIZE = 20;

/**
 * One group of the left toolbar: the button draws with the group's last tool; the small arrow
 * opens the group's tools.
 */
export function ToolGroupButton({ group }: { group: ToolGroup }) {
  const activeTool = useDrawingStore((s) => s.tool);
  const last = useDrawingStore((s) => s.lastTool[group.id]);
  const setTool = useDrawingStore((s) => s.setTool);
  const iconName = useDrawingStore((s) => s.iconName);
  const setIconName = useDrawingStore((s) => s.setIconName);
  // The Icons group's entries share a type; the picked icon tells them apart.
  const isTool = (t: ToolGroup['tools'][number], type: string | null | undefined) =>
    t.type === type && (t.iconName === undefined || t.iconName === iconName);
  const pick = (t: ToolGroup['tools'][number]) => {
    if (t.iconName !== undefined) setIconName(t.iconName);
    setTool(t.type, group.id);
  };
  const { open, setOpen, menu, wrapperRef, close } = useMenuButton();

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

  const current = group.tools.find((t) => isTool(t, last)) ?? group.tools[0];
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
          if (activeTool === current.type) setTool(null);
          else pick(current);
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
            checked: isTool(t, activeTool),
            icon: <t.icon size={16} strokeWidth={1.5} aria-hidden="true" />,
            ...(t.shortcut === undefined ? {} : { shortcut: t.shortcut }),
            onSelect: () => {
              pick(t);
            },
          }))}
        />
      )}
    </div>
  );
}
