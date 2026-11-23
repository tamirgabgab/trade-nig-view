import { Fragment, useMemo } from 'react';

import {
  groupSymbols,
  useSymbols,
  useUniverseQuotes,
  type Quote,
  type SymbolInfo,
} from '../api/market.ts';
import { useChartStore } from '../store/chartStore.ts';
import { direction, formatPercent, formatPrice } from './formatNumber.ts';
import styles from './RightSidebar.module.css';
import { Sparkline } from './Sparkline.tsx';
import { usePriceFlash } from './usePriceFlash.ts';

const DASH = '—';

function QuoteCells({ info, quote }: { info: SymbolInfo; quote: Quote | undefined }) {
  const flash = usePriceFlash(quote?.last ?? null, info.symbol);
  if (quote === undefined) {
    return (
      <>
        <td />
        <td className={styles.dash}>{DASH}</td>
        <td className={styles.dash}>{DASH}</td>
        <td className={styles.dash}>{DASH}</td>
      </>
    );
  }
  if (quote.error !== null || quote.last === null) {
    return (
      <>
        <td />
        <td className={styles.dash} title={quote.error ?? 'No data'}>
          {DASH}
        </td>
        <td className={styles.dash}>{DASH}</td>
        <td className={styles.dash}>{DASH}</td>
      </>
    );
  }
  const tone = styles[direction(quote.change)];
  return (
    <>
      <td className={styles.sparkCell}>
        <Sparkline values={quote.spark} />
      </td>
      <td title={quote.stale ? 'Cached value (refresh failed)' : `Close ${quote.time ?? ''}`}>
        <span key={flash.tick} className={styles.last} data-flash={flash.direction ?? undefined}>
          {formatPrice(quote.last, info.decimals)}
        </span>
      </td>
      <td className={tone}>
        {quote.change === null ? DASH : formatPrice(quote.change, info.decimals)}
      </td>
      <td className={tone}>{quote.changePct === null ? DASH : formatPercent(quote.changePct)}</td>
    </>
  );
}

/** Watchlist table: sections from the universe, prices from GET /api/quotes. */
export function Watchlist() {
  const activeSymbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const symbolsQuery = useSymbols();
  const symbols = useMemo(() => symbolsQuery.data ?? [], [symbolsQuery.data]);
  const quotesQuery = useUniverseQuotes();
  const quotes = useMemo(
    () => new Map((quotesQuery.data ?? []).map((q) => [q.symbol, q])),
    [quotesQuery.data],
  );

  if (symbolsQuery.isPending) {
    return <p className={styles.status}>Loading symbols…</p>;
  }
  if (symbolsQuery.isError) {
    return (
      <div className={styles.status} role="alert">
        <p>Could not load the watchlist: {symbolsQuery.error.message}</p>
        <button
          type="button"
          className={styles.retry}
          onClick={() => {
            void symbolsQuery.refetch();
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      {quotesQuery.isFetching && (
        <p className={styles.status} role="status">
          {quotesQuery.data ? 'Updating prices…' : 'Loading prices (first run downloads history)…'}
        </p>
      )}
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Symbol</th>
            <th scope="col">
              <span className="visually-hidden">Last 20 days</span>
            </th>
            <th scope="col">Last</th>
            <th scope="col">Chg</th>
            <th scope="col">Chg%</th>
          </tr>
        </thead>
        <tbody>
          {groupSymbols(symbols).map(([group, members]) => (
            <Fragment key={group}>
              <tr className={styles.section}>
                <td colSpan={5}>{group}</td>
              </tr>
              {members.map((info) => (
                <tr
                  key={info.symbol}
                  className={[styles.row, info.symbol === activeSymbol ? styles.active : '']
                    .filter(Boolean)
                    .join(' ')}
                  title={`${info.name} · ${info.exchange} (click to chart)`}
                  data-symbol={info.symbol}
                  aria-current={info.symbol === activeSymbol ? 'true' : undefined}
                  tabIndex={0}
                  onClick={() => {
                    setSymbol(info.symbol);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSymbol(info.symbol);
                    }
                  }}
                >
                  <td className={styles.symbol}>{info.display}</td>
                  <QuoteCells info={info} quote={quotes.get(info.symbol)} />
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </>
  );
}
