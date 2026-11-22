import { useState } from 'react';

import { DRAWING_TOOL_GROUPS, MEASURE_ACTIONS, TOGGLE_ICONS } from './drawingTools.ts';
import { IconButton } from './IconButton.tsx';
import styles from './Toolbar.module.css';

const ICON_SIZE = 20;
const { Magnet, Lock, LockOpen, Eye, EyeOff, Trash2 } = TOGGLE_ICONS;

interface DrawingToolbarProps {
  className?: string | undefined;
}

/**
 * Left vertical toolbar. In R0 it only keeps UI state (selected tool, toggles);
 * the DrawingManager that acts on it arrives in R4.
 */
export function DrawingToolbar({ className }: DrawingToolbarProps) {
  const [activeTool, setActiveTool] = useState('cursor');
  const [magnet, setMagnet] = useState(false);
  const [locked, setLocked] = useState(false);
  const [hidden, setHidden] = useState(false);

  return (
    <nav className={[styles.bar, styles.vertical, className].join(' ')} aria-label="Drawing tools">
      {DRAWING_TOOL_GROUPS.map(({ id, label, icon: Icon, shortcut }) => (
        <IconButton
          key={id}
          label={label}
          {...(shortcut ? { shortcut } : {})}
          icon={<Icon size={ICON_SIZE} strokeWidth={1.5} />}
          pressed={activeTool === id}
          tooltipSide="right"
          onClick={() => {
            setActiveTool(id);
          }}
        />
      ))}
      <span className={styles.separator} aria-hidden="true" />
      {MEASURE_ACTIONS.map(({ id, label, icon: Icon }) => (
        <IconButton
          key={id}
          label={label}
          icon={<Icon size={ICON_SIZE} strokeWidth={1.5} />}
          pressed={activeTool === id}
          tooltipSide="right"
          onClick={() => {
            setActiveTool(id);
          }}
        />
      ))}
      <span className={styles.separator} aria-hidden="true" />
      <IconButton
        label="Magnet mode"
        icon={<Magnet size={ICON_SIZE} strokeWidth={1.5} />}
        pressed={magnet}
        tooltipSide="right"
        onClick={() => {
          setMagnet((value) => !value);
        }}
      />
      <IconButton
        label={locked ? 'Unlock all drawings' : 'Lock all drawings'}
        icon={
          locked ? (
            <Lock size={ICON_SIZE} strokeWidth={1.5} />
          ) : (
            <LockOpen size={ICON_SIZE} strokeWidth={1.5} />
          )
        }
        pressed={locked}
        tooltipSide="right"
        onClick={() => {
          setLocked((value) => !value);
        }}
      />
      <IconButton
        label={hidden ? 'Show all drawings' : 'Hide all drawings'}
        shortcut="Alt+Shift+H"
        icon={
          hidden ? (
            <EyeOff size={ICON_SIZE} strokeWidth={1.5} />
          ) : (
            <Eye size={ICON_SIZE} strokeWidth={1.5} />
          )
        }
        pressed={hidden}
        tooltipSide="right"
        onClick={() => {
          setHidden((value) => !value);
        }}
      />
      <IconButton
        label="Remove all drawings"
        icon={<Trash2 size={ICON_SIZE} strokeWidth={1.5} />}
        tooltipSide="right"
        comingIn="R4"
      />
    </nav>
  );
}
