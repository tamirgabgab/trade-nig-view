# Phase A — Market data from Alpaca (plan)

- Status: **planned** (2026-11-28). Asked for by the user on 2026-11-28; nothing is implemented yet.
- Rounds: A0 (gate) → A1 → A2 → A3 → A4. Sizes: A0 S, A1 M, A2 L, A3 L, A4 M.

## Goal
Deeper and finer US market data than Yahoo gives: minute bars for years instead of 30/60 days, bars down to the
second built from the trades themselves, the bid and the ask, and prices that arrive live. The data feeds the chart,
the indicators, Replay and Phase 4's backtester (the Day profile is the one that needs it, `PHASE4_PLAN.md`, "Data per
profile"). **Data only**: ChartLab never trades through Alpaca (see "Safety").

## What Alpaca gives over Yahoo
| | Yahoo (today, ADR 0017) | Alpaca |
|---|---|---|
| 1m bars | the last ~30 days (accumulated by the collector since D0) | since 2016 (*web*) |
| 5m / 15m / 30m | the last ~60 days | since 2016, any 1–59 minutes natively (*SDK*) |
| 1h | ~730 days | since 2016, 1–23 hours natively (*SDK*) |
| Seconds | none | no second bars (*SDK*: the smallest unit is the minute); built from the trades |
| Trades and quotes | none | every trade and every quote with its exchange and conditions (*SDK*: `/v2/stocks/trades`, `/v2/stocks/quotes`) |
| Live | polled every 60 s (ADR 0017) | a websocket stream of trades, quotes and bars (*SDK*) |
| Extended hours | not used (regular hours only) | included in the bars (*web*); overnight trading from the BOATS feed (*SDK*) |
| Corporate actions | from Yahoo's adjusted closes | an API with 13 action types (splits, dividends, spin-offs, mergers, name changes, ...) (*SDK*) |
| Coverage | indices, TASE, FX, futures, crypto, US stocks | US stocks and ETFs (plus crypto and US options, not in this phase); **no indices** (`^GSPC`: use SPY), **no TASE**, no FX, no futures |

