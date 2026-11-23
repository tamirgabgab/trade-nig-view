import { BookOpen } from 'lucide-react';
import { useCallback } from 'react';

import { CATEGORY_LABELS, type IndicatorCategory } from '../api/indicators.ts';
import { useLearnIndex, type LearnEntry } from '../api/lab.ts';
import { PAGE_PREFIX, useUiStore } from '../store/uiStore.ts';
import { SearchDialog } from './SearchDialog.tsx';
import { usePresence } from './usePresence.ts';

const group = (e: LearnEntry) =>
  e.kind === 'concept'
    ? 'Concepts'
    : e.category !== null && e.category in CATEGORY_LABELS
      ? CATEGORY_LABELS[e.category as IndicatorCategory]
      : 'Indicators';

/** Every learn page (indicators by category, then concepts), searchable; a pick opens it. */
export function LearnIndexDialog() {
  const open = useUiStore((s) => s.modal === 'learnIndex');
  const closeModal = useUiStore((s) => s.closeModal);
  const openLearn = useUiStore((s) => s.openLearn);
  const pages = useLearnIndex().data;
  const search = useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase();
      const hits = (pages ?? []).filter(
        (p) => q === '' || p.title.toLowerCase().includes(q) || p.slug.includes(q),
      );
      const groups = new Map<string, LearnEntry[]>();
      for (const p of hits) groups.set(group(p), [...(groups.get(group(p)) ?? []), p]);
      return [...groups].map(([label, items]) => ({ label, items }));
    },
    [pages],
  );
  const { shown, attrs, key } = usePresence(open ? true : null);
  if (shown === null) return null;
  const close = () => {
    closeModal('learnIndex');
  };

  return (
    <SearchDialog
      key={key}
      title="Learn pages"
      icon={<BookOpen size={16} />}
      inputLabel="Page"
      listLabel="Learn pages"
      placeholder="e.g. RSI or combining"
      attrs={attrs}
      search={search}
      itemKey={(p) => p.slug}
      renderItem={(p) => <span>{p.title}</span>}
      onPick={(p) => {
        close();
        openLearn(`${PAGE_PREFIX}${p.slug}`);
      }}
      onClose={close}
      status={(_query, count) =>
        pages === undefined ? 'Loading the pages…' : count === 0 ? 'No page matches.' : null
      }
    />
  );
}
