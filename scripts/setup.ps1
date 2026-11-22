<#
.SYNOPSIS
    Install backend (uv) and frontend (npm) dependencies and create .env if missing.
.EXAMPLE
    .\scripts\setup.ps1
#>
. "$PSScriptRoot\_common.ps1"

Assert-Command 'uv' 'Install: powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
Assert-Command 'node' 'Install Node.js 22 LTS or newer from https://nodejs.org'
Assert-Command 'npm' 'npm ships with Node.js.'

$envFile = Join-Path $RepoRoot '.env'
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $RepoRoot '.env.example') $envFile
    Write-Host 'Created .env from .env.example (all keys optional).'
}

$ok = Invoke-Step 'Backend: uv sync' $BackendDir { uv sync }
if (-not $ok) { throw 'uv sync failed' }

$ok = Invoke-Step 'Frontend: npm ci' $FrontendDir { npm ci }
if (-not $ok) { throw 'npm ci failed' }

Write-Host "`nSetup complete. Next: .\scripts\dev.ps1" -ForegroundColor Green
