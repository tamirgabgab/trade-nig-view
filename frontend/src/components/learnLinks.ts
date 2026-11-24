import type { ExtraProps } from 'react-markdown';

/**
 * Links between learn pages (P2d). In a page's Markdown:
 * - `[text](learn:slug)` or `[text](learn:slug#heading)` opens that page (at that heading);
 * - `[term](glossary:term)` shows the glossary's definition on hover and opens it on click.
 * A heading's anchor is its plain text in lower case, with every run of other characters as `-`
 * (backend/tests/unit/test_learn_pages.py checks every link with the same rule).
 */

export const LEARN_SCHEME = 'learn:';
export const GLOSSARY_SCHEME = 'glossary:';
export const GLOSSARY_SLUG = 'glossary';

export function anchorOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The DOM id of a heading anchor (prefixed: the drawer shares the page with the app). */
export const headingDomId = (anchor: string) => `learn-${anchor}`;

interface TextNode {
  type: string;
  value?: string;
  children?: TextNode[];
}

/** The visible text of a rendered Markdown node. */
export function nodeText(node: ExtraProps['node'] | TextNode): string {
  if (node === undefined) return '';
  const n = node as TextNode;
  return n.type === 'text' ? (n.value ?? '') : (n.children ?? []).map(nodeText).join('');
}

/** Strip Markdown marks for a plain-text tooltip: links keep their text, emphasis and code marks go. */
function plain(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*`$]/g, '')
    .trim();
}

/** Glossary entries: each `### Term` heading's anchor -> its first paragraph as plain text. */
export function parseGlossary(markdown: string): Map<string, string> {
  const entries = new Map<string, string>();
  let term: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (term !== null && lines.length > 0) entries.set(term, plain(lines.join(' ')));
  };
  for (const line of markdown.split('\n')) {
    if (line.startsWith('#')) {
      flush();
      term = line.startsWith('### ') ? anchorOf(plain(line.slice(4))) : null;
      lines = [];
    } else if (line.trim() === '') {
      if (lines.length > 0) {
        flush();
        term = null;
      }
    } else if (term !== null) {
      lines.push(line.trim());
    }
  }
  flush();
  return entries;
}