Daily bars stay on Yahoo (decades of history; Alpaca's start in 2016 is too short). Alpaca is for the intraday bases
and below, for the symbols it covers; everything else keeps today's providers.

## The facts, and where each one comes from
The official documentation (`docs.alpaca.markets`) and the data hosts (`data.alpaca.markets`,
`stream.data.alpaca.markets`) are **not reachable from the cloud session** (DNS blocked, checked 2026-11-28). The
facts below come from two places, marked in the tables:
- *SDK*: read in the source of the official Python client `alpaca-py` 0.45.0 (downloaded from PyPI, 2026-11-28).
- *web*: search results quoting the docs, the community forum and third-party guides (October–November 2026). **Each
  of these is confirmed or corrected by the A0 probe** on the user's machine before anything is built on it.

| Fact | Source |
|---|---|
| Hosts: market data `https://data.alpaca.markets` (`/v2/stocks/...`, corporate actions `/v1/corporate-actions`), stream `wss://stream.data.alpaca.markets/v2/{iex,sip,delayed_sip}` (`/v1beta1/{boats,overnight}`); trading hosts are separate (`api.alpaca.markets`, `paper-api.alpaca.markets`) | SDK |
| Authentication: headers `APCA-API-KEY-ID` and `APCA-API-SECRET-KEY` | SDK |
| Feeds: `iex`, `sip`, `delayed_sip`, `otc`, `boats`, `overnight` | SDK |
| Bar timeframes: 1–59 Min, 1–23 Hour, 1 Day, 1 Week, 1/2/3/6/12 Month; no seconds | SDK |
| Adjustment: `raw`, `split`, `dividend`, `all` (the reference also lists `spin-off`; default `raw`) | SDK (*web* for spin-off) |
| Bar fields: open time, OHLC, volume, trade count, VWAP | SDK |
| Request fields: `start`, `end` (UTC), `limit`, `sort`, `currency`, `feed`, `asof`; pages by `page_token` | SDK |
| `limit` default 1,000, at most 10,000 per call, counted across all the symbols of a call | web |
| History from 2016 | web |
| Plans: **Basic** (free): real-time IEX only, 200 calls/min, 30 stream symbols; **Algo Trader Plus** ($99/month): real-time SIP, 10,000 calls/min, no symbol cap | web |
| Basic may read SIP history whose `end` is at least 15 minutes old (the docs, staff on the forum, a measured 403 inside the delay) | web |
| **A paper-only account is entitled to IEX data only** (the paper-trading page; one guide: even with a paid plan) | web |
| Anyone in the world can open a paper-only account with an email; a live account outside the US needs a tax id and documents; **Israel is not confirmed** either way | web |
| One stream connection per account (a second gets error 406); 405 = too many symbols, 407 = the client is too slow | web |
| A test stream (`v2/test`, fake symbols such as FAKEPACA, 24/7) | web |
| Minute bars are built from the trades by their SIP timestamp; condition codes decide which trades update OHLC (an extended-hours trade "T" does, "U" only the volume); a minute with no valid trade has no bar | web |

## The decision that sets everything: which feed the account may use
- **SIP** is the consolidated tape: every US exchange and off-exchange trade, the same picture as Yahoo but to the
  trade. With SIP, Alpaca is both **deeper and more precise** than Yahoo.
- **IEX** is one exchange, a few percent of US volume (an estimate, not from the sources above). Its minute bars are other bars: sparse minutes, a fraction of
  the volume, highs and lows that miss the other venues. With IEX only, Alpaca is **deeper but less precise** than
  Yahoo, and second bars built from IEX trades would be thinner still.
- Which one the user gets depends on the account (the user's sign-up link was `signup/pending`):
  - a **paper-only account** (open to everyone): IEX only, by the terms (*web*);
  - a **live account approved, Basic plan** (free): SIP history older than 15 minutes, IEX live (*web*): **the
    consolidated data is always 15 minutes behind**;
  - **Algo Trader Plus** ($99/month): SIP history and SIP live (*web*). If the paid plan does not lift the paper-only
    restriction (one guide says it does not), an account that stays paper-only has **no way to SIP at all**.
- **What the user checks in the dashboard** (A0): is the account paper-only or approved for live trading, and which
  data plan does "Plans & Features" show?
- **The trade-off of the keys:** paper keys cannot move money, but may mean IEX only. Live keys may unlock SIP history,
  but they are keys of a real brokerage account that can place real orders: if they leak, someone else can trade. The
  plan's defense: ChartLab's code can only reach the two data hosts (enforced by a test) and the keys never leave
  `.env`; an unfunded live account also has no money to trade with. **The choice of key is the user's.**
- A0 measures what the keys can actually do (feeds, depth, limits) and the user decides; A1 to A3 are written below for
  both outcomes.

## Safety: a proposed amendment to CLAUDE.md §10 (needs the user's approval before A0)
Today §10 says "no broker APIs or credentials", and `PHASE4_PLAN.md` says "a paid data source (data only, never a
broker)". Alpaca is a broker that also sells market data, so this phase needs the rule amended. **Proposed text**
(added to §10 only once the user approves it, with an ADR at A0):

> Market data may come from a broker's **market-data API only** (Alpaca: `data.alpaca.markets` and
> `stream.data.alpaca.markets`). No trading, account or order endpoint is ever called, no trading client is imported
> (`alpaca.trading`, `alpaca.broker`), and a test fails if the code names any other Alpaca host. Paper-account keys are
> preferred; the keys live only in `.env` (`ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`), never committed, logged,
> recorded in fixtures or sent to the frontend.

Not in this phase, and still forbidden: real orders, paper orders through Alpaca (Phase 5's agent stays inside
ChartLab), account or position reads.

