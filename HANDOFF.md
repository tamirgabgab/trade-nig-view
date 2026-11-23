# HANDOFF — סטטוס חי של ChartLab

> קובץ זה נכתב בעברית (מונחים טכניים, נתיבים ופקודות באנגלית). מתעדכן בסוף כל session.

## מצב נוכחי
- **שלב:** Phase 1. R0, R1a, R1b, R2a, R2b (S1), R3a (S2) ו-**R3b (S3) הושלמו** (2026-11-23). R3b: 19 אינדיקטורים של ממוצעים. הם כוללים 15 סוגי MA, "Moving Average" כללי עם בחירת סוג, MA Cross עם חיצים על הנרות, Ribbon ו-Envelope. כל אחד נבדק כמו DUT מול golden model, TA-Lib ו-properties. **ממתין לדמו אצל המשתמש (S1–S3).**
- **הסבב הבא:** **L1** (S4 ב-[PLAN.md](PLAN.md)): דפי לימוד לממוצעים (impulse/step response, lag, NRF, תגובת תדר). אחריו R3c, U1.
- **החלטות D1–D6** (PLAN §7): המשתמש ביקש לממש S1–S3 בלי לבחור; אומצו ההמלצות: D2 = TA-Lib כתלות בדיקות אופציונלית (מדולג מקומית אם חסום), D4 = כולל KAMA, T3, ZLEMA, D6 = פאנל הגדרות חי.
- **Branch:** עובדים ישירות על `main` (הוראה קבועה של המשתמש מ-2026-11-22). האייקון מעביר checkout ישן ל-`main` לבד.

## מה נעשה ב-session האחרון (2026-11-22, R0)
- **Backend** (`backend/`):
  - FastAPI עם `create_app()`, `config.py` (pydantic-settings, `.env`) ו-`GET /api/health`.
  - כל השגיאות בפורמט RFC 9457 problem+json, כולל `correlation_id` ל-500.
  - fixture שחוסם DNS ו-sockets שאינם loopback בכל ה-tests. גם ל-fixture הזה יש tests.
  - 11 tests, coverage של 100%, ו-ruff, ruff format ו-pyright strict נקיים (`pyright` החליף את `mypy`, ראה למטה).
- **Frontend** (`frontend/`):
  - Vite 8, React 19 ו-TS 6.0 strict.
  - ESLint (typescript-eslint strictTypeChecked) עם חוק שאוסר import של `lightweight-charts` מחוץ ל-`src/chart/`.
  - Prettier ו-Vitest: 19 tests.
  - Shell כהה עם 5 אזורים:
    - top toolbar
    - left drawing toolbar: בחירת כלי, magnet, lock ו-hide כ-UI state
    - chart placeholder
    - watchlist סטטי עם Indices, ETFs, Stocks, Futures ו-Forex
    - bottom bar: range buttons, `%`/`log`/`auto`/`ADJ`, שעון UTC ו-health badge שעושה polling כל 10 שניות
  - כל כפתור הוא `IconButton` עם `aria-label` ו-tooltip שמופיע גם ב-hover וגם ב-focus מהמקלדת. כפתורים של פיצ'רים עתידיים נשארים focusable, ומסומנים "coming in Rn".
- **Scripts**: `setup`, `dev`, `test` ו-`lint`, בגרסת `.ps1` ובגרסת `.sh`.
- **CI**: `.github/workflows/ci.yml` רץ על ubuntu ועל windows. ב-Windows הוא מריץ את `setup.ps1` ו-`test.ps1` עצמם תחת Windows PowerShell 5.1.
- צילום מסך: `docs/img/shell-r0.png`.

## הצעדים הבאים (R1) — צעדים ראשונים מדויקים
1. להוסיף ל-`backend/pyproject.toml`: `numpy`, `pandas`, `yfinance` (בגרסה pinned) ו-`httpx2`. ל-dev: `pandas-stubs`.
2. לכתוב `backend/config/universe.yaml` עם Indices, ETFs, Stocks, Futures ו-Forex. הרשימה כבר מופיעה ב-`frontend/src/components/watchlist.ts`.
3. לכתוב domain models (`Interval`, `Bar`, `BarFrame`) ואת ה-protocol `DataProvider`.
4. לכתוב `RateLimiter` ו-backoff, עם tests קודם.
5. לכתוב `BarCache` (SQLite) ואת ה-planner של missing ranges, עם tests קודם.
6. לכתוב `YahooProvider`, `TiingoProvider` ו-`FixtureProvider`. אחר כך `scripts/make_fixtures.py` ו-commit של ה-fixtures.
7. `/api/symbols` ו-`/api/bars`, ואחריהם generation של TS types מ-OpenAPI (`openapi-typescript`) ל-`frontend/src/api/schema.ts`.

## R1a — מה נבנה (2026-11-22)
- `backend/app/models/`: `BarFrame` (עמודות numpy) ו-`SymbolInfo`. `backend/config/universe.toml`: 25 סימבולים ב-5 קבוצות.
- `backend/app/data/`: `validate`, `adjust`, `resample` (W/M בלי lookahead), `ratelimit` (token bucket, backoff, circuit breaker), `cache/bar_cache.py` (SQLite) ו-`bar_service.py`.
- Providers: `yahoo` (ברירת מחדל), `tiingo` (fallback למניות ול-ETFs, עם התאמה ל-splits מ-`splitFactor`), ו-`fixtures` (offline).
- API: `/api/symbols`, `/api/bars`, `/api/quotes`. ה-health מציג את שרשרת ה-providers הפעילה.
- Frontend: `Watchlist.tsx` טוען סימבולים ומחירים מהשרת. ירוק ואדום לפי כיוון השינוי; `n/a` עם tooltip לסימבול שנכשל.
- `scripts/make_fixtures.py`: מוריד snapshot קבוע (2015-01-01 עד 2026-10-30) ל-`backend/fixtures/daily/`.
- בדיקות: 102 ב-backend (coverage 97%) ו-28 ב-frontend. כוללות תשובה מוקלטת אמיתית של Tiingo (AAPL, 17–20.11.2026) ו-hypothesis properties ל-resampling.

