/**
 * All drawings as one series primitive on the main series (top z-order). It projects each anchor
 * at paint time, so drawings follow every scroll, zoom and resize without extra work.
 */
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
} from 'lightweight-charts';

import { drawDrawing } from '../drawings/render.ts';
import { NO_DRAWINGS, type Anchor, type DrawingView, type Point } from '../drawings/types.ts';

export class DrawingLayer implements ISeriesPrimitive {
  private view: DrawingView = NO_DRAWINGS;
  private requestUpdate: (() => void) | null = null;

  private readonly renderer: IPrimitivePaneRenderer = {
    draw: (target) => {
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        const { drawings, draft, selectedId, hoverId, hideAll } = this.view;
        const shown = hideAll ? [] : drawings.filter((d) => !d.hidden);
        for (const drawing of draft === null ? shown : [...shown, draft]) {
          const pts = drawing.points.map(this.project);
          if (pts.some((p) => p === null)) continue;
          drawDrawing(context, drawing, pts as Point[], mediaSize, {
            selected: drawing.id === selectedId || drawing === draft,
            hovered: drawing.id === hoverId,
            background: this.background(),
          });
        }
      });
    },
  };

  private readonly paneView: IPrimitivePaneView = {
    zOrder: () => 'top',
    renderer: () => this.renderer,
  };

  constructor(
    private readonly project: (anchor: Anchor) => Point | null,
    private readonly background: () => string,
  ) {}

  attached({ requestUpdate }: SeriesAttachedParameter): void {
    this.requestUpdate = requestUpdate;
  }

  detached(): void {
    this.requestUpdate = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }

  set(view: DrawingView): void {
    this.view = view;
    this.requestUpdate?.();
  }
}
