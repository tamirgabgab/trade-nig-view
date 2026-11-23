import { ChartColumnBig } from 'lucide-react';

import { useIndicatorList, type Params } from '../api/indicators.ts';
import { useIndicatorStore } from '../store/indicatorStore.ts';
import { useStructureStore } from '../store/structureStore.ts';
import { ActionMenu, type MenuItem } from './ActionMenu.tsx';
import styles from './ActionMenu.module.css';
import { IconButton } from './IconButton.tsx';
import { addIndicator, removeIndicator } from './indicatorActions.ts';
import { useMenuButton } from './useMenuButton.ts';

/** The structure overlays that are registry indicators: id, the params that tell them apart. */
const LEVELS: { label: string; id: string; params: Params }[] = [
  { label: 'Previous day high, low, close', id: 'prev_hlc', params: { period: 'day' } },
  { label: 'Previous week high, low, close', id: 'prev_hlc', params: { period: 'week' } },
  { label: 'Previous month high, low, close', id: 'prev_hlc', params: { period: 'month' } },
  { label: 'Pivot points high/low', id: 'pivots', params: {} },
];

/** Top-toolbar "Structure" menu: gap zones, previous-period levels and pivot points, on or off. */
export function StructureMenu() {
  const { open, setOpen, menu, wrapperRef, menuId, close } = useMenuButton();
  const gaps = useStructureStore((s) => s.gaps);
  const toggleGaps = useStructureStore((s) => s.toggleGaps);
  const instances = useIndicatorStore((s) => s.instances);
  const specs = useIndicatorList().data;

  const items: MenuItem[] = [
    { label: 'Gaps', checked: gaps, onSelect: toggleGaps },
    ...LEVELS.flatMap(({ label, id, params }) => {
      const spec = specs?.find((s) => s.id === id);
      if (spec === undefined) return [];
      const on = instances.find(
        (i) => i.id === id && Object.entries(params).every(([k, v]) => i.params[k] === v),
      );
      return [
        {
          label,
          checked: on !== undefined,
          divider: id === 'pivots',
          onSelect: () => {
            if (on === undefined) addIndicator(spec, params);
            else removeIndicator(on.uid, label);
          },
        },
      ];
    }),
  ];

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <IconButton
        label="Market structure"
        text="Structure"
        icon={<ChartColumnBig size={18} />}
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
          label="Market structure"
          attrs={menu.attrs}
          anchor={wrapperRef}
          onClose={close}
          items={items}
        />
      )}
    </div>
  );
}
