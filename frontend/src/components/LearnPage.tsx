import 'katex/dist/katex.min.css';

import { useEffect, useRef } from 'react';
import Markdown, { defaultUrlTransform, type Components, type ExtraProps } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { useLearnPage } from '../api/learn.ts';
import { GlossaryTerm } from './GlossaryTerm.tsx';
import { LabBlock } from './lab/LabBlock.tsx';
import { LearnLink } from './LearnLink.tsx';
import { anchorOf, GLOSSARY_SCHEME, headingDomId, LEARN_SCHEME, nodeText } from './learnLinks.ts';
import styles from './LearnPage.module.css';

const REMARK = [remarkGfm, remarkMath];
const REHYPE = [rehypeKatex];
/** The text of a ```lab fenced block (its JSON), or null for any other block. */
function labSource(node: ExtraProps['node']): string | null {
  const code = node?.children[0];
  if (code?.type !== 'element' || code.tagName !== 'code') return null;
  const classes = code.properties['className'];
  if (!Array.isArray(classes) || !classes.includes('language-lab')) return null;
  return code.children.map((c) => (c.type === 'text' ? c.value : '')).join('');
}

/** Our own link schemes pass; every other URL goes through react-markdown's safe default. */
const urlTransform = (url: string) =>
  url.startsWith(LEARN_SCHEME) || url.startsWith(GLOSSARY_SCHEME) ? url : defaultUrlTransform(url);

/** The drawer header already names the page: its own title is not repeated. A ```lab block is
 *  an interactive example (LabBlock), any other code block stays a code block. Headings get an
 *  anchor; `learn:` and `glossary:` links open pages and definitions (learnLinks.ts). */
const COMPONENTS: Components = {
  h1: () => null,
  h2: ({ node, children }) => <h2 id={headingDomId(anchorOf(nodeText(node)))}>{children}</h2>,
  h3: ({ node, children }) => <h3 id={headingDomId(anchorOf(nodeText(node)))}>{children}</h3>,
  a: ({ href = '', children }) => {
    if (href.startsWith(LEARN_SCHEME)) {
      return <LearnLink target={href.slice(LEARN_SCHEME.length)}>{children}</LearnLink>;
    }
    if (href.startsWith(GLOSSARY_SCHEME)) {
      return <GlossaryTerm term={href.slice(GLOSSARY_SCHEME.length)}>{children}</GlossaryTerm>;
    }
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
  pre: ({ node, children, ...rest }) => {
    const source = labSource(node);
    return source === null ? <pre {...rest}>{children}</pre> : <LabBlock source={source} />;
  },
};

/** A learn page: Markdown with KaTeX math (raw HTML is not rendered). Every navigation (`nav`)
 *  shows it at `anchor`, or at its top. */
export function LearnPage({
  slug,
  anchor = null,
  nav = 0,
}: {
  slug: string;
  anchor?: string | null;
  nav?: number;
}) {
  const page = useLearnPage(slug);
  const loaded = page.data !== undefined;
  const article = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!loaded) return;
    const heading = anchor === null ? null : document.getElementById(headingDomId(anchor));
    if (heading === null) {
      const body = article.current?.parentElement;
      if (body) body.scrollTop = 0;
    } else if ('scrollIntoView' in heading) {
      // jsdom (tests) has no scrollIntoView.
      heading.scrollIntoView({ block: 'start' });
    }
  }, [loaded, slug, anchor, nav]);
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
    <article ref={article} className={styles.page}>
      <Markdown
        remarkPlugins={REMARK}
        rehypePlugins={REHYPE}
        components={COMPONENTS}
        urlTransform={urlTransform}
      >
        {page.data}
      </Markdown>
    </article>
  );
}
