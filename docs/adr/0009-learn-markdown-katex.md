# ADR 0009 — Learn pages: Markdown + KaTeX via react-markdown

- Status: Accepted (2026-11-23)

## Context
L1 (S4) shows each indicator's learn page (`docs/indicators/<slug>.md`, served by `GET /api/learn/{slug}`) in a drawer.
The pages are long, derivation-heavy Markdown with display and inline LaTeX and GFM tables. ADR 0001 names KaTeX for
math (decision D3: KaTeX over MathJax for size and synchronous rendering) but not the Markdown pipeline around it.

## Decision
- Runtime dependencies (frontend): `react-markdown` **10.1**, `remark-gfm` **4.0**, `remark-math` **6.0**,
  `rehype-katex` **7.0**, `katex` **0.19.1** (plus its CSS). APIs and versions checked against the packages' current
  READMEs: `<Markdown remarkPlugins rehypePlugins components>`; raw HTML is not rendered (no `rehype-raw`), so a page
  cannot inject markup.
- `katex` is a direct dependency and `package.json` `overrides` maps every nested `katex` to it (`"$katex"`):
  `rehype-katex` 7 and `micromark-extension-math` 3 pin `^0.16`, which has advisory GHSA-238p-pmpm-9mq7 (fixed in
  0.18.2). Rendering with 0.19.1 was verified on all pages, 19 at the time (`throwOnError`, `strict: 'error'`).
- The drawer (`LearnDrawer`) is loaded with `React.lazy`, so the Markdown/KaTeX code and CSS are a separate chunk that
  only loads when a learn page is opened.

## Consequences
- + Pages stay plain Markdown files in the repo, readable on GitHub and in the app.
- + No raw HTML path; math errors would show inline instead of breaking the page.
- − Four runtime packages (unified ecosystem, ESM-only) and an `overrides` entry to revisit when `rehype-katex` moves
  its peer range past 0.16.

## Alternatives
- MathJax: larger, asynchronous typesetting. Rejected in D3.
- Pre-rendering the pages to HTML in the backend: adds a Python Markdown/KaTeX toolchain and an HTML trust boundary.
  Rejected.
- `marked` + manual KaTeX pass: hand-rolled math tokenising. Rejected.

## Amendment (Phase-1 review, 2026-11-23)
Decision holds. `docs/indicators/` now has a page per registered indicator (29), all rendered by the same pipeline.
