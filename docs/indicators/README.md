# Indicator learn pages

One Markdown file per indicator, named after the registry `learn_slug` (e.g. `bollinger-bands.md`), plus concept pages
(`combinations.md`). Math is written in LaTeX (`$...$`, `$$...$$` on its own lines) and rendered with KaTeX in the
app.

Pages are served by `GET /api/learn/{slug}` (the index: `GET /api/learn`) and rendered in the learn drawer (book icon in
the legend, the sidebar's "Learn pages" button, or `Ctrl+K` → "Learn: …") with `react-markdown` + `remark-gfm` +
`remark-math` + `rehype-katex`. GitHub-flavoured tables work; raw HTML is not rendered. The drawer also has a
**Try it** tab (every parameter live, on a random or a real series) and, for averages, the **Filter view**.

## Template v2 (Phase 2)

Every section in this order (extra `##` sections, e.g. "Kernel, lag and noise" or "Filter view" for averages, may sit
between them). `backend/tests/unit/test_learn_pages.py` checks the headings of every page listed in `V2_PAGES`.

```markdown
# <Name> (`<id>`)

One or two plain sentences: what it is and when people use it.

## What it measures
The question the indicator answers, in words, before any formula. One small `param` lab (see below).

## Formula
The definition, with each symbol coloured like its line on the chart, then a "where" table:

$$
\textcolor{#7E57C2}{RSI_t} = 100 - \frac{100}{1 + \textcolor{#2962FF}{RS_t}}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#7E57C2}{RSI_t}$ | the indicator at bar $t$ | 0–100 |

## Defaults
| Param | Default | Why |

## Warm-up
The first bar with a value, and why.

## How to read it
What high / low / crossing values mean; what the levels are; what it does in a trend vs a range.

## Why it works
The mathematics behind the reading: derivations (bounds, distributions under a random walk, filter response), then an
`event` lab: "what followed the signal" vs an average bar, with the 95 % interval. Always show that on a random walk
there is no edge, and on which kind of market (scenario) there is.

## Combine with
Which other indicator(s) complement it and why (trend filter, trigger, confirmation), with a `combo` lab.

## Differences vs TradingView

## Pitfalls

## Exercise
One or two short tasks for the reader (with a `replay` block where it helps), e.g. "set the scenario to Range, move the threshold from 30 to 20: how do the
count and the edge change, and why?" or "start Replay on AAPL at <date>".
```

### Equations and colours
- Colour a symbol with `\textcolor{#RRGGBB}{...}` in the colour of its line in the registry (the chart and the labs
  draw it in that colour). Price and plain variables stay uncoloured.
- Colours must read on the dark and the light theme. A registry colour too pale for white paper takes a darker shade
  of the same hue in equations: HMA `#FFCA28` → `#F9A825`, ZLEMA `#D4E157` → `#AFB42B`, ALMA `#29B6F6` → `#039BE5`, VWMA `#66BB6A` → `#43A047`, McGinley `#FFA726` → `#FB8C00`,
  RSI MA `#FDD835` → `#F9A825`, Ribbon MA 1 `#F7A600` → `#E69500`. Other symbols that are not lines: `#2962FF` blue,
  `#FF6D00` orange, `#089981` green, `#F23645` red, `#7E57C2` purple, `#00BCD4` cyan, `#787B86` grey.
- Every displayed equation is followed by a "where" table (symbol, meaning, units / typical range).

### Interactive labs
A fenced block with the language `lab` holding JSON becomes a live widget. All of them have a data picker: a random
stock (scenarios: `random_walk`, `uptrend`, `range`, `reversal`, `shock`, `volatility_regime`; a new-sample button) or
any symbol of the universe. Every number is computed by the backend's one implementation (`POST /api/learn/lab`).

````markdown
```lab
{"kind": "param", "indicator": "rsi", "vary": "length", "min": 2, "max": 50, "scenario": "range"}
```

```lab
{"kind": "event", "indicator": "rsi", "output": "rsi", "op": "lt", "value": 30, "range": [5, 50],
 "horizon": 10, "scenario": "range"}
```

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}},
  {"label": "RSI 14 below 40", "left": {"indicator": {"id": "rsi", "params": {}}, "output": "rsi"},
   "op": "lt", "right": {"value": 40}}
 ]}
```
````

- `param`: one parameter (`vary`) on a slider (`min`/`max` optional), optional `params` over the defaults.
- `event`: an event study of `output` `op` `value` (`op`: `lt`, `gt`, `crosses_above`, `crosses_below`); the reader can
  move the threshold within `range`, change the comparison and the look-ahead (`horizon`, bars).
- `replay`: a "Start in Replay" button for an exercise: the chart switches to `symbol` (the universe's provider
  symbol, e.g. `SPY`, `^GSPC`) on daily bars, adds `indicators` (each `{"id", "params"}`) unless the same one is already
  on, and starts the bar replay at the last bar on or before `date` (`YYYY-MM-DD`; daily history reaches about 20 years
  back).

  ```lab
  {"kind": "replay", "symbol": "SPY", "date": "2020-02-19", "indicators": [{"id": "sma", "params": {"length": 50}}]}
  ```
- `filter`: the measured Filter view of a linear indicator (impulse, step and frequency response, lag and noise; for a
  band-pass output such as MACD, no lag); `output` picks the line shown first, e.g.
  `{"kind": "filter", "indicator": "macd", "output": "macd"}`, or the RMA inside RSI:
  `{"kind": "filter", "indicator": "smma", "params": {"length": 14}}`.
- `combo`: up to three of `rules` at once (their AND), each rule's edge alone next to it. A rule's sides are
  `{"indicator": {"id", "params"}, "output"}`, `{"price": "close"}` or `{"value": n}`.

The backend test also checks every lab block of every page: valid JSON, a known `kind`, registered indicator ids.

### Event studies: what they show and what they do not
Mean $h$-bar log return after the signal minus the mean after any bar ("edge"), its standard error and 95 % interval,
the hit rates, the two distributions. At most one signal counts per $h + 1$ bars (a signal within $h$ bars of a
counted one is skipped), so the counted forward windows do not overlap: a one-bar trigger (a cross) counts once, a state
that stays true (close above the line) is sampled every $h + 1$ bars. It is one rule on one sample: not a backtest (no costs, no position sizing), sensitive to multiple testing,
and not investment advice. Pages must say so where they draw conclusions.
