import { act, render, waitFor } from '@testing-library/react';

import { newDrawing } from '../drawings/manager.ts';
import { useDrawingStore } from '../store/drawingStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { jsonResponse, stubApi } from '../test/render.tsx';
import { SAVE_DELAY_MS, useDrawingsSync } from './useDrawings.ts';

function Sync({ symbol }: { symbol: string }) {
  useDrawingsSync(symbol);
  return null;
}

const line = newDrawing(
  'trend_line',
  [
    { time: 1, price: 10 },
    { time: 2, price: 11 },
  ],
  'a',
);

let puts: { path: string; body: { revision: number; drawings: unknown[] } }[];

function backend(revisions: Record<string, number>, conflict = false) {
  puts = [];
  stubApi({
    '/api/drawings/AAPL': (url, init) => route(url, init, 'AAPL'),
    '/api/drawings/MSFT': (url, init) => route(url, init, 'MSFT'),
  });
  function route(url: URL, init: RequestInit | undefined, symbol: string) {
    if (init?.method === 'PUT') {
      const body = JSON.parse(init.body as string) as { revision: number; drawings: unknown[] };
      puts.push({ path: url.pathname, body });
      if (conflict) {
        return jsonResponse(
          { title: 'Conflict', status: 409, detail: 'stale', code: 'revision_conflict' },
          409,
        );
      }
      revisions[symbol] = (revisions[symbol] ?? 0) + 1;
      return jsonResponse({ symbol, revision: revisions[symbol], drawings: body.drawings });
    }
    return jsonResponse({ symbol, revision: revisions[symbol] ?? 0, drawings: [] });
  }
}

beforeEach(() => {
  useDrawingStore.setState(useDrawingStore.getInitialState(), true);
  useUiStore.setState(useUiStore.getInitialState());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useDrawingsSync', () => {
  it('loads the symbol, saves edits once on top of the revision read', async () => {
    backend({ AAPL: 4 });
    render(<Sync symbol="AAPL" />);
    await waitFor(() => {
      expect(useDrawingStore.getState()).toMatchObject({ symbol: 'AAPL', revision: 4 });
    });

    act(() => {
      useDrawingStore.getState().add(line);
      useDrawingStore.getState().update('a', (d) => ({ ...d, locked: true }));
    });
    await waitFor(() => {
      expect(useDrawingStore.getState().revision).toBe(5);
    });
    expect(puts).toHaveLength(1); // debounced: two edits, one save
    expect(puts[0]?.body.revision).toBe(4);
  });

  it('saves a pending edit before switching symbol', async () => {
    backend({});
    const { rerender } = render(<Sync symbol="AAPL" />);
    await waitFor(() => {
      expect(useDrawingStore.getState().symbol).toBe('AAPL');
    });
    act(() => {
      useDrawingStore.getState().add(line);
    });
    rerender(<Sync symbol="MSFT" />);
    expect(puts.map((p) => p.path)).toEqual(['/api/drawings/AAPL']);
    await waitFor(() => {
      expect(useDrawingStore.getState().symbol).toBe('MSFT');
    });
  });

  it('reloads and says so when another window saved first (409)', async () => {
    backend({ AAPL: 2 }, true);
    render(<Sync symbol="AAPL" />);
    await waitFor(() => {
      expect(useDrawingStore.getState().symbol).toBe('AAPL');
    });
    act(() => {
      useDrawingStore.getState().add(line);
    });
    await waitFor(() => {
      expect(useUiStore.getState().toast?.message).toMatch(/changed in another window/);
    });
    expect(useDrawingStore.getState().drawings).toEqual([]);
  });

  it('saves one at a time: an edit during a save is saved after it, on its revision', async () => {
    const revisions: number[] = [];
    let release: (() => void) | undefined;
    stubApi({
      '/api/drawings/AAPL': (_url, init) => {
        if (init?.method !== 'PUT')
          return jsonResponse({ symbol: 'AAPL', revision: 1, drawings: [] });
        const body = JSON.parse(init.body as string) as { revision: number; drawings: unknown[] };
        revisions.push(body.revision);
        const next = { symbol: 'AAPL', revision: body.revision + 1, drawings: body.drawings };
        // The first save waits until released; later ones answer at once.
        if (revisions.length > 1) return jsonResponse(next);
        return new Promise<Response>((resolve) => {
          release = () => {
            void jsonResponse(next).then(resolve);
          };
        });
      },
    });
    render(<Sync symbol="AAPL" />);
    await waitFor(() => {
      expect(useDrawingStore.getState().symbol).toBe('AAPL');
    });

    act(() => {
      useDrawingStore.getState().add(line);
    });
    await waitFor(() => {
      expect(revisions).toEqual([1]);
    });
    act(() => {
      useDrawingStore.getState().update('a', (d) => ({ ...d, locked: true }));
    });
    // The second debounce fires while the first save is still out: it waits.
    await new Promise((resolve) => setTimeout(resolve, SAVE_DELAY_MS + 50));
    expect(revisions).toEqual([1]);

    act(() => {
      release?.();
    });
    await waitFor(() => {
      expect(useDrawingStore.getState().revision).toBe(3);
    });
    expect(revisions).toEqual([1, 2]);
  });

  it("clears the previous symbol's drawings while the next one loads", async () => {
    backend({});
    const { rerender } = render(<Sync symbol="AAPL" />);
    await waitFor(() => {
      expect(useDrawingStore.getState().symbol).toBe('AAPL');
    });
    act(() => {
      useDrawingStore.getState().load('AAPL', 0, [line]);
    });
    rerender(<Sync symbol="MSFT" />);
    expect(useDrawingStore.getState()).toMatchObject({ symbol: null, drawings: [] });
  });
});
