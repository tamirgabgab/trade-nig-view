import type { ButtonHTMLAttributes, ReactNode } from 'react';

import styles from './IconButton.module.css';

export type TooltipSide = 'top' | 'bottom' | 'bottom-end' | 'left' | 'right';

const SIDE_CLASS: Record<TooltipSide, string | undefined> = {
  top: styles.top,
  bottom: styles.bottom,
  'bottom-end': styles.bottomEnd,
  left: styles.left,
  right: styles.right,
};

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'aria-pressed' | 'children'
> {
  /** Accessible name; also the tooltip text. Required: every icon button needs one. */
  label: string;
  icon?: ReactNode;
  /** Visible text next to the icon (e.g. "Indicators"). */
  text?: string;
  /** Keyboard shortcut shown in the tooltip, e.g. "Alt+H". */
  shortcut?: string;
  /** Toggle state; omit for plain buttons. */
  pressed?: boolean;
  /** Round in which the feature lands; renders the button inert but focusable. */
  comingIn?: string;
  tooltipSide?: TooltipSide;
}

/**
 * Square toolbar button with a mandatory accessible label and a hover/focus tooltip that shows the
 * shortcut as a key cap. Buttons of later rounds stay focusable but are dimmed and carry a small dot.
 */
export function IconButton({
  label,
  icon,
  text,
  shortcut,
  pressed,
  comingIn,
  tooltipSide = 'bottom',
  className,
  onClick,
  ...rest
}: IconButtonProps) {
  const classes = [styles.button, SIDE_CLASS[tooltipSide], text ? styles.withLabel : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      {...rest}
      className={classes}
      aria-label={label}
      aria-pressed={pressed}
      aria-disabled={comingIn ? true : rest['aria-disabled']}
      aria-keyshortcuts={shortcut}
      onClick={comingIn ? undefined : onClick}
    >
      {icon}
      {text && <span className={styles.label}>{text}</span>}
      {/* Hidden from the a11y tree: the button's name is `label`, the shortcut is aria-keyshortcuts. */}
      <span className={styles.tooltip} aria-hidden="true" data-testid="tooltip">
        {label}
        {shortcut && <kbd className={styles.kbd}>{shortcut}</kbd>}
        {comingIn && <span className={styles.soon}>coming in {comingIn}</span>}
      </span>
    </button>
  );
}
