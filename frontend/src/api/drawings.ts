import { RETURN_UNITS } from '../drawings/measure.ts';
import type { Drawing, DrawingType, FibLevel, LineStyle, ReturnUnit } from '../drawings/types.ts';
import { POINT_COUNT } from '../drawings/types.ts';
import { apiGet, apiPut, fieldsOf, isRecord, type Schemas } from './client.ts';

/** The drawings of one symbol, with the revision the next save must build on. */
export interface DrawingsDoc {
  symbol: string;
  revision: number;
  drawings: Drawing[];
}

const LINE_STYLES: readonly LineStyle[] = ['solid', 'dashed', 'dotted'];

function parseLevels(items: readonly unknown[]): FibLevel[] {
  return items.flatMap((l) =>
    isRecord(l) && typeof l['value'] === 'number' && typeof l['color'] === 'string'
      ? [{ value: l['value'], color: l['color'], visible: l['visible'] !== false }]
      : [],
  );
}

function parseDrawing(item: unknown): Drawing | null {
  if (!isRecord(item)) return null;
  const field = fieldsOf<Schemas['Drawing']>(item);
  const type = field('type');
  const points = field('points');
  const style = field('style');
  const props = field('props');
  if (typeof type !== 'string' || !(type in POINT_COUNT) || !Array.isArray(points)) return null;
  const anchors = (points as unknown[]).flatMap((p) =>
    isRecord(p) && typeof p['time'] === 'number' && typeof p['price'] === 'number'
      ? [{ time: p['time'], price: p['price'] }]
      : [],
  );
  if (anchors.length !== POINT_COUNT[type as DrawingType]) return null;
  const s = isRecord(style) ? style : {};
  const pr = isRecord(props) ? props : {};
  const lineStyle = LINE_STYLES.find((v) => v === s['line_style']) ?? 'solid';
  return {
    id: String(field('id')),
    type: type as DrawingType,
    points: anchors,
    style: {
      line_color: typeof s['line_color'] === 'string' ? s['line_color'] : '#2962FF',
      line_width: typeof s['line_width'] === 'number' ? s['line_width'] : 2,
      line_style: lineStyle,
    },
    props: {
      ...(typeof pr['text'] === 'string' ? { text: pr['text'] } : {}),
      ...(typeof pr['font_size'] === 'number' ? { font_size: pr['font_size'] } : {}),
      ...(typeof pr['fill'] === 'boolean' ? { fill: pr['fill'] } : {}),
      ...(Array.isArray(pr['levels']) ? { levels: parseLevels(pr['levels'] as unknown[]) } : {}),
      ...(RETURN_UNITS.some((u) => u.unit === pr['unit'])
        ? { unit: pr['unit'] as ReturnUnit }
        : {}),
      ...(pr['returns'] === 'log' || pr['returns'] === 'simple' ? { returns: pr['returns'] } : {}),
      ...(pr['basis'] === 'close' || pr['basis'] === 'open' ? { basis: pr['basis'] } : {}),
    },
    locked: field('locked') === true,
    hidden: field('hidden') === true,
    z: typeof field('z') === 'number' ? (field('z') as number) : 0,
    created_at: typeof field('created_at') === 'string' ? (field('created_at') as string) : '',
    updated_at: typeof field('updated_at') === 'string' ? (field('updated_at') as string) : '',
  };
}

/** A drawings document; drawings that fail to parse (an unknown tool) are skipped, not fatal. */
function parseDrawingsDoc(body: unknown): DrawingsDoc {
  if (!isRecord(body)) throw new Error('Unexpected drawings response');
  const field = fieldsOf<Schemas['DrawingsDocument']>(body);
  const drawings = field('drawings');
  return {
    symbol: String(field('symbol')),
    revision: typeof field('revision') === 'number' ? (field('revision') as number) : 0,
    drawings: Array.isArray(drawings)
      ? (drawings as unknown[]).flatMap((d) => {
          const parsed = parseDrawing(d);
          return parsed === null ? [] : [parsed];
        })
      : [],
  };
}

export function fetchDrawings(symbol: string, signal?: AbortSignal): Promise<DrawingsDoc> {
  return apiGet(
    `/drawings/${encodeURIComponent(symbol)}`,
    parseDrawingsDoc,
    signal ? { signal } : {},
  );
}

/** Save the whole list on top of `revision` (409 revision_conflict when it is stale). */
export function saveDrawings(
  symbol: string,
  revision: number,
  drawings: readonly Drawing[],
): Promise<DrawingsDoc> {
  return apiPut(
    `/drawings/${encodeURIComponent(symbol)}`,
    { revision, drawings },
    parseDrawingsDoc,
  );
}
