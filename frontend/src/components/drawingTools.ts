import {
  Activity,
  AlignVerticalSpaceAround,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  CircleCheck,
  CircleX,
  Flag,
  Info,
  Mountain,
  Star,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Zap,
  ChartNoAxesColumn,
  ArrowRightFromLine,
  BetweenHorizontalStart,
  Minus,
  Move,
  MoveDiagonal,
  MoveHorizontal,
  MoveUpRight,
  MoveVertical,
  Percent,
  RectangleHorizontal,
  Rows4,
  Ruler,
  Target,
  SeparatorVertical,
  Shapes,
  Slash,
  Smile,
  Spline,
  Type,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';

import type { IconName } from '../drawings/iconPaths.ts';
import { TOOL_LABELS } from '../drawings/manager.ts';
import type { DrawingType } from '../drawings/types.ts';

interface ToolDef {
  type: DrawingType;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  /** The Icons group: which icon this entry places. */
  iconName?: IconName;
}

/** A button of the left toolbar: its tools open in a flyout; the button repeats the last one. */
export interface ToolGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  tools: readonly ToolDef[];
  /** Round in which the group's tools arrive (the button is inert until then). */
  comingIn?: string;
}

const tool = (type: DrawingType, icon: LucideIcon, shortcut?: string): ToolDef => ({
  type,
  label: TOOL_LABELS[type],
  icon,
  ...(shortcut === undefined ? {} : { shortcut }),
});

/** Tool groups, in TradingView's order. */
export const TOOL_GROUPS: readonly ToolGroup[] = [
  {
    id: 'lines',
    label: 'Trend line tools',
    icon: Slash,
    tools: [
      tool('trend_line', Slash, 'Alt+T'),
      tool('ray', MoveUpRight),
      tool('extended_line', MoveDiagonal),
      tool('horizontal_line', Minus, 'Alt+H'),
      tool('horizontal_ray', ArrowRightFromLine),
      tool('vertical_line', SeparatorVertical, 'Alt+V'),
      tool('parallel_channel', BetweenHorizontalStart),
    ],
  },
  {
    id: 'fib',
    label: 'Gann and Fibonacci tools',
    icon: Waypoints,
    tools: [
      tool('fib_retracement', Rows4, 'Alt+F'),
      tool('fib_extension', AlignVerticalSpaceAround),
    ],
  },
  {
    id: 'patterns',
    label: 'Patterns',
    icon: Spline,
    tools: [tool('xabcd', Activity), tool('abcd', Spline), tool('head_shoulders', Mountain)],
  },
  {
    id: 'measure-tools',
    label: 'Forecasting and measurement tools',
    icon: Ruler,
    tools: [
      tool('price_range', MoveVertical),
      tool('date_range', MoveHorizontal),
      tool('date_price_range', Move),
      tool('return_range', Percent),
      tool('stats_range', ChartNoAxesColumn),
      tool('trade_plan', Target),
    ],
  },
  {
    id: 'shapes',
    label: 'Geometric shapes',
    icon: Shapes,
    tools: [tool('rectangle', RectangleHorizontal)],
  },
  { id: 'annotations', label: 'Annotation tools', icon: Type, tools: [tool('text', Type)] },
  {
    id: 'icons',
    label: 'Icons',
    icon: Smile,
    tools: (
      [
        ['arrow-up', 'Arrow up', ArrowUp],
        ['arrow-down', 'Arrow down', ArrowDown],
        ['arrow-left', 'Arrow left', ArrowLeft],
        ['arrow-right', 'Arrow right', ArrowRight],
        ['trending-up', 'Trending up', TrendingUp],
        ['trending-down', 'Trending down', TrendingDown],
        ['circle-check', 'Check', CircleCheck],
        ['circle-x', 'Cross', CircleX],
        ['alert', 'Alert', TriangleAlert],
        ['info', 'Info', Info],
        ['flag', 'Flag', Flag],
        ['star', 'Star', Star],
        ['bell', 'Bell', Bell],
        ['zap', 'Lightning', Zap],
      ] as const
    ).map(([iconName, label, icon]) => ({ type: 'icon' as const, label, icon, iconName })),
  },
];

/** Every tool with a keyboard shortcut (the ? dialog and the hotkeys use it). */
export const TOOL_SHORTCUTS = TOOL_GROUPS.flatMap((g) =>
  g.tools.flatMap((t) => (t.shortcut === undefined ? [] : [{ ...t, group: g.id }])),
);
