#!/usr/bin/env bash
# Download the newest 1m, 5m and 1h bars of every watchlist symbol into the local cache (Yahoo
# keeps 1m for 30 days and 5m for 60; the cache keeps everything). Run daily, e.g. from cron.
. "$(dirname "$0")/_common.sh"
cd "$BACKEND_DIR" && uv run python -m app.data.collect