## How it fits ChartLab
- **Provider contract** (`app/data/providers/base.py`): `AlpacaProvider` implements `DataProvider` like Tiingo
  (key in `.env` via `Settings`, an error that names the key when it is rejected). It serves the intraday bases `1m`,
  `5m`, `1h` (resampling to 2m … 4h stays as in ADR 0017, so every interval comes from one download per base), **regular
  hours only, split-adjusted OHLC** as the contract says (`adjustment=split`; dividends from the daily factors as today),
  and an explicit `feed` on every request (never the account's default).
- **Plain HTTP, no SDK:** the REST calls are a few GETs with two headers and a page token, made with the project's
  `httpx`; the official SDK also carries the trading and broker clients, which the safety rule keeps out. The stream in
  A3 needs a websocket client: the candidate libraries and the Windows Smart App Control check are A3's first task
  (the `websockets` package has a native module SAC may block, `pyproject.toml`).
- **Rate limits:** a token bucket at the plan's rate (200/min on Basic), exponential backoff with jitter on 429, the
  circuit breaker and the cache, as for Yahoo (§8). `OFFLINE=1` = fixtures only.
- **The cache must know the source and the feed.** `bars.db` keeps a `source` per bar, but ADR 0017's rule "an overlap
  within 1 % of the cached closes is a late-print correction: the fresh bars replace the cached ones" would splice
  Alpaca bars over the Yahoo-collected ones without a word, and on IEX the volumes differ many times over. A1 keeps
  **one source per symbol and base**: the source and feed are recorded with the coverage, a change of source is a new
  series (the old bars kept apart, not mixed), and the chart says which one it shows.
- **Depth in the UI:** the minutes menu and the line under the legend (ADR 0017) show Alpaca's depth ("1m since 2016,
  SIP") instead of "~30 days".
- **Not reachable from the cloud.** Every real call runs on the user's Windows machine: a probe script and a fixture
  recorder like `make-fixtures.ps1`, whose output is stripped of keys and account ids before it is committed. Tests
  never hit the network (§8) and use those recordings.

## Rounds

### A0 — Keys, the probe and the safety rule (S) — the gate
- The ADR and the §10 amendment as approved; `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY` and `ALPACA_FEED`
  (`iex` | `sip`) in `Settings` and `.env.example` (empty); `alpaca` in `DATA_PROVIDERS`.
- `scripts/alpaca-probe.ps1` (and `.sh`), run by the user: checks the keys; for AAPL and SPY asks 1m bars on `iex`,
  on `sip` ending more than 15 minutes ago, on `sip` inside the last 15 minutes and on `delayed_sip`; finds the first
  1m bar of each feed (IEX may start later than SIP); reads the rate-limit headers; runs once per key set the user
  has (paper, live); opens the test stream and the IEX stream for a few seconds; writes a report
  (no keys, no account id) to `data/alpaca-probe.txt` for the user to paste back.
- `scripts/make-alpaca-fixtures.ps1`: records a few responses (1m/5m/1h bars, a page with a `next_page_token`, trades,
  quotes, a 403, a 429, stream messages) into `backend/tests/fixtures/alpaca/`, with the headers removed. First an
  A0 check: may recorded Alpaca data be committed (the repository's visibility, Alpaca's data terms on
  redistribution)? If not, the tests use hand-made payloads of the same shape.
- Tests: the hosts test (no Alpaca host other than the two data hosts anywhere in the code), the key never in a log
  line or a response, the settings.
- **Exit:** the probe's report decides the feed for A1–A3, and the user decides whether to go on (and on which plan).

### A1 — Minute and hour bars from Alpaca (M)
- `providers/alpaca.py`: bars for `1m`, `5m`, `1h` by pages of 10,000 (an estimate for ten years of one symbol's 1m
  bars: ~100 calls for the regular hours alone, two to three times that because the response also carries the
  extended hours, cut afterwards; one to a few minutes at 200/min), regular hours only (09:30–16:00 New York, the
  half days included), split-adjusted, the feed explicit; `INTRADAY_MAX_DAYS` becomes per provider (Alpaca: from
  2016-01-01).
- Provider order for intraday: Alpaca first for the US stocks and ETFs it covers, Yahoo for the rest and as the
  fallback when Alpaca fails; daily stays Yahoo.
- **With SIP:** Alpaca's bars become the intraday series of those symbols. **With IEX only:** they are offered as a
  separate, labelled source (the user's choice at A0), never spliced into Yahoo's consolidated bars.
- **The newest 15 minutes on Basic:** a SIP request ends at now − 15 minutes (clamped before it is sent, so a 403
  inside the delay never happens and never counts as a failure). The chart draws the minutes after it from Yahoo's
  polled bars as a labelled provisional tail (both are consolidated), which is never written into the Alpaca series
  and is replaced as the SIP minutes become readable. The fallback to Yahoo is for a whole request when Alpaca fails;
  the chart then shows Yahoo's series, labelled, and the cache mixes nothing.
- History on demand: scrolling back fetches older pages (the cache keeps them); `collect` gets `--backfill SINCE` for
  the watchlist and the daily run tops Alpaca's bases up. Storage estimate: ~1 M rows a symbol for ten years of 1m
  bars (some 60–100 MB in `bars.db`), so the backfill is per symbol, not the whole market.
- **A scoreboard against Yahoo** (the verification angle): on the days both have, per bar the difference of the closes
  and the ratio of the volumes, with stated tolerances (SIP: closes within a few basis points; IEX: reported, not
  asserted); minutes missing on one side listed.
- Tests: the pages and their token, the regular-hours cut, the split adjustment, the 429/403 handling, the source
  rule of the cache (no splice), the resampled intervals over Alpaca's bases (counts, totals, no lookahead), all from
  the recordings.

### A2 — Trades, quotes and bars to the second (L)
- `/v2/stocks/trades` → base `1s` bars built by ChartLab, keeping the trades that update OHLC by the SIP's condition
  rules (the list as a table in the ADR); intervals `1s`, `5s`, `10s`, `15s`, `30s`. A busy symbol has several hundred
  thousand SIP trades a day (an estimate: tens of calls a day of history), so second bars are **on demand, by day,
  for a limited number of recent days**, cached by day, not collected for the watchlist.
- `/v2/stocks/quotes`: the bid, the ask and the spread per second (SIP: the national best; IEX: IEX's own book, wider),
  shown as an optional spread line, and the spread statistics by time of day that Phase 4's Day costs need.
- The chart: seconds on the interval menu (only for Alpaca's symbols), the time axis to the second; Replay at seconds.
- Golden model and properties (as for an indicator): a scalar loop that builds the bars from the trades; 60 one-second
  bars aggregate to Alpaca's own 1m bar on OHLC and volume within a stated tolerance (the scoreboard of A1 again, one
  level down); every second bar uses trades of its own second only.

### A3 — Live data (L)
- The backend holds the one stream connection (`iex` on Basic, `sip` with Algo Trader Plus), subscribes the symbols
  open on charts and in the watchlist (at most 30 on Basic, the rest polled), and passes them on to the browser over
  one connection of its own (server-sent events: one way, no new frontend library); reconnects with backoff, and
  answers 405/406/407 with a clear status line.
- The chart's last bar moves with every trade (the chart engine's update, not a reload); the watchlist's prices too.
- **With IEX live:** the live bars are a labelled provisional tail (as A1's, from IEX instead of Yahoo), never written
  into the cached series; once the SIP bars of those minutes may be read (15 minutes later) they take their place, so
  the stored history stays consolidated and from one source.
- Tests: recorded stream messages (no network), a fake clock; the test stream (`v2/test`) for a manual check outside
  market hours.

### A4 — Corporate actions, data quality and Phase 4 (M)
- Corporate actions from `/v1/corporate-actions` checked against Yahoo's splits and dividends; a disagreement is a
  warning on the chart.
- A data-quality page per symbol: the A1/A2 scoreboards, gaps, minutes without trades, the source and feed of each
  series, the depth.
- Phase 4 inputs: the Day profile's history (years of 5m/15m bars), the default spread from A2's statistics
  instead of a guess, and the backtester's honest note of the feed it ran on.
- Optional, by the user's choice: the extended hours as a chart setting (TradingView's "Extended trading hours"), with
  the session shading.

## Order and size
- **Recommended: before Phase 4** (A0 → A1 at least): B0's question 5 ("Day data: the free collection from Yahoo,
  or also a paid data feed?") is answered by A0, and the Day profile gets years of minutes instead of a year of
  collecting. A2 and A3 can also come after B0–B2 (the Swing, Position and Long-term profiles do not need them).
- Phase K closed with K4's approval (2026-11-28); Phase A is next, at the user's request.
- Sizes: A0 S, A1 M, A2 L, A3 L, A4 M.

## Questions for the user (asked before A0, in a dialog)
1. **Account:** is it paper-only or approved for live trading, and which data plan does the dashboard show?
2. **Keys:** paper keys (cannot trade, likely IEX only) or live keys (may unlock SIP history, but can trade)?
3. **The amendment:** approve the data-only text for §10 as written above (or change it)?
4. **Plan:** stay on Basic (free), or Algo Trader Plus ($99/month) for SIP live and 10,000 calls/min, and if so from
   which round?
5. **If IEX only:** use Alpaca as a separate, labelled source for the depth, or stop after A0?
6. **Order:** Phase A before Phase 4 (recommended), only A0–A1 before it, or after it?
7. **Seconds (A2):** which intervals, and how many recent days on demand?
8. **Extended hours:** keep regular hours only, or add the setting in A4?
9. **Backfill:** which symbols get ten years of minutes (the watchlist, a list, on demand only)?

## Sources (2026-11-28)
- Official client: `alpaca-py` 0.45.0 on PyPI (`alpaca/common/enums.py`, `alpaca/data/enums.py`,
  `alpaca/data/timeframe.py`, `alpaca/data/historical/*.py`, `alpaca/data/live/stock.py`).
- [About Market Data API](https://docs.alpaca.markets/us/docs/about-market-data-api),
  [Market Data FAQ](https://docs.alpaca.markets/us/docs/market-data-faq),
  [Historical API](https://docs.alpaca.markets/us/docs/historical-api),
  [Historical bars](https://docs.alpaca.markets/us/reference/stockbarsingle-1),
  [Paper Trading](https://docs.alpaca.markets/us/docs/paper-trading),
  [Is Alpaca available outside the US?](https://alpaca.markets/support/is-alpaca-available-outside-the-us)
  (quoted by search; not opened from the cloud).
- Forum: [IEX or SIP with a free account](https://forum.alpaca.markets/t/iex-or-sip-with-a-free-account/17141),
  [Paper account data query denied](https://forum.alpaca.markets/t/paper-account-data-query-denied/13822),
  [Multiple connections to the market data websocket](https://forum.alpaca.markets/t/multiple-connections-to-market-data-websocket/6291),
  [Premarket data in Python](https://forum.alpaca.markets/t/premarket-data-in-python/14012).
- Guides: [narwhalapi review](https://narwhalapi.com/compare/alpaca-review),
  [jorgai: free plan vs $99](https://jorgai.com/blog/alpaca-api-key-pricing),
  [quantvps: Python bot](https://www.quantvps.com/blog/alpaca-api-python-trading-bot),
  [hmmtrade: paper gotchas](https://hmmtrade.com/blog/alpaca-paper-gotchas),
  [a Basic key's measured 403](https://github.com/degenview/degenview/pull/634),
  [Alpaca's stream AsyncAPI](https://apis.io/asyncapis/alpaca/alpaca-asyncapi/),
  [Fetch historical data](https://alpaca.markets/learn/fetch-historical-data).
