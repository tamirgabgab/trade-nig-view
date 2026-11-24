# HANDOFF — סטטוס חי של ChartLab

> קובץ זה נכתב בעברית (מונחים טכניים, נתיבים ופקודות באנגלית). מתעדכן בסוף כל session.

## מצב נוכחי
- **שלב:** Phase 1. R0, R1a, R1b, R2a, R2b (S1), R3a (S2), R3b (S3), L1 (S4), R3c (S5), U1a, U1b, U1c, ‏R4a, ‏R4b, ‏R5, ‏R6 ו-**R7 (Bar Replay) הושלמו**. **‏Phase 1 גמור** (2026-11-23). יש 29 אינדיקטורים: משפחת הממוצעים, ונוסף עליה BB, ‏RSI, ‏MACD, ‏Stochastic, ‏ATR, ‏OBV, ‏VWAP ו-Volume SMA. לכל אוסילטור יש pane משלו. כל אינדיקטור נבדק כמו DUT מול golden model, ‏TA-Lib ו-properties. **ממתין לדמו אצל המשתמש (S4, ‏S5, ‏U1a, ‏U1b, ‏R4a, ‏R4b, ‏R5, ‏R6 ו-R7).**
- **‏Phase 2 הושלם** (2026-11-24). **‏Phase 3 הוגדר מחדש לפי בקשת המשתמש:** כל אינדיקטור או כלי חדש מוגדר איתו בדיון, ואז ממומש כמובנה עם כל מערכת הבדיקות. מה שהושלם: כלי **Return**, כלי **Statistics**, ו-**F1**, ה-backend של חיזוי ה-OHLC. **הבא: F2**, החיזוי על הגרף, לשונית Forecast, דף לימוד ו-E2E. ממתין לדמו אצל המשתמש.
- **פרופיל UX:** `.ux-profile.md` בשורש הריפו מגדיר את ChartLab ככלי צפוף (12–13px, שטח לחיצה של 28px לפחות, תנועה שקטה, הצבעים של TradingView). כל סקיל UX קורא אותו.
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

## R3b — תיקונים אחרי code review (2026-11-23)
הרצנו `/code-review high` על `bc41eb0..HEAD`. הסקירה העלתה 6 ממצאים, וכולם תוקנו:
1. 🔴 **offset לא נכלל ב-lookback.**
   - הבעיה: עם offset גדול, ערכים בתחילת החלון יצאו NaN או שגויים. הבאג היה קיים כבר מ-R3a.
   - התיקון: `IndicatorSpec.total_lookback` מוסיף את ה-offset במקום אחד מרכזי, וה-API משתמש בו.
   - בדיקה חדשה: כל 19 האינדיקטורים, עם offset של עד 500, יוצאים זהים בחלון ובהיסטוריה מלאה. וידאנו שהבדיקה נכשלת בלי התיקון (14 כשלים).
2. 🔴 **KAMA:** ה-lookback מחושב עכשיו לפי `max(fast, slow)`, ו-`fast > slow` נדחה עם 422.
3. **McGinley:**
   - ירידה של יותר מ-50% בנר אחד גרמה ב-Pine לתנודות של ±1e245. עכשיו רמה ≤ 0 מוחלפת ב-EMA באותו נר. זו סטייה מכוונת מ-Pine; בכל מקרה אחר הערכים זהים.
   - בדרך נמצא ותוקן `OverflowError` כשהיחס $(x/M)^4$ חורג מטווח float. ב-Pine זה inf, ולכן הצעד הוא 0.
4. **ARCHITECTURE:** עודכנו §3.2 (טבלת lookback לפי סוג, ו-offset), §4 (פורמט markers, משמעות `warmup`, שגיאות 422) ו-§5.1 (`option_labels`, ‏`lookback`, ‏`MA_TYPES`, ‏markers).
5. **Composites:** נוספו golden models ל-MA Cross (fast, slow ו-crosses מול `golden_crosses` לפי Pine), ל-Ribbon ול-Envelope, על 6 סוגים ועל כל ה-datasets. נוספו גם hand vectors ב-`test_composites.py`.
6. **`warmup`:** תועד ב-`IndicatorSpec` וב-API שה-warmup שייך ל-output שמתחיל אחרון. warmup נפרד לכל output יתווסף ב-P4 אם יידרש.

## R3b — simplify (2026-11-23)
הרצנו `simplify` על `bc41eb0..HEAD` עם ארבעה סוקרים (Reuse, Simplification, Efficiency, Altitude), תחת המגבלות: בלי לשנות ids, פרמטרים, פלטים או ערכים, ובלי לגעת ב-golden models. כל הפלטים וה-warmups של 111 מקרים על 5 datasets יצאו **זהים ביט-לביט** לפני ואחרי.
- **Backend:**
  - `IndicatorSpec.shift` (הזזת הגרף) מחליף את הניחוש לפי שם הפרמטר `"offset"`. ה-offset של LSMA הוא offset של רגרסיה, ולכן כבר לא מוסיף lookback.
  - `ma_warmup` ו-`offset_shift` ב-`ma.py`. ה-specs של t3, ‏kama, ‏alma, ‏lsma וה-composites לוקחים warmup ו-lookback מ-`MA_TYPES` במקום להעתיק נוסחאות.
  - `MA_TYPES` נכתב מחדש עם `_plain` ו-warmup ברירת מחדל `n-1`.
  - `ma_cross._legs`.
  - `core.shift` משתמש ב-`lagged`, ו-`ema_recursive` משתמש ב-`adaptive_recursion`, כך שיש לולאת IIR אחת בלבד.
  - קבועי ברירת המחדל של KAMA ו-ALMA עברו ל-`core`.
  - ה-lookback של KAMA לפי `slow` עם רצפה של 250.
- **Frontend:**
  - `toMarkers` עבר ל-`seriesData.ts` ונכתב כלולאה אחת לפי סדר הזמן, בלי מיון.
  - `setMarkers` שומר את מערך ה-markers המוכן, בלי השוואה ידנית של 7 שדות. החלפת סוג גרף משתמשת במערך השמור.
  - `IndicatorLine.plot` מקבל את כל סוגי ה-plot. ההחלטה "histogram/area כקווים עד R4" נמצאת עכשיו רק ב-`ChartEngine`.
  - `valueOutputs` משותף ל-legend ולחלון ההגדרות.
- **דילגנו (בכוונה):**
  - hook של `validate` ב-registry (KAMA ו-HMA בדחייה לפני טעינת נתונים): ההתנהגות זהה (422), ונשקול כשיהיו עוד בדיקות בין-פרמטריות.
  - kernel משולב ל-HMA: משנה ערכים ב-5e-16.
  - EMA inline ב-McGinley: חוסך 1.7ms ומסבך את הלולאה.
  - prefix sums ל-VWMA: משנה נומריקה.
  - איחוד `ma_indicator` עם ה-specs המותאמים: refactor גדול מדי.

## L1 — מה נבנה (2026-11-23, S4)
- **Backend:**
  - `app/analysis/response.py`: ה-filter response של כל אינדיקטור נמדד ע"י הרצת הקוד האמיתי על נתונים סינתטיים: impulse אחרי ה-warm-up, ‏step ו-ramp.
    - מה מחושב: DC gain, lag $\bar k$, ‏NRF, תגובת תדר (DTFT ישיר ב-121 periods לוגריתמיים 2–200), group delay ו-ramp lag.
    - לינאריות **נמדדת** (superposition על random walks ובדיקה שה-volume לא משנה את הפלט). VWMA, ‏KAMA ו-McGinley מקבלים רק step/ramp ו-`reason`.
    - מספר ה-taps הוא פי 2 מה-lookback, כדי שה-lag (moment ראשון) יהיה מדויק ל-1e-9.
  - `POST /api/indicators/response` (POST ולא GET כמו ב-PLAN, כי `params` הוא אובייקט חופשי) ו-`GET /api/learn/{slug}` (רק slugs של אינדיקטורים רשומים).
  - בדיקות directed: הערכים הנמדדים שווים לנוסחאות הסגורות של PLAN §5.3 לכל הממוצעים הלינאריים, ב-n=9/20/50.
- **Frontend:**
  - כפתור הספר ב-legend פותח drawer מימין. ה-drawer נטען lazy, והגרף נשאר גלוי.
  - טאב **Page**: Markdown עם KaTeX (react-markdown + remark-math + rehype-katex). ‏katex מוצמד ל-0.19 דרך `overrides` בגלל advisory בגרסה 0.16.
  - טאב **Filter view**: גרפי SVG של impulse (stems כשיש ≤64 taps), ‏step, ‏|H| ב-dB לפי period ו-group delay.
    - כל גרף כולל crosshair, ‏tooltip וקריאת ערכים עם החצים.
    - יש טבלת Lag / NRF / Lag on a trend / DC gain / Overshoot.
    - "Compare with" מציג ממוצע שני באורך שבוחרים, עם כפתור "Add … to chart".
  - צבעי סדרות: `--color-series-1/2` (פלטה מאומתת ב-validator של dataviz, dark ו-light).
- **תוכן:** 19 דפי learn מלאים ברמת MSc EE, עם גזירות של lag, ‏NRF ו-H(ω).
  - כל המספרים נמדדו ב-`filter_response` או נגזרו בצורה סגורה ונבדקו מולו.
  - הכול מתקמפל ב-KaTeX במצב strict.
  - נוספו נוסחאות סגורות ל-NRF של DEMA, ‏TEMA ו-ZLEMA, שב-PLAN היו "numeric".
- **תיקוני תיאור שעלו בכתיבה (בלי שינוי ערכים):**
  - ‏docstring של KAMA: ה-c בריבוע, ולכן אורכי ה-EMA הם 3.5 ו-479.5, לא F ו-S.
  - ה-seed residual של RMA הוא e^-24 ולא e^-25.
  - SWMA הוא טרפז (SMA2∘SMA3) ולא משולש.
  - SMA מסוכם במדויק לכל חלון.
- **ממצאים מעניינים בדפים:**
  - ה-lag של KAMA על נתונים "רועשים" ארוך פי ~190 מה-lag על step (ה-Filter view מראה רק את המקרה המהיר).
  - McGinley 14 מתנהג כמו RMA14 = EMA27.
  - האיתות של MA Cross מגיע מאוחר מממוצע שני ה-lags (SMA 9/21: ‏10 ברים לעומת הערכה של 7).
- **בדיקות:** ‏vitest ל-`plotScale`, לפרסור ול-drawer (כולל compare, אורך לא חוקי ו-"-0.00"), ו-E2E שפותח את ה-drawer של SMA 9 ובודק KaTeX, ‏Lag 4.00, ‏NRF 0.111 ו-DC gain 1.000.

## L1 — ponytail ו-code review (2026-11-23)
- **ponytail (full):**
  - ה-frontend כבר לא מפרסר את `linear` שלא היה בשימוש. ב-API הוא נשאר.
  - פונקציית `series` אחת ב-`FilterView` במקום שתיים.
  - שאר הקוד כבר היה רזה.
