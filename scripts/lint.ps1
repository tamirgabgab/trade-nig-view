<#
.SYNOPSIS
    Auto-fix lint and formatting issues (ruff --fix, ruff format, eslint --fix, prettier --write).
.EXAMPLE
    .\scripts\lint.ps1
#>
. "$PSScriptRoot\_common.ps1"

Invoke-Step 'backend: ruff check --fix' $BackendDir { uv run python -m ruff check --fix . } | Out-Null
Invoke-Step 'backend: ruff format' $BackendDir { uv run python -m ruff format . } | Out-Null
Invoke-Step 'frontend: eslint --fix' $FrontendDir { npx eslint . --fix } | Out-Null
Invoke-Step 'frontend: prettier --write' $FrontendDir { npm run --silent format } | Out-Null
Write-Host 'Done. Run .\scripts\test.ps1 to verify.' -ForegroundColor Green
