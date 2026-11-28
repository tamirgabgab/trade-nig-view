import { useEffect, useState } from 'react';

/** A Planner chart's width before it is measured, when hidden (0) or without ResizeObserver. */
const CHART_WIDTH = 640;

/**
 * The rendered width of a chart's box in CSS pixels, for its SVG's viewBox: one unit is then one
 * pixel, so the text is drawn at its own size however wide the column is (a 640-unit chart in a
 * 400 px column would shrink a 12 px label to 7.5 px).
 */
export function useChartWidth() {
  // A callback ref: a chart that first renders without its figure is measured once it has one.
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(CHART_WIDTH);
  useEffect(() => {
    if (element === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const measured = Math.round(entry?.contentRect.width ?? 0);
      if (measured > 0) setWidth(measured);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [element]);
  return [setElement, width] as const;
}
