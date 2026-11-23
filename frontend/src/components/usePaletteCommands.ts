import {
  defaultParams,
  effectiveParams,
  instanceLabel,
  useIndicatorList,
} from '../api/indicators.ts';
import { useSymbols } from '../api/market.ts';
import { CHART_TYPES } from '../chart/chartTypes.ts';
import { RANGE_LABEL, RANGES } from '../chart/visibleRange.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useIndicatorStore } from '../store/indicatorStore.ts';
import { useThemeStore } from '../store/themeStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import type { Command } from './commands.ts';
import { INTERVALS } from './intervals.ts';
import { NARROW_QUERY, useMediaQuery } from './useMediaQuery.ts';

const onOff = (on: boolean) => (on ? 'Turn off' : 'Turn on');

/** Everything the Ctrl+K palette can do, built from the current state (first match wins). */
export function usePaletteCommands(): Command[] {
  const chart = useChartStore();
  const instances = useIndicatorStore((s) => s.instances);
  const add = useIndicatorStore((s) => s.add);
  const toggleVisible = useIndicatorStore((s) => s.toggleVisible);
  const remove = useIndicatorStore((s) => s.remove);
  const restore = useIndicatorStore((s) => s.restore);
  const ui = useUiStore();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const narrow = useMediaQuery(NARROW_QUERY);
  const symbols = useSymbols().data ?? [];
  const specs = useIndicatorList().data ?? [];

  const commands: Command[] = [];
  for (const instance of instances) {
    const spec = specs.find((s) => s.id === instance.id);
    if (spec === undefined) continue;
    const label = instanceLabel(spec, effectiveParams(spec, instance.params));
    const group = 'On the chart';
    const base = { group, keywords: spec.name };
    commands.push(
      {
        ...base,
        id: `edit-${instance.uid}`,
        label: `${label}: Edit settings`,
        run: () => {
          ui.openSettings(instance.uid);
        },
      },
      {
        ...base,
        id: `learn-${instance.uid}`,
        label: `${label}: Learn`,
        run: () => {
          ui.openLearn(instance.uid);
        },
      },
      {
        ...base,
        id: `vis-${instance.uid}`,
        label: `${label}: ${instance.visible ? 'Hide' : 'Show'}`,
        run: () => {
          toggleVisible(instance.uid);
        },
      },
      {
        ...base,
        id: `rm-${instance.uid}`,
        label: `${label}: Remove`,
        run: () => {
          const removed = remove(instance.uid);
          if (removed !== null)
            ui.showToast(`Removed ${label}`, () => {
              restore(removed);
            });
        },
      },
    );
  }
  for (const option of INTERVALS) {
    commands.push({
      id: `interval-${option.interval}`,
      group: 'Chart',
      label: `Interval: ${option.label}`,
      hint: chart.interval === option.interval ? 'current' : option.text,
      keywords: 'timeframe',
      run: () => {
        chart.setInterval(option.interval);
      },
    });
  }
  for (const type of CHART_TYPES) {
    commands.push({
      id: `type-${type.id}`,
      group: 'Chart',
      label: `Chart type: ${type.label}`,
      hint: chart.chartType === type.id ? 'current' : undefined,
      run: () => {
        chart.setChartType(type.id);
      },
    });
  }
  for (const range of RANGES) {
    commands.push({
      id: `range-${range}`,
      group: 'Chart',
      label: `Show ${RANGE_LABEL[range].toLowerCase()}`,
      hint: range,
      keywords: 'range zoom',
      run: () => {
        chart.selectRange(range);
      },
    });
  }
  commands.push(
    {
      id: 'log',
      group: 'Chart',
      label: `${onOff(chart.scaleMode === 'log')} logarithmic scale`,
      hint: 'log',
      run: () => {
        chart.toggleScaleMode('log');
      },
    },
    {
      id: 'percent',
      group: 'Chart',
      label: `${onOff(chart.scaleMode === 'percent')} percent scale`,
      hint: '%',
      run: () => {
        chart.toggleScaleMode('percent');
      },
    },
    {
      id: 'auto',
      group: 'Chart',
      label: `${onOff(chart.autoScale)} auto-fit price scale`,
      hint: 'auto',
      run: () => {
        chart.setAutoScale(!chart.autoScale);
      },
    },
    {
      id: 'adjusted',
      group: 'Chart',
      label: `${onOff(chart.adjusted)} dividend adjustment`,
      hint: 'ADJ',
      run: () => {
        chart.setAdjusted(!chart.adjusted);
      },
    },
    {
      id: 'theme',
      group: 'View',
      label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`,
      keywords: 'dark light mode colors',
      run: toggleTheme,
    },
    {
      id: 'watchlist',
      group: 'View',
      label: `${(narrow ? ui.watchlist.floating : ui.watchlist.docked) ? 'Hide' : 'Show'} watchlist`,
      keywords: 'sidebar',
      run: () => {
        ui.toggleWatchlist(narrow);
      },
    },
    {
      id: 'shortcuts',
      group: 'View',
      label: 'Show keyboard shortcuts',
      hint: '?',
      run: () => {
        ui.setShortcutsOpen(true);
      },
    },
  );
  for (const info of symbols) {
    commands.push({
      id: `symbol-${info.symbol}`,
      group: 'Symbols',
      label: `${info.display} · ${info.name}`,
      hint: info.exchange,
      keywords: info.symbol,
      run: () => {
        chart.setSymbol(info.symbol);
      },
    });
  }
  for (const spec of specs) {
    commands.push({
      id: `add-${spec.id}`,
      group: 'Add indicator',
      label: `Add ${spec.name}`,
      hint: spec.shortName,
      keywords: spec.description,
      run: () => {
        ui.setEmphasis(add(spec.id, defaultParams(spec)));
      },
    });
  }
  return commands;
}
