import { useCallback, useEffect, useRef } from 'react';

import type { Bar } from '../api/bars.ts';
import type { SymbolInfo } from '../api/market.ts';
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
 * A stable handler for the chart image (ChartView is memoised): adds the title band (symbol,
 * name, interval, exchange; latest OHLC and date), then copies or downloads it and says so in a
 * toast. The text is built from the latest input only when an image arrives.
 */
export function useChartSnapshot(
  input: SnapshotInput,
): (image: HTMLCanvasElement, mode: SnapshotMode) => void {
  const showToast = useUiStore((s) => s.showToast);
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  });

  return useCallback(
    (image, mode) => {
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
}
