import { createContext } from 'react';

/** Where a `learn:` link goes: null opens the learn drawer; a function shows the page in place
 *  (a learn page read inside a modal dialog, which covers the drawer). */
export const LearnNavigation = createContext<((target: string) => void) | null>(null);
