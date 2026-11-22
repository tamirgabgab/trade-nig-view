import { useEffect, useState } from 'react';

import { useBars } from '../api/bars.ts';
import { useSymbols } from '../api/market.ts';
import { DEFAULT_SYMBOL, useChartStore } from '../store/chartStore.ts';
import styles from './ChartArea.module.css';
import { ChartView } from './ChartView.tsx';
import { LegendOHLC } from './LegendOHLC.tsx';
import { legendValues } from './legendValues.ts';

interface ChartAreaProps {
  className?: string | undefined;
}

const DEFAULT_DECIMALS = 2;

/** Chart region: candlestick + volume chart of the selected symbol, with the OHLC legend. */
export function ChartArea({ className }: ChartAreaProps) {
  const symbol = useChartStore((s) => s.symbol);
  const interval = useChartStore((s) => s.interval);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const symbols = useSymbols().data;
  const barsQuery = useBars(symbol, interval);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const data = barsQuery.data;
  const shownSymbol = data?.symbol ?? symbol;
  const info = symbols?.find((s) => s.symbol === shownSymbol);
  const selected = symbols?.find((s) => s.symbol === symbol);
  const bars = data?.bars ?? [];
  const decimals = info?.decimals ?? DEFAULT_DECIMALS;
  const hasVolume = info?.hasVolume ?? true;

  // A symbol remembered from an older universe (renamed or removed) falls back to the default.
  useEffect(() => {
    if (symbols === undefined || symbols.length === 0) return;
    if (symbols.some((s) => s.symbol === symbol)) return;
    setSymbol(symbols.find((s) => s.symbol === DEFAULT_SYMBOL)?.symbol ?? symbols[0]?.symbol ?? '');
  }, [symbols, symbol, setSymbol]);

  let status: string | undefined;
  if (barsQuery.isFetching && (barsQuery.isPlaceholderData || data === undefined)) {
    status = `Loading ${selected?.display ?? symbol}…`;
  } else if (data?.stale) {
    status = 'Cached data (refresh failed)';
  }

  return (
    <main className={[styles.area, className].join(' ')} aria-label="Chart">
      <LegendOHLC
        title={info?.name ?? shownSymbol}
        interval={data?.interval ?? interval}
        exchange={info?.exchange ?? ''}
        values={legendValues(bars, hoverIndex)}
        decimals={decimals}
        hasVolume={hasVolume}
        status={status}
      />
      <ChartView
        bars={bars}
        decimals={decimals}
        hasVolume={hasVolume}
        viewKey={`${shownSymbol}|${data?.interval ?? interval}`}
        onHover={setHoverIndex}
      />
      {barsQuery.isError && (
        <div className={styles.overlay} role="alert">
          <p className={styles.overlayTitle}>
            Could not load {selected?.display ?? symbol} ({interval})
          </p>
          <p className={styles.overlayText}>{barsQuery.error.message}</p>
          <button
            type="button"
            className={styles.retry}
            onClick={() => {
              void barsQuery.refetch();
            }}
          >
            Try again
          </button>
        </div>
      )}
      {data !== undefined && bars.length === 0 && !barsQuery.isError && (
        <div className={styles.overlay}>
          <p className={styles.overlayTitle}>No bars for {selected?.display ?? symbol}</p>
        </div>
      )}
    </main>
  );
}