## R2a — מה נבנה (2026-11-22)
- `frontend/src/chart/ChartEngine.ts`: המודול היחיד שמייבא את `lightweight-charts`. נרות, ו-volume בתחתית ה-pane (20% התחתונים, scale נפרד), בצבע לפי כיוון הנר (`close >= open` = ירוק). ה-crosshair מדווח את האינדקס של הנר לכל היותר פעם אחת ב-frame (`rafLatest`). `attributionLogo` נשאר דלוק.
- `chart/theme.ts` קורא את הצבעים מ-`tokens.css`. נוספו `--color-chart-grid` ו-`--color-chart-crosshair`.
- `chart/seriesData.ts`: פונקציות טהורות, כמו המרה ל-series, טווח פתיחה (150 הנרות האחרונים ועוד 5 משבצות ריקות מימין), ו-`priceFormat` לפי `decimals` של הסימבול.
- `api/bars.ts`: `useBars` מעל `/api/bars` (עד 5,000 בארים, עם `keepPreviousData` כדי שהגרף הקודם יישאר על המסך בזמן טעינה).
- `store/chartStore.ts`: Zustand store לסימבול ול-interval, שנשמר ב-localStorage (`chartlab.chart`). ערכים פגומים חוזרים לברירת המחדל AAPL 1D.
- `LegendOHLC`: שם, interval, בורסה, O/H/L/C, שינוי מול הסגירה הקודמת, ו-Vol (לא מוצג לסימבולים בלי volume).
- `IntervalSwitcher` (D/W/M) בסרגל העליון. שורה ב-Watchlist נבחרת בלחיצה או ב-Enter/Space, והשורה הפעילה מודגשת.
- **באג שנתפס בבדיקה:** ה-view סומן כ"הוצג" כבר במערך הריק שלפני התשובה הראשונה, והגרף נפתח על הנרות הישנים. תוקן ב-`ChartView` (הסימון נעשה רק כשיש בארים).
- בדיקות: 71 ב-frontend (היו 28). כוללות `ChartEngine` מול mock של הספרייה, ו-`ChartArea` עם `FakeChartEngine` (`src/test/fakeChartEngine.ts`), כי ל-jsdom אין canvas.
- בדיקה בדפדפן (Playwright, Chromium, backend במצב `OFFLINE=1` עם נתונים סינתטיים ב-scratchpad שלא נכנסו לריפו): הגרף הראשון תוך 0.6 שניות, ה-legend עוקב אחרי העכבר, החלפת סימבול ו-interval עובדות, הבחירה נשמרת אחרי רענון, ואין שגיאות ב-console.

## עדכון אוטומטי באייקון (2026-11-22)
- `scripts/update.ps1` (ו-`update.sh`): `git pull --ff-only` של ה-branch הנוכחי. אחר כך `uv sync` רק אם `uv.lock`, `pyproject.toml` או `.python-version` השתנו, או שאין `.venv`. ו-`npm ci` רק אם `package-lock.json` או `package.json` השתנו, או שאין `node_modules`.
- `dev.ps1 -Open` (האייקון) מריץ אותו לפני ההפעלה. `-NoUpdate` מדלג. אם ה-pull נכשל (אין אינטרנט, שינויים מקומיים), מוצגת אזהרה צהובה והאפליקציה עולה עם הגרסה הקיימת. רק כשל בהתקנת ספריות עוצר את ההפעלה.
- שינויים ב-`dev.ps1` עצמו נכנסים לתוקף רק בהפעלה שאחרי ה-pull (PowerShell כבר קרא את הקובץ).
- נבדק: `update.sh` ב-7 תרחישים על clone זמני עם `uv`/`npm` מזויפים (נמצא ותוקן באג: תבנית ריקה ב-`grep` גרמה ל-`npm ci` מיותר). `update.ps1` נבדק ב-CI על Windows PowerShell 5.1 (checkout רגיל ו-remote לא זמין), כי בענן אין PowerShell.

## תיקון: האייקון נסגר מיד (2026-11-22, ערב)
- **תסמין אצל המשתמש:** חלון שחור מופיע לרגע ונסגר. בצילום: ה-backend עולה עד `Application startup complete`, ואז החלון נסגר בלי `Backend is up` ובלי `ERROR`.
- **סיבה (הסבר סביר, לא אומת על Windows):** `uvicorn --reload` ב-Windows מפעיל את השרת מחדש עם `os.kill(pid, CTRL_C_EVENT)` (`uvicorn/supervisors/basereload.py`). אירוע Ctrl+C של הקונסולה מגיע גם ל-PowerShell שחולק איתו את החלון, ולכן הסקריפט נעצר בלי לעבור ב-`catch`.
- **תיקון ב-`dev.ps1`:**
  - `-Open` (האייקון) מריץ את ה-backend בלי `--reload`. `dev.ps1` רגיל מהטרמינל נשאר עם reload.
  - זמן ההמתנה ל-backend הוגדל מ-30 ל-180 שניות, עם הודעת "still starting" כל 15 שניות, כי Defender סורק את pandas בהפעלה הראשונה.
  - אם ה-frontend יוצא עם קוד שגיאה, נזרקת שגיאה והחלון נשאר פתוח.
- **branch:** העבודה עברה ל-`main`. `update.ps1`/`update.sh` מעבירים checkout ישן מ-`claude/...` ל-`main` פעם אחת, רק כשאין שינויים מקומיים וכל ה-commits המקומיים כבר ב-`origin/main`. אחרת: אזהרה צהובה ונשארים במקום.
- **בדיקות:** 6 תרחישים של המעבר ל-`main` ב-bash (scratchpad); ב-CI ב-Windows: תרחישי המעבר תחת PowerShell 5.1, ובדיקת parse לכל קבצי `.ps1`.

## R1b — מה נבנה (2026-11-22)
- **Intervals:** `1h` (מ-Yahoo) ו-`4h` (resample מ-1h). `Interval` ב-backend: `1h`, `4h`, `1D`, `1W`, `1M`.
  - Yahoo שומר 1h רק ל-730 יום אחורה. ההורדה הראשונה מתחילה 729 ימים אחורה, וה-cache שומר גם היסטוריה ישנה יותר שכבר ירדה. רענון: 5 הימים האחרונים.
  - Tiingo לא מספק 1h אצלנו (מדולג אוטומטית). ל-`^IDX` של הבדיקות אין 1h, והתשובה היא 503 ברורה.
- **Sessions** (`app/data/sessions.py`): לכל נר שעתי יש session date, זהה לתאריך של הנר היומי.
  - ל-futures יש `session_start = "18:00"`, ל-DXY `"20:00"`, ול-forex `"17:00"` (שעון ניו יורק), כך שנר של יום ראשון 18:00 שייך ל-session של יום שני.
  - נרות 4h מעוגנים לנר הראשון של ה-session: מניות 09:30 ו-13:30 (ניו יורק), futures ב-18, 22, 2, 6, 10 ו-14.
  - ADJ לנרות שעתיים: כל נר מקבל את מקדם הדיבידנד של הנר היומי של אותו session.
  - `start`/`end`/`until` ב-intraday בוחרים sessions שלמים.
- **GOLD/SILVER/USOIL:** הוצגו מעכשיו כמו שהם באמת: `GC1!`, `SI1!` ו-`CL1!` (continuous futures, כמו `COMEX:GC1!` ב-TradingView). ה-provider symbol (`GC=F`) לא השתנה, ולכן הבחירה השמורה ב-localStorage ממשיכה לעבוד.
- **Frontend:**
  - כפתורי `1h` ו-`4h` ב-`IntervalSwitcher` (לפני D/W/M).
  - `chart/timeZone.ts`: המרה של UTC לשעון ישראל (`Asia/Jerusalem`), עם offset ששמור לכל יום UTC ומחושב לכל נר בימי מעבר שעון. מדויק גם בימי DST (נבדק מול golden model לכל נר, ב-3 אזורי זמן ובשני כיווני המעבר).
  - ציר הזמן מציג שעות ב-intraday (בלי שניות). השעון בסרגל התחתון מציג שעון ישראל עם `UTC+2`/`UTC+3`.
  - סימבול שמור שכבר לא קיים ב-universe חוזר ל-AAPL.
