# ADR 0008 — TypeScript API types generated with openapi-typescript

- Status: Accepted (2026-11-22)

## Context
The API contract (`docs/ARCHITECTURE.md §4`) says response types are generated from the backend OpenAPI schema into
`frontend/src/api/schema.ts`, never written by hand. Until R1b the frontend parsers read fields by string name, so a
renamed backend field (for example `has_more_before`) would silently read `undefined`.

## Decision
- `backend/app/openapi_export.py` writes the FastAPI schema to `frontend/src/api/openapi.json` (built with isolated
  settings: no `.env`, temporary data directory).
- `openapi-typescript` **7.13.x** (dev dependency) turns it into `schema.ts` (`npm run gen:api`;
  `scripts/gen-api.ps1` / `.sh` run both steps).
- Freshness gates: a backend test compares the committed JSON with the live schema; `npm run check:api`
  (`openapi-typescript --check`, a gate in `scripts/test.*`) compares `schema.ts` with the JSON.
- The runtime parsers stay (every response is still validated), but read fields through `fieldsOf<Schemas[...]>()`,
  which only accepts keys of the generated type, so a contract change breaks `tsc`.
- openapi-typescript 7.x declares the peer dependency `typescript ^5.x`; we use TypeScript 6.0. `package.json`
  `overrides` maps its `typescript` to ours (`"$typescript"`). It only uses the stable compiler factory API to print
  the AST; generation and `--check` were verified with TS 6.0.3.

## Consequences
- + Contract drift is caught by tests on both sides; no hand-written duplicate of the API types.
- + Small, dev-only dependency (no runtime code shipped).
- − Two generated files must be committed after a backend model change (the gates say which command to run).
- − The `overrides` entry must be revisited when openapi-typescript 8 (or a TS 6 peer range) ships.

## Alternatives
- `openapi-fetch` / generated clients: also replace the fetch layer; more than we need. Rejected for now.
- Hand-written interfaces + a contract test: duplicate types that drift. Rejected.
- `orval` / `@hey-api/openapi-ts`: larger, generate client code and hooks. Rejected (heavier than needed).
