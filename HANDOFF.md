# HANDOFF — סטטוס חי של ChartLab

> קובץ זה נכתב בעברית (מונחים טכניים, נתיבים ופקודות באנגלית). מתעדכן בסוף כל session.

## מצב נוכחי
- **שלב:** Phase 1. **R0 — Scaffolding & quality gates** הושלם ואומת על המחשב שלך (Windows 11, Smart App Control דלוק): `dev.ps1` עובד ו-`test.ps1` עבר 8/8. ממתין לאישור שלך.
- **הסבב הבא:** **R1 — Market data layer** (ראה `docs/ROADMAP.md`).
- **Branch:** `claude/jolly-planck-gd2vdg`. `main` עדיין מכיל רק את ה-Initial commit; עוד לא נפתח PR.

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

## יומן החלטות
| תאריך | החלטה | סיבה | ADR |
|---|---|---|---|
| 2026-11-22 | Stack: FastAPI + React/TS + Vite, uv, Python 3.13 | אקוסיסטם נומרי, ידידותי ל-Windows | [0001](docs/adr/0001-stack.md) |
| 2026-11-22 | TypeScript pinned ל-6.0.x | `typescript-eslint` תומך רק ב-`<6.1` | [0001](docs/adr/0001-stack.md) |
| 2026-11-22 | lightweight-charts `^5.3.0` מאחורי `ChartEngine` | Apache-2.0, panes ו-primitives | [0002](docs/adr/0002-charting-library.md) |
| 2026-11-22 | Indicators מחושבים ב-backend ב-Python | מימוש אחד לכל ה-phases | [0003](docs/adr/0003-indicators-in-backend.md) |
| 2026-11-22 | מסגרת drawings משלנו על series primitives | הספריות הקהילתיות עדיין v0.x | [0004](docs/adr/0004-own-drawing-framework.md) |
| 2026-11-22 | Bar cache ב-SQLite | upserts אינקרמנטליים, בלי תלות נוספת | [0005](docs/adr/0005-bar-cache-format.md) |
| 2026-11-22 | yfinance כ-default, Tiingo כ-fallback, fixtures ל-offline | Stooq דורש עכשיו API key | [0006](docs/adr/0006-default-data-provider.md) |
| 2026-11-22 | CSS Modules ו-CSS custom properties | אותם tokens משמשים גם את ה-canvas | [0007](docs/adr/0007-styling.md) |
| 2026-11-22 | EMA עם SMA seed; Bollinger עם population σ | קונבנציות של TA-Lib ו-Pine | research §5 |
| 2026-11-22 | `httpx2` כ-HTTP client (ל-tests ול-providers) | Starlette 1.x הוציא את `httpx` ל-deprecation | [0001 amendment](docs/adr/0001-stack.md) |
| 2026-11-22 | `lucide-react` לאייקונים | קל ו-tree-shaken, בלי assets קנייניים | [0001 amendment](docs/adr/0001-stack.md) |
| 2026-11-22 | Defaults לשאלות הפתוחות (עד שתשנה): Python 3.13; CI ubuntu ו-windows; Futures ו-Forex ב-universe; בלי PR ל-`main` עד שתבקש; fixtures ייוצרו בענן ב-R1 | ענית "בוא נתחיל" בלי לבחור | — |
| 2026-11-22 | במחשב של המשתמש: הכול נשאר ב-Windows ו-Smart App Control דלוק. משתמשים ב-**Python הרשמי מ-python.org** (חתום על ידי PSF) במקום ה-Python של uv, עם `UV_PYTHON_PREFERENCE=only-system`; ו-`uvicorn` בלי `[standard]` | SAC חסם את `_socket.pyd` של ה-Python של uv ואת ה-launcher `uvicorn.exe`. WSL נשקל ונדחה על ידי המשתמש (רוצה הכול ב-Windows). פתוח: האם SAC יאפשר `.pyd` של צד שלישי (`pydantic_core`, בהמשך `numpy`) | — |
| 2026-11-22 | `pyright` strict במקום `mypy` | `mypy` 2.x תלוי ב-`librt` הבינארי, ש-SAC חוסם. ל-`pyright` אין קבצים בינאריים (JavaScript על Node החתום) | [0001 amendment 2](docs/adr/0001-stack.md) |
| 2026-11-22 | כלל לתלויות חדשות: להעדיף Python טהור או wheels נפוצים, ולאמת כל native extension חדש ב-`test.ps1` אצל המשתמש. ב-R1 מאמתים קודם כול את numpy ואת pandas | SAC במחשב של המשתמש | [0001 amendment 2](docs/adr/0001-stack.md) |

## שאלות פתוחות אליך
1. **Tiingo key** (נדרש רק ל-R1, ולא חוסם): יש לך, או שתפתח חשבון חינמי?
2. **מקור ה-"Moving average crossover 9/21"** מהצילום (נדרש ל-R3).
3. האם הלוק של ה-shell מקובל עליך (צבעים, צפיפות, רוחב ה-sidebar)? עדיף לשנות עכשיו מאשר אחרי R2.

## בעיות ידועות / tech debt
- ✅ ה-`.ps1` scripts אומתו ב-CI על `windows-latest` תחת PowerShell 5.1 (run #3 ירוק). הריצה הראשונה נכשלה בגלל התנגשות שמות `Clock.tsx`/`clock.ts` ב-file system שלא מבחין בין אותיות גדולות לקטנות. תוקן, ונוסף כלל ל-`CLAUDE.md`.
- ה-TS types של ה-API עדיין כתובים ידנית (`api/health.ts`). generation מ-OpenAPI ייכנס ב-R1.
- ה-watchlist סטטי, וה-range/scale toggles הם UI state בלבד. הם יחוברו ל-chart ב-R2.
- EMA seeding מול TradingView לא אומת מול המקור הרשמי של Pine (יאומת ב-R3).
- Vitest מדווח שה-jsdom environment נוצר 5 פעמים (אופטימיזציה אופציונלית, לא דחוף).

## הערות סביבה
- **Smart App Control ב-Windows של המשתמש** חוסם קבצי `.exe` לא חתומים שנוצרים ב-`.venv\Scripts` (os error 4551). לכן כל הכלים רצים דרך `uv run python -m <tool>`. הסקריפטים ו-`CLAUDE.md` עודכנו בהתאם. ל-`ruff.exe` (binary מ-PyPI) עדיין לא ברור אם ייחסם; ייבדק בהרצה של `test.ps1` אצל המשתמש.
- גרסאות בשימוש: Python 3.13, FastAPI 0.165, Starlette 1.10, pydantic 2.14, uvicorn 0.54, httpx2 2.16, ruff 0.17, pyright 1.1.414 (רץ על Node),
  pytest 9.2; Node 22, Vite 8.3, React 19.3, TypeScript 6.0.3, ESLint 10, typescript-eslint 8.73, Vitest 5.1,
  TanStack Query 5.108, lucide-react 1.77.
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
- הבא: R1 אחרי אישור.
