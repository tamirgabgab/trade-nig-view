/**
 * The drawing model, as stored by the backend (ARCHITECTURE §5.2). Anchors are in data space:
 * `time` = UTC epoch seconds of the anchor bar's open, so a drawing maps onto any interval.
 */
export type DrawingType =
  | 'trend_line'
  | 'ray'
  | 'extended_line'
  | 'horizontal_line'
  | 'horizontal_ray'
  | 'vertical_line'
  | 'rectangle'
  | 'text'
  | 'fib_retracement'
  | 'fib_extension'
  | 'parallel_channel'
  | 'price_range'
  | 'date_range'
  | 'date_price_range';

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface Anchor {
  time: number;
  price: number;
}

export interface DrawingStyle {
  line_color: string;
  line_width: number;
  line_style: LineStyle;
}

/** One Fibonacci level: its ratio, colour and whether it shows. */
export interface FibLevel {
  value: number;
  color: string;
  visible: boolean;
}

export interface DrawingProps {
  text?: string;
  font_size?: number;
  fill?: boolean;
  /** Fib tools. */
  levels?: FibLevel[];
}

export interface Drawing {
  id: string;
  type: DrawingType;
  points: Anchor[];
  style: DrawingStyle;
  props: DrawingProps;
  locked: boolean;
  hidden: boolean;
  z: number;
  created_at: string;
  updated_at: string;
}

/** Anchors each tool needs. */
export const POINT_COUNT: Record<DrawingType, number> = {
  trend_line: 2,
  ray: 2,
  extended_line: 2,
  horizontal_line: 1,
  horizontal_ray: 1,
  vertical_line: 1,
  rectangle: 2,
  text: 1,
  fib_retracement: 2,
  fib_extension: 3,
  parallel_channel: 3,
  price_range: 2,
  date_range: 2,
  date_price_range: 2,
};

export const DEFAULT_STYLE: DrawingStyle = {
  line_color: '#2962FF',
  line_width: 2,
  line_style: 'solid',
};

/** A drawing's anchors in CSS pixels of the price pane (null = not on screen, e.g. no bars). */
export interface Point {
  x: number;
  y: number;
}

/** What the chart shows: the drawings, which one is selected or hovered, the one being drawn. */
export interface DrawingView {
  drawings: readonly Drawing[];
  selectedId: string | null;
  hoverId: string | null;
  /** The drawing being created (follows the pointer), or null. */
  draft: Drawing | null;
  hideAll: boolean;
}

export const NO_DRAWINGS: DrawingView = {
  drawings: [],
  selectedId: null,
  hoverId: null,
  draft: null,
  hideAll: false,
};
