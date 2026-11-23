# Indicator learn pages

One Markdown file per indicator, named after the registry `learn_slug` (e.g. `bollinger-bands.md`). Stubs are created
together with the indicator (R3); full content is Phase 2. Math is written in LaTeX (`$...$`, `$$...$$`) and rendered
with KaTeX in the app.

Pages are served by `GET /api/learn/{slug}` and rendered in the learn drawer (book icon in the legend) with
`react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex`. Write math as `$...$` (inline) and `$$...$$`
(display, on its own lines); GitHub-flavoured tables work; no raw HTML (it is not rendered). The drawer's
**Filter view** tab plots the indicator's measured impulse, step and frequency response
(`POST /api/indicators/response`); the page's "Filter view" section explains what those plots show for it.

Template:

```markdown
# <Name> (`<id>`)

One or two sentences: what it is and when to use it.

## Formula
$$ ... $$

## Kernel, lag and noise
Impulse response h_k, derivation of the lag (centre of mass) and NRF (sum of h_k^2), and their values at the default
length. For adaptive or volume-weighted averages: why there is no fixed kernel and what replaces it.

## Defaults
| Param | Default | Why |

## Warm-up
First valid bar index: ...

## Filter view
What the impulse, step and frequency-response plots show for this average (zeros, overshoot, ripple, group delay).

## What it measures

## Differences vs TradingView

## Pitfalls
```
