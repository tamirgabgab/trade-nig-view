import type { Bar } from '../api/bars.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useForecastOriginStore } from '../store/forecastOriginStore.ts';
import { useIndicatorStore } from '../store/indicatorStore.ts';
import { useStructureStore } from '../store/structureStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { ActionMenu, type MenuItem } from './ActionMenu.tsx';
import { formatPrice } from './formatNumber.ts';
import { usePastOrigin } from './useChartForecast.ts';
import type { OverlayAttrs } from './usePresence.ts';

/** Approximate menu size, to keep it inside the window near the right and bottom edges. */
const MENU_WIDTH = 200;
const MENU_HEIGHT = 320;

interface ChartContextMenuProps {
  at: { x: number; y: number; price: number | null };
  decimals: number;
  /** The past bar under the click a forecast can be made at (not the last bar, not in replay). */
  forecastBar: Bar['time'] | null;
  attrs: OverlayAttrs;
  onClose: () => void;
  onResetView: () => void;
}

/** Right-click menu on the chart. */
export function ChartContextMenu({
  at,
  decimals,
  forecastBar,
  attrs,
  onClose,
  onResetView,
}: ChartContextMenuProps) {
  const symbol = useChartStore((s) => s.symbol);
  const interval = useChartStore((s) => s.interval);
  const pastOrigin = usePastOrigin();
  const setOrigin = useForecastOriginStore((s) => s.setOrigin);
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
  // A forecast at a past bar: turn the forecast on and open its tab, which compares it with what
  // happened next.
  const forecastFrom = (time: Bar['time'] | null) => {
    setOrigin(time === null ? null : { symbol, interval, time });
    const structure = useStructureStore.getState();
    if (!structure.forecast) structure.toggleForecast();
    useUiStore.getState().openSidebar('forecast');
  };
  if (forecastBar !== null) {
    items.push({
      label: 'Forecast from this bar',
      divider: true,
      onSelect: () => {
        forecastFrom(forecastBar);
      },
    });
  }
  if (pastOrigin !== null) {
    items.push({
      label: 'Forecast from the last bar',
      divider: forecastBar === null,
      onSelect: () => {
        forecastFrom(null);
      },
    });
  }
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
