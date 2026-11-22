# HANDOFF — סטטוס חי של ChartLab

> קובץ זה נכתב בעברית (מונחים טכניים, נתיבים ופקודות באנגלית). מתעדכן בסוף כל session.

## מצב נוכחי
- **שלב:** Phase 1 — Stage A (מחקר, ארכיטקטורה, תיעוד) **הושלם**, ממתין לאישור שלך.
- **הסבב הבא:** **R0 — Scaffolding & quality gates** (ראה `docs/ROADMAP.md`).
- **Branch:** `claude/jolly-planck-gd2vdg` (ה-session בענן מחויב לעבוד עליו; `main` עדיין מכיל רק את ה-Initial commit).

## מה נעשה ב-session האחרון (2026-11-22)
- מחקר: אימות גרסאות מול npm/PyPI ואימות מגבלות של providers ו-API של lightweight-charts v5.3 (נבדק מול `typings.d.ts`).
- נכתבו: `docs/TRADINGVIEW_RESEARCH.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/adr/0001`–`0007`,
  `docs/indicators/README.md`, `README.md`, `CLAUDE.md`, `.gitignore`, `.env.example`.

## הצעדים הבאים (R0) — צעדים ראשונים מדויקים
1. לקרוא את `CLAUDE.md`, את הקובץ הזה ואת הסעיף R0 ב-`docs/ROADMAP.md`.
2. ליצור את `backend/pyproject.toml` (uv, `requires-python >=3.12`, ו-`.python-version` = 3.13), ואז `uv sync`.
3. `backend/app/main.py` עם `create_app()` ו-`/api/health`, ו-test שחוסם network sockets.
4. ליצור את ה-frontend עם `npm create vite@latest frontend -- --template react-ts`, ואז ל-pin את `typescript@~6.0.3`.
5. להוסיף shell layout ב-CSS Modules ו-`tokens.css`, ואחריו scripts (`.ps1`/`.sh`) ו-CI.

## יומן החלטות
| תאריך | החלטה | סיבה | ADR |
|---|---|---|---|
| 2026-11-22 | Stack: FastAPI + React/TS + Vite, uv, Python 3.13 | אקוסיסטם נומרי, ידידותי ל-Windows | [0001](docs/adr/0001-stack.md) |
| 2026-11-22 | TypeScript pinned ל-6.0.x | `typescript-eslint` תומך רק ב-`<6.1`, ו-TS 7 הוא ה-latest | [0001](docs/adr/0001-stack.md) |
| 2026-11-22 | lightweight-charts `^5.3.0` מאחורי `ChartEngine` | Apache-2.0, panes ו-primitives | [0002](docs/adr/0002-charting-library.md) |
| 2026-11-22 | Indicators מחושבים ב-backend ב-Python | מימוש אחד לכל ה-phases | [0003](docs/adr/0003-indicators-in-backend.md) |
| 2026-11-22 | מסגרת drawings משלנו על series primitives | הספריות הקהילתיות עדיין v0.x; נדרש schema ו-undo בשליטה שלנו | [0004](docs/adr/0004-own-drawing-framework.md) |
| 2026-11-22 | Bar cache ב-SQLite (ולא Parquet) | upserts אינקרמנטליים, בלי תלות נוספת | [0005](docs/adr/0005-bar-cache-format.md) |
| 2026-11-22 | yfinance כ-default, Tiingo כ-fallback, fixtures ל-offline | Stooq דורש עכשיו API key | [0006](docs/adr/0006-default-data-provider.md) |
| 2026-11-22 | CSS Modules ו-CSS custom properties (לא Tailwind) | אותם tokens משמשים גם את ה-canvas, בלי תלות | [0007](docs/adr/0007-styling.md) |
| 2026-11-22 | EMA עם SMA seed (קונבנציית TA-Lib) | השגיאה דועכת כמו $(1-\alpha)^k$; יאומת מול TV ב-R3 | research §5 |
| 2026-11-22 | Bollinger עם population σ | ברירת המחדל של Pine `ta.stdev` היא `biased=true` | research §5 |

## שאלות פתוחות אליך
1. **Futures/Forex בווטצ'ליסט:** בצילום המסך יש USOIL, SILVER, GOLD, USDJPY, GBPUSD ו-DXY. להוסיף ל-universe את `CL=F`, `SI=F`, `GC=F`, `JPY=X`, `GBPUSD=X` ו-`DX-Y.NYB` (מ-Yahoo בלבד)?
2. **Tiingo key:** יש לך, או שתפתח חשבון חינמי? בלי key, ה-fallback יהיה רק cache ו-fixtures.
3. **Fixtures:** לייצר אותם ב-R1 מתוך הסביבה בענן (אם Yahoo לא יחסום), או שתריץ `scripts/make_fixtures.py` אצלך ב-Windows?
4. **Python 3.13** במקום 3.12: מקובל? (`uv` מתקין אותו בשבילך.)
5. **Branch:** לפתוח PR מ-`claude/jolly-planck-gd2vdg` ל-`main` בסוף כל round, או לעבוד על ה-branch ולמזג מתי שתחליט?
6. **CI על windows-latest:** לכלול (איטי יותר, אבל תופס בעיות PowerShell ו-CRLF), או רק ubuntu?
7. **מקור "Moving average crossover 9/21" מהצילום:** זה indicator מובנה, community script או script שלך? כרגע מתוכנן `MA Cross` עם SMA או EMA לבחירה, ו-markers ב-R3.

## בעיות ידועות / tech debt
- אין עדיין קוד.
- EMA seeding מול TradingView לא אומת מול המקור הרשמי של Pine (יאומת ב-cross-check ב-R3).
- המגבלות של yfinance לא מתועדות; צפויים 429 מדי פעם.

## הערות סביבה
- גרסאות שאומתו ב-2026-11-22: lightweight-charts 5.3.0, React 19.3, Vite 8.3, TypeScript 6.0.3 (pinned), Zustand 5.1,
  TanStack Query 5.108, Vitest 5.1, Playwright 1.65, ESLint 10, typescript-eslint 8.73;
  Python: FastAPI 0.165, pydantic 2.14, pandas 3.1, numpy 2.5 (דורש Python ≥3.12), yfinance 1.8.0, ta-lib 0.8.3 (יש wheels ל-Windows),
  pytest 9.2, hypothesis 6.170, ruff 0.17, mypy 2.4, uv 0.13.
- Keys אופציונליים: `TIINGO_API_KEY`, `TWELVEDATA_API_KEY`, `MASSIVE_API_KEY`, `STOOQ_API_KEY` (ב-`.env` בלבד).
- Windows: צריך `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` כדי להריץ scripts. בעיות CRLF ייפתרו עם `.gitattributes` ב-R0.

## יומן sessions
### 2026-11-22 — Stage A
- ה-repo היה ריק (רק `README.md`). בוצעו A1–A8: מחקר, כל מסמכי התיעוד, `.gitignore` ו-`.env.example`, ו-commit.
- ממצאים עיקריים: Stooq דורש key; TS 7 לא נתמך על ידי typescript-eslint; pandas-ta בסיכון ארכוב, ולכן TA-Lib משמש כ-reference;
  lightweight-charts 5.3.0 תואם את ה-API שתיארת.
- הבא: R0 אחרי שתאשר ותענה על השאלות הפתוחות.
