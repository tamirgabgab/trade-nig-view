import { useCallback, useEffect, useRef, type RefObject } from 'react';

import type { Bar } from '../api/bars.ts';
import type { SymbolInfo } from '../api/market.ts';
import type { ChartEngine } from '../chart/ChartEngine.ts';
import { readChartTheme } from '../chart/theme.ts';
import { useUiStore, type SnapshotMode } from '../store/uiStore.ts';
import { formatPrice } from './formatNumber.ts';
import { legendValues } from './legendValues.ts';
import { copyImage, downloadImage, snapshotFileName, withTitleBand } from './snapshot.ts';

interface SnapshotInput {
  bars: readonly Bar[];
  decimals: number;
  info: SymbolInfo | undefined;
  symbol: string;
  interval: string;
}

/**
 * Answer each snapshot request (toolbar, palette, context menu, Alt+S): take the chart image, add
 * the title band (symbol, name, interval, exchange; latest OHLC and date), copy or download it and
 * say so in a toast. The text is built from the latest input only when a request comes.
 */
export function useChartSnapshot(
  engineRef: RefObject<ChartEngine | null>,
  input: SnapshotInput,
): void {
  const request = useUiStore((s) => s.snapshot);
  const showToast = useUiStore((s) => s.showToast);
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  });
  const handled = useRef(request?.seq ?? 0);

  const take = useCallback(
    (image: HTMLCanvasElement, mode: SnapshotMode) => {
      const { bars, decimals, info, symbol, interval } = latest.current;
      const last = legendValues(bars, null);
      const price = (v: number) => formatPrice(v, decimals);
      const ohlc =
        last === null
          ? ''
          : `O ${price(last.open)}  H ${price(last.high)}  L ${price(last.low)}  C ${price(last.close)}`;
      const title = [info?.display ?? symbol, info?.name, interval, info?.exchange]
        .filter(Boolean)
        .join(' · ');
      const detail = [ohlc, typeof last?.time === 'string' ? last.time : '']
        .filter(Boolean)
        .join('   ');
      const file = snapshotFileName(info?.display ?? symbol, interval, new Date());
      const out = withTitleBand(image, title, detail, readChartTheme());
      const done =
        mode === 'copy'
          ? copyImage(out).then(() => 'Chart image copied')
          : downloadImage(out, file).then(() => `Chart saved as ${file}`);
      done.then(
        (message) => {
          showToast(message);
        },
        (error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          showToast(`Could not ${mode === 'copy' ? 'copy' : 'save'} the chart image (${reason})`);
        },
      );
    },
    [showToast],
  );

  useEffect(() => {
    const engine = engineRef.current;
    if (request === null || engine === null || request.seq === handled.current) return;
    handled.current = request.seq;
    take(engine.snapshot(), request.mode);
  }, [request, engineRef, take]);
}
