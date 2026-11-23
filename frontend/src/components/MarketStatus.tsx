import { memo } from 'react';

import type { SymbolInfo } from '../api/market.ts';
import { isMarketOpen, MARKET_STATUS_NOTE } from './marketHours.ts';
import styles from './MarketStatus.module.css';
import { useNow } from './useNow.ts';

/** "Market open" / "Market closed" with a dot, re-checked every minute. */
export const MarketStatus = memo(function MarketStatus({
  info,
  compact = false,
}: {
  info: SymbolInfo;
  compact?: boolean;
}) {
  const open = isMarketOpen(info, useNow(60_000));
  const label = open ? 'Market open' : 'Market closed';
  return (
    <span
      className={[styles.status, open ? styles.open : ''].join(' ')}
      title={`${label}. ${MARKET_STATUS_NOTE}`}
      aria-label={label}
    >
      <span className={styles.dot} aria-hidden="true" />
      {!compact && label}
    </span>
  );
});
