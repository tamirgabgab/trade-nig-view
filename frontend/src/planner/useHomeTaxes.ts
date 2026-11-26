import { useQuery } from '@tanstack/react-query';

import { taxPresets } from '../api/planner.ts';
import { resolveTaxes, usePlannerHomeStore } from '../store/plannerHomeStore.ts';

/**
 * The built-in tax tables and the two the apartment form stands for (`taxes` is null until the
 * built-in ones arrive, so a plan is never run with a missing table read as "no tax").
 */
export function useHomeTaxes() {
  const home = usePlannerHomeStore((s) => s.home);
  const saved = usePlannerHomeStore((s) => s.saved);
  const presets = useQuery({
    queryKey: ['planner', 'tax-presets'],
    queryFn: taxPresets,
    staleTime: Infinity,
  });
  return {
    presets: presets.data,
    failed: presets.isError,
    taxes: resolveTaxes(home, saved, presets.data),
  };
}