- **code-review high** (`0f913aa..HEAD`): 7 ממצאים, וכולם תוקנו.
  1. ‏`truncated` חושב לפי תקציב ה-lookback, ולכן סימן FIR ארוך (SMA 1500) כ-"approximate". עכשיו הוא נקבע לפי ה-tap האחרון שנמדד.
  2. פלט לא-לינארי עם gain ≠ 1 (Envelope על KAMA) נורמל כאילו ה-gain הוא 1, וה-ramp lag יצא −1305. עכשיו ה-gain נלקח מהבר השטוח.
  3. ה-tooltip היה נעול לטווח של הסדרה הראשונה. עכשיו הוא הולך לפי הסדרה הארוכה ומציג — אחרי סוף הסדרה הקצרה.
  4. ‏`keepPreviousData` הציג נתוני השוואה ישנים תחת השם החדש.
  5. שגיאה בבקשת השוואה לא הוצגה.
  6. ה-focus לא חזר לכפתור ה-Learn בסגירת ה-drawer, ועבר ל-tab הלא נבחר.
  7. נוסף ADR 0009 לצינור Markdown + KaTeX.
- **simplify:** לא הורץ. אחרי ponytail וה-review אין כפילות או מורכבות ששווה להוריד.
- 9/9 gates ירוקים, ‏backend 1,202, ‏frontend 183, ‏e2e 7/7.

## R3c — מה נבנה (2026-11-23, S5)
- **Backend:**
  - 8 אינדיקטורים חדשים: `bb`, ‏`rsi`, ‏`macd`, ‏`stoch`, ‏`atr`, ‏`obv`, ‏`vwap` ו-`vol_sma`, כל אחד בקובץ משלו ב-`app/indicators/`.
  - primitives חדשים ב-`core.py`: `stdev` (σ של אוכלוסייה, שני מעברים בבלוקים), `highest`, `lowest` ו-`true_range`.
  - `apply_ma_valid`: מריץ MA על הקלט החל מהערך התקף הראשון. משמש ל-smoothing של RSI ול-signal של MACD, עם כל 15 הסוגים. ה-basis של BB משתמש ב-`apply_ma` הרגיל.
  - `BarFrame.session`: עמודה אופציונלית ל-VWAP, נבנית ב-intraday בלבד. ב-daily התוצאה NaN.
  - `ParamSpec.requires` ו-`OutputSpec.requires`: פרמטר או קו שפעילים רק כשה-bool או ה-enum שהם תלויים בו דולק (True או לא `"none"`). ב-RSI זה חל על אורך ה-smoothing, על ה-BB ועל הקווים שלהם.
  - `filter_response` מודד רק outputs שעל ברים שטוחים הם כפולה קבועה של המחיר. לאוסילטורים מוחזר `outputs: []`.
- **בדיקות:** golden על כל הברים (`rtol=1e-9`), ‏TA-Lib על האזור המתכנס (הסטיות המתועדות מפורטות ב-docstrings), ‏properties כולל `check_no_lookahead` לכל אינדיקטור ולכל 15 סוגי ה-MA כ-smoothing, ועוד 12 שורות TV cross-check. ‏backend: 1,829 בדיקות.
- **Frontend:**
  - `overlay: false` פותח pane לכל instance. ה-pane נמחק אחרי שהקו האחרון שלו מוסר, ויש בו legend משלו בראשו וקווי levels מקווקווים.
  - מילוי בין קווים (`BandFill`, primitive), ‏histogram של MACD בארבעה צבעים, ‏Volume SMA על סקאלת ה-volume, ו-OBV בפורמט K/M/B.
  - פאנל ההגדרות מאפיר inputs לא פעילים, וה-legend משמיט אותם יחד עם הקווים הכבויים.
  - החיפוש בחלון ה-Indicators מציג קודם את הקבוצה עם ההתאמה הטובה ביותר. לפני כן "rsi" הציג EMA ראשון, כי ב-description שלו מופיעה המילה "Recursive".
- **E2E:** הוספת RSI ו-BB, בדיקה שה-smoothing מאפיר את השדות, שינוי האורך של BB ל-30 והסרת RSI. הערכים נבדקים מול מימוש ייחוס ב-TS.
- **ponytail ו-code review (high):** ‏ponytail מצא רק map מיותר אחד בחיפוש. ה-review מצא 6 ממצאים, וכולם טופלו:
  1. **(חשוב) lookback של Stochastic:** הוא קרא רק את `k_length`. עם smoothing ארוך, החלון הראשון של כל עמוד יצא ריק. עכשיו ה-lookback הוא $\max(25k, \text{warmup})$, ונוסף טסט שמוודא שחלון עם lookback נותן את ערכי ההיסטוריה המלאה.
  2. צבעי ה-histogram של MACD עכשיו כמו ב-TradingView (`hist[1] < hist`): בר ראשון או בר ששווה לקודם נחשב "לא עולה".
  3. ה-`ResizeObserver` מפסיק לעקוב אחרי pane שנסגר (קודם הייתה דליפה).
  4. ‏`lookback` ב-API: תועד הערך 1000000000, שמשמעו "כל ההיסטוריה" (OBV). שינוי המשמעות לבארים שנטענו בפועל היה שובר את החוזה הקיים.
  5. תוקן ב-HANDOFF מי משתמש ב-`apply_ma_valid`.
  6. קו על סקאלת ה-volume (Volume SMA) מוסתר בסימבול בלי volume (forex, מדדים).
- **פתוח:** ה-legend ב-pane מציג ערכים לפי מספר הספרות העשרוניות של הסימבול (ל-U1). בנוסף, ‏ARCHITECTURE §5.1 עודכן: `fills` ו-`intraday_only` לא קיימים, ובמקומם יש `style` ו-`session`.

## U1a — מה נבנה (2026-11-23, S6a)
קדמה לו סקירת UX/UI עם עמוד הצעות והדגמות חיות (Artifact). המשתמש בחר: להישאר עם הצבעים של TV, תנועה שקטה, חצי מסך מספיק, פרופיל UX, כל ההצעות, בשני סבבים.
- **פרופיל וטוקנים:** `.ux-profile.md`; ‏`--font-size-xs` (11px) נמחק, וכל ה-meta עובר ל-`--font-size-sm` (12px); ‏tokens לתנועה (`--duration-base` 200, ‏`--duration-exit` 150, ‏`--ease-out`/`--ease-in`); ‏`kbd` גלובלי אחד; צללים רכים עם קו הארה עליון (`--shadow-overlay`, ‏`--shadow-panel`) במקום 40–45% שחור.
- **כפתורים:** כפתורים של "coming in Rn" בשקיפות 50% עם נקודה כתומה. ה-tooltip הוא אלמנט אמיתי (ולא `::after`), והקיצור מוצג בתוכו כ-`kbd`. ה-tooltips מתחילים בפועל ("Add indicator", "Edit settings: EMA 9"). ב-ChartTypeMenu יש עכשיו טבעת focus.
- **אנימציות:**
  - `SlidingPill`: גלולה שמחליקה בין כפתורי ה-interval והטווח.
  - `usePresence`: פאנלים, דיאלוגים, התפריט וה-toast יוצאים באנימציה של 150ms, במצב `inert`. כשהמשתמש מבקש פחות תנועה, או ב-jsdom, הסגירה מיידית.
  - `usePriceFlash`: הבזק ירוק או אדום על המחיר האחרון ב-Watchlist ועל C ב-legend. ב-legend ההבזק מופיע רק כשמוצג הבר האחרון.
- **Legend:**
  - ריחוף או focus על שורה מעמעם את שאר הקווים ל-20% (`presentLines`; משנה רק options, לא data).
  - אינדיקטור חדש מצויר עבה ב-2px למשך 700ms, והשורה שלו מהבהבת פעם אחת.
  - שמות קצרים: מספרים תמיד, ו-source, סוג או מתג רק כשהם שונים מברירת המחדל ("MACD 12 26 9", "EMA 9", "EMA 9 hl2").
- **Undo:** הסרת אינדיקטור מציגה toast עם Undo ל-5 שניות, שמחזיר אותו למקומו עם ההגדרות (`remove` מחזיר `{instance, index}`, ו-`restore` מחזיר אותו).
- **גרף:**
  - שדה `level_fill` ב-registry (RSI 30–70, ‏Stochastic 20–80), שמצויר כ-`BandFill` בצבע הקו ב-8%.
  - volume ב-35%.
  - קו הפרדה בין panes בצבע הגבול, שנדלק בריחוף.
  - כפתור "»" שחוזר לבר האחרון אחרי גלילה אחורה.
  - `auto` מסונכרן: גרירת ציר המחיר מכבה אותו ולחיצה כפולה מדליקה (LWC משנה את `autoScale` בעצמו, וה-engine מדווח על כך).
- **חצי מסך:** מתחת ל-1100px ה-Watchlist נפתח כפאנל צף מכפתור ה-Watchlist ונסגר ב-Esc, בכפתור או בלחיצה בחוץ. במסך רחב אותו כפתור מקפל את העמודה.
- **מקלדת:** `?` (או כפתור המקלדת בסרגל העליון) פותח מפת קיצורים. עד שמוסיפים אינדיקטור ראשון, ה-legend מציג "Press / to add an indicator".
- **Watchlist:** `—` במקום `n/a`, ופחות padding, כך ש-Chg% כבר לא נחתך.
- **באגים שנתפסו בבדיקות:**
  1. **(E2E)** פאנל שיוצא באנימציה החזיר את ה-focus לכפתור שפתח אותו 150ms אחרי הסגירה, וגנב אותו מדיאלוג שנפתח בינתיים (אותיות שהוקלדו בחיפוש אבדו). עכשיו `restoreFocus` מחזיר focus רק אם הוא עדיין על ה-body או בתוך הפאנל.
  2. **(צילום)** בזמן ריחוף, מילוי ה-RSI נעשה חזק במקום חלש, כי `withAlpha` החזיר צבע rgba כמו שהוא. עכשיו הוא מכפיל את ה-alpha.
