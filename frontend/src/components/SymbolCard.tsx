import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { useSymbols, useUniverseQuotes } from '../api/market.ts';
import { useChartStore } from '../store/chartStore.ts';
import { direction, formatPercent, formatPrice, formatSigned } from './formatNumber.ts';
import { MarketStatus } from './MarketStatus.tsx';
import { RangeBar } from './RangeBar.tsx';
import styles from './SymbolCard.module.css';
import { usePriceFlash } from './usePriceFlash.ts';

/** Details of the charted symbol under the watchlist: price, ranges and market status. */
export function SymbolCard() {
  const symbol = useChartStore((s) => s.symbol);
  const info = useSymbols().data?.find((s) => s.symbol === symbol);
  const quote = useUniverseQuotes().data?.find((q) => q.symbol === symbol);
  const [open, setOpen] = useState(true);
  const flash = usePriceFlash(quote?.last ?? null, symbol);
  if (info === undefined) return null;
  const last = quote?.last ?? null;
  const tone = styles[direction(quote?.change ?? null)] ?? '';

  return (
    <section className={styles.card} aria-label="Symbol details">
      <button
        type="button"
        className={styles.header}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span className={styles.symbol}>{info.display}</span>
        <span className={styles.name}>{info.name}</span>
        <ChevronDown size={16} className={styles.chevron} aria-hidden="true" />
      </button>
      {open && (
        <div className={styles.body}>
          <div className={styles.priceRow}>
            <span
              key={flash.tick}
              className={styles.price}
              data-flash={flash.direction ?? undefined}
            >
              {last === null ? '—' : formatPrice(last, info.decimals)}
            </span>
            <span className={styles.currency}>{info.currency}</span>
            {quote?.change != null && quote.changePct !== null && (
              <span className={tone}>
                {formatSigned(quote.change, info.decimals)} ({quote.changePct > 0 ? '+' : ''}
                {formatPercent(quote.changePct)})
              </span>
            )}
          </div>
          <div className={styles.meta}>
            <MarketStatus info={info} />
            <span>{info.exchange}</span>
          </div>
          {last !== null && (
            <>
              <RangeBar
                label="Day's range"
                low={quote?.dayLow ?? null}
                high={quote?.dayHigh ?? null}
                value={last}
                decimals={info.decimals}
              />
              <RangeBar
                label="52-week range"
                low={quote?.low52w ?? null}
                high={quote?.high52w ?? null}
                value={last}
                decimals={info.decimals}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}
