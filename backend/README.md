# ChartLab backend

FastAPI service for market data, indicators and analysis. See the repo root `README.md` and
`docs/ARCHITECTURE.md`.

```bash
uv sync                                   # install
uv run uvicorn app.main:app --reload      # dev server on :8000
uv run pytest                             # tests (network is blocked)
uv run ruff check . && uv run ruff format --check . && uv run mypy
```