- **ניקוי (ponytail ← code-review high ← simplify):**
  - **ponytail:** איחוד של `CloseField` לתוך `Field`; ה-timer של ה-emphasis עבר ממשתנה גלובלי במודול ל-effect; ה-undo ב-toast הוא חובה.
  - **code review:** 10 ממצאים. תוקנו 9:
    - ה-Learn drawer לא הציג אנימציית יציאה.
    - דיאלוג הקיצורים לא חסם את ה-hotkeys האחרים, ונפתח modal על modal.
    - העמעום לא חל על histogram ועל fills.
    - הבזק שגוי בזמן החלפת ADJ.
    - פתיחה מחדש בזמן אנימציית יציאה החזירה state ישן (נוסף `key` ב-`usePresence`).
    - גרירת ציר שהסתיימה מחוץ לגרף לא כיבתה את `auto`.
    - משך ההבהוב של שורה חדשה לא תאם את משך ההדגשה.
    - Esc כפול סגר גם את ה-Watchlist הצף.
    - הדגשה עד 4px הוסברה בתיעוד.
    הממצא היחיד שלא שונה: שני רכיבים בקובץ `ShortcutsDialog.tsx`, באותה תבנית Dialog/Panel כמו `IndicatorsDialog` ו-`SymbolSearchDialog`.
  - **simplify** (4 סוקרים: שימוש חוזר, פישוט, יעילות, עומק):
    - `isBareKeyOutsideField` משותף ל-3 ה-hotkeys, ו-`selectModalOpen` אחד.
    - `usePresence` מחזיר `attrs` לפריסה, ונמחקו שכפולים.
    - ה-presence של ה-Learn drawer עבר ל-ChartArea, וה-latch נמחק.
    - עמעום של קו רגיל כבר לא שולח את ה-data מחדש.
    - blur בתוך השורה לא מאפס את העמעום.
    - `usePriceFlash` לא מרנדר פעמיים בתנועת crosshair.
    - `kbd` גלובלי; ‏`--font-size-xs` ו-`--duration-slow` נמחקו; משכי האנימציה של ה-toast וההבהוב נקבעים מ-TS.
    - **דולג:** keyframes משותפים, כי CSS Modules מחליף את שמות האנימציות בשמות מקומיים; רכיב `ModalDialog` משותף, ‏`useDismiss` ו-`useTimeout`, כי אלה שינויי מבנה גדולים מהסבב; ‏`BandFill` בזמן קבוע לפס קבוע (רווח קטן).
- **בדיקות:** ‏frontend: 208 (היו 189); ‏E2E: 10 (היו 8): Watchlist צף ב-960, ‏`?`, ‏Undo; ‏backend: 1,854. `test.sh`: כל 9 השערים ירוקים. ב-ux-audit אין גלישה ב-1280 וב-960, ואין שגיאות ב-console.

## U1b — מה נבנה (2026-11-23, S6b)
- **Backend:** `/api/quotes` מחזיר גם `spark` (20 הסגירות האחרונות), ‏`day_low`/`day_high` ו-`low_52w`/`high_52w` (‏365 ימים אחורה מהבר האחרון, low ו-high, לא מותאמים).
- **Watchlist:**
  - עמודת sparkline (‏36px; ירוקה כשהסגירה האחרונה מעל הראשונה).
  - כרטיס סימבול בתחתית, לסימבול שבגרף, שאפשר לקפל: מחיר גדול עם הבזק, שינוי, בורסה, סטטוס, וסרגלי טווח יומי ו-52 שבועות.
  - ה-sidebar הורחב ל-320px כדי ש-Chg% ייכנס.
- **סטטוס בורסה** (`marketHours.ts`): לפי שעות מסחר באזור הזמן של הבורסה, בלי חגים (ה-tooltip אומר זאת).
  - בלי `session_start`: ימים ב'–ו' 09:30–16:00.
  - עם `session_start` (futures, ‏forex, ‏ICE): מיום א' בשעת הפתיחה עד יום ו' 17:00, עם הפסקה יומית מ-17:00 עד הפתיחה.
  - מוצג גם כנקודה ב-legend.
- **Theme:** מתג light/dark בסרגל העליון (כהה כברירת מחדל, נשמר ב-`chartlab.theme`). `ChartEngine.setTheme` צובע מחדש בלי לאבד data או viewport.
- **צילום:** כפתור המצלמה פותח תפריט Copy image (`Alt+S`) / Download PNG.
  - בראש התמונה פס כותרת: סימבול, שם, interval, בורסה, OHLC אחרון ותאריך.
  - ‏toast מאשר את הפעולה או מסביר למה נכשלה.
  - `ActionMenu` הוא רכיב popup שמשמש גם את תפריט הקליק הימני.
- **קליק ימני:** Reset chart view, ‏Add indicator, ‏Copy price (המחיר בגובה הסמן, רק ב-pane של המחיר), ‏Copy chart image, ‏Log ו-% (כ-checkbox), ‏Remove all indicators.
  - ההסרה של כולם עוברת דרך `ConfirmDialog` שנוקב בשמות, ואחריה יש Undo.
  - `ChartView` מקבל prop אחד, `command` (latest/reset).
- **`Ctrl+K`:** פלטת פקודות על סימבולים, הוספת אינדיקטורים, פעולות גרף (interval, סוג גרף, טווחים, log, %, auto, ADJ), פעולות תצוגה (theme, ‏Watchlist, קיצורים) ופעולות על אינדיקטורים קיימים (עריכה, Learn, הסתרה, הסרה עם Undo).
  - מצב ה-Watchlist עבר ל-uiStore.
- **בדיקות:**
  - frontend: 230 (היו 208).
  - E2E: 13 (היו 10): הורדת PNG, ‏`Ctrl+K`, קליק ימני.
  - `test.sh`: כל 9 השערים ירוקים.
  - backend: 1,856.
  - נמצא ותוקן: הסבולת בבדיקת ה-property של VWAP הייתה שגויה במחירים שליליים (באג בבדיקה מ-R3c, שה-hypothesis מצא).
- **ניקוי (ponytail ← code-review high ← simplify):**
  - **ponytail:** מונה האינדיקטורים מה-views, ‏`onClose` יציב לתפריט, ו-div מיותר אחד נמחק.
  - **code review:** 9 ממצאים. תוקנו 8:
    - פס הכותרת בצילום לא התאים למסך HiDPI.
    - לחיצה שנייה על המצלמה לא סגרה את התפריט.
    - חלון האישור לא חסם את ה-hotkeys.
    - Undo פתח מחדש פאנל של אינדיקטור שהוסר.
    - Download PNG לא עבד ב-Firefox.
    - `Alt+S` לא עבד ב-Mac.
    - ה-toast כתב "1 indicators".
    - צבע הטקסט של כפתור המחיקה לא היה token.
    לא שונה בזמנו: `PalettePanel` בתבנית Dialog/Panel. ב-U1c כל הדיאלוגים עברו ל-`ModalShell` ול-`SearchDialog`, וכל רכיב בקובץ משלו.
  - **simplify** (4 סוקרים):
    - `setTheme` שולח מחדש רק את הנרות ואת ה-volume.
    - `MarketStatus` עם memo, ושעות המסחר משתמשות ב-`zoneOffsetSeconds` הקיים.
    - `useChartSnapshot` בונה את הטקסט רק כשמצלמים.
    - `indicatorActions`: הוספה והסרה משותפות לכל המקומות. ההוספה מהפלטה מודיעה כשהגרף מלא.
    - `useAppHotkeys` עם `useGlobalHotkey`: כל הקיצורים במקום אחד, וארבעה hooks נמחקו.
    - הפלטה נרשמת רק לשדות שהיא מציגה, ו-Tab נלכד בה.
    - `formatChange` משותף; ‏`themeStore` עם `sanitizePersisted`; ‏searchsorted ב-backend.
    - **דולג** (שינויי מבנה גדולים בקוד שקדם לסבב):
      - מעטפת משותפת לשלושת דיאלוגי החיפוש.
      - `ChartTypeMenu` מעל `ActionMenu`.
      - שדה `modal` אחד במקום דגלים נפרדים.
      - העברת ה-engine ל-ChartArea במקום props של "בקשה".
  - **E2E:** בדיקת הקליק הימני נכשלה לפעמים, כי היא לחצה לפני שהנרות נטענו. נוספה המתנה לנרות.
- **שמות קבצים:** `marketStatus.ts` שונה ל-`marketHours.ts`, כי לצד `MarketStatus.tsx` הוא היה שובר את Windows (כלל ב-CLAUDE.md).

## U1c — ניקוי מבני (2026-11-23)
- **`uiStore.modal`:** שדה אחד לדיאלוג הפתוח (`symbols`, ‏`indicators`, ‏`shortcuts`, ‏`palette`, ‏`confirmRemoveAll`) עם `openModal` ו-`closeModal`. דיאלוגים לא יכולים להיערם, ו-`selectModalOpen` הוא השוואה אחת.
- **`ModalShell`:** מטפל ב-backdrop, בכותרת, ב-Esc, בלכידת Tab ובהחזרת ה-focus.
- **`SearchDialog`:** שדה combobox מעל רשימה מקובצת. חיפוש הסימבולים, האינדיקטורים, הפלטה, הקיצורים וחלון האישור בנויים עליהם, כל רכיב בקובץ משלו (החלטת המשתמש: לשמור על הכלל, בלי חריגה).
- **`ActionMenu`:** תומך ב-radio, באייקונים ובפריט פעיל התחלתי. `ChartTypeMenu` בנוי עליו, ו-CSS התפריט עבר ל-`ActionMenu.module.css`.
- **גישה ישירה ל-engine:** `ChartView.onEngine` מוסר את ה-engine ל-ChartArea, שקורא לו ישירות ("חזרה להווה", Reset view, צילום). ה-props `command` ו-`snapshot` נמחקו.
- **code review (high):** 5 ממצאים, וכולם תוקנו:
  - תפריט שנפתח מחדש בזמן אנימציית הסגירה איבד את המקלדת (נוסף `key`).
  - חץ ברשימה ריקה השאיר את הבחירה במינוס 1. הבאג היה קיים עוד לפני הסבב.
  - מזהי האפשרויות מחושבים לפי מיקום, כדי שיהיו ייחודיים.
  - ה-memo של החיפוש חזר.
  - HANDOFF עודכן.
- **ponytail:** ‏CSS התפריט קיבל את שם הרכיב שמשתמש בו.
- **simplify:** לא הורץ, כי הסבב עצמו הוא פישוט: 23 קבצים, ‏225 שורות פחות.
- **בדיקות:** frontend: 231; ‏E2E: 13.

## R4a — כלי ציור, חלק א' (2026-11-23)
- **החלטות המשתמש:** ‏R4 מתפצל ל-R4a ול-R4b; עריכה בסרגל צף ובפאנל צד חי; תפריט נפתח לכל קבוצה בסרגל השמאלי.
- **Backend:**
  - `GET/PUT /api/drawings/{symbol}`: מסמך עם `schema_version` 1, שנשמר ב-SQLite ‏`app.db` עם revision. אם ה-revision לא תואם, מוחזר 409 `revision_conflict`.
  - מודלים ב-pydantic בודקים לכל כלי את מספר הנקודות ואת ה-props שלו (`text`: ‏text ו-font_size; ‏`rectangle`: ‏fill).
  - `migrate()` היא התשתית לגרסאות סכמה הבאות.
- **פונקציות טהורות** (`drawings/`, עם בדיקות יחידה):
  - גיאומטריה: מרחק מקטע, מקרן ומקו, פגיעה במלבן, חיתוך Liang–Barsky ונעילה ל-45°.
  - מיפוי זמן ↔ אינדקס בר: שבר בתוך בר; פער (סוף שבוע) שייך לבר שלפניו; אקסטרפולציה מעבר לקצוות.
  - magnet חלש וחזק ל-O/H/L/C.
  - `shapes.ts`: מודול אחד שמשמש גם את בדיקת הפגיעה וגם את הרינדור.