- **OpenAPI → TS** (ADR 0008):
  - `app/openapi_export.py` כותב את `frontend/src/api/openapi.json`, ו-`openapi-typescript` 7.13 מייצר ממנו את `schema.ts`. הפקודה: `scripts/gen-api.ps1`.
  - ה-parsers קוראים שדות דרך `fieldsOf<Schemas[...]>()`, כך ששינוי שם של שדה ב-backend שובר את `tsc`.
  - gate חדש `frontend: api types` (סה"כ 9 gates), ו-test ב-backend שבודק ש-`openapi.json` מעודכן.
  - openapi-typescript מצהיר על peer `typescript ^5`; פתרנו עם `overrides` ב-`package.json` (נבדק עם TS 6.0.3).
- **Fixtures:**
  - `scripts/make_fixtures.py` כותב `backend/fixtures/daily/` (2015-01-01 עד 2026-10-30) ו-`backend/fixtures/1h/` (2026-08-01 עד 2026-10-30).
  - `scripts/make-fixtures.ps1`: `git pull`, הורדה מ-Yahoo, הרצת `test_committed_fixtures.py`, commit של `backend/fixtures` בלבד, ו-`git push`. `-NoPush` כותב ובודק בלי commit.
  - `tests/unit/data/test_committed_fixtures.py`: לכל סימבול ב-universe: הקבצים נקיים, ה-sessions של 1h תואמים לימים של daily (לפחות 90%), וה-API מחזיר נרות תקינים בכל 5 ה-intervals במצב offline. סימבול בלי קובץ מדולג (כרגע: 175 skipped).
- **בדיקות:** backend 141 (coverage 98%), frontend 89. בדיקה בדפדפן (Playwright, `OFFLINE=1` עם נתוני הבדיקה): הנר הראשון של AAA ב-1h מוצג ב-16:30 (= 09:30 בניו יורק), 4h מציג 2 נרות ל-session, השעון מציג `UTC+2`, ואין שגיאות ב-console.

## R2b — מה נבנה (2026-11-22)
- **Backend:**
  - `app/analysis/transforms.py`: Heikin Ashi (`close = (O+H+L+C)/4`, `open_t = (open_{t-1} + close_{t-1})/2`). רץ על כל ההיסטוריה **לפני** החיתוך לעמוד, ולכן עמוד = אותו קטע מהחישוב המלא (נבדק).
  - `/api/bars`: פרמטרים חדשים `before` (epoch seconds, בלעדי; נר יומי = 00:00 UTC של התאריך) ו-`transform=none|heikin_ashi`. שדה `transform` בתשובה. ה-OpenAPI types עודכנו.
  - **T1 תוקן:** אין יותר `app = create_app()` ברמת המודול. `dev.ps1`/`dev.sh` מריצים `uvicorn --factory app.main:create_app`; `app.main:app` עדיין עובד (lazy) בשביל `dev.ps1` ישן שכבר בזיכרון.
- **Frontend:**
  - `api/bars.ts`: `useBarHistory` מעל `useInfiniteQuery`: עמוד ראשון = 5,000 הנרות האחרונים, עמודים ישנים עם `before`. העמוד הבא נטען כשנשארים פחות מ-50 נרות משמאל לחלון. `ChartEngine.setBars` מזיז את ה-logical range במספר הנרות שנוספו, כך שהגרף לא קופץ.
  - `ChartEngine`: `setChartType` (נרות, נרות חלולים, bars, line, area, Heikin Ashi), `setScale` (normal/log/%, auto), `setVisibleRange`, `onVisibleRangeChange`.
  - `chart/visibleRange.ts`: כפתורי הטווח כמתמטיקה טהורה. כל כפתור עובר ל-interval שמתאים לו (1D/5D/1M/3M → 1h, 6M → 4h, YTD/1Y → 1D, 5Y → 1W, All → 1M), טוען עמודים ישנים עד שהטווח מכוסה, ואז מציג אותו פעם אחת. 1D/5D סופרים ימי מסחר (לא ימים קלנדריים).
  - `chartStore` גרסה 2: סוג גרף, scale, auto, ADJ נשמרים ב-localStorage (רשומה מגרסה 1 משודרגת לבד). הטווח הנבחר נמחק כשמחליפים interval או סימבול.
  - `SymbolSearchDialog`: הקלדת אות או ספרה בכל מקום (לא בתוך שדה טקסט) פותחת חיפוש עם האות הזו. חצים, Enter, Esc, לחיצה בחוץ; קבוצות לפי ה-watchlist; דירוג: טיקר מדויק, תחילת טיקר, תחילת מילה בשם, מכיל. הפוקוס חוזר למקום שבו היה.
  - `ChartTypeMenu` בסרגל העליון (`role=menu`, `menuitemradio`, חצים/Home/End/Esc).
  - Loaders: פס התקדמות דק אחרי 150ms, skeleton אחרי שנייה כשאין נרות, ותווית "Loading older bars…" בזמן טעינת עמוד ישן.
  - **X3 תוקן:** ה-overflow של 29px ב-1280 נבע מ-tooltip שקוף של כפתור Fullscreen שבלט מימין. כפתורי הימין מקבלים tooltip מיושר לימין (`bottom-end`). בחלון צר (≤720px לאזור הגרף) השעון וטקסט ה-API badge מוסתרים כדי שהסרגל התחתון לא יישבר.
- **Playwright (E2E):** `frontend/e2e/` עם נתונים סינתטיים דטרמיניסטיים (`e2e/data/generate.py`, seed קבוע; AAPL עם 6,500 נרות יומיים כדי לבדוק דפדוף). `serve-backend.mjs` מריץ backend עם `OFFLINE=1` על port 8010 ו-Vite על 5183 (לא מתנגש באפליקציה שרצה). 4 בדיקות: חיפוש סימבול → NVDA → 1W → log → ערכי ה-legend מול ה-CSV (כולל נר שבועי ו-ADJ) → נשמר אחרי רענון; כפתורי טווח וסוגי גרף (HA close מול הנוסחה); גלילה שמאלה טוענת היסטוריה (`before=`); אין overflow ב-1280 וב-960. ב-CI: job חדש `e2e` (ubuntu, Chromium).
- **ביצועים** (Chromium headless, dev build לא ממוזער, בענן): 5,000 נרות יומיים מצוירים 0.36–0.85 שניות אחרי התשובה; 60 צעדי zoom על 5,000 נרות בכ-2 שניות כולל ה-round trips של Playwright. עומד ביעד (<1 שנייה).
- **בדיקות:** backend 148 (175 skipped = fixtures אמיתיים שעוד לא בריפו), frontend 133 (היו 89), E2E 4. 9/9 gates ירוקים.
- **חוזה lookback ל-indicators (E5):** הוגדר ב-[ARCHITECTURE §3.2](docs/ARCHITECTURE.md). הגרף מבקש indicator בדיוק על טווח הנרות הטעונים; ה-backend מוסיף `max(25·n, 250)` נרות warm-up. כשנטען עמוד ישן, ה-indicator מחושב מחדש לכל הטווח (בלי תפירה בצד הלקוח).

## R3a — מה נבנה (2026-11-23)
- **Backend (`backend/app/indicators/`):**
  - `core.py`: `fir(x, w)` (חלון מדויק עם `sliding_window_view @ w`, בלי drift של סכום רץ) ו-`ema_recursive(x, α, n)` (seed = SMA של n הערכים התקינים הראשונים). מעליהם `sma`, `wma`, `ema` ($\alpha=\frac{2}{n+1}$), `rma` ($\alpha=\frac1n$), `source` (close/open/high/low/hl2/hlc3/ohlc4/hlcc4) ו-`shift` (offset ≥ 0 בלבד, כדי שערך בנר t לא יקרא נר עתידי).
  - `registry.py`: `IndicatorSpec`/`ParamSpec`/`OutputSpec`, ולידציה של פרמטרים (טיפוס, min/max, options, שמות לא מוכרים → 422 `invalid_params`), ו-`lookback = max(25·n, 250)`.
  - `ma.py`: `MA_TYPES` (dispatcher שישמש גם את MA Cross, Ribbon, Envelope, BB, MACD) ו-factory לממוצע עם קו אחד. סדר הפרמטרים כמו ב-TradingView: Length, Source, Offset.
  - API: `GET /api/indicators` ו-`POST /api/indicators/compute`. התשובה בעמודות (`time[]` ו-`outputs{name: [value|null]}`), לא רשימת אובייקטים. החוזה עודכן ב-[ARCHITECTURE §4](docs/ARCHITECTURE.md).
- **אימות (כמו DUT):** golden model בלולאה סקלרית לכל ממוצע, על **כל** הנרות (`rtol=1e-9, atol=1e-12`, ומיקומי NaN זהים); TA-Lib (תלות בדיקות בלבד, מדולג אם החבילה חסומה) על כל האזור התקף. EMA של TA-Lib שווה ל-EMA שלנו עד 1e-9 גם בנר הראשון, וזה מאשר את קונבנציית ה-seed. Directed tests: ramp lag = $\bar k$ בדיוק, impulse response = $h_k$, קבוע נכנס = קבוע יוצא. Hypothesis: equivariance להזזה ולסקאלה, חסם convex hull, ו-`check_no_lookahead`. Scoreboard: `backend/.reports/indicator_scoreboard.csv` (גם כ-artifact ב-CI). בדיקת API: חישוב עם `start` שווה לחישוב על כל ההיסטוריה (חוזה ה-lookback).
- **TradingView cross-check:** תבנית ב-`backend/tests/golden/tv_crosscheck.json` (3 תאריכים של AAPL 1D × כל ממוצע). ממלאים את `tv_value` מה-legend של TradingView, מריצים `make-fixtures.ps1` פעם אחת, ואז `test.ps1`. שורה ריקה מדולגת; טולרנס 0.01.
- **Frontend:**
  - `api/indicators.ts`: parsing של ה-registry, `effectiveParams` (פרמטרים ישנים שנשמרו מתמזגים עם ה-defaults), `alignToBars` (ערכים לפי זמן הנר), ו-`useIndicatorComputes` עם `keepPreviousData` (שינוי length לא מהבהב).
  - `store/indicatorStore.ts`: מופעים (uid, id, params, styles, visible) נשמרים ב-localStorage, עם sanitize ועד 20 מופעים.
  - `IndicatorsDialog`: `/` בכל מקום (לא בתוך שדה טקסט) או כפתור Indicators; חיפוש, קטגוריות, חצים, Enter, Esc.
  - `IndicatorLegend`: שורה לכל מופע: "EMA 20 close" + הערך בנר שמתחת לעכבר (או בנר האחרון), ⚠ אם החישוב נכשל, וכפתורים: עין, גלגל שיניים, ספר ("coming in L1"), הסרה.
  - `IndicatorSettingsPanel`: פאנל צד שנבנה מה-`ParamSpec`/`OutputSpec`. מספרים מוחלים 250ms אחרי ההקלדה האחרונה, select ו-checkbox מיד. שגיאה מוצגת ב-blur ונמחקת מיד כשהערך תקין. יש בו צבע, עובי קו ו-"Reset to defaults".
  - `ChartEngine.setIndicatorLines`: קו לכל output על ה-pane של המחיר. נתונים נשלחים מחדש רק כשהערכים או הנרות השתנו, כך ששינוי צבע לא מצייר מחדש.
- **באג שנמצא ב-E2E ותוקן:** ה-canvas של lightweight-charts קיבל את הלחיצות על כפתורי ה-legend (ה-z-index הפנימי שלו התחרה ב-legend). תוקן ב-`isolation: isolate` על מיכל הגרף.
- **בדיקות:** backend 421 (+ skipped של fixtures אמיתיים ושל TV cross-check), frontend 161, E2E 5 (חדשה: EMA 9 → 20 → 50 → נשמר אחרי רענון → הסתרה → הסרה, והערך ב-legend מול EMA שחושב ב-TypeScript מה-CSV).

## R3b — מה נבנה (2026-11-23)
- **Backend (`backend/app/indicators/`):**
  - `core.py` מכיל 11 ממוצעים חדשים, וכל אחד מתועד עם הנוסחה שלו:
    - **לפי Pine:**
      - `dema`: $2E-E(E)$
      - `tema`
      - `hma`: $\mathrm{WMA}_{\lfloor\sqrt n\rfloor}(2\mathrm{WMA}_{n/2}-\mathrm{WMA}_n)$, ‏$n\ge2$
      - `lsma`: ה-FIR של קו הריבועים הפחותים, עם ה-offset של `ta.linreg`
      - `alma`: חלון גאוסי, כולל `floor`
      - `swma`: $[1,2,2,1]/6$
      - `vwma`: NaN כשה-volume בחלון הוא 0
      - `mcginley`
    - **לפי TA-Lib:**
      - `kama`: seed $x_{n-1}$, ER = 1 כשה-noise ≤ change
      - `t3`: שישה EMA מדורגים עם המקדמים של Tillson
    - **לפי Ehlers:**
      - `zlema`: $\mathrm{EMA}(2x_t - x_{t-d})$
  - `ma.py`: ‏`MA_TYPES` מכיל עכשיו 15 סוגים, כל אחד עם warmup, lookback ו-`min_length` (ל-HMA ‏2). ל-KAMA ‏lookback מיוחד, $25/s^2$ (בערך 6,000 נרות), כי ה-seed שלו דועך לאט בשוק צדדי. ל-T3 ‏lookback של $50n$.
  - **Composites:**
    - `moving_average` (id `ma`): enum `ma_type` לכל 15 הסוגים.
    - `ma_cross`: שני ממוצעים מכל סוג, ופלט `crosses` מסוג `markers` שערכיו +1/‑1/NaN. החצייה ידועה רק בסגירת הנר, ולכן אין lookahead.
    - `ma_ribbon`: ארבעה ממוצעים, ברירת מחדל EMA 20/50/100/200.
    - `envelope`: קטגוריה `bands`, $B(1\pm p/100)$, וה-basis מכל סוג.
  - `ParamSpec.option_labels`, ובהתאם `ParamInfo.option_labels` ב-API: שמות תצוגה ל-enum (למשל "HMA (Hull)"). ה-API types נוצרו מחדש.
- **אימות (DUT):**
  - **golden models:** מודל בלולאה סקלרית לכל אחד מ-15 הסוגים, בלי קוד משותף עם `core`. מכסה 474 צירופים של סוג × length × dataset על כל הנרות (`rtol=1e-9`) ועל כל ה-inputs (ALMA offset/sigma/floor, KAMA fast/slow, T3 factor, LSMA offset).
  - **TA-Lib:** זהה ב-DEMA, TEMA, KAMA, T3 (כולל factor) ו-LINEARREG, כולל מיקומי ה-NaN (204 בדיקות).
  - **Directed tests:**
    - hand vectors
    - ramp lag אנליטי בדיוק: 0 ל-DEMA/TEMA/LSMA, $(s+2m-n-2)/3$ ל-HMA, $(n-1)/2-d$ ל-ZLEMA, $3(1-v)(n-1)/2$ ל-T3
    - overshoot על מדרגה לכל הממוצעים שמפצים על lag
  - **Hypothesis:**
    - קבוע נכנס = קבוע יוצא
    - equivariance (ל-McGinley רק scale)
    - חסם חלון ל-FIR אי-שליליים
    - KAMA בין $K_{t-1}$ ל-$x_t$
    - no-lookahead לכל סוג ולכל composite
    - החיצים של MA Cross = בדיוק החלפות הסימן
    - Envelope = יחס קבוע
- **באג שנמצא ב-property test ותוקן:** ב-McGinley, כש-length = 1 ויש קפיצה של 50%, הרמה הופכת לשלילית ואחר כך ענקית. אז $(x/M)^4$ עושה underflow ל-0, והייתה חלוקה באפס (exception). עברנו לסמנטיקה של Pine: חלוקה באפס נותנת `na`, ובנר הבא ה-seed מחושב מחדש מה-EMA (`na(mg[1]) ? ta.ema : ...`).
- **Frontend:**
  - `ChartEngine`: פלט `markers` מצויר כחיצים על ה-series הראשי דרך `createSeriesMarkers`: ‏`belowBar`/`arrowUp` לחצייה למעלה ו-`aboveBar`/`arrowDown` לחצייה למטה. כל ה-markers מאוחדים ל-plugin אחד, שנבנה מחדש כשמחליפים סוג גרף.
  - ה-legend מדלג על ה-markers ומציג רק את ערכי הקווים.
  - בפאנל ההגדרות ה-select מציג את `optionLabels`, ואין שורת style ל-markers.
  - ה-label ב-legend: enum בשם הקצר ("MA Cross HMA 9 SMA 21 close"), bool רק כשהוא דלוק.
- **Learn stubs:** 15 קבצים חדשים ב-`docs/indicators/`. TV cross-check: נוספו 18 שורות, תאריכיים לכל אחד מ-DEMA/TEMA/HMA/LSMA/ALMA/VWMA/McGinley ול-Envelope upper/lower.
- **בדיקות:**
  - backend: 1,000+ בדיקות. מתוכן 474 golden, 204 TA-Lib, ו-hypothesis לכל מחלקה.
  - frontend: 165 בדיקות, כולל markers ב-`ChartEngine` ו-composite בבדיקת component.
  - E2E: 6. החדשה מוסיפה Envelope, משנה את ה-basis ל-EMA, ומוסיפה MA Cross. הערכים ב-legend נבדקים מול SMA/EMA שחושבו ב-TypeScript.

## יומן החלטות
| תאריך | החלטה | סיבה | ADR |
|---|---|---|---|
| 2026-11-22 | Stack: FastAPI + React/TS + Vite, uv, Python 3.13 | אקוסיסטם נומרי, ידידותי ל-Windows | [0001](docs/adr/0001-stack.md) |
| 2026-11-22 | TypeScript pinned ל-6.0.x | `typescript-eslint` תומך רק ב-`<6.1` | [0001](docs/adr/0001-stack.md) |
| 2026-11-22 | lightweight-charts `^5.3.0` מאחורי `ChartEngine` | Apache-2.0, panes ו-primitives | [0002](docs/adr/0002-charting-library.md) |
| 2026-11-22 | Indicators מחושבים ב-backend ב-Python | מימוש אחד לכל ה-phases | [0003](docs/adr/0003-indicators-in-backend.md) |
| 2026-11-22 | מסגרת drawings משלנו על series primitives | הספריות הקהילתיות עדיין v0.x | [0004](docs/adr/0004-own-drawing-framework.md) |
| 2026-11-22 | Bar cache ב-SQLite | upserts אינקרמנטליים, בלי תלות נוספת | [0005](docs/adr/0005-bar-cache-format.md) |
| 2026-11-22 | R2a: volume בתחתית ה-pane של המחיר (לא pane נפרד), זכירת הסימבול וה-interval ב-localStorage, כפתורי D/W/M | בחירת המשתמש | — |
| 2026-11-22 | `zustand` pinned ל-`~5.0.16` ולא 5.1.0 | 5.1.0 יצאה שבועיים לפני הסבב | [0001](docs/adr/0001-stack.md) |
| 2026-11-22 | yfinance כ-default, Tiingo כ-fallback, fixtures ל-offline | Stooq דורש עכשיו API key | [0006](docs/adr/0006-default-data-provider.md) |
| 2026-11-22 | CSS Modules ו-CSS custom properties | אותם tokens משמשים גם את ה-canvas | [0007](docs/adr/0007-styling.md) |
| 2026-11-22 | EMA עם SMA seed; Bollinger עם population σ | קונבנציות של TA-Lib ו-Pine | research §5 |
| 2026-11-22 | `httpx2` כ-HTTP client (ל-tests ול-providers) | Starlette 1.x הוציא את `httpx` ל-deprecation | [0001 amendment](docs/adr/0001-stack.md) |
| 2026-11-22 | `lucide-react` לאייקונים | קל ו-tree-shaken, בלי assets קנייניים | [0001 amendment](docs/adr/0001-stack.md) |
| 2026-11-22 | Defaults לשאלות הפתוחות (עד שתשנה): Python 3.13; CI ubuntu ו-windows; Futures ו-Forex ב-universe; בלי PR ל-`main` עד שתבקש; fixtures ייוצרו בענן ב-R1 | ענית "בוא נתחיל" בלי לבחור | — |
| 2026-11-22 | במחשב של המשתמש: הכול נשאר ב-Windows ו-Smart App Control דלוק. משתמשים ב-**Python הרשמי מ-python.org** (חתום על ידי PSF) במקום ה-Python של uv, עם `UV_PYTHON_PREFERENCE=only-system`; ו-`uvicorn` בלי `[standard]` | SAC חסם את `_socket.pyd` של ה-Python של uv ואת ה-launcher `uvicorn.exe`. WSL נשקל ונדחה על ידי המשתמש (רוצה הכול ב-Windows). פתוח: האם SAC יאפשר `.pyd` של צד שלישי (`pydantic_core`, בהמשך `numpy`) | — |
| 2026-11-22 | `pyright` strict במקום `mypy` | `mypy` 2.x תלוי ב-`librt` הבינארי, ש-SAC חוסם. ל-`pyright` אין קבצים בינאריים (JavaScript על Node החתום) | [0001 amendment 2](docs/adr/0001-stack.md) |
| 2026-11-22 | כלל לתלויות חדשות: להעדיף Python טהור או wheels נפוצים, ולאמת כל native extension חדש ב-`test.ps1` אצל המשתמש. ב-R1 מאמתים קודם כול את numpy ואת pandas | SAC במחשב של המשתמש | [0001 amendment 2](docs/adr/0001-stack.md) |
| 2026-11-22 | `universe.toml` (TOML דרך `tomllib` של ה-stdlib) במקום YAML | בלי תלות נוספת | — |
| 2026-11-22 | `/api/quotes` ומחירים ב-Watchlist הוקדמו מ-R2 ל-R1a | המשתמש רוצה לראות התקדמות בממשק | — |
| 2026-11-22 | Tiingo מחזיר OHLC גולמי: מתאימים ל-splits לפי `splitFactor`, כדי ש-Yahoo ו-Tiingo יחזירו אותה סמנטיקה | עקביות בין providers | — |
| 2026-11-22 | רענון cache: הורדה של 10 הימים האחרונים כל 15 דקות. אם החפיפה לא תואמת (split או דיבידנד חדש), מורידים את כל ההיסטוריה | נכונות מול חיסכון בבקשות | ARCHITECTURE §8 |
| 2026-11-22 | אין workflow שעושה push אוטומטי של fixtures מ-CI (נחסם; דורש אישור מפורש של המשתמש). ה-fixtures ייווצרו אצל המשתמש | בטיחות | — |
| 2026-11-22 | R1b לפני R2b, לבקשת המשתמש | רוצה דברים מעניינים יותר (שעות) | — |
| 2026-11-22 | Fixtures: סקריפט אצל המשתמש (`make-fixtures.ps1`) שמוריד, בודק, עושה commit ו-push | בחירת המשתמש | — |
| 2026-11-22 | GOLD/SILVER/USOIL → `GC1!`/`SI1!`/`CL1!` (futures רציפים, בלי מקור spot) | בחירת המשתמש; אין מקור spot חינמי ואמין | — |
| 2026-11-22 | Intervals תוך-יומיים: `1h` ו-`4h`; 4h מעוגן ל-session (כמו TradingView) | בחירת המשתמש | ARCHITECTURE §6 |
| 2026-11-22 | נרות תוך-יומיים מוצגים בשעון ישראל (`Asia/Jerusalem`); הגדרה למשתמש ב-R6 | בחירת המשתמש | ARCHITECTURE §6 |
| 2026-11-22 | `openapi-typescript` ~7.13 עם `overrides` ל-TS 6 | types שנוצרים מה-backend, תלות dev קטנה | [0008](docs/adr/0008-openapi-typescript.md) |
| 2026-11-22 | R2b: כפתורי טווח מחליפים interval (כמו TradingView); Heikin Ashi מחושב ב-backend; דפדוף לאחור עם `before`; `@playwright/test` 1.63.0 (dev) | ROADMAP R2b, PLAN S1 | ARCHITECTURE §3.1 |
| 2026-11-22 | D2/D4/D6 לפי ההמלצה: TA-Lib אופציונלי לבדיקות, KAMA/T3/ZLEMA נכללים, פאנל הגדרות חי | המשתמש ביקש לממש S1–S3 בלי לבחור | PLAN §7 |
| 2026-11-23 | R3a: תשובת compute בעמודות (`time[]`, `outputs{}`); offset ≥ 0 בלבד; פאנל הגדרות צד חי (לא חלון OK/Cancel); סדר פרמטרים Length/Source/Offset כמו ב-TV; `ta-lib` כתלות dev בלבד | יעילות, no-lookahead, D6 | ARCHITECTURE §4, §5.1 |
| 2026-11-23 | R3b: markers מצוירים על ה-series הראשי, ולא על series נסתר, כדי שהחיצים יישבו מתחת לנר ומעליו; McGinley לפי Pine (חלוקה באפס = `na`, ואז seed חדש מה-EMA); KAMA ו-T3 לפי TA-Lib; ב-"Moving Average" הכללי, לסוגים עם inputs נוספים (ALMA, KAMA, T3, LSMA offset) יש defaults, ואת ה-inputs האלה חושפים האינדיקטורים הייעודיים | נאמנות ל-TV ול-TA-Lib, ממשק פשוט | PLAN §5 |
| 2026-11-22 | `PLAN.md` כתוכנית העבודה ל-sessions הבאים: R3 מתפצל ל-R3a/R3b/R3c, ו-L1 (דפי לימוד לממוצעים) ו-U1 (UX) נכנסים לפני R4 | בקשת המשתמש להתמקד בממוצעים נעים ובמתמטיקה שלהם וב-UX | [PLAN.md](PLAN.md) |

## שאלות פתוחות אליך
1. **מקור ה-"Moving average crossover 9/21"** מהצילום (נדרש ל-R3).
2. החלטות D1–D6 ב-[PLAN.md §7](PLAN.md#7-decisions-needed-from-the-user): סדר הסבבים, TA-Lib כתלות בדיקות אופציונלית, KaTeX מול Temml, ממוצעים שאינם ב-TV (KAMA, T3, ZLEMA), ופאנל הגדרות חי מול חלון OK/Cancel.

## בעיות ידועות / tech debt
- ✅ **GOLD, SILVER ו-USOIL** (spot ב-TV מול futures אצלנו): נפתר ב-R1b בשינוי השם ל-`GC1!`/`SI1!`/`CL1!`. להשוואה ב-TradingView יש לפתוח `COMEX:GC1!`, `COMEX:SI1!`, `NYMEX:CL1!`. בימי roll השינוי היומי של continuous futures עדיין חריג (כך גם ב-TV).
- **1h לא אומת עם Yahoo אמיתי** (אין גישה מהענן). לבדוק בדמו: AAPL, `GC1!`, SPX ו-GBPUSD. אם Yahoo לא מחזיר 1h לסימבול מסוים, תוצג שגיאה ברורה בגרף.
- חלון ה-1h של ה-fixtures (2026-08-01 עד 2026-10-30) ייצא ממגבלת 730 הימים של Yahoo באמצע 2028. אז צריך להזיז אותו ב-`make_fixtures.py`.
- ✅ ייבוא של `app.main` כבר לא יוצר את `data/bars.db` (R2b: `uvicorn --factory`).
- הבדלים קטנים ב-DJI (0.01%), ב-DXY וב-Forex (Yahoo ו-TV חותכים את היום בשעות שונות). מניות, ETFs, SPX, NDX ו-VIX זהים ל-TV עד הסנט.
- **אין גישה ל-Yahoo מסביבת הענן של Claude** (ה-proxy מחזיר `403`). ה-fixtures וה-recorded responses ייווצרו על המחשב של המשתמש באמצעות סקריפט שירוץ אצלו.
- **ה-fixtures עדיין לא בריפו.** הם ייכנסו כשהמשתמש יריץ `.\scripts\make-fixtures.ps1`. עד אז הבדיקות משתמשות בנתונים קטנים שנבנו ידנית (`backend/tests/fixtures/`), `test_committed_fixtures.py` מדלג, ומצב `OFFLINE=1` עם ה-universe האמיתי לא יעבוד.
- הגישה ל-Yahoo מתבצעת רק מהמחשב של המשתמש. כאן בענן היא חסומה, ולכן בדקתי את `YahooProvider` עם DataFrame מזויף בפורמט של yfinance.
- ✅ ה-`.ps1` scripts אומתו ב-CI על `windows-latest` תחת PowerShell 5.1 (run #3 ירוק). הריצה הראשונה נכשלה בגלל התנגשות שמות `Clock.tsx`/`clock.ts` ב-file system שלא מבחין בין אותיות גדולות לקטנות. תוקן, ונוסף כלל ל-`CLAUDE.md`.
- ✅ ה-TS types של ה-API נוצרים מ-OpenAPI (R1b).
- ✅ ה-range buttons וה-scale toggles (`%`, `log`, `auto`, `ADJ`) מחוברים לגרף (R2b).
- `auto` לא נכבה לבד כשגוררים את ציר המחיר (כמו ב-TradingView); כרגע רק לחיצה על הכפתור משנה אותו. ל-U1.
- סוג הגרף נשמר אחד לכל הסימבולים (לא לכל סימבול בנפרד). Layouts ב-R6.
- בעמודת Chg% ב-Watchlist המספר נחתך מימין כשהמחירים ארוכים (למשל 12,912.115 בנתונים הסינתטיים). עם מחירים אמיתיים זה לא קרה; לבדוק ב-R2b.
- צילום המסך ב-README עדיין של R0. יוחלף בצילום של גרף עם נתונים אמיתיים אחרי הדמו.
- EMA seeding: TA-Lib זהה לנו עד 1e-9. מול TradingView עצמו עוד לא אומת: צריך למלא את `tv_crosscheck.json` (3 תאריכים לכל ממוצע).
- **מצב `%` עם indicators:** lightweight-charts מחשב אחוזים לכל series מול הערך הראשון הנראה **שלו**, ולא מול המחיר (ב-TradingView הכול יחסי למחיר). לכן במצב `%` קו ה-MA מוזז קצת מהמחיר. במצבים normal ו-log הכול תקין. פתרון אפשרי: לממש את מצב האחוזים ב-`ChartEngine` בעצמנו. ל-U1 או R6.
- בגרף מסוג Line, צבע ברירת המחדל של SMA (`#2962FF`) זהה לצבע הקו של המחיר (כמו ב-TV). אפשר לשנות בפאנל ההגדרות.
- גלישה אופקית מתחת ל-960px (סרגל הכלים העליון). קיים מ-R2 ומתוכנן ל-U1.
- **R3b:** החיצים של MA Cross קטנים (גודל ברירת המחדל של lightweight-charts), ואי אפשר לשנות את הצבעים שלהם בפאנל. ל-U1.
- **R3b:** כמה צבעי ברירת מחדל חוזרים על עצמם (ה-basis של Envelope, הקו המהיר של MA Cross וקו 2 של ה-Ribbon הם כתומים, כמו ב-TV). אפשר לשנות בפאנל.
- **R3b:** הצעדים `code-review` ו-`simplify` מ-PLAN §8 לא הורצו כ-subagents בסבב הלילה. נעשתה סקירה עצמית של ה-diff. אפשר להריץ אותם בתחילת S4.
- Vitest מדווח שה-jsdom environment נוצר 5 פעמים (אופטימיזציה אופציונלית, לא דחוף).

## הערות סביבה
- **E2E אצל המשתמש (לא חובה):** `cd frontend; npx playwright install chromium; npm run e2e -- --trace off`. רץ גם ב-CI.
- **Smart App Control ב-Windows של המשתמש** חוסם קבצי `.exe` לא חתומים שנוצרים ב-`.venv\Scripts` (os error 4551). לכן כל הכלים רצים דרך `uv run python -m <tool>`. הסקריפטים ו-`CLAUDE.md` עודכנו בהתאם. ל-`ruff.exe` (binary מ-PyPI) עדיין לא ברור אם ייחסם; ייבדק בהרצה של `test.ps1` אצל המשתמש.
- גרסאות בשימוש: Python 3.13, FastAPI 0.165, Starlette 1.10, pydantic 2.14, uvicorn 0.54, httpx2 2.16, ruff 0.17, pyright 1.1.414 (רץ על Node),
  pytest 9.2; Node 22, Vite 8.3, React 19.3, TypeScript 6.0.3, ESLint 10, typescript-eslint 8.73, Vitest 5.1,
  TanStack Query 5.108, lucide-react 1.77, lightweight-charts 5.3.0, zustand 5.0.x.
- **Windows (חד-פעמי):** `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, להתקין uv, Node 22+ ו-Git.
- Ports: backend על `127.0.0.1:8000`, frontend על `localhost:5173` (`strictPort`). Vite עושה proxy ל-`/api`.
- ה-`.ps1` נשמרים עם CRLF (לפי `.gitattributes`) ומכילים ASCII בלבד, בשביל תאימות ל-Windows PowerShell 5.1.

## יומן sessions
### 2026-11-22 — Stage A
- ה-repo היה ריק. בוצעו A1–A8: מחקר, כל מסמכי התיעוד, `.gitignore` ו-`.env.example`.
- ממצאים: Stooq דורש key; TS 7 לא נתמך על ידי typescript-eslint; pandas-ta בסיכון ארכוב; LWC 5.3.0 תואם.

### 2026-11-22 — R0
- Scaffolding מלא ו-8 quality gates ירוקים מקומית (`./scripts/test.sh`). ה-UI נבדק ב-Chromium דרך Playwright, בלי console errors.
- ביקשת שאעשה clone אצלך. זה לא התאפשר: התיקיות ב-`DESKTOP-02U943G` לא זמינות ל-sessions בענן. כנראה צריך לעדכן את אפליקציית Claude ב-Windows, אבל זה לא ודאי.
- CI run #3 ירוק על ubuntu ועל windows.
- התקנה אצלך: Git, Node 24 ו-uv מוכנים, ה-clone הצליח ל-`C:\Users\User\chartlab`. בעיות שנפתרו בדרך: clone בתוך `System32` (אין הרשאה), ו-`uv` שלא היה ב-PATH.
- **אימות על המחשב של המשתמש (Windows 11, SAC = On, לא מנוהל על ידי ארגון):**
  - `uv run uvicorn` נחסם (launcher לא חתום). תיקון: `python -m`.
  - `_socket.pyd` של ה-Python של uv נחסם. תיקון: Python רשמי מ-python.org דרך `winget` ו-`UV_PYTHON_PREFERENCE=only-system`.
  - WSL הוצע ונדחה על ידי המשתמש.
  - `mypy` נחסם (`librt`). תיקון: `pyright`.
  - אחרי התיקונים: `dev.ps1` עובד (Backend is up, health 200, ה-shell מוצג), ו-**`test.ps1` עבר 8/8 על המחשב של המשתמש** (pyright 0 errors, 11 backend tests, 19 frontend tests), עם SAC דלוק. R0 אומת במלואו ב-Windows.
- המשתמש ביקש "ללחוץ על לינק ושהאפליקציה תיפתח". נוסף `scripts/install-shortcut.ps1`, שיוצר אייקון ChartLab בשולחן העבודה וב-Start. האייקון מריץ את `dev.ps1 -Open`: מפעיל backend ו-frontend ופותח דפדפן, ואם האפליקציה כבר רצה, רק פותח דפדפן. אפשרות של אתר בענן נדחתה לסוף Phase 1 (עלות, ו-Yahoo חוסם כתובות של שרתי ענן).
- ✅ המשתמש אישר: האייקון בשולחן העבודה עובד, והדפדפן נפתח לבד עם האפליקציה.

### 2026-11-22 — R1 (שלב 0: בדיקה מקדימה)
- `scripts/check_native.py` על המחשב של המשתמש: **ALL REQUIRED OK**. numpy 2.5.5, pandas 3.1.1, curl_cffi 0.17.0, protobuf 7.36.2 (upb), yfinance 1.8.0, lxml ו-ta-lib נטענים כולם עם SAC דלוק. הטעינה הראשונה של pandas איטית (Defender סורק), ובפעמים הבאות היא מהירה.
- Yahoo עונה מה-IP של המשתמש: AAPL close ב-2026-11-20 = **342.56**, זהה לצילום של TradingView.
- R1 פוצל ל-R1a (מנוע נתונים, API ומחירים ב-Watchlist) ו-R1b (Tiingo, 1h, OpenAPI types).
- הבא: R1 אחרי אישור.

### 2026-11-22 — R1a: דמו אצל המשתמש
- `git pull` ו-`setup.ps1` עברו. הטעינה הראשונה של המחירים (25 סימבולים, כולל טעינה ראשונה של yfinance ו-pandas תחת SAC) נמשכה בערך דקה, והסתיימה ב-`GET /api/quotes 200 OK`.
- השוואה ל-TradingView (20.11): SPX, NDX, VIX, AAPL, TSLA ו-NFLX זהים. DJI, DXY ו-Forex שונים מעט. GOLD, SILVER ו-USOIL שונים משמעותית (futures מול spot, ראה בעיות ידועות).
- המשתמש שאל אם אפשר לעבוד מהטלפון כשהמחשב כבוי. התשובה: כן לפיתוח ולבדיקות (הסשן רץ בענן); הדמו ונתוני Yahoo דורשים את המחשב שלו.

### 2026-11-22 — R2a: גרף הנרות הבסיסי
- המשתמש ביקש לראות גרפים, ולכן R2 פוצל ל-R2a (גרף בסיסי) ו-R2b. R1b נדחה לאחר R2b.
- החלטות המשתמש לפני המימוש: volume בתחתית הגרף, לזכור את הסימבול האחרון, וכפתורי D/W/M.
- נבנו `ChartEngine`, legend, interval switcher, Watchlist לחיץ ו-store. 8/8 gates ירוקים (backend 102 tests, frontend 71).
- הדמו עם נתונים אמיתיים ממתין למשתמש.
- המשתמש ביקש שאריץ בעצמי את `git pull` ו-`setup.ps1`. session בענן לא יכול להגיע למחשב שלו (התיקיות שלו לא זמינות ל-sessions בענן), ולכן נבחרה "דרך 2": האייקון מתעדכן לבד לפני כל הפעלה.

### 2026-11-22 — R1b: שעות, futures ו-OpenAPI types
- המשתמש ביקש לממש את R1b לפני R2b. השאלות לפני המימוש והתשובות: fixtures דרך סקריפט אצלו עם push; futures בשם `GC1!`; intervals של `1h` ו-`4h`; שעון ישראל.
- 5 commits: backend של 1h/4h, OpenAPI types, frontend של 1h/4h ושעון ישראל, סקריפט fixtures, ותיעוד.
- 9/9 gates ירוקים מקומית (backend 141 tests, coverage 98%; frontend 89). CI ירוק על ubuntu ו-windows.
- נמצא ותוקן בדרך: `has_more_before` ספר גם נרות אחרי `end` (נכתב מחדש ב-`_window`); תווית ה-crosshair הציגה שניות ב-intraday (`secondsVisible: false`).
- ממתין לדמו אצל המשתמש: `make-fixtures.ps1` ובדיקת 1h/4h מול TradingView.

### 2026-11-22 — סקירה ותוכנית עבודה (PLAN.md)
- המשתמש ביקש סיכום, סקירה רחבה ותוכנית לימים הבאים עם דגש על ממוצעים נעים (כולל המתמטיקה) ועל UX/UI, והמלצת מודל ו-effort לכל סבב.
- סקירת UX: צילומי Playwright ב-1280 וב-375 על נתוני הבדיקה, ובדיקה מול ה-UX skills. ממצאים עיקריים: כפתורי range ו-scale שנראים פעילים ולא עושים כלום, שבירה של הפריסה בחלון צר, גלילה אופקית של 29px ב-1280.
- נוסחאות ה-lag וה-NRF של 12 ממוצעים אומתו נומרית (impulse response על 4,000 נרות) ונכנסו ל-PLAN.md §5.
- בלי שינוי קוד. נוצר `PLAN.md`, ועודכנו ROADMAP, README ו-HANDOFF.

### 2026-11-22 — S1 / R2b: השלמת הגרף
- המשתמש ביקש לממש S1, S2 ו-S3 ברצף ("תמשיך לעבוד, לילה טוב"). לא היו שאלות פתוחות; D2/D4/D6 לפי ההמלצות.
- נבנו: Heikin Ashi ו-`before` ב-backend, היסטוריה עצלה, סוגי גרף, scale, כפתורי טווח, חיפוש סימבולים, loaders, Playwright עם 4 בדיקות ו-job ב-CI, ותיקון ה-overflow.
- נמצא ותוקן בדרך: ה-legend בבדיקת ה-E2E הראה את הנר שמתחת לעכבר ולא את האחרון (העכבר נשאר על הגרף אחרי בחירה בתפריט); `setState` בתוך effect הוחלף ב-focus נגזר (`useMemo`) ש-`ChartView` מפעיל פעם אחת לכל `seq`.
- 9/9 gates ירוקים, E2E 4/4.

### 2026-11-23 — S2 / R3a: מנוע indicators וממוצעים בסיסיים
- המשך ריצה אוטונומית (S1 → S2 → S3) לבקשת המשתמש.
- נבנו: core/registry/API, 4 ממוצעים, golden + TA-Lib + properties + scoreboard, תבנית TV cross-check, ובצד ה-frontend הדיאלוג, ה-legend, פאנל ההגדרות והקווים על הגרף. נוספו E2E ו-artifact של ה-scoreboard ב-CI.
- נמצא ותוקן: לחיצות על כפתורי ה-legend נבלעו ב-canvas (stacking context). התגלה (ולא תוקן): הבסיס של מצב `%` הוא per-series.

### 2026-11-23 — S3 / R3b: משפחת הממוצעים המוכללת
- המשך הריצה האוטונומית (S1 → S2 → S3) לבקשת המשתמש.
- נבנו: 11 ממוצעים חדשים ב-`core`, ‏`MA_TYPES` עם 15 סוגים, 4 composites, ‏`option_labels`, golden models לכל הסוגים, TA-Lib ל-5 נוספים, property tests לפי מחלקה, 15 learn stubs, 18 שורות TV cross-check, ובצד ה-frontend חיצי crossover ו-select עם שמות תצוגה. נוסף גם E2E.
- נמצא ותוקן: חלוקה באפס ב-McGinley (נמצאה ב-hypothesis). הכול ירוק.
