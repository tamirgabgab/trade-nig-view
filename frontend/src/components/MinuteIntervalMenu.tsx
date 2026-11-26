import { useChartStore } from '../store/chartStore.ts';
import { useReplayStore } from '../store/replayStore.ts';
import { ActionMenu } from './ActionMenu.tsx';
import styles from './ActionMenu.module.css';
import { IconButton } from './IconButton.tsx';
import { MINUTE_INTERVALS } from './intervals.ts';
import { useMenuButton } from './useMenuButton.ts';

/**
 * The minute intervals (1m … 90m) in a menu left of the interval buttons; each item says how many
 * days of history the provider keeps. The button shows the minute interval in use, pressed.
 */
export function MinuteIntervalMenu() {
  const interval = useChartStore((s) => s.interval);
  const setInterval = useChartStore((s) => s.setInterval);
  const locked = useReplayStore((s) => s.mode !== 'off');
  const { open, setOpen, menu, wrapperRef, menuId, close } = useMenuButton();
  const current = MINUTE_INTERVALS.find((m) => m.interval === interval);

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <IconButton
        label={current === undefined ? 'Minute intervals' : `Minute intervals: ${current.label}`}
        text={`${current?.text ?? 'min'} ▾`}
        pressed={current !== undefined}
        disabled={locked}
        title={locked ? 'Locked during bar replay' : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen(!open);
        }}
      />
      {menu.shown && (
        <ActionMenu
          key={menu.key}
          id={menuId}
          label="Minute intervals"
          attrs={menu.attrs}
          anchor={wrapperRef}
          initialActive={Math.max(
            MINUTE_INTERVALS.findIndex((m) => m.interval === interval),
            0,
          )}
          onClose={close}
          items={MINUTE_INTERVALS.map((m) => ({
            label: m.label,
            radio: true,
            checked: m.interval === interval,
            hint: `~${String(m.keepsDays)} days`,
            onSelect: () => {
              setInterval(m.interval);
            },
          }))}
        />
      )}
    </div>
  );
}