- **גרף:** ‏`DrawingLayer` הוא primitive אחד על הסדרה הראשית, שמקרין את העוגנים בכל ציור מחדש. ‏ChartEngine מספק `project`, ‏`unproject`, ‏`barAt`, ‏`paneSize` ו-`setPanZoom`.
- **`DrawingManager`:**
  - ציור בקליק-קליק או בגרירה; ריחוף, בחירה, הזזה, ידיות, ו-Shift לנעילה ל-45°.
  - magnet; ‏Del עם Undo; ‏Esc; לחיצה כפולה פותחת את ההגדרות.
  - "הישאר בציור", נעילת הכול והסתרת הכול.
- **ממשק:**
  - קבוצות בסרגל השמאלי עם תפריט נפתח. הכפתור חוזר על הכלי האחרון שנבחר בקבוצה.
  - `Alt+T`, ‏`Alt+H`, ‏`Alt+V` ו-`Alt+Shift+H`.
  - סרגל צף לציור נבחר: צבע, עובי, סגנון קו, הגדרות, נעילה ומחיקה.
  - פאנל צד חי: טקסט (שורה אחת), סגנון, מחיר לכל עוגן (מתעדכן גם בגרירה) ונעילה.
- **שמירה:** ‏`useDrawingsSync` טוען לפי סימבול ושומר עם debounce של 600ms. שמירה ממתינה נשלחת לפני מעבר סימבול, ואחרי 409 הציורים נטענים מחדש. רק שמירה אחת יוצאת בכל רגע, וכל אחת נבנית על ה-revision שהקודמת החזירה.
- **באגים שנתפסו בבדיקות:**
  - הקליק השני בקו לא עדכן את הנקודה אם לא הייתה תזוזה לפניו (למשל במגע).
  - בזמן מעבר סימבול, שמירה ממתינה לא נשלחה.
- **code-review ‏(high) על R4a:** עשרה ממצאים, תשעה חשובים ואחד קטן. כולם תוקנו:
  - במעבר סימבול, הציורים של הסימבול הקודם נשארו על הגרף עד שהחדש נטען, ואפשר היה לערוך אותם. עכשיו `unload()` מנקה אותם מיד.
  - ‏Undo אחרי מעבר סימבול החזיר את הציור לסימבול הלא נכון. עכשיו `restore` פועל רק על הסימבול שממנו נמחק.
  - שתי שמירות במקביל שלחו את אותו revision, והשנייה קיבלה 409 שגוי. עכשיו השמירות עוברות אחת אחרי השנייה.
  - קליק לפני שהציורים נטענו יצר ציור שנמחק בטעינה. עכשיו ה-manager מתעלם מקלט עד שיש סימבול.
  - ‏Esc ו-Del הגיעו לגרף גם כשדיאלוג פתוח. עכשיו `blocked()` חוסם אותם.
  - שחרור עכבר אחרי קליק בסרגל הכלים סיים ציור בטעות. עכשיו נספר רק שחרור שהתחיל על הגרף.
  - החלפת כלי באמצע ציור השאירה טיוטה, ו-pan/zoom נשאר כבוי. עכשיו הטיוטה נמחקת ו-pan/zoom חוזר.
  - שדות המחיר בפאנל לא התעדכנו בגרירה. עכשיו הם controlled.
  - "הסתר הכול" השאיר בחירה, ו-Del מחק ציור נסתר. עכשיו הבחירה מתאפסת. הוסרה גם תיבת ההסתרה לציור בודד, שלא הייתה דרך להחזיר ממנה.
  - (קטן) מלבן בלי `fill` צויר מלא אבל לא נתפס מבפנים. עכשיו הפגיעה תואמת לרינדור. ‏ChartView מדווח שה-engine נעלם לפני `dispose`.
- **ponytail:** עזר אחד (`follow`) מזיז את העוגנים שעוד לא הונחו; ה-manager משתמש בבדיקת `isBareKeyOutsideField` המשותפת; הוסרו exports שאיש לא משתמש בהם.
- **simplify:** לא הורץ. אחרי ה-review וה-ponytail לא נשארה כפילות או מורכבות שמצדיקה אותו.
- **בדיקות:**
  - frontend: 267 (היו 231).
  - E2E: 14: ציור קו מגמה, טעינה מחדש, הזזה ומחיקה ב-Del.
  - backend: 1,870.

## R4b — כלי ציור, חלק ב' (2026-11-23)
- **החלטות המשתמש:** טבלת רמות Fib מלאה (הצגה, יחס וצבע); קווים עם רצועות צבע ותוויות "יחס (מחיר)"; כלי מדידה כמו ב-TradingView; פח בתחתית הסרגל עם תפריט.
- **כלים:**
  - ‏Fib retracement ‏(`Alt+F`): הרמה 0 על העוגן השני, $p(r) = p_1 - r(p_1 - p_0)$.
  - ‏Fib extension: שלושה עוגנים, $p(r) = C + r(B - A)$. הרמות מתחילות ב-C, ורוחבן כרוחב A–B.
  - ערוץ מקביל: שלושה עוגנים, עם מילוי וקו אמצע מקווקו.
  - טווח מחיר, טווח תאריך וטווח מחיר+תאריך. התווית מציגה שינוי ואחוז, מספר ברים ומשך, ונפח בטווח המשולב.
  - הרמות הן מחירים שעוברים דרך סקאלת המחיר, ולכן הן נכונות גם בסקאלה לוגריתמית.
- **פח:** תפריט עם "הסר ציורים", "הסר אינדיקטורים" ו"הסר הכול". כל אפשרות פותחת דיאלוג אישור שמציין את הכמות ואת שמות האינדיקטורים. ‏Undo אחד מחזיר הכול. ‏`RemoveConfirm` מחליף את הדיאלוג שהיה ב-ChartArea.
- **באג של R4a שנתפס ב-E2E:** ‏`logicalToCoordinate` של lightweight-charts מחזיר 0 לאינדקס לא שלם. לכן ציור שעוגן שלו נופל באמצע בר (עוגן יומי ב-1W) קפץ לקצה השמאלי. ‏`logicalToX` עושה אינטרפולציה בין הברים השכנים.
- **ponytail:** פונקציית `plural` אחת, ורשימת התפריט מטבלה.
- **code-review ‏(high):** שמונה ממצאים, שניים חשובים ושישה קטנים. כולם תוקנו:
  - ‏Fib שכל הרמות שלו מוסתרות לא היה ניתן לבחירה. עכשיו גם קו המגמה המקווקו תופס אותו.
  - כשעוגן נופל באמצע בר (אחרי מעבר interval), הנפח ומספר הברים חושבו מבר שגוי, בגלל עיגול. עכשיו כל עוגן שייך לבר שמכיל אותו (floor), דרך הפונקציה הטהורה `spanBetween`.
  - ‏(קטן) הנפח חושב על N+1 ברים. עכשיו הוא על N הברים שאחרי העוגן הראשון.
  - ‏(קטן) כלי המדידה התעלמו מעובי הקו ומהדגשת הריחוף.
  - ‏(קטן) ‏Undo של "הסר הכול" לא עשה כלום אם צוירו ציורים חדשים בינתיים. עכשיו הציורים שהוסרו חוזרים לפני החדשים.
  - ‏(קטן) ‏Shift בגרירת ידית הרוחב של ערוץ נעל אותה ל-45°. עכשיו היא זזה חופשי.
  - ‏(קטן) עדכון התיעוד (README, ‏ROADMAP, ‏ARCHITECTURE §5.2).
  - ‏(קטן) כפתור הפח ללא מה להסיר הוכרז כתפריט. עכשיו הוא `aria-disabled`.
- **simplify:** לא הורץ. אחרי ה-review וה-ponytail לא נשארה כפילות שמצדיקה אותו.
- **בדיקות:**
  - frontend: 284.
  - E2E: 15. נוסף: Fib, טעינה מחדש, מעבר ל-1W והסרה מתפריט הפח.
  - backend: 1,878.

