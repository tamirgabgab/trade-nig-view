# ChartLab backend

FastAPI service for market data, indicators and analysis. See the repo root `README.md` and
`docs/ARCHITECTURE.md`.

```bash
uv sync                                   # install
uv run python -m uvicorn app.main:app --reload   # dev server on :8000
uv run python -m pytest                          # tests (network is blocked)
uv run python -m ruff check . && uv run python -m ruff format --check . && uv run python -m pyright
```

Always use `uv run python -m <tool>`: Windows Smart App Control blocks the unsigned launcher `.exe` files in `.venv\Scripts`.
