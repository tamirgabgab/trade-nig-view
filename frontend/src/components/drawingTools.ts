import {
  AlignVerticalSpaceAround,
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
  SeparatorVertical,
  Shapes,
  Slash,
  Smile,
  Spline,
  Type,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';

import { TOOL_LABELS } from '../drawings/manager.ts';
import type { DrawingType } from '../drawings/types.ts';

interface ToolDef {
  type: DrawingType;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
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
  { id: 'patterns', label: 'Patterns', icon: Spline, tools: [], comingIn: 'a later round' },
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
    ],
  },
  {
    id: 'shapes',
    label: 'Geometric shapes',
    icon: Shapes,
    tools: [tool('rectangle', RectangleHorizontal)],
  },
  { id: 'annotations', label: 'Annotation tools', icon: Type, tools: [tool('text', Type)] },
  { id: 'icons', label: 'Icons', icon: Smile, tools: [], comingIn: 'a later round' },
];

/** Every tool with a keyboard shortcut (the ? dialog and the hotkeys use it). */
export const TOOL_SHORTCUTS = TOOL_GROUPS.flatMap((g) =>
  g.tools.flatMap((t) => (t.shortcut === undefined ? [] : [{ ...t, group: g.id }])),
);
