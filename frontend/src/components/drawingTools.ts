import {
  Crosshair,
  Eraser,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Magnet,
  PencilLine,
  Ruler,
  Shapes,
  Slash,
  Smile,
  Spline,
  Trash2,
  Type,
  Waypoints,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react';

/** One entry of the left drawing toolbar. Tools become functional in R4. */
export interface DrawingToolGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
}

/** Tool groups, in TradingView's order (cursors, lines, Fib/Gann, patterns, ...). */
export const DRAWING_TOOL_GROUPS: readonly DrawingToolGroup[] = [
  { id: 'cursor', label: 'Cross cursor', icon: Crosshair },
  { id: 'trend-lines', label: 'Trend line tools', icon: Slash, shortcut: 'Alt+T' },
  { id: 'fib', label: 'Gann and Fibonacci tools', icon: Waypoints, shortcut: 'Alt+F' },
  { id: 'patterns', label: 'Patterns', icon: Spline },
  { id: 'measure-tools', label: 'Forecasting and measurement tools', icon: Ruler },
  { id: 'shapes', label: 'Geometric shapes', icon: Shapes },
  { id: 'annotations', label: 'Annotation tools', icon: Type },
  { id: 'icons', label: 'Icons', icon: Smile },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
];

export const MEASURE_ACTIONS: readonly DrawingToolGroup[] = [
  { id: 'measure', label: 'Measure', icon: PencilLine },
  { id: 'zoom', label: 'Zoom in', icon: ZoomIn },
];

export const TOGGLE_ICONS = { Magnet, Lock, LockOpen, Eye, EyeOff, Trash2 } as const;
