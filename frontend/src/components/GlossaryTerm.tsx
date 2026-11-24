import { useId, useMemo, type ReactNode } from 'react';

import { useLearnPage } from '../api/learn.ts';
import { PAGE_PREFIX, useUiStore } from '../store/uiStore.ts';
import styles from './GlossaryTerm.module.css';
import { GLOSSARY_SLUG, parseGlossary } from './learnLinks.ts';

/** A glossary term inside a page: its definition on hover or focus, the glossary on click. */
export function GlossaryTerm({ term, children }: { term: string; children: ReactNode }) {
  const id = useId();
  const openLearn = useUiStore((s) => s.openLearn);
  const glossary = useLearnPage(GLOSSARY_SLUG);
  const entries = useMemo(
    () => (glossary.data === undefined ? null : parseGlossary(glossary.data)),
    [glossary.data],
  );
  const definition = glossary.isError
    ? 'Definition unavailable.'
    : entries === null
      ? 'Loading…'
      : (entries.get(term) ?? 'Not in the glossary.');
  return (
    <span className={styles.term}>
      <a
        href={`#${GLOSSARY_SLUG}-${term}`}
        aria-describedby={id}
        onClick={(event) => {
          event.preventDefault();
          openLearn(`${PAGE_PREFIX}${GLOSSARY_SLUG}#${term}`);
        }}
      >
        {children}
      </a>
      <span id={id} role="tooltip" className={styles.definition}>
        {definition}
      </span>
    </span>
  );
}
