<#
.SYNOPSIS
    Bring this ChartLab checkout up to date: fast-forward pull of the current branch, then
    reinstall dependencies only if the lock files changed (or were never installed).
.DESCRIPTION
    Safe by design:
      - Only 'git pull --ff-only': never merges, never rewrites local work.
      - If the pull fails (offline, local changes in the way, no upstream), ChartLab keeps
        running the version already on disk and a warning is printed.
      - Exit code 1 only when installing dependencies fails (the app would not start).
    The desktop shortcut runs this automatically (dev.ps1 -Open).
.EXAMPLE
    .\scripts\update.ps1
#>
. "$PSScriptRoot\_common.ps1"

function Write-Warn([string]$Text) {
    Write-Host "WARNING: $Text" -ForegroundColor Yellow
}

function Get-Head {
    $head = git -C $RepoRoot rev-parse HEAD
    if ($LASTEXITCODE -ne 0) { return $null }
    return "$head".Trim()
}

function Update-Code {
    # Returns the list of changed files ($null when nothing was pulled).
    if (-not (Get-Command 'git' -ErrorAction SilentlyContinue)) {
        Write-Warn 'git is not installed: skipping the update.'
        return $null
    }
    $before = Get-Head
    if ($null -eq $before) {
        Write-Warn 'This folder is not a git checkout: skipping the update.'
        return $null
    }

    Write-Host '==> Checking GitHub for updates...' -ForegroundColor Cyan
    $env:GIT_TERMINAL_PROMPT = '0'  # never hang on a credentials prompt
    git -C $RepoRoot pull --ff-only | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Warn 'Could not download updates (see the message above). Starting the version already on this computer.'
        return $null
    }

    $after = Get-Head
    if ($after -eq $before) {
        Write-Host '==> Already up to date' -ForegroundColor Green
        return $null
    }
    $changed = @(git -C $RepoRoot diff --name-only $before $after)
    $count = "$(git -C $RepoRoot rev-list --count "$before..$after")".Trim()
    Write-Host "==> Updated: $count new commit(s), $($changed.Count) file(s) changed" -ForegroundColor Green
    git -C $RepoRoot log --oneline --no-decorate "$before..$after" | Out-Host
    return $changed
}

function Test-Changed([string[]]$Changed, [string[]]$Paths) {
    foreach ($path in $Paths) {
        if ($Changed -contains $path) { return $true }
    }
    return $false
}

$changed = @(Update-Code)

$backendNeeded = (-not (Test-Path (Join-Path $BackendDir '.venv'))) -or
    (Test-Changed $changed @('backend/uv.lock', 'backend/pyproject.toml', 'backend/.python-version'))
$frontendNeeded = (-not (Test-Path (Join-Path $FrontendDir 'node_modules'))) -or
    (Test-Changed $changed @('frontend/package-lock.json', 'frontend/package.json'))

if ($backendNeeded) {
    Assert-Command 'uv' 'Run .\scripts\setup.ps1 first.'
    if (-not (Invoke-Step 'Backend libraries changed: uv sync' $BackendDir { uv sync })) {
        Write-Host 'ERROR: uv sync failed (see above).' -ForegroundColor Red
        exit 1
    }
}
if ($frontendNeeded) {
    Assert-Command 'npm' 'Run .\scripts\setup.ps1 first.'
    if (-not (Invoke-Step 'Frontend libraries changed: npm ci' $FrontendDir { npm ci })) {
        Write-Host 'ERROR: npm ci failed (see above).' -ForegroundColor Red
        exit 1
    }
}
exit 0
