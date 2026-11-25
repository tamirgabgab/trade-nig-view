import { effectiveParams, instanceLabel, useIndicatorList } from '../api/indicators.ts';
import { useSymbols } from '../api/market.ts';
import { CHART_TYPES } from '../chart/chartTypes.ts';
import { RANGE_LABEL, RANGES } from '../chart/visibleRange.ts';
import { useShallow } from 'zustand/react/shallow';

import { useChartStore } from '../store/chartStore.ts';
import { useIndicatorStore } from '../store/indicatorStore.ts';
import { isLightTheme, useThemeStore } from '../store/themeStore.ts';
import { PAGE_PREFIX, useUiStore } from '../store/uiStore.ts';
import type { Command } from './commands.ts';
import { addIndicator, removeIndicator } from './indicatorActions.ts';
import { INTERVALS } from './intervals.ts';
import { NARROW_QUERY, useMediaQuery } from './useMediaQuery.ts';
import { useLearnIndex } from '../api/lab.ts';

/** Everything the Ctrl+K palette can do, built from the current state (first match wins). */
export function usePaletteCommands(): Command[] {
  // Subscribe only to what the labels show; actions read the stores when they run.
  const chart = useChartStore(
    useShallow((s) => ({
      interval: s.interval,
      chartType: s.chartType,
      scaleMode: s.scaleMode,
      autoScale: s.autoScale,
      adjusted: s.adjusted,
    })),
  );
  const instances = useIndicatorStore((s) => s.instances);
  const watchlist = useUiStore((s) => s.watchlist);
  const sidebarTab = useUiStore((s) => s.sidebarTab);
  const learnPages = useLearnIndex().data;
  const act = useChartStore.getState;
  const ui = useUiStore.getState;
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
    const base = { group: 'On the chart', keywords: spec.name };
    commands.push(
      {
        ...base,
        id: `edit-${instance.uid}`,
        label: `${label}: Edit settings`,
        run: () => {
          ui().openSettings(instance.uid);
        },
      },
      {
        ...base,
        id: `learn-${instance.uid}`,
        label: `${label}: Learn`,
        run: () => {
          ui().openLearn(instance.uid);
        },
      },
      {
        ...base,
        id: `vis-${instance.uid}`,
        label: `${label}: ${instance.visible ? 'Hide' : 'Show'}`,
        run: () => {
          useIndicatorStore.getState().toggleVisible(instance.uid);
        },
      },
      {
        ...base,
        id: `rm-${instance.uid}`,
        label: `${label}: Remove`,
        run: () => {
          removeIndicator(instance.uid, label);
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
        act().setInterval(option.interval);
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
        act().setChartType(type.id);
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
        act().selectRange(range);
      },
    });
  }
  const toggles: [string, boolean, string, string, () => void][] = [
    [
      'log',
      chart.scaleMode === 'log',
      'logarithmic scale',
      'log',
      () => {
        act().toggleScaleMode('log');
      },
    ],
    [
      'percent',
      chart.scaleMode === 'percent',
      'percent scale',
      '%',
      () => {
        act().toggleScaleMode('percent');
      },
    ],
    [
      'auto',
      chart.autoScale,
      'auto-fit price scale',
      'auto',
      () => {
        act().setAutoScale(!chart.autoScale);
      },
    ],
    [
      'adjusted',
      chart.adjusted,
      'dividend adjustment',
      'ADJ',
      () => {
        act().setAdjusted(!chart.adjusted);
      },
    ],
  ];
  for (const [id, on, what, hint, run] of toggles) {
    commands.push({
      id,
      group: 'Chart',
      label: `${on ? 'Turn off' : 'Turn on'} ${what}`,
      hint,
      run,
    });
  }
  commands.push(
    {
      id: 'theme',
      group: 'View',
      label: `Switch to ${isLightTheme(theme) ? 'dark' : 'light'} theme`,
      keywords: 'dark light mode colors',
      run: toggleTheme,
    },
    ...(
      [
        ['watchlist', 'watchlist', 'sidebar symbols'],
        ['objects', 'object tree', 'drawings indicators list hide lock'],
        ['data', 'data window', 'values crosshair ohlc'],
        ['gaps', 'gaps panel', 'structure gap list'],
      ] as const
    ).map(([tab, name, keywords]) => ({
      id: `sidebar-${tab}`,
      group: 'View',
      label: `${(narrow ? watchlist.floating : watchlist.docked) && sidebarTab === tab ? 'Hide' : 'Show'} ${name}`,
      keywords,
      run: () => {
        ui().showSidebar(tab, narrow);
      },
    })),
    {
      id: 'learn-index',
      group: 'Learn',
      label: 'Open a learn page…',
      keywords: 'learn education math explanation index',
      run: () => {
        ui().openModal('learnIndex');
      },
    },
    ...(learnPages ?? []).map((page) => ({
      id: `learn-${page.slug}`,
      group: 'Learn',
      label: `Learn: ${page.title}`,
      keywords: `learn ${page.slug} math`,
      run: () => {
        ui().openLearn(`${PAGE_PREFIX}${page.slug}`);
      },
    })),
    {
      id: 'shortcuts',
      group: 'View',
      label: 'Show keyboard shortcuts',
      hint: '?',
      run: () => {
        ui().openModal('shortcuts');
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
        act().setSymbol(info.symbol);
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
        addIndicator(spec);
      },
    });
  }
  return commands;
}
