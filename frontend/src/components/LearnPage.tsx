import 'katex/dist/katex.min.css';

import Markdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { useLearnPage } from '../api/learn.ts';
import styles from './LearnPage.module.css';

const REMARK = [remarkGfm, remarkMath];
const REHYPE = [rehypeKatex];
/** The drawer header already names the indicator: the page's own title is not repeated. */
const COMPONENTS = { h1: () => null };

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
