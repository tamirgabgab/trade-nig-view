"""Write the OpenAPI schema to ``frontend/src/api/openapi.json``.

Run from ``backend/``: ``uv run python -m app.openapi_export``. The frontend turns the file into
TypeScript types with ``npm run gen:api`` (``src/api/schema.ts``); ``scripts/gen-api.ps1`` / ``.sh``
run both steps. Tests fail when either committed file is out of date.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
from typing import Any

from app.config import REPO_ROOT, Settings

OPENAPI_FILE = REPO_ROOT / "frontend" / "src" / "api" / "openapi.json"


def openapi_schema() -> dict[str, Any]:
    """OpenAPI document of the app, built with isolated settings (no ``.env``, no repo data dir)."""
    from app.main import create_app  # noqa: PLC0415 (keeps this module import-light)

    with tempfile.TemporaryDirectory(prefix="chartlab-openapi-") as tmp:
        settings = Settings(_env_file=None, offline=True, chartlab_data_dir=Path(tmp))  # pyright: ignore[reportCallIssue]
        return create_app(settings).openapi()


def openapi_text() -> str:
    """The schema as committed: 2-space JSON, key order as FastAPI emits it, trailing newline."""
    return json.dumps(openapi_schema(), indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    OPENAPI_FILE.write_text(openapi_text(), encoding="utf-8", newline="\n")
    sys.stdout.write(f"Wrote {OPENAPI_FILE.relative_to(REPO_ROOT).as_posix()}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
