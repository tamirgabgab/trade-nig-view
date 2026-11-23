# On Balance Volume (`obv`)

Joe Granville's running total of volume: a bar's volume is added when it closes higher than the previous bar and
subtracted when it closes lower.

## Formula

$$
OBV_0 = 0, \qquad OBV_t = OBV_{t-1} + \operatorname{sign}(C_t - C_{t-1})\,V_t
$$

## Kernel, lag and noise
Not a filter of the price: a cumulative sum (an integrator) of signed volume. It has no lag and no warm-up, and it
never forgets: every bar since the start of the history is in it.

## Defaults
No inputs.

## Warm-up
First valid bar index: 0.

## Filter view
Not offered (not a moving average).

## What it measures
Whether volume flows in on up days or on down days. Only the shape matters: rising OBV while price is flat is read as
accumulation, a falling OBV under a rising price as a divergence.

## Differences vs TradingView
- Same as TradingView's built-in (`ta.obv`, 0 on the first bar). TA-Lib starts at $V_0$ instead, a constant offset.

## Pitfalls
- The level depends on where the history starts: two tools with different history give curves that differ by a
  constant. ChartLab always computes it over the whole loaded history, so values do not change when older bars load.
- Symbols without volume (indices, forex) give a flat line at 0.
