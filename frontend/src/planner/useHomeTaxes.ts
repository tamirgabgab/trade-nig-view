import { useQuery } from '@tanstack/react-query';

import { taxPresets } from '../api/planner.ts';
import { resolveTaxes, usePlannerHomeStore } from '../store/plannerHomeStore.ts';
import { bySlot } from '../store/plannerStore.ts';

/**
 * The built-in tax tables, the two the apartment on screen stands for (`taxes`) and those of
 * both options (`both`). Each is null until the built-in ones arrive, so a plan is never run
 * with a missing table read as "no tax".
 */
export function useHomeTaxes() {
  const slot = usePlannerHomeStore((s) => s.slot);
  const home = usePlannerHomeStore((s) => s.home);
  const other = usePlannerHomeStore((s) => s.other);
  const saved = usePlannerHomeStore((s) => s.saved);
  const presets = useQuery({
    queryKey: ['planner', 'tax-presets'],
    queryFn: taxPresets,
    staleTime: Infinity,
  });
  const taxes = resolveTaxes(home, saved, presets.data);
  const others = resolveTaxes(other, saved, presets.data);
  return {
    presets: presets.data,
    failed: presets.isError,
    taxes,
    both: taxes === null || others === null ? null : bySlot(slot, taxes, others),
  };
}
