import { Fragment, useCallback, useMemo, useRef, useState } from 'react';

import { useSymbols, useUniverseQuotes, type Quote, type SymbolInfo } from '../api/market.ts';
import { isSynthetic } from '../api/synthetic.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useSettingsStore } from '../store/settingsStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { useWatchlistStore } from '../store/watchlistStore.ts';
import { ActionMenu, type MenuItem } from './ActionMenu.tsx';
import { SyntheticBadge } from './SyntheticBadge.tsx';
import { usePresence } from './usePresence.ts';
import { useWatchlistEditor } from './useWatchlistEditor.ts';
import { moveSymbol, removeSection, removeSymbol } from './watchlistEdit.ts';
import { WatchlistHeader } from './WatchlistHeader.tsx';
import { WatchlistHeatmap } from './WatchlistHeatmap.tsx';
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

/** Where a right-click opened the row or section menu. */
type MenuAt = { x: number; y: number } & (
  { kind: 'row'; symbol: string; section: number } | { kind: 'section'; section: number }
);

const MENU_WIDTH = 240;

/**
 * The shown watchlist (R6): its sections and symbols, prices from GET /api/quotes. Drag a row
 * to reorder or to another section; right-click a row or a section title for its menu.
 */
export function Watchlist() {
  const activeSymbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const openModal = useUiStore((s) => s.openModal);
  const symbolsQuery = useSymbols();
  const universe = useMemo(
    () => new Map((symbolsQuery.data ?? []).map((info) => [info.symbol, info])),
    [symbolsQuery.data],
  );
  const heatmap = useSettingsStore((s) => s.heatmap);
  const quotesQuery = useUniverseQuotes();
  const quotes = useMemo(
    () => new Map((quotesQuery.data ?? []).map((q) => [q.symbol, q])),
    [quotesQuery.data],
  );
  const editor = useWatchlistEditor();
  const dragged = useRef<string | null>(null);
  const [menuAt, setMenuAt] = useState<MenuAt | null>(null);
  const menu = usePresence(menuAt);
  const closeMenu = useCallback(() => {
    setMenuAt(null);
  }, []);

  if (symbolsQuery.isPending || editor.query.isPending) {
    return <p className={styles.status}>Loading the watchlist…</p>;
  }
  const error = symbolsQuery.error ?? editor.query.error;
  if (error !== null) {
    return (
      <div className={styles.status} role="alert">
        <p>Could not load the watchlist: {error.message}</p>
        <button
          type="button"
          className={styles.retry}
          onClick={() => {
            void symbolsQuery.refetch();
            void editor.query.refetch();
          }}
        >
          Try again
        </button>
      </div>
    );
  }
  const sections = editor.active?.sections ?? [];
  const drop = (section: number, before: string | null) => {
    const symbol = dragged.current;
    dragged.current = null;
    if (symbol !== null) editor.edit((s) => moveSymbol(s, symbol, section, before));
  };

  const menuItems = (at: MenuAt): MenuItem[] => {
    if (at.kind === 'section') {
      return [
        {
          label: 'Rename section…',
          onSelect: () => {
            useWatchlistStore.setState({ editingSection: at.section });
            openModal('sectionRename');
          },
        },
        ...(sections.length > 1
          ? [
              {
                label: 'Remove section (keeps its symbols)',
                onSelect: () => {
                  editor.edit((s) => removeSection(s, at.section));
                },
              },
            ]
          : []),
      ];
    }
    const display = universe.get(at.symbol)?.display ?? at.symbol;
    const synthetic = isSynthetic(universe.get(at.symbol))
      ? [
          {
            label: `Edit ${display}…`,
            onSelect: () => {
              openModal('synthetic', at.symbol);
            },
          },
          {
            label: `Delete ${display}…`,
            onSelect: () => {
              openModal('syntheticDelete', at.symbol);
            },
          },
        ]
      : [];
    return [
      ...synthetic,
      {
        label: `Remove ${display} from the watchlist`,
        onSelect: () => {
          editor.edit((s) => removeSymbol(s, at.symbol));
        },
      },
      ...sections.flatMap((section, index) =>
        index === at.section
          ? []
          : [
              {
                label: `Move to ${section.title}`,
                onSelect: () => {
                  editor.edit((s) => moveSymbol(s, at.symbol, index, null));
                },
              },
            ],
      ),
    ];
  };

  return (
    <>
      <WatchlistHeader editor={editor} />
      {quotesQuery.isFetching && (
        <p className={styles.status} role="status">
          {quotesQuery.data ? 'Updating prices…' : 'Loading prices (first run downloads history)…'}
        </p>
      )}
      {sections.every((s) => s.symbols.length === 0) && (
        <p className={styles.status}>This list is empty. Use + to add a symbol.</p>
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
          {sections.map((section, sectionIndex) => (
            <Fragment key={sectionIndex}>
              <tr
                className={styles.section}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={() => {
                  drop(sectionIndex, null);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenuAt({
                    kind: 'section',
                    section: sectionIndex,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
              >
                <td colSpan={5}>{section.title}</td>
              </tr>
              {section.symbols.flatMap((symbol) => {
                const info = universe.get(symbol);
                if (info === undefined) return [];
                return [
                  <tr
                    key={symbol}
                    className={[styles.row, symbol === activeSymbol ? styles.active : '']
                      .filter(Boolean)
                      .join(' ')}
                    title={`${info.name} · ${info.exchange} (click to chart, drag to move)`}
                    data-symbol={symbol}
                    aria-current={symbol === activeSymbol ? 'true' : undefined}
                    tabIndex={0}
                    draggable
                    onDragStart={() => {
                      dragged.current = symbol;
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                    }}
                    onDrop={() => {
                      drop(sectionIndex, symbol);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setMenuAt({
                        kind: 'row',
                        symbol,
                        section: sectionIndex,
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                    onClick={() => {
                      setSymbol(symbol);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSymbol(symbol);
                      }
                    }}
                  >
                    <td className={styles.symbol}>
                      {info.display}
                      {isSynthetic(info) && <SyntheticBadge />}
                    </td>
                    <QuoteCells info={info} quote={quotes.get(symbol)} />
                  </tr>,
                ];
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
      {heatmap && (
        <WatchlistHeatmap
          tiles={sections.flatMap((section) =>
            section.symbols.flatMap((symbol) => {
              const info = universe.get(symbol);
              return info === undefined
                ? []
                : [
                    {
                      symbol,
                      display: info.display,
                      changePct: quotes.get(symbol)?.changePct ?? null,
                    },
                  ];
            }),
          )}
          active={activeSymbol}
          onPick={setSymbol}
        />
      )}
      {menu.shown !== null && (
        <ActionMenu
          key={menu.key}
          label={menu.shown.kind === 'row' ? 'Symbol' : 'Section'}
          items={menuItems(menu.shown)}
          attrs={menu.attrs}
          onClose={closeMenu}
          style={{
            position: 'fixed',
            left: Math.min(menu.shown.x, window.innerWidth - MENU_WIDTH),
            top: menu.shown.y,
          }}
        />
      )}
    </>
  );
}
