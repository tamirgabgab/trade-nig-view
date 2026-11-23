import { useSymbols } from '../api/market.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useSettingsStore } from '../store/settingsStore.ts';

/** The IANA zone the chart, clock and panels show times in (the setting, or the exchange's). */
export function useDisplayTimeZone(): string {
  const setting = useSettingsStore((s) => s.timeZone);
  const symbol = useChartStore((s) => s.symbol);
  const exchange = useSymbols().data?.find((s) => s.symbol === symbol)?.timezone;
  return setting === 'exchange' ? (exchange ?? 'America/New_York') : setting;
}
