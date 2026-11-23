import { Check } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

import styles from './ChartTypeMenu.module.css';
import type { OverlayAttrs } from './usePresence.ts';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** Shown on the right, e.g. "Alt+S". */
  shortcut?: string;
  /** A toggle (log scale): rendered as a checkbox item with a tick when true. */
  checked?: boolean;
  /** Draw a divider above this item. */
  divider?: boolean;
}

interface ActionMenuProps {
  label: string;
  items: readonly MenuItem[];
  /** Called with whether focus should go back to the opener (Esc, a pick) or stay (a click away). */
  onClose: (restoreFocus: boolean) => void;
  style?: CSSProperties;
  attrs?: OverlayAttrs;
}

/** A list of actions in a popup (snapshot menu, chart context menu): arrows, Enter, Esc. */
export function ActionMenu({ label, items, onClose, style, attrs }: ActionMenuProps) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    itemRefs.current[active]?.focus();
  }, [active]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [onClose]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = items.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: active === last ? 0 : active + 1,
      ArrowUp: active === 0 ? last : active - 1,
      Home: 0,
      End: last,
    };
    const next = moves[event.key];
    if (next !== undefined) {
      event.preventDefault();
      setActive(next);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose(true);
    } else if (event.key === 'Tab') {
      onClose(false);
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={styles.menu}
      style={style}
      onKeyDown={onKeyDown}
      {...attrs}
    >
      {items.map((item, index) => (
        <button
          key={item.label}
          ref={(el) => {
            itemRefs.current[index] = el;
          }}
          type="button"
          role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
          aria-checked={item.checked}
          tabIndex={index === active ? 0 : -1}
          className={[styles.item, item.divider ? styles.divider : ''].join(' ')}
          onClick={() => {
            onClose(true);
            item.onSelect();
          }}
          onMouseEnter={() => {
            setActive(index);
          }}
        >
          <span className={styles.itemLabel}>{item.label}</span>
          {item.checked === true && <Check size={14} className={styles.check} aria-hidden="true" />}
          {item.shortcut !== undefined && <kbd className={styles.shortcut}>{item.shortcut}</kbd>}
        </button>
      ))}
    </div>
  );
}
