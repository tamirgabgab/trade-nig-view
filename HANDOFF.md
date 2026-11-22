# HANDOFF — סטטוס חי של ChartLab

> קובץ זה נכתב בעברית (מונחים טכניים, נתיבים ופקודות באנגלית). מתעדכן בסוף כל session.

## מצב נוכחי
- **שלב:** Phase 1. R0, R1a ו-R2a הושלמו. **R1b (1h ו-4h, שעון ישראל, futures, OpenAPI types, סקריפט fixtures) הושלם** (2026-11-22) ונבדק בענן על נתוני הבדיקה. **ממתין לדמו אצל המשתמש: הרצת `make-fixtures.ps1` ובדיקת 1h/4h עם נתונים אמיתיים.**
- **הסבב הבא:** **R2b** (S1 ב-[PLAN.md](PLAN.md)). **סדר ה-sessions הבאים, המלצת מודל ו-effort לכל אחד, ממצאי סקירת ה-UX והמתמטיקה של משפחת הממוצעים הנעים נמצאים ב-[PLAN.md](PLAN.md).** אחרי R2b: R3a (מנוע indicators ו-SMA/EMA/WMA/RMA), R3b (ממוצעים מוכללים), L1 (דפי לימוד), R3c, U1.
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
| 2026-11-22 | `PLAN.md` כתוכנית העבודה ל-sessions הבאים: R3 מתפצל ל-R3a/R3b/R3c, ו-L1 (דפי לימוד לממוצעים) ו-U1 (UX) נכנסים לפני R4 | בקשת המשתמש להתמקד בממוצעים נעים ובמתמטיקה שלהם וב-UX | [PLAN.md](PLAN.md) |

## שאלות פתוחות אליך
1. **מקור ה-"Moving average crossover 9/21"** מהצילום (נדרש ל-R3).
2. החלטות D1–D6 ב-[PLAN.md §7](PLAN.md#7-decisions-needed-from-the-user): סדר הסבבים, TA-Lib כתלות בדיקות אופציונלית, KaTeX מול Temml, ממוצעים שאינם ב-TV (KAMA, T3, ZLEMA), ופאנל הגדרות חי מול חלון OK/Cancel.

## בעיות ידועות / tech debt
- ✅ **GOLD, SILVER ו-USOIL** (spot ב-TV מול futures אצלנו): נפתר ב-R1b בשינוי השם ל-`GC1!`/`SI1!`/`CL1!`. להשוואה ב-TradingView יש לפתוח `COMEX:GC1!`, `COMEX:SI1!`, `NYMEX:CL1!`. בימי roll השינוי היומי של continuous futures עדיין חריג (כך גם ב-TV).
- **1h לא אומת עם Yahoo אמיתי** (אין גישה מהענן). לבדוק בדמו: AAPL, `GC1!`, SPX ו-GBPUSD. אם Yahoo לא מחזיר 1h לסימבול מסוים, תוצג שגיאה ברורה בגרף.
- חלון ה-1h של ה-fixtures (2026-08-01 עד 2026-10-30) ייצא ממגבלת 730 הימים של Yahoo באמצע 2028. אז צריך להזיז אותו ב-`make_fixtures.py`.
- ייבוא של `app.main` יוצר את `app = create_app()` ברמת המודול, ולכן גם `openapi_export` ו-tests יוצרים את `data/bars.db` (gitignored). לא מזיק; אפשר לעבור ל-`uvicorn --factory` בהזדמנות.
- הבדלים קטנים ב-DJI (0.01%), ב-DXY וב-Forex (Yahoo ו-TV חותכים את היום בשעות שונות). מניות, ETFs, SPX, NDX ו-VIX זהים ל-TV עד הסנט.
- **אין גישה ל-Yahoo מסביבת הענן של Claude** (ה-proxy מחזיר `403`). ה-fixtures וה-recorded responses ייווצרו על המחשב של המשתמש באמצעות סקריפט שירוץ אצלו.
- **ה-fixtures עדיין לא בריפו.** הם ייכנסו כשהמשתמש יריץ `.\scripts\make-fixtures.ps1`. עד אז הבדיקות משתמשות בנתונים קטנים שנבנו ידנית (`backend/tests/fixtures/`), `test_committed_fixtures.py` מדלג, ומצב `OFFLINE=1` עם ה-universe האמיתי לא יעבוד.
- הגישה ל-Yahoo מתבצעת רק מהמחשב של המשתמש. כאן בענן היא חסומה, ולכן בדקתי את `YahooProvider` עם DataFrame מזויף בפורמט של yfinance.
- ✅ ה-`.ps1` scripts אומתו ב-CI על `windows-latest` תחת PowerShell 5.1 (run #3 ירוק). הריצה הראשונה נכשלה בגלל התנגשות שמות `Clock.tsx`/`clock.ts` ב-file system שלא מבחין בין אותיות גדולות לקטנות. תוקן, ונוסף כלל ל-`CLAUDE.md`.
- ✅ ה-TS types של ה-API נוצרים מ-OpenAPI (R1b).
- ה-range buttons וה-scale toggles (`%`, `log`, `auto`, `ADJ`) בסרגל התחתון עדיין UI state בלבד. הם יחוברו לגרף ב-R2b.
- בעמודת Chg% ב-Watchlist המספר נחתך מימין כשהמחירים ארוכים (למשל 12,912.115 בנתונים הסינתטיים). עם מחירים אמיתיים זה לא קרה; לבדוק ב-R2b.
- צילום המסך ב-README עדיין של R0. יוחלף בצילום של גרף עם נתונים אמיתיים אחרי הדמו.
- EMA seeding מול TradingView לא אומת מול המקור הרשמי של Pine (יאומת ב-R3).
- Vitest מדווח שה-jsdom environment נוצר 5 פעמים (אופטימיזציה אופציונלית, לא דחוף).

## הערות סביבה
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
