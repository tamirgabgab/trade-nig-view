<#
.SYNOPSIS
    Download the offline/test fixtures from Yahoo (daily + 1h bars for every universe symbol),
    check them, then commit and push them to GitHub.
.DESCRIPTION
    Run this on your own computer (the cloud sessions cannot reach Yahoo):
      1. git pull --ff-only, so the push below does not conflict.
      2. scripts/make_fixtures.py writes backend/fixtures/daily/*.csv and backend/fixtures/1h/*.csv.
      3. The fixture tests run against the new files.
      4. Only backend/fixtures is committed; then 'git push'.
    The first push may open a GitHub sign-in window (Git Credential Manager). Sign in once.
    Takes a few minutes (about 2 seconds per file, to be gentle with Yahoo).
.PARAMETER Symbols
    Optional: only these symbols, e.g. .\scripts\make-fixtures.ps1 AAPL NVDA
.PARAMETER NoPush
    Write and test the files, but do not commit or push.
.EXAMPLE
    .\scripts\make-fixtures.ps1
#>
param(
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Symbols = @(),
    [switch]$NoPush
)
. "$PSScriptRoot\_common.ps1"

function Write-Warn([string]$Text) {
    Write-Host "WARNING: $Text" -ForegroundColor Yellow
}

Assert-Command 'git' 'Install Git for Windows: https://git-scm.com/download/win'
Assert-Command 'uv' 'Run .\scripts\setup.ps1 first.'
# update.ps1 sets this to 0 in the same window; the push below may need the sign-in prompt.
Remove-Item Env:GIT_TERMINAL_PROMPT -ErrorAction SilentlyContinue

Write-Host '==> Updating the checkout (git pull --ff-only)' -ForegroundColor Cyan
git -C $RepoRoot pull --ff-only | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Warn 'git pull failed (see above). Fix that first, then run this script again.'
    exit 1
}

Write-Host '==> Downloading fixtures from Yahoo (a few minutes)' -ForegroundColor Cyan
Push-Location $BackendDir
try {
    uv run python ..\scripts\make_fixtures.py @Symbols | Out-Host
    $downloadCode = $LASTEXITCODE
    if ($downloadCode -ne 0) {
        Write-Warn 'Some files could not be downloaded (listed above). The others are kept.'
    }

    Write-Host '==> Checking the fixture files' -ForegroundColor Cyan
    uv run python -m pytest tests/unit/data/test_committed_fixtures.py -q | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Warn 'The fixture check failed: nothing was committed. Send the output above to Claude.'
        exit 1
    }
} finally {
    Pop-Location
}

if ($NoPush) {
    Write-Host 'Done (-NoPush): files written and checked, nothing committed.' -ForegroundColor Green
    exit 0
}

git -C $RepoRoot add -- backend/fixtures
git -C $RepoRoot diff --cached --quiet -- backend/fixtures
if ($LASTEXITCODE -eq 0) {
    Write-Host 'The fixtures did not change: nothing to commit.' -ForegroundColor Green
    exit 0
}

# Use the computer's git identity; without one, commit under a neutral fixtures identity.
$identity = @()
$name = "$(git -C $RepoRoot config user.name)".Trim()
$email = "$(git -C $RepoRoot config user.email)".Trim()
if ($name -eq '' -or $email -eq '') {
    $identity = @('-c', 'user.name=ChartLab fixtures', '-c', 'user.email=fixtures@chartlab.invalid')
}
$message = 'chore(fixtures): snapshot daily and 1h bars from Yahoo'
git -C $RepoRoot @identity commit -m $message -- backend/fixtures | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Warn 'git commit failed (see above).'
    exit 1
}

Write-Host '==> Pushing to GitHub (a sign-in window may open the first time)' -ForegroundColor Cyan
git -C $RepoRoot push | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Warn 'git push failed (see above). The commit is saved locally; run "git push" later.'
    exit 1
}
Write-Host 'Done: fixtures committed and pushed.' -ForegroundColor Green
if ($downloadCode -ne 0) { exit 2 }
exit 0
