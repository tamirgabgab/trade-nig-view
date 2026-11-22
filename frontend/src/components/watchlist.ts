/** Default watchlist shown in the sidebar. Becomes server-backed (GET /api/watchlists) in R2/R6. */
export interface WatchlistSection {
  title: string;
  symbols: readonly { symbol: string; display: string }[];
}

export const DEFAULT_WATCHLIST: readonly WatchlistSection[] = [
  {
    title: 'Indices',
    symbols: [
      { symbol: '^GSPC', display: 'SPX' },
      { symbol: '^NDX', display: 'NDX' },
      { symbol: '^DJI', display: 'DJI' },
      { symbol: '^VIX', display: 'VIX' },
    ],
  },
  {
    title: 'ETFs',
    symbols: [
      { symbol: 'SPY', display: 'SPY' },
      { symbol: 'QQQ', display: 'QQQ' },
      { symbol: 'IWM', display: 'IWM' },
    ],
  },
  {
    title: 'Stocks',
    symbols: [
      { symbol: 'AAPL', display: 'AAPL' },
      { symbol: 'NVDA', display: 'NVDA' },
      { symbol: 'MSFT', display: 'MSFT' },
      { symbol: 'TSLA', display: 'TSLA' },
      { symbol: 'NFLX', display: 'NFLX' },
    ],
  },
  {
    title: 'Futures',
    symbols: [
      { symbol: 'CL=F', display: 'USOIL' },
      { symbol: 'GC=F', display: 'GOLD' },
      { symbol: 'SI=F', display: 'SILVER' },
    ],
  },
  {
    title: 'Forex',
    symbols: [
      { symbol: 'JPY=X', display: 'USDJPY' },
      { symbol: 'GBPUSD=X', display: 'GBPUSD' },
    ],
  },
];
