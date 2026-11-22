import type { ButtonHTMLAttributes, ReactNode } from 'react';

import styles from './IconButton.module.css';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

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

/** Square toolbar button with a mandatory accessible label and a hover/focus tooltip. */
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
  const tooltipParts = [label];
  if (shortcut) tooltipParts.push(`(${shortcut})`);
  if (comingIn) tooltipParts.push(`— coming in ${comingIn}`);

  const classes = [styles.button, styles[tooltipSide], text ? styles.withLabel : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      {...rest}
      className={classes}
      aria-label={label}
      aria-pressed={pressed}
      aria-disabled={comingIn ? true : undefined}
      aria-keyshortcuts={shortcut}
      data-tooltip={tooltipParts.join(' ')}
      onClick={comingIn ? undefined : onClick}
    >
      {icon}
      {text && <span className={styles.label}>{text}</span>}
    </button>
  );
}
