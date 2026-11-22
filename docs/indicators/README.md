# Indicator learn pages

One Markdown file per indicator, named after the registry `learn_slug` (e.g. `bollinger-bands.md`). Stubs are created
together with the indicator (R3); full content is Phase 2. Math is written in LaTeX (`$...$`, `$$...$$`) and rendered
with KaTeX in the app.

Template:

```markdown
# <Name> (<id>)

## Formula
$$ ... $$

## Defaults
| Param | Default | Why |

## Warm-up
First valid bar index: ...

## What it measures

## Differences vs TradingView

## Pitfalls
```
