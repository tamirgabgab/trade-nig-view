import type { AssetDepth } from '../api/planner.ts';
import styles from './Planner.module.css';
import { price } from './plannerFormat.ts';

/** How far back each ticker's data goes, and the price everything is sold at. */
export function PlannerAssetsTable({ assets }: { assets: AssetDepth[] }) {
  return (
    <table className={styles.table} aria-label="Assets history">
      <thead>
        <tr>
          <th>Ticker</th>
          <th>Data from</th>
          <th>Data to</th>
          <th>Days</th>
          <th>Dividends</th>
          <th>Sell price</th>
          <th>USD/ILS at the sale</th>
        </tr>
      </thead>
      <tbody>
        {assets.map((asset) =>
          asset.error ? (
            <tr key={asset.symbol}>
              <td>{asset.symbol}</td>
              <td colSpan={6} className={styles.bad}>
                {asset.error}
              </td>
            </tr>
          ) : (
            <tr key={asset.symbol}>
              <td>{asset.symbol}</td>
              <td>{asset.first}</td>
              <td>{asset.last}</td>
              <td>{asset.bars.toLocaleString('en-US')}</td>
              <td>{asset.has_dividends ? 'in the prices' : 'none'}</td>
              <td>{asset.sell_price == null ? '—' : price(asset.sell_price)}</td>
              <td>
                {asset.sell_fx == null || asset.currency === 'ILS' ? '—' : price(asset.sell_fx)}
              </td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}
