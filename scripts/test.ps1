<#
.SYNOPSIS
    Run every quality gate: backend (ruff, ruff format, mypy, pytest) and
    frontend (eslint, prettier, tsc, vitest). Exits non-zero if any gate fails.
.EXAMPLE
    .\scripts\test.ps1
#>
. "$PSScriptRoot\_common.ps1"

$steps = @(
    @{ Name = 'backend: ruff check'; Dir = $BackendDir; Cmd = { uv run ruff check . } },
    @{ Name = 'backend: ruff format --check'; Dir = $BackendDir; Cmd = { uv run ruff format --check . } },
    @{ Name = 'backend: mypy'; Dir = $BackendDir; Cmd = { uv run mypy } },
    @{ Name = 'backend: pytest'; Dir = $BackendDir; Cmd = { uv run pytest --cov --cov-report=term-missing:skip-covered } },
    @{ Name = 'frontend: eslint'; Dir = $FrontendDir; Cmd = { npm run --silent lint } },
    @{ Name = 'frontend: prettier'; Dir = $FrontendDir; Cmd = { npm run --silent format:check } },
    @{ Name = 'frontend: tsc'; Dir = $FrontendDir; Cmd = { npm run --silent typecheck } },
    @{ Name = 'frontend: vitest'; Dir = $FrontendDir; Cmd = { npm run --silent test } }
)

$failed = @()
foreach ($step in $steps) {
    if (-not (Invoke-Step $step.Name $step.Dir $step.Cmd)) { $failed += $step.Name }
}

Write-Host ''
if ($failed.Count -gt 0) {
    Write-Host "FAILED: $($failed -join ', ')" -ForegroundColor Red
    exit 1
}
Write-Host "All $($steps.Count) gates passed." -ForegroundColor Green
