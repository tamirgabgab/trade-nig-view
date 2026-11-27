import { useContext, type ReactNode } from 'react';

import { PAGE_PREFIX, useUiStore } from '../store/uiStore.ts';
import { LearnNavigation } from './learnNavigation.ts';

/** A link to another learn page (`learn:slug#heading`): opens it in the drawer. */
export function LearnLink({ target, children }: { target: string; children: ReactNode }) {
  const openLearn = useUiStore((s) => s.openLearn);
  const navigate = useContext(LearnNavigation);
  return (
    <a
      href={`#${target}`}
      onClick={(event) => {
        event.preventDefault();
        if (navigate === null) openLearn(`${PAGE_PREFIX}${target}`);
        else navigate(target);
      }}
    >
      {children}
    </a>
  );
}
