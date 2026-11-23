import { useChartStore } from '../store/chartStore.ts';
import { useIndicatorStore } from '../store/indicatorStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { ActionMenu, type MenuItem } from './ActionMenu.tsx';
import { formatPrice } from './formatNumber.ts';
import type { OverlayAttrs } from './usePresence.ts';

/** Approximate menu size, to keep it inside the window near the right and bottom edges. */
const MENU_WIDTH = 200;
const MENU_HEIGHT = 260;

interface ChartContextMenuProps {
  at: { x: number; y: number; price: number | null };
  decimals: number;
  attrs: OverlayAttrs;
  onClose: () => void;
  onResetView: () => void;
}

/** Right-click menu on the chart. */
export function ChartContextMenu({
  at,
  decimals,
  attrs,
  onClose,
  onResetView,
}: ChartContextMenuProps) {
  const scaleMode = useChartStore((s) => s.scaleMode);
  const toggleScaleMode = useChartStore((s) => s.toggleScaleMode);
  const indicatorCount = useIndicatorStore((s) => s.instances.length);
  const openModal = useUiStore((s) => s.openModal);
  const requestSnapshot = useUiStore((s) => s.requestSnapshot);
  const showToast = useUiStore((s) => s.showToast);

  const items: MenuItem[] = [
    { label: 'Reset chart view', onSelect: onResetView },
    {
      label: 'Add indicator',
      shortcut: '/',
      onSelect: () => {
        openModal('indicators');
      },
    },
  ];
  if (at.price !== null) {
    const text = formatPrice(at.price, decimals);
    items.push({
      label: `Copy price ${text}`,
      onSelect: () => {
        navigator.clipboard.writeText(text.replace(/,/g, '')).then(
          () => {
            showToast(`Copied ${text}`);
          },
          () => {
            showToast('Could not copy the price (clipboard not available)');
          },
        );
      },
    });
  }
  items.push(
    {
      label: 'Copy chart image',
      shortcut: 'Alt+S',
      onSelect: () => {
        requestSnapshot('copy');
      },
    },
    {
      label: 'Logarithmic scale',
      checked: scaleMode === 'log',
      divider: true,
      onSelect: () => {
        toggleScaleMode('log');
      },
    },
    {
      label: 'Percent scale',
      checked: scaleMode === 'percent',
      onSelect: () => {
        toggleScaleMode('percent');
      },
    },
  );
  if (indicatorCount > 0) {
    items.push({
      label: 'Remove all indicators…',
      divider: true,
      onSelect: () => {
        openModal('removeIndicators');
      },
    });
  }

  return (
    <ActionMenu
      label="Chart"
      items={items}
      attrs={attrs}
      onClose={onClose}
      style={{
        position: 'fixed',
        left: Math.min(at.x, window.innerWidth - MENU_WIDTH),
        top: Math.min(at.y, window.innerHeight - MENU_HEIGHT),
      }}
    />
  );
}