## R5 — מבנה שוק (2026-11-23)
- **החלטות המשתמש:** ‏gaps פתוחים בצבע וסגורים דהויים; קווי H/L/C של היום, השבוע והחודש הקודמים, **בלי** קווי 52 שבועות; ‏pivots כנקודה בלבד, ‏5/5; ‏Data window ו-Gaps כלשוניות בסרגל הימני.
- **החלטת תכנון:** קווי H/L/C ו-pivots הם **אינדיקטורים ב-registry** ‏(`prev_hlc`, ‏`pivots`), ולא endpoints נפרדים. כך הם מקבלים את כל ה-harness ‏(golden, ‏properties ו-no-lookahead), את ה-legend, את פאנל ההגדרות, ובהמשך גם את ה-replay, ממימוש אחד. ‏`/analysis/pivots` ו-`/analysis/levels` מ-ARCHITECTURE בוטלו.
- **‏Backend** (נכתב ע"י agent ברקע, ונבדק ושולב):
  - ‏`analysis/gaps.py` ו-`GET /api/analysis/gaps`: ‏gaps מלאים, ואופציונלית גם חלקיים; סף גודל; מעקב סגירה; עומק הסגירה; תמיכה ב-`until`.
  - ‏`prev_hlc`: תקופה (יום, שבוע או חודש) לפי תאריך ה-session. ב-intraday זה `frame.session`, כך ש-session של חוזים עתידיים שנפתח ב-18:00 בניו יורק נחשב יום אחד.
  - ‏`pivots`: שמירה ב-strict משני הצדדים. הערך נשמר בבר המאשר ‏(p+R), ולכן אין מידע מהעתיד. שדה התצוגה `display_shift` מצייר אותו על בר ה-pivot עצמו.
- **‏Frontend:**
  - תפריט Structure.
  - ‏`GapLayer` (primitive מתחת לנרות).
  - לשוניות בסרגל הימני, Data window ופאנל Gaps עם סף גודל, ‏gaps חלקיים ולחיצה שגוללת לבר.
  - קווי מדרגה ‏(`line_type: step`) ונקודות ‏(`shape: circle`).
  - ‏`chartDataStore` משתף נתונים בין הגרף לפאנלים.
- **פתוח אצל המשתמש:** ‏`nvda_gaps.json` נוצר מה-fixture הסינתטי של ה-E2E. כדי לבדוק אותו ידנית מול TradingView צריך את ה-fixture האמיתי מ-`make-fixtures.ps1`.
- **לא ודאי (נבדק מול TradingView בדמו):** כלל השוויון ב-pivots.
- **ponytail:** הקוד רזה, ולא נמצא מה לקצץ.
- **code-review ‏(high):** חמישה ממצאים, שלושה חשובים ושניים קטנים. כולם תוקנו:
  - ה-Data window הציג ערכי markers בבר הלא נכון. נקודת pivot מוצגת עכשיו עם ההזזה שלה, על הבר שבו היא מצוירת. חיצי ה-crosses נשמטים, כמו ב-legend.
  - "יום קודם" חושב לפי היום ב-UTC, ולכן בחוזים עתידיים ובמט"ח (session שחוצה חצות) הוא ערבב שני sessions. עכשיו הוא לפי `frame.session`. הבדיקות מול ה-golden מעבירות לו עכשיו את תאריך ה-session. ה-golden model עצמו לא שונה.
  - ‏gap חלקי שהבר שלו עצמו כבר סגר הוצג כפתוח. עכשיו הבר של gap חלקי נכלל בבדיקת הסגירה. זה שינוי הגדרה, ולכן ה-golden model עודכן יחד עם המימוש.
  - ‏(קטן) מעבר ל-Heikin Ashi או שינוי בהגדרות ה-gaps גרם להבהוב ריק. עכשיו מפתח השאילתה הוא סימבול, interval ו-adjusted בלבד, עם `keepPreviousData`.
  - ‏(קטן) הערות תיעוד היו מוצמדות לטיפוסים הלא נכונים ב-uiStore.
- **simplify:** לא הורץ. אין כפילות שמצדיקה אותו.
- **בדיקות:**
  - frontend: 288.
  - E2E: 16. נוסף: תפריט Structure, רשימת ה-gaps, וה-Data window עוקב אחרי ה-crosshair.
  - backend: 2,006.

## R6 — workspace (2026-11-23)
- **החלטות המשתמש:**
  - אחסון ב-backend; ‏layouts כמו ב-TradingView עם שמירה אוטומטית; סבב אחד, בלי פיצול.
  - ‏Undo כולל גם סימבול ו-interval, בהיסטוריה אחת לכל הגרף.
  - ‏watchlists כמו ב-TradingView; ‏object tree בלשונית רביעית.
  - בהגדרות: אזור זמן, צבעי נרות, קו מחיר אחרון ו-volume.
- **‏Backend** (נכתב ע"י agent ברקע ונבדק): ‏`storage/documents.py` גנרי, ‏`/api/layouts` ו-`/api/watchlists` עם revision. ‏layout מאמת סימבול, ‏id של אינדיקטור, פרמטרים (`resolve_params`) וסגנונות. ‏watchlist ‏`Default` סינתטי עד השמירה הראשונה. רשימה ריקה תקינה.
- **‏Layouts:**
  - נשמרים אוטומטית שנייה אחרי כל שינוי, וגם בסגירת הדף (`keepalive`). אחרי 409 הגרף של החלון הנוכחי גובר.
  - כל layout שומר גם את גובה ה-panes ואת הברים הנראים.
  - תפריט מימין: Save ‏(`Ctrl+S`), ‏Rename, ‏Make a copy, ‏Open (כולל מחיקה).
- **‏Watchlists:** בורר רשימות, ‏+ דרך חיפוש הסימבול, גרירה לסידור ולמעבר בין סקשנים, וקליק ימני (הסרה, העברה, שינוי שם או הסרה של סקשן). השמירות רצות אחת אחרי השנייה.
- **‏Undo/Redo:** היסטוריה אחת של snapshots ‏(`historyStore`). שינויים רצופים מאותו סוג (גרירה, הקלדה) מתמזגים לצעד אחד. פתיחת layout מנקה את ההיסטוריה.
- **עוד:** הגדרות (אזור זמן כולל "Exchange"), ‏object tree (אפשר להציג בו שוב ציור מוסתר), מסך מלא ו-`Alt+R`.
- **‏E2E:** כל בדיקה מתחילה מ-workspace ריק ב-backend ‏(`freshStart`), כי ה-layout השמור דלף בין בדיקות.
- **ponytail:** ‏`useMenuButton` מחליף שישה עותקים זהים של כפתור תפריט; ‏`apiDelete` אחד. סך הכול 49 שורות פחות.
- **code-review ‏(high):** עשרה ממצאים, שמונה חשובים ושניים קטנים. כולם תוקנו:
  - עריכה מהירה ב-watchlist, בזמן שהשמירה הקודמת עוד רצה, נמחקה. עכשיו תשובת השמירה מעדכנת רק את ה-revision.
  - פתיחת layout שה-bars שלו עוד נטענים שמרה עליו את הטווח הנראה ואת גובה ה-panes של הגרף הקודם. עכשיו, עד שה-view מוחל, נשמר ה-view של ה-layout עצמו.
  - כשטעינת ה-layout נכשלה (למשל ה-backend עוד עולה), השמירה האוטומטית דרסה את ה-layout השמור. עכשיו לא נשמר כלום עד שהטעינה מצליחה, והטעינה מנסה שוב (2, 5, 10 ו-30 שניות).
  - שינוי שם או מחיקה של layout או watchlist נכשלו באמצע, כי ה-revision היה ישן. עכשיו קודם מחכים לשמירות שבתור. שגיאת מחיקה מוצגת.
  - השמירה בסגירת הדף לא הייתה keepalive כששמירה אחרת רצה. עכשיו גם השמירה שאחריה נשלחת keepalive.
  - כותרת סקשן ארוכה מ-40 תווים נדחתה ב-backend. עכשיו הדיאלוג מגביל ל-40.
  - שתי כותרות סקשן זהות שברו את ה-keys של React. עכשיו ה-key הוא האינדקס, ושם כפול נדחה גם בדיאלוג וגם ב-backend.
  - סימבול שיצא מה-universe חסם כל שמירה של הרשימה. עכשיו הוא יוצא מהרשימה בעריכה הבאה.
  - ‏(קטן) שמות שהם רק נקודות ("." או "..") נדחים, כי הם צעדי נתיב ב-URL.
  - ‏(קטן) ‏`Ctrl+S` כשדיאלוג פתוח פתח את חלון השמירה של הדפדפן. עכשיו הקיצור פעיל תמיד.
- **simplify:** לא הורץ בנפרד. ה-ponytail כבר הוציא את הכפילות העיקרית.
- **בדיקות:**
  - frontend: 302.
  - E2E: 17.
  - backend: 2,047.

## R7 — Bar Replay (2026-11-23)
- **החלטות המשתמש:** התחלה בקליק על הגרף, בתאריך או בבר אקראי; רק הגרף חוזר לעבר (ה-Watchlist נשאר חי); ה-interval נעול; ציורים נשמרים כרגיל.
- **החלטת תכנון:** האינדיקטורים **לא מחושבים מחדש** בכל צעד. הערכים שחושבו על כל הברים פשוט נחתכים בסמן. זה מדויק, כי כל אינדיקטור עומד ב-`compute(bars)[k] == compute(bars[:k+1])[k]`. בדיקה חדשה, `test_replay_no_lookahead.py`, מריצה את זה על כל 29 האינדיקטורים, ב-1D וב-1h, ועל ה-gaps. ‏pivot שאושר אחרי הסמן נחתך גם הוא. ‏gap שנסגר אחרי הסמן מוצג כפתוח.
- **‏UI:**
  - כפתור Replay: בבחירה מופיע קו אנכי, והברים שאחריו מוצללים.
  - סרגל שליטה: ‏Play/Pause, ‏`Shift+→`, מהירות 0.5 עד 10 ברים לשנייה, תאריך הסמן, בחירת תאריך, בר אקראי, חזרה להווה.
  - כפתורי ה-interval והטווח מושבתים בזמן Replay. מעבר סימבול מסיים אותו.
- **‏E2E:** ‏AAPL מ-2024-01-02, חמישה צעדים; ה-legend מציג את בר 5, ואז ניגון ויציאה.
- **ponytail:** שני כפתורים עשו אותו דבר ("Back to the present" ו-Exit). נשאר אחד.
- **code-review ‏(high):** תשעה ממצאים, חמישה חשובים וארבעה קטנים. כולם תוקנו:
  - קליק לבחירת נקודת ההתחלה גם צייר כשכלי ציור היה פעיל. עכשיו ה-manager חסום בזמן הבחירה.
  - ה-interval היה נעול רק בכפתורים, ודרך הפלטה או Undo היה אפשר לשנות אותו. בשבועי, למשל, זה הציג נתונים מהעתיד. עכשיו הנעילה ב-`chartStore` עצמו, ופתיחת layout מסיימת את ה-Replay.
  - הקלדת תאריך הזיזה את ה-Replay כבר באמצע ההקלדה. עכשיו התאריך מוחל ב-Enter או ביציאה מהשדה, ותאריך לפני ההיסטוריה נשמט.
  - התחלה מתאריך או מבר אקראי לא הביאה את הבר לתצוגה. עכשיו `jumps` מבקש גלילה.
  - במגע נבחר הבר של ה-hover הקודם. עכשיו `barIndexAtClientX` קורא את הבר מנקודת הלחיצה עצמה.
  - ‏(קטן) ‏`Shift+→` נבלע בכל הדף גם בלי Replay. עכשיו הוא פעיל רק בזמן Replay, ובודק `defaultPrevented`.
  - ‏(קטן) ‏`fillPrice` של gap פתוח הגיע מהעתיד. בזמן Replay הוא מתאפס.
  - ‏(קטן) שדה התאריך היה לפי UTC והתווית לפי אזור הזמן של התצוגה. עכשיו שניהם לפי אזור הזמן של התצוגה.
  - ‏(קטן) יציאה מ-Replay לא חזרה להווה. עכשיו היא גוללת לבר האחרון.
- **simplify:** לא הורץ. הקוד קטן, ואין כפילות.
- **בדיקות:**
  - frontend: 303.
  - E2E: 18.
  - backend: 2,109 (נוספו 60 בדיקות no-lookahead).

## סקירת Phase 1 (2026-11-23)
- **החלטות המשתמש:** שדרוג patch ו-minor בלבד; על ADR 0004 רק המלצה; ‏Phase 2 = דף מלא לכל אינדיקטור; התוכנית ב-PLAN.md עם סיכום בעברית.
- **גרסאות:**
  - ‏zustand שודרג ל-5.1.0.
  - ה-backend כבר על הגרסאות האחרונות של כל הספריות.
  - נדחו: lucide-react, ‏typescript-eslint ו-react-query, כי יצאו פחות משבועיים לפני הסקירה (לשדרג אחרי 2026-12-07). ‏Playwright 1.65 נדחה כי הדפדפן ב-sandbox של הענן הוא של 1.63. ‏TypeScript 7 נדחה כי typescript-eslint עדיין לא תומך בו. ‏`@types/node` 26 הוא major.
- **ספקי נתונים:** ‏Tiingo עדיין 50 בקשות לשעה ו-1,000 ליום, ו-Yahoo עדיין לא מפרסם מגבלות. ההגדרות שלנו נשארות.
- **‏ADR 0004:** אושר מחדש. אף ספריית ציור עוד לא הגיעה ל-1.0.
- **מסמכים:** בדיקה מול הקוד מצאה 73 פערים ב-ARCHITECTURE, ‏README, ‏ROADMAP, ‏CLAUDE.md וב-ADRs, וכולם תוקנו. הקוד עצמו לא השתנה.
- **תוכנית Phase 2:** ‏P2a פלטפורמת לימוד; ‏P2b אוסילטורים; ‏P2c רצועות, תנודתיות ונפח; ‏P2d מבנה שוק, מושגים ותרגילים (PLAN.md §0.3).

## P2a — פלטפורמת לימוד (2026-11-23)
- **החלטות המשתמש:** ווידג'טים בתוך הטקסט ועוד לשונית "Try it"; מניה אקראית מתוך תרחישים; משוואות עם סמלים צבעוניים וטבלת "where"; הדפים באנגלית; הוכחות מתמטיות ועוד event study קטן; דף "Combinations" עם ווידג'ט תנאים; מניה אמיתית מכל ה-universe.
- **‏Backend:**
  - `app/analysis/synthetic.py`: שישה תרחישים דטרמיניסטיים (random walk, ‏uptrend, ‏range שהוא OU סביב 100, ‏reversal, ‏shock של ‎−15 %‎, ‏volatility regime פי 3.75).
  - `conditions.py`: ‏`lt`, ‏`gt`, ‏`crosses_above`, ‏`crosses_below` על פלט, מחיר או מספר, ו-AND ביניהם.
  - `events.py`: תשואת log קדימה של h ברים אחרי הסיגנל מול כל בר: ‏edge, ‏se, ‏t, ‏ci95 והיסטוגרמה. לכל היותר אירוע אחד בכל h+1 ברים, כך שחלונות קדימה לא חופפים.
  - `POST /api/learn/lab` (מקור סינתטי, או הברים היומיים האחרונים של סימבול), ‏`GET /api/learn` (אינדקס).
- **‏Frontend:** בלוקי ```` ```lab ```` בתוך ה-Markdown הופכים לווידג'טים:
  - `param`: slider לפרמטר אחד.
  - `event`: "מה קרה אחרי הסיגנל", עם סף, השוואה ו-look-ahead.
  - `combo`: עד שלושה כללים, וה-edge של כל אחד לבד.
  - `replay`: כפתור "Start in Replay", שעובר לסימבול על יומי, מוסיף את האינדיקטורים ומתחיל Replay מהתאריך.
  - בכל ווידג'ט: בורר נתונים (תרחיש, "New random sample", או סימבול אמיתי) וגרף SVG קטן (`MiniChart`).
  - לשונית "Try it" במגירה (כל הפרמטרים חיים), חלון "Learn pages" (כפתור בסרגל הצד, ו-`Ctrl+K` → "Learn: …").
- **תוכן:** 19 דפי משפחת הממוצעים כתובים מחדש לפי template v2, ע"י שלושה agents במקביל. בדקתי בעצמי את המתמטיקה ב-SMA וב-EMA.
  - הנגזרת המשותפת: מחיר פחות הקו = סכום משוקלל של תשואות אחרונות (משקלים שסכומם ה-lag), ולכן "מעל הקו" הוא מדד momentum.
  - על random walk אין edge לאף כלל (התשואה הצפויה קדימה היא $h\mu$ אחרי כל בר); ב-reversal יש edge חיובי; ב-range הסימן מתהפך, כי $\mathbb{E}[x_{t+h}-x_t] = -(1-0.92^{h})\,d$.
  - כל מספר נמדד עם seed 1 ונבדק על seeds 1–5. כל מסקנה מסומנת "not a backtest, not investment advice".
- **בדיקות חדשות:**
  - backend: lint לדפים (סדר הסעיפים ב-19 הדפים; כל בלוק lab תקין עם ids רשומים והשדות ההכרחיים).
  - frontend: כל נוסחה בכל דף עוברת KaTeX דרך ה-pipeline של המגירה.
  - ‏E2E: תרגיל replay מעביר את הגרף מ-AAPL שבועי ל-NVDA יומי, עם SMA 50, מ-2024-01-02.
- **ponytail:**
  - הוסרו `interval` ו-`adjusted` ממקור ה-symbol (לא היה בהם שימוש).
  - **באג:** ב-EventLab, ‏`useDebounced` קיבל אובייקט חדש בכל render, וזה גרם ל-render כל 200ms לנצח. עכשיו ההשוואה לפי תוכן.
  - ‏`LabOutcome` אחד במקום ארבעה עותקים של שגיאה / מחשב / תוצאה.
- **code-review ‏(high):** עשרה ממצאים, שלושה חשובים ושבעה קטנים. כולם תוקנו:
  - בלוק lab חסר שדה הפיל את כל האפליקציה. עכשיו מופיעה שורת שגיאה, וה-lint בודק את השדות.
  - ה-sliders לא היו על רשת ה-step (‏`bb_mult` 2.0 לא היה ניתן לבחירה), וקיצצו ל-200 ערך גדול יותר מהגרף.
  - ‏ParamLab שלח 14 קבוע לפני שה-registry נטען (‏422 ל-`factor` של T3).
  - ‏(קטן) אינדיקטור לא מוכר הציג "Computing…" לנצח.
  - ‏(קטן) אינדיקטור זהה עם פרמטרים שונים בכתיבה בלבד נספר פעמיים.
  - ‏(קטן) הסרת כל האינדיקטורים סגרה דף לימוד שנפתח מהאינדקס.
  - ‏(קטן) ‏`display_shift` לא שימש בגרפים.
  - ‏(קטן) האינדקס הציג דף בלי קובץ.
  - ‏(קטן) ה-docstring של episodes היה לא מדויק.
  - ‏(קטן) הוסר import ישיר של `hast`.
- **simplify:** לא הורץ. ה-ponytail כבר הסיר את הכפילות העיקרית.
- **בדיקות:** ‏frontend 349, ‏E2E 19, ‏backend 2,264. כל 9 ה-gates ירוקים.

## P2b — אוסילטורים ו-Combining indicators (2026-11-23)
- **תשתית:**
  - `/indicators/response` מודד עכשיו גם פלטים **band-pass**: לינאריים, עם DC gain אפס (MACD, ה-signal וה-histogram). יש להם impulse, ‏step ותגובת תדר, בלי lag.
  - בדיקת golden מול הנוסחה הסגורה $H = \mathrm{EMA}_{12} - \mathrm{EMA}_{26}$. השיא בערך במחזור של 55 ברים, ב-−8.66 dB.
  - בלוק lab חדש, `filter`, מציג את ה-Filter view בתוך הדף. ‏`output` בוחר את הקו שמוצג ראשון.
- **תוכן** (שלושה agents במקביל; בדקתי את המתמטיקה המרכזית בעצמי):
  - **RSI:**
    - $\mathrm{RSI} = 50 + 50\,\mathrm{RMA}(\Delta x)/\mathrm{RMA}(|\Delta x|)$, ועדכון מדויק של בר אחד: ה-RSI זז תמיד בכיוון השינוי של הסגירה.
    - על random walk: $\sigma_{RSI} \approx 62.7/\sqrt{2n-1}$.
    - ב-14, הרמות 70/30 הן בערך הזנבות של 5 %.
    - figure של ה-RMA ‏(SMMA 14).
  - **Stochastic:**
    - הוכחת חסם 0–100, ו-slow %K = fast %D.
    - ההתפלגות על random walk בצורת U ‏(Sparre Andersen: $P(\%K=100) = \binom{26}{13}/4^{13} = 0.155$).
  - **MACD:**
    - $G(z) = (\alpha_f-\alpha_s)(1-z^{-1})/((1-p_fz^{-1})(1-p_sz^{-1}))$.
    - ‏MACD = 7 × ממוצע משוקלל של שינויי מחיר, ו-hist = 4·EMA9 של השינוי ב-MACD.
    - שני figures מדודים.
  - **Combining indicators:**
    - שלושה תפקידים (filter, ‏trigger, ‏confirmation), $P(A\wedge B)$ ותוחלת מותנית, ו-n מול ה-standard error.
    - כללים כפולים זהים בר-בר.
    - ריבוי בדיקות: 280 בדיקות על 20 seeds של random walk, 1.8 % "מובהקות" במקרה, עם Bonferroni.
    - **תיקון של ה-agent לסיפור המקורי:** ב-range ה-trigger לא מוסיף מידע (נבדק על 200 דגימות), כי רק המרחק מהמרכז מנבא. הדף מציג את זה כאזהרה. המקרה המשלים האמיתי הוא reversal.
- **ponytail:** ענף ה-band-pass ב-`response.py` אוחד עם הענף הלינארי.
- **code-review ‏(high):** ארבעה ממצאים, שלושה חשובים ואחד קטן. כולם תוקנו:
  - ‏"Step overshoot" הציג ‎1e18 %‎ ל-MACD, כי ה-DC gain הוא שארית עיגול. עכשיו מוצג "—".
  - בלוק `filter` על אינדיקטור בלי פלט לינארי הציג "Measuring…" לנצח. עכשיו יש הודעה.
  - ה-figures של MACD נפתחו על ה-histogram, בזמן שהטקסט מתאר את קו ה-MACD. נוסף `output`, וה-lint בודק אותו.
  - ‏(קטן) ‏ARCHITECTURE עודכן.
- **simplify:** לא הורץ. הקוד של P2b קטן, והכפילות הוסרה ב-ponytail.
- **בדיקות:** כל 9 ה-gates ירוקים. ‏E2E: ‏20, כולל דף MACD עם figure של band-pass.

## P2c — רצועות, תנודתיות ונפח (2026-11-24)
- **החלטות המשתמש:**
  - ל-VWAP גם 1h סינתטי וגם 1h אמיתי.
  - נוסף תרחיש `accumulation`.
  - המילון בנוי כדף ועוד הגדרה ב-hover.
  - אזהרות לוח שנה נדחו ל-backlog.
- **תשתית:**
  - 1h סינתטי: שבעה ברים ל-session, עם `session` (‏VWAP מתאפס כל בוקר), פער פתיחה רחב פי 4 ונפח בצורת U. הברים היומיים לא השתנו, כך שכל המספרים בדפים נשארו תקפים.
  - 1h אמיתי במקור symbol, ומתג D / 1h בבורר הנתונים.
  - תרחיש `accumulation`: מחזורים של 100 ברים. זה התרחיש היחיד שבו הנפח נושא כיוון. בבדיקה: ‏OBV עולה ב-accumulation בזמן שהמחיר שטוח.
  - ‏`ago` בצד של כלל: הערך k ברים אחורה.
  - בלוק `replay` מקבל `"interval": "1h"`.
  - דגל `intraday_only` ב-registry, שבו "Try it" של VWAP משתמש כדי להיפתח על 1h.
- **תוכן:** ‏VWAP, ‏Bollinger, ‏ATR, ‏OBV ו-Volume SMA, כתובים ע"י agents. דגשים:
  - ב-Bollinger יוצאים מחוץ לרצועות בערך 12 % מהסגירות ב-random walk, ולא 5 %.
  - ‏squeeze מנבא את גודל התנועה, לא את הכיוון.
  - ‏OBV מוביל את המחיר רק ב-accumulation.
  - ל-VWAP לבד אין edge יציב: הוא שכבת תזמון ועלות.
- **באג שנמצא ע"י agent:** קו Volume SMA צויר על סקאלת המחיר ושיטח את הגרף. עכשיו יש לו pane עם הנפח.

## P2d — מבנה, מושגים, מילון ותרגילים (2026-11-24)
- **תשתית:**
  - ‏`[text](learn:slug#heading)` פותח דף בכותרת.
  - ‏`[term](glossary:term)` מציג הגדרה ב-hover או ב-focus, ובלחיצה פותח את המילון.
  - לכותרות יש anchors.
  - ‏replay מקבל `steps` ו-`reveal` (הסעיף "What to look for").
  - ה-lint בודק כל קישור וכל ערך במילון.
  - שמונה דפי concept נרשמו ב-`CONCEPT_PAGES`.
- **תוכן:**
  - ‏Pivots ו-Previous HLC ב-v2. ה-agent תיקן טענה שגויה: התקופות הן לפי תאריך ה-session, לא UTC.
  - דף Gaps.
  - חמישה דפי concept: bars and sessions, ‏adjusted prices, ‏warm-up, ‏lookahead and replay, ‏lag and noise. ה-agent תיקן גם טעות בתדריך שלי: ה-WMA עוקף את עקומת ‎SMA/EMA‎, ולכן היא לא חסם תחתון.
  - מילון של 59 מונחים, ו-413 קישורים אליו ב-36 דפים. הטקסט הנראה לא השתנה (נבדק).
  - דף "Guided exercises": תרגיל לכל משפחה, וכל עובדה נבדקה על נתונים אמיתיים דרך האינדיקטורים של האפליקציה.
- **ponytail:** הקוד היה רזה, והוסר רק כינוי מיותר.
- **code-review ‏(high), שני סבבים:** 18 ממצאים, כולם תוקנו. החשובים:
  - קישור לדף אחר נפתח באמצע הדף. עכשיו מונה ניווט, וגלילה לראש הדף או לכותרת.
  - מונח במילון הציג "Loading…" לנצח כשהמילון לא נטען.
  - ה-tooltip נחתך או יצא מהמגירה.
  - "Try it" של VWAP היה ריק על יומי.
  - שדות חדשים בבלוק (steps, ‏interval, ‏ago) לא נבדקו, וטעות הקלדה הפילה את המגירה.
  - ‏`ago` על ערך קבוע לא נדחה.
  - תרגילי 1h יפסיקו לעבוד כשיציאו מ-730 הימים ש-Yahoo שומר: NVDA ‏2025-01-24 בערך בינואר 2027, ושני תרגילי SPY ‏(‎2025-04-02‎, ‏‎2025-04-08‎) בערך באפריל 2027. עכשיו מוצגת הודעה ("No bars on or before …"), והדפים מציינים את זה.
  - כותרת שמטרתה מכילה מתמטיקה לא מקבלת anchor יציב, וה-lint דוחה קישור אליה.
  - גלילה ל-anchor נשמרת גם כשהווידג'טים מעליה גדלים.
- **simplify:** לא הורץ. אין כפילות של ממש.
- **בדיקות:** כל 9 ה-gates ירוקים. ‏E2E: ‏21, כולל המילון ותרגיל replay.

## P3 — כלי Return וכלי Statistics (2026-11-24)
- **בקשת המשתמש:**
  - כלי 1: שתי נקודות, שינוי באחוזים, ותשואה שקולה, כברירת מחדל שנתית, עם אפשרות ליחידת זמן T אחרת.
  - כלי 2: טווח זמן, היסטוגרמה של תשואות הנרות, תוחלת וסטיית תקן, ועקמומיות (השינוי של השינוי).
- **התשובות לשאלות לפני המימוש:**
  - כלי חדש, ולא הרחבה של כלי קיים.
  - יחידות: שנה, חודש, שבוע, יום ונר.
  - המחיר הוא המחיר בנקודת הלחיצה.
  - הטווח נבחר בגרירה.
  - סוג התשואה בבחירה חופשית: לוג או פשוטה, מהסגירה הקודמת או מהפתיחה.
  - עקמומיות = $r_t - r_{t-1}$.
  - לשונית בפאנל הצד, עם עקומה נורמלית ותוחלת ותנודתיות שנתיות.
  - בשיטת חישוב התשואה השקולה לא נבחר כלום, ולכן אומצה ההמלצה: ריבית דריבית על זמן קלנדרי (CAGR).
- **‏Return** (`return_range`):
  - התווית מציגה את השינוי, ‏$\approx (P_2/P_1)^{1/m}-1$ ליחידה, ואת משך הזמן ומספר הנרות.
  - $m$ = ימים קלנדריים לחלק לימים ביחידה (שנה = 365.25 ימים), או מספר נרות.
  - קצב גדול מ-‏999,999% (טווח קצר מאוד שמומר לשנה) מוצג כחסום.
  - ‏`unit` נשמר ב-props של הציור.
- **‏Statistics** (`stats_range`):
  - גוררים טווח, ולשונית Statistics נפתחת לבד.
  - שתי היסטוגרמות, בערך $\sqrt{n}$ תאים כל אחת (בין 5 ל-40), עם העקומה הנורמלית $n\,w\,\varphi$, ‏n, תוחלת, סטיית תקן מדגמית, מינימום ומקסימום.
  - לתשואות גם ערכים שנתיים: התוחלת מוכפלת ב-$k$, וסטיית התקן ב-$\sqrt{k}$, כש-$k$ הוא מספר הנרות בשנה בטווח עצמו.
  - החישוב ב-frontend על הנרות של הגרף, ולכן הוא מכבד ADJ ועוצר בסמן של Replay. ב-Heikin Ashi מוצגת אזהרה.
- **ponytail:** הגדרות Statistics נשארו רק בלשונית (הוסרו מפאנל הגדרות הציור).
- **code-review ‏(high):** שבעה ממצאים, שלושה חשובים. כולם תוקנו:
  - הפאנל דילג על הנר שהעוגן הראשון נמצא בתוכו (כשה-magnet כבוי). עכשיו נכללים הנרות שמכילים את שני העוגנים, כמו בספירה של התווית.
  - מספר הנרות בשנה חושב מהטווח עצמו, ולכן בטווח בלי סוף שבוע או לילה התנודתיות השנתית יצאה מנופחת. עכשיו הוא מחושב מכל הנרות הטעונים.
  - ב-Return שנלחץ מימין לשמאל, שורת השינוי ושורת התשואה השקולה הראו סימנים הפוכים. עכשיו שתיהן מתארות את הכיוון קדימה בזמן.
  - ‏(קטן) משך שלילי בתווית של טווח שנגרר משמאל לימין.
  - ‏(קטן) טווח מוסתר עדיין קבע מה הפאנל מציג.
  - ‏(קטן) ‏`Math.min(...values)` על טווח ארוך מאוד היה עלול לקרוס.
  - ‏(קטן) הופר הכלל של רכיב אחד לכל קובץ.
- **simplify:** לא הורץ. הקוד קטן ואין בו כפילות.
- **בדיקות:**
  - golden model ל-`equivalentReturn` ול-`rangeStats`.
  - בדיקות מודל backend לסוגי ה-props.
  - ‏E2E לשני הכלים: ציור, פאנל, שמירת הגדרות.
  - קובץ ה-E2E של הציורים מנקה עכשיו ציורים שנשארו מבדיקה קודמת.

## P3 F1 — חיזוי OHLC, ה-backend (2026-11-24)
- **בקשת המשתמש:**
  - אינדיקטור שנותן הסתברויות ל-OHLC של k הנרות הבאים, ברגרסיה לינארית.
  - שיהיה עקבי גם בתקופות עבר אחרות.
  - שחיזוי C ישתמש גם בעבר של O, ‏H ו-L.
- **החלטות המשתמש:** מודלים A ‏(OLS) ו-C ‏(Ridge ו-HAR), חיזוי ישיר לכל h, כוונון אוטומטי מחוץ לדגימה, קלטים של p נרות אחרונים ועוד ממוצעי טווח, ורק OHLC.
- **המודל** (`app/analysis/forecast.py`, ‏ADR 0010):
  - ארבעה יעדים לוגריתמיים מול $C_t$: פער, תשואה ושני פתילים. כל צירוף שלהם בונה נר תקין.
  - ‏C: רגרסיית HAR על לוג הטווח קובעת את הסקאלה, ו-ridge על היעדים המנורמלים קובע את המיקום.
  - ההתפלגות היא כל שורות השאריות של האימון יחד, כך שהתלות בין היעדים נשמרת.
  - ‏quantiles של סטטיסטי סדר מאפשרים חישוב וקטורי של האימות, פי 5 מהר יותר.
- **אימות walk-forward** על 500 התחזיות האחרונות, עם אימון מחדש כל 20 נרות:
  - ‏pinball, כיסוי של רצועות 50/80/95, ‏R² מחוץ לדגימה ו-hit rate.
  - הכוונון רץ על 500 הנקודות שלפני זה, כך שהציונים נשארים מחוץ לדגימה.
- **‏API:** ‏`GET /api/forecast`, עם cache של הכוונון ושל התשובות על `app.state` מאחורי lock.
- **מה נמדד:**
  - על random walk הכיסוי נומינלי ו-R² ≈ 0.
  - כשהתנודתיות מקובצת, ‏C טוב מהנאיבי בכ-10% ב-pinball.
  - הכוונון לוקח כשנייה לסימבול.
- **באגים שנמצאו בבדיקות:**
  - ‏hit rate של 0.056 לנאיבי: חציון 0 נספר כטעות. עכשיו נספרות רק תחזיות שבוחרות כיוון.
  - ‏quantiles עם אינטרפולציה לא מתחלפים עם החיתוך ב-0 של הפתילים. עבר ל-`inverted_cdf`.
- **ponytail:** הוסר פרמטר שלא היה בשימוש.
- **code-review ‏(high):** שמונה ממצאים, חמישה חשובים. כולם תוקנו:
  - מפתח ה-cache לא כלל את ערכי הנרות, ולכן נר אחרון שהתעדכן או היסטוריה שהותאמה מחדש לדיבידנד הגישו תחזית ישנה.
  - ה-cache היה גלובלי ובלי lock. עכשיו הוא ב-`app.state`.
  - הכוונון והאימות רצו על אותם נרות (בתוך הדגימה), וזה העדיף את C בגלל הרשת הגדולה יותר. עכשיו כל אחד בקטע נפרד.
  - ‏"הכל" השתמש רק ב-5000 הנרות האחרונים. עכשיו כל ההיסטוריה.
  - חלון ידני של 1–59 החזיר "not enough history". עכשיו הוא נדחה כ-`invalid_params`.
  - ‏(קטן) ‏h גדול מהנתונים קרס.
  - ‏(קטן) הכוונון חזר על עצמו בכל שינוי של k. עכשיו יש לו cache משלו.
  - ‏(קטן) ‏HANDOFF ו-README עודכנו.
- **simplify:** לא הורץ. אין כפילות.

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
| 2026-11-22 | `zustand` pinned ל-`~5.0.16` ולא 5.1.0 | 5.1.0 יצאה שבועיים לפני הסבב. **שודרג ל-`~5.1.0` בסקירת Phase 1 (2026-11-23).** | [0001](docs/adr/0001-stack.md) |
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
| 2026-11-23 | אחרי code review: offset נכלל ב-lookback (`total_lookback`); ב-KAMA ה-lookback לפי `max(fast, slow)` ו-`fast > slow` נדחה; ב-McGinley רמה ≤ 0 מוחלפת ב-EMA (סטייה מכוונת מ-Pine, שמתנודד ל-±1e200) | נכונות חוזה ה-lookback וגרף שמיש | ARCHITECTURE §3.2 |
| 2026-11-23 | **כלל קבוע:** אחרי כל סבב מימוש, מריצים לפי הסדר `ponytail` ← `code-review` ברמת high על ה-commits של הסבב ← `simplify` (רק אם צריך), אלא אם המשתמש אומר אחרת. לא מריצים אותם בסבבי סקירה או הצעות | קוד נקי לאורך כל הפרויקט | CLAUDE.md §9 |
| 2026-11-23 | U1 מתפצל ל-U1a (ליטוש, אנימציות, Undo, חצי מסך, מפת קיצורים) ו-U1b (Watchlist עשיר, `Ctrl+K`, קליק ימני, light/dark, צילום). להישאר עם הצבעים של TV ועם פונט המערכת; תנועה שקטה; תמיכה מ-960px (טלפון לא בהיקף) | בחירת המשתמש אחרי סקירת UX | `.ux-profile.md`, PLAN S6 |
| 2026-11-23 | מחיקת אובייקט בודד מיידית עם Undo ב-toast (בלי חלון אישור); פעולות גורפות (מחיקת כל הציורים, layout) עם חלון אישור שנוקב בשם | כמו ב-TV, ופחות חיכוך | `.ux-profile.md` |
| 2026-11-23 | U1b: נתוני ה-Watchlist (sparkline, טווח יומי ו-52 שבועות) בהרחבה של `/api/quotes`; סטטוס בורסה לפי שעות מסחר בלי חגים; `Ctrl+K` כפלטה חדשה לצד הקיצורים הקיימים; ‏theme כהה כברירת מחדל עם מתג; כפתור המצלמה כתפריט Copy image / Download PNG | בחירת המשתמש | PLAN S6b |
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
- ✅ `auto` נכבה כשגוררים את ציר המחיר ונדלק בלחיצה כפולה עליו (U1a).
- סוג הגרף נשמר אחד לכל הסימבולים (לא לכל סימבול בנפרד). Layouts ב-R6.
- ✅ Chg% ב-Watchlist כבר לא נחתך (U1a: padding צר יותר).
- צילום המסך ב-README עדיין של R0. יוחלף בצילום של גרף עם נתונים אמיתיים אחרי הדמו.
- EMA seeding: TA-Lib זהה לנו עד 1e-9. מול TradingView עצמו עוד לא אומת: צריך למלא את `tv_crosscheck.json` (3 תאריכים לכל ממוצע).
- **מצב `%` עם indicators:** lightweight-charts מחשב אחוזים לכל series מול הערך הראשון הנראה **שלו**, ולא מול המחיר (ב-TradingView הכול יחסי למחיר). לכן במצב `%` קו ה-MA מוזז קצת מהמחיר. במצבים normal ו-log הכול תקין. פתרון אפשרי: לממש את מצב האחוזים ב-`ChartEngine` בעצמנו. ל-U1 או R6.
- בגרף מסוג Line, צבע ברירת המחדל של SMA (`#2962FF`) זהה לצבע הקו של המחיר (כמו ב-TV). אפשר לשנות בפאנל ההגדרות.
- גלישה אופקית מתחת ל-960px (סרגל הכלים העליון). מחוץ להיקף לפי `.ux-profile.md` (תמיכה מ-960px); ב-960 וב-1280 אין גלישה.
- **U1a:** כשמרחפים על שורה ב-legend, ה-histogram של MACD לא מתעמעם, כי הצבעים שלו נשמרים בתוך ה-data ולא ב-options. גם חיצי MA Cross נשארים באותה עוצמה.
- **U1a:** בציר של ה-pane של RSI התוויות (80, ‏40) צפופות, ולפעמים התווית של הערך האחרון מסתירה אותן. זו התנהגות ברירת המחדל של lightweight-charts.
- **R3b:** החיצים של MA Cross קטנים (גודל ברירת המחדל של lightweight-charts), ואי אפשר לשנות את הצבעים שלהם בפאנל. ל-U1.
- **R3b:** כמה צבעי ברירת מחדל חוזרים על עצמם (ה-basis של Envelope, הקו המהיר של MA Cross וקו 2 של ה-Ribbon הם כתומים, כמו ב-TV). אפשר לשנות בפאנל.
- **R3b:** `code-review` הורץ ותוקן (ראה למעלה). `simplify` (PLAN §8) עדיין לא הורץ.
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
- המשך באותו יום: `/code-review high` מצא 6 ממצאים, וכולם תוקנו. בדרך נמצא גם `OverflowError` ב-McGinley ותוקן. 9/9 gates ירוקים, ‏backend 1,118 בדיקות.
- `simplify` על R3b: ניקוי reuse ו-altitude בלי שינוי ערכים (אומת ביט-לביט). 9/9 gates ירוקים, ‏backend 1,119, ‏frontend 167, ‏e2e 6/6.

### 2026-11-23 — S4 / L1: דפי לימוד ו-Filter view
- המשתמש ביקש לממש S4 ו-S5 ברצף, כל אחד עם ponytail ו-code-review. התשובות לשאלות הפתיחה:
  - KaTeX.
  - דפים מלאים עם גזירות.
  - drawer מימין.
  - pane נפרד לכל אוסילטור.
  - כל 15 סוגי ה-MA ל-BB ול-MACD.
  - ‏RSI עם smoothing כבוי כברירת מחדל.
  - ‏Volume SMA על ה-histogram.
- נבנו: endpoint המדידה, ה-drawer, ה-Filter view ו-19 דפים (נכתבו במקביל ע"י 3 agents ונבדקו).

### 2026-11-23 — S5 / R3c: bands ואוסילטורים
- ה-backend נכתב ע"י agent ברקע (8 אינדיקטורים ו-harness מלא), נבדק ושולב. ה-frontend (panes, ‏fills, ‏histogram ו-legends) נכתב ישירות.
- נוסף `requires`, כדי שה-legend של RSI לא יציג "None 14 2" ואת הקווים הכבויים.
- נמצא ותוקן: החיפוש "rsi" הציג EMA ראשון.

### 2026-11-23 — סקירת UX/UI ו-S6a / U1a: מעבר UX ראשון
- ה-session רץ בסביבה "UX/UI Env". סקירה עם ux-audit (15 סקילים) ו-frontend-design, צילומים ב-1280, ‏960 ו-375, ועמוד הצעות עם הדגמות חיות (Artifact).
- שלושה סבבים של שאלות אמריקאיות; כל ההמלצות אומצו, חוץ מהבזק המחיר, שהמשתמש ביקש גם ב-legend.
- מימוש U1a בחמישה commits. ה-E2E תפס באג focus אחרי אנימציית יציאה, וצילום המסך תפס מילוי RSI חזק מדי. שניהם תוקנו.

### 2026-11-23 — S6b / U1b: Watchlist, ‏`Ctrl+K`, ‏theme וצילום
- ארבע שאלות לפני המימוש: הכרטיס מציג את הסימבול שבגרף; הפלטה כוללת פעולות גרף, תצוגה ואינדיקטורים קיימים; הקליק הימני כולל צילום, סקאלות והסרת הכול; הצילום כולל פס כותרת.
- מימוש בשישה commits, ובדיקה ויזואלית ב-light וב-dark, ב-1280 וב-960.

### 2026-11-23 — U1c ו-R4a: ניקוי מבני וכלי ציור, חלק א'
- שאלות לפני המימוש: דיאלוגים מפוצלים (רכיב לכל קובץ); ‏R4 מתפצל ל-R4a ול-R4b; עריכה בסרגל צף ובפאנל צד; תפריט נפתח לכל קבוצת כלים.
- ‏U1c בשלושה commits, ו-R4a בשישה. ה-code-review מצא עשרה ממצאים, וכולם תוקנו עם בדיקות חדשות. אחריו ponytail; ‏simplify לא נדרש.

### 2026-11-23 — R4b: ‏Fib, ערוץ וכלי מדידה
- שאלות לפני המימוש, ל-R4b ול-R5 יחד. ב-R5 המשתמש לא בחר בקווי 52 שבועות.
- בדיקה ויזואלית בדפדפן תפסה באג של R4a: עוגן שנופל באמצע בר צויר ב-x=0. הבאג תוקן.

### 2026-11-23 — R5: מבנה שוק
- ה-backend נכתב ע"י agent ברקע במקביל ל-frontend, עם חוזה API מוגדר מראש. אחרי השילוב כל 9 ה-gates עברו.
- בדיקה ויזואלית: קווי מדרגה שבועיים, נקודות pivot, רשימת gaps, וגלילה ל-gap מ-2009 בלחיצה.

### 2026-11-23 — R6: ‏workspace
- שמונה שאלות לפני המימוש, ל-R6 ול-R7 יחד.
- ה-backend נכתב ע"י agent ברקע. ה-E2E תפס שני דברים: רשימה ריקה נדחתה (תוקן), ו-layout שמור דלף בין בדיקות (נוסף `freshStart`).

### 2026-11-23 — R7: ‏Bar Replay; ‏Phase 1 גמור
- השאלות נשאלו מראש יחד עם R6. בדיקת ה-no-lookahead הכוללת עברה מיד על כל 29 האינדיקטורים.

### 2026-11-23 — סקירת Phase 1
- ארבע שאלות לפני העבודה. בדיקת התיעוד מול הקוד נעשתה ע"י agent, והתיקונים ע"י agent שני. נבדקו ואושרו.

### 2026-11-23 — P2a: פלטפורמת לימוד
- שבע שאלות לפני המימוש, ל-P2a ול-P2b יחד. ה-backend נכתב ע"י agent ברקע; 19 הדפים ע"י שלושה agents במקביל, כל אחד עם תדריך משותף וסקריפט שמריץ את ה-lab offline כדי לאמת כל מספר. לא נמצאה אף טענה קיימת שגויה.

### 2026-11-23 — P2b: אוסילטורים
- המשתמש ביקש לשרשר את P2a ו-P2b בסבב אחד. ה-figure של MACD דרש הרחבה של `/indicators/response` ל-band-pass. ‏agent ה-Combinations מצא שהסיפור המבוקש (trigger משפר את ה-range) לא מחזיק כשמאחדים 200 דגימות, ושינה את הדף בהתאם.

### 2026-11-24 — P2c ו-P2d; ‏Phase 2 גמור
- ארבע שאלות לפני המימוש: ‏VWAP 1h, ‏accumulation, צורת המילון, לוח שנה. התשתית נבנתה ראשונה, והתוכן נכתב ע"י שבעה agents במקביל עם תדריכים משותפים.
- כמה agents הורידו נתוני Yahoo אמיתיים כדי לאמת את התרגילים ואת סטטיסטיקות הנפח. נראה שהגישה ל-Yahoo מהענן פתוחה עכשיו, אבל זה לא נבדק בבדיקות.

### 2026-11-24 — ‏P3: ‏Return ו-Statistics
- המשתמש ביקש להגדיר אינדיקטורים בדיון ולא לכתוב plugins. שמונה שאלות, בעברית לבקשתו, לפני המימוש.

### 2026-11-24 — ‏P3 F1: חיזוי OHLC ‏(backend)
- חמש הצעות (A עד E). המשתמש בחר A ו-C. אחר כך ארבע שאלות ומפרט, שהמשתמש אישר לפני המימוש.
