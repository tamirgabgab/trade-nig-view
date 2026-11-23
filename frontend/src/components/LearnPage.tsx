import 'katex/dist/katex.min.css';

import type { Element } from 'hast';
import Markdown, { type Components } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { useLearnPage } from '../api/learn.ts';
import { LabBlock } from './lab/LabBlock.tsx';
import styles from './LearnPage.module.css';

const REMARK = [remarkGfm, remarkMath];
const REHYPE = [rehypeKatex];
/** The text of a ```lab fenced block (its JSON), or null for any other block. */
function labSource(node: Element | undefined): string | null {
  const code = node?.children[0];
  if (code?.type !== 'element' || code.tagName !== 'code') return null;
  const classes = code.properties['className'];
  if (!Array.isArray(classes) || !classes.includes('language-lab')) return null;
  return code.children.map((c) => (c.type === 'text' ? c.value : '')).join('');
}

/** The drawer header already names the page: its own title is not repeated. A ```lab block is
 *  an interactive example (LabBlock), any other code block stays a code block. */
const COMPONENTS: Components = {
  h1: () => null,
  pre: ({ node, children, ...rest }) => {
    const source = labSource(node);
    return source === null ? <pre {...rest}>{children}</pre> : <LabBlock source={source} />;
  },
};

/** An indicator's learn page: Markdown with KaTeX math (raw HTML is not rendered). */
export function LearnPage({ slug }: { slug: string }) {
  const page = useLearnPage(slug);
  if (page.isError) {
    return (
      <p className={styles.status} role="alert">
        Could not load this page: {page.error.message}
      </p>
    );
  }
  if (page.data === undefined) {
    return (
      <p className={styles.status} role="status">
        Loading page…
      </p>
    );
  }
  return (
    <article className={styles.page}>
      <Markdown remarkPlugins={REMARK} rehypePlugins={REHYPE} components={COMPONENTS}>
        {page.data}
      </Markdown>
    </article>
  );
}
