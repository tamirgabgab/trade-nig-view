# ruff: noqa: PLC0415, S101, PLR2004
# Lazy imports are the point (each package is probed in isolation); asserts are the checks.
"""Check that the native (compiled) Python packages ChartLab needs can load on this machine.

Windows Smart App Control blocks unsigned DLL/.pyd files it has no reputation for. Run this before
relying on a new native dependency. It runs in a throw-away environment and does not touch the
project:

    uv run --no-project --with numpy --with pandas --with yfinance --with ta-lib `
        python scripts/check_native.py --network

Exit code 0 = every required check passed.
"""

from __future__ import annotations

import argparse
import platform
import sys
from collections.abc import Callable

Status = tuple[str, str]  # (OK | BLOCKED | ERROR, detail)


def _numpy() -> str:
    import numpy as np

    values = np.arange(1.0, 101.0)
    assert float(values.mean()) == 50.5
    assert abs(float(np.linalg.det(np.eye(3) * 2.0)) - 8.0) < 1e-12
    return f"numpy {np.__version__}"


def _pandas() -> str:
    import pandas as pd

    index = pd.date_range("2026-01-05", periods=10, freq="B")
    frame = pd.DataFrame({"close": range(10)}, index=index)
    weekly = frame.resample("W-FRI").last()
    assert list(weekly["close"]) == [4, 9]
    return f"pandas {pd.__version__}"


def _curl_cffi() -> str:
    import curl_cffi
    from curl_cffi import requests as _requests  # noqa: F401  (loads the native libcurl binding)

    return f"curl_cffi {curl_cffi.__version__}"


def _lxml() -> str:
    from lxml import etree

    assert etree.fromstring("<a><b>1</b></a>").findtext("b") == "1"
    return f"lxml {'.'.join(map(str, etree.LXML_VERSION))}"


def _protobuf() -> str:
    from google.protobuf import __version__
    from google.protobuf.internal import api_implementation

    return f"protobuf {__version__} (backend: {api_implementation.Type()})"


def _yfinance() -> str:
    import yfinance

    return f"yfinance {yfinance.__version__}"


def _talib() -> str:
    import numpy as np
    import talib

    sma = talib.SMA(np.arange(1.0, 11.0), timeperiod=3)
    assert abs(float(sma[-1]) - 9.0) < 1e-12
    return f"ta-lib {talib.__version__}"


REQUIRED: list[tuple[str, Callable[[], str]]] = [
    ("numpy", _numpy),
    ("pandas", _pandas),
    ("curl_cffi (used by yfinance)", _curl_cffi),
    ("protobuf (used by yfinance)", _protobuf),
    ("yfinance", _yfinance),
]
OPTIONAL: list[tuple[str, Callable[[], str]]] = [
    ("lxml (yfinance HTML parsing, not needed for prices)", _lxml),
    ("ta-lib (test-only reference model, R3)", _talib),
]


def run(check: Callable[[], str]) -> Status:
    try:
        return "OK", check()
    except ImportError as exc:
        text = str(exc)
        if "Application Control" in text or "blocked" in text.lower():
            return "BLOCKED", text
        return "ERROR", text
    except Exception as exc:  # report any failure, never crash the checker
        return "ERROR", f"{type(exc).__name__}: {exc}"


def network_check() -> Status:
    """Download 5 daily AAPL bars from Yahoo to prove yfinance works from this IP."""
    try:
        import yfinance

        frame = yfinance.Ticker("AAPL").history(period="5d", interval="1d", auto_adjust=False)
        if frame.empty:
            return "ERROR", "Yahoo returned no rows (possible rate limit)"
        last = frame.iloc[-1]
        return "OK", f"{len(frame)} bars, last {frame.index[-1].date()} close {last['Close']:.2f}"
    except Exception as exc:
        return "ERROR", f"{type(exc).__name__}: {exc}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--network", action="store_true", help="also fetch 5 AAPL bars from Yahoo")
    args = parser.parse_args()

    print(f"Python {platform.python_version()} at {sys.executable}")
    print(f"Platform: {platform.platform()}\n")

    failed = False
    for group, checks in (("REQUIRED", REQUIRED), ("OPTIONAL", OPTIONAL)):
        print(group)
        for name, check in checks:
            status, detail = run(check)
            print(f"  [{status:7}] {name}: {detail}")
            if group == "REQUIRED" and status != "OK":
                failed = True
        print()

    if args.network:
        status, detail = network_check()
        print(f"NETWORK\n  [{status:7}] Yahoo AAPL 5d: {detail}\n")

    print("RESULT: " + ("FAIL - see BLOCKED/ERROR lines above" if failed else "ALL REQUIRED OK"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
