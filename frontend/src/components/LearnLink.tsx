import type { ReactNode } from 'react';

import { PAGE_PREFIX, useUiStore } from '../store/uiStore.ts';

/** A link to another learn page (`learn:slug#heading`): opens it in the drawer. */
export function LearnLink({ target, children }: { target: string; children: ReactNode }) {
  const openLearn = useUiStore((s) => s.openLearn);
  return (
    <a
      href={`#${target}`}
      onClick={(event) => {
        event.preventDefault();
        openLearn(`${PAGE_PREFIX}${target}`);
      }}
    >
      {children}
    </a>
  );
}
