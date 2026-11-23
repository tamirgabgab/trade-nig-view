import { jsonResponse, stubApi } from '../test/render.tsx';
import { useChartStore } from './chartStore.ts';
import { useHistoryStore } from './historyStore.ts';
import { useIndicatorStore } from './indicatorStore.ts';
import { useLayoutStore } from './layoutStore.ts';
import { waitFor } from '@testing-library/react';

import { applyLayout, currentLayout, saveAs, saveNow, startLayoutSync } from './layoutSync.ts';

let puts: { name: string; body: Record<string, unknown> }[];

function backend(revisions: Record<string, number>) {
  puts = [];
  stubApi({
    '/api/layouts/Unnamed': (_url, init) => route('Unnamed', init),
    '/api/layouts/Swing': (_url, init) => route('Swing', init),
  });
  function route(name: string, init: RequestInit | undefined) {
    if (init?.method === 'PUT') {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      puts.push({ name, body });
      const current = revisions[name] ?? 0;
      if (body['revision'] !== current) {
        return jsonResponse({ title: 'Conflict', status: 409, code: 'revision_conflict' }, 409);
      }
      revisions[name] = current + 1;
      return jsonResponse({
        ...body,
        name,
        revision: current + 1,
        schema_version: 1,
        updated_at: '',
      });
    }
    return revisions[name] === undefined
      ? jsonResponse({ title: 'Not found', status: 404, code: 'layout_not_found' }, 404)
      : jsonResponse({
          name,
          revision: revisions[name],
          symbol: 'NVDA',
          interval: '1W',
          chart_type: 'line',
          scale_mode: 'log',
          auto_scale: true,
          adjusted: true,
          indicators: [
            {
              uid: 'ema-7',
              id: 'ema',
              params: { length: 20 },
              styles: {},
              visible: true,
              pane_stretch: null,
            },
          ],
          visible_range: { from: '2026-01-05', to: '2026-11-16' },
        });
  }
}

beforeEach(() => {
  useChartStore.setState(useChartStore.getInitialState());
  useIndicatorStore.setState(useIndicatorStore.getInitialState());
  useLayoutStore.setState({ name: 'Unnamed', revision: 0, status: 'saved', pending: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('layout sync', () => {
  it('loads the open layout, saves the chart, and after a save elsewhere (409) saves on top', async () => {
    const revisions = { Unnamed: 3 };
    backend(revisions);
    const stop = startLayoutSync();
    await waitFor(() => {
      expect(useChartStore.getState().symbol).toBe('NVDA'); // the stored layout
    });
    revisions.Unnamed = 5; // another window saved meanwhile
    useChartStore.getState().setSymbol('TSLA');
    await saveNow();
    stop();
    expect(puts.map((p) => p.body['revision'])).toEqual([3, 5]);
    expect(puts[1]?.body).toMatchObject({ symbol: 'TSLA', chart_type: 'line' });
    expect(useLayoutStore.getState()).toMatchObject({ revision: 6, status: 'saved' });
  });

  it('saves nothing until the stored layout could be read, then retries the read', async () => {
    let up = false;
    puts = [];
    stubApi({
      '/api/layouts/Unnamed': (_url, init) => {
        if (!up) return Promise.reject(new TypeError('Failed to fetch'));
        if (init?.method === 'PUT') {
          puts.push({ name: 'Unnamed', body: {} });
          return jsonResponse({ name: 'Unnamed', revision: 1, symbol: 'AAPL' });
        }
        return jsonResponse({ title: 'Not found', status: 404, code: 'layout_not_found' }, 404);
      },
    });
    const stop = startLayoutSync([10]);
    await waitFor(() => {
      expect(useLayoutStore.getState().status).toBe('error');
    });
    await saveNow();
    expect(puts).toEqual([]);
    up = true;
    await waitFor(() => {
      expect(useLayoutStore.getState().status).toBe('saved');
    });
    await saveNow();
    stop();
    expect(puts).toHaveLength(1);
  });

  it('opens a layout: chart, indicators (uids go on after theirs), view later; clears undo', () => {
    useHistoryStore.setState({
      past: [
        {
          kind: 'chart',
          before: { symbol: 'A', interval: '1D' },
          after: { symbol: 'B', interval: '1D' },
        },
      ],
    });
    applyLayout({
      name: 'Swing',
      revision: 2,
      symbol: 'NVDA',
      interval: '1W',
      chartType: 'line',
      scaleMode: 'log',
      autoScale: true,
      adjusted: true,
      indicators: [{ uid: 'ema-7', id: 'ema', params: {}, styles: {}, visible: true }],
      stretches: { 'ema-7': 0.5 },
      visibleRange: null,
    });
    expect(currentLayout()).toMatchObject({ symbol: 'NVDA', interval: '1W', chartType: 'line' });
    expect(useIndicatorStore.getState().add('sma', {})).toBe('sma-8');
    expect(useLayoutStore.getState()).toMatchObject({ name: 'Swing', revision: 2 });
    expect(useLayoutStore.getState().pending?.stretches).toEqual({ 'ema-7': 0.5 });
    expect(useHistoryStore.getState().past).toEqual([]);
  });

  it('saves under a new name, and refuses a taken one', async () => {
    backend({ Swing: 1 });
    expect(await saveAs('Swing', { replace: false })).toBe(false);
    backend({});
    expect(await saveAs('Swing', { replace: false })).toBe(true);
    expect(useLayoutStore.getState()).toMatchObject({ name: 'Swing', revision: 1 });
  });
});
