import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

// Every learn page, through the drawer's own Markdown pipeline: KaTeX marks a formula it cannot
// parse with `katex-error` instead of throwing, so the test looks for that class.
const PAGES = import.meta.glob<string>('../../../docs/indicators/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('learn pages', () => {
  it('finds the pages', () => {
    expect(Object.keys(PAGES).length).toBeGreaterThan(20);
  });

  it.each(Object.entries(PAGES))('%s: every formula renders with KaTeX', (_, markdown) => {
    const html = renderToStaticMarkup(
      <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {markdown}
      </Markdown>,
    );
    const errors = [...html.matchAll(/class="katex-error"[^>]*title="([^"]*)"/g)].map((m) => m[1]);
    expect(errors).toEqual([]);
  });
});
