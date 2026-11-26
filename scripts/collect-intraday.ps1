<#
.SYNOPSIS
    Download the newest 1m, 5m and 1h bars of every watchlist symbol into the local cache.
.DESCRIPTION
    Yahoo keeps 1m bars for 30 days and 5m bars for 60; ChartLab's cache keeps every bar it ever
    downloaded. Running this once a day (install-collector.ps1 schedules it) makes the minute
    history grow without gaps, even on days the app stays closed. The output is also appended to
    data\collect-intraday.log.
.EXAMPLE
    .\scripts\collect-intraday.ps1
#>
. "$PSScriptRoot\_common.ps1"
Assert-Command 'uv' 'Run .\scripts\setup.ps1 first.'

$log = Join-Path $RepoRoot 'data\collect-intraday.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
Add-Content -Path $log -Value "`n=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="
Push-Location $BackendDir
try {
    # 'python -m', never the uv launcher .exe (blocked by Smart App Control).
    uv run python -m app.data.collect | Tee-Object -FilePath $log -Append
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
