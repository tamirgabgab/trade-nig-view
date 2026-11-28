import { useProfiles, useSignals } from '../api/strategies.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useStrategyStore } from '../store/strategyStore.ts';

/**
 * The Strategy tab's signals on the chart's symbol (P4 B0), shared by the tab and the chart (one
 * query). Signals exist only on the profile's decision intervals; on another interval there are
 * none (`onDecision` false).
 */
export function useChartSignals() {
  const symbol = useChartStore((s) => s.symbol);
  const interval = useChartStore((s) => s.interval);
  const profileId = useStrategyStore((s) => s.profile);
  const current = useStrategyStore((s) => s.current);
  const show = useStrategyStore((s) => s.show);
  const profile = useProfiles().data?.find((p) => p.id === profileId);
  const onDecision = profile?.decisionIntervals.includes(interval) ?? false;
  const result = useSignals(
    show && current !== null && onDecision
      ? { symbol, interval, strategy: current.strategy }
      : null,
  );
  return { result, profile, onDecision };
}
