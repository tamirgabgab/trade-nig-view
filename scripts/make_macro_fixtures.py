"""Download every macro series from the Bank of Israel into the offline fixtures.

Run from ``backend/`` (the BoI API is public; no key)::

    uv run python ../scripts/make_macro_fixtures.py

Writes ``backend/fixtures/macro/<id>.csv`` (``date,value``), the snapshot ``OFFLINE=1`` serves.
"""

from __future__ import annotations

import sys

from app.config import REPO_ROOT
from app.data.providers.base import ProviderError
from app.macro.boi import BoiSource
from app.macro.fixtures import write_macro_fixture
from app.macro.series import SERIES

OUT_DIR = REPO_ROOT / "backend" / "fixtures" / "macro"


def main() -> int:
    source = BoiSource()
    failures = 0
    for spec in SERIES.values():
        try:
            series = source.fetch(spec)
        except ProviderError as exc:
            failures += 1
            print(f"FAIL {spec.id:26} {exc}")
            continue
        write_macro_fixture(OUT_DIR / f"{spec.id}.csv", series)
        first, last = series.days[[0, -1]].astype("datetime64[D]")
        print(f"OK   {spec.id:26} {len(series):6} values {first} .. {last}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
