# Python strategies

Each `.py` file here (except files starting with `_`) is a strategy the Strategy tab lists under **Python files**.
A file is imported again whenever it changes, so edit it and press **Show signals** again.

```python
import numpy as np

SPEC = {
    "description": "One line shown in the Strategy tab",
    "params": {
        # type: int | float | bool; min and max are optional; label defaults to the name
        "length": {"type": "int", "default": 20, "min": 2, "max": 400, "label": "Length"},
    },
}


def signals(bars, params, ind):
    ma = ind("sma", length=params["length"])["ma"]  # on the decision bars
    weekly = ind("sma", interval="1W", length=30)["ma"]  # a context interval of the profile
    return {
        "long_entry": (bars.close > ma) & (bars.close > weekly),
        "long_exit": bars.close < ma,
        "short_entry": (bars.close < ma) & (bars.close < weekly),
        "short_exit": bars.close > ma,
    }
```

- `bars`: the decision bars, with read-only numpy columns `time`, `open`, `high`, `low`, `close`, `adj_close`,
  `volume` (and `session` on intraday bars).
- `params`: the values from the Strategy tab, checked against `SPEC`.
- `ind(id, interval=None, **params)`: any indicator of the app (the same code the chart draws), as a dict of output
  arrays aligned to `bars`. With `interval` (one of the profile's context intervals, e.g. `"1W"` for Position), a value
  arrives on the first bar after its context bar has closed.
- Return any of `long_entry`, `long_exit`, `short_entry`, `short_exit`, one boolean per bar. A missing key never fires.

Rules:

- **Bar `t` may use only bars up to `t`.** Every run is repeated on shorter histories; if an early signal changes when
  later bars are added, the run is refused with the bar where it changed. Random numbers count as a change: seed them.
- The file runs inside the app with your user's rights. Only put code here that you wrote or read.
- Errors are shown in the Strategy tab with the file and line.
