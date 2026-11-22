<#
.SYNOPSIS
    Run the backend (http://127.0.0.1:8000) and the frontend (http://localhost:5173) together.
    Press Ctrl+C (or close the window) to stop both.
.PARAMETER Open
    Open the app in the default browser once it is ready. Used by the desktop shortcut
    (see install-shortcut.ps1). If ChartLab is already running, only the browser is opened.
.EXAMPLE
    .\scripts\dev.ps1
.EXAMPLE
    .\scripts\dev.ps1 -Open
#>
param([switch]$Open)

. "$PSScriptRoot\_common.ps1"

$AppUrl = 'http://localhost:5173'
$HealthUrl = 'http://127.0.0.1:8000/api/health'

function Test-Url([string]$Url) {
    try {
        Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Start-ChartLab {
    $Host.UI.RawUI.WindowTitle = 'ChartLab - close this window to stop'

    if ((Test-Url $AppUrl) -and (Test-Url $HealthUrl)) {
        Write-Host "ChartLab is already running at $AppUrl" -ForegroundColor Green
        if ($Open) { Start-Process $AppUrl }
        return
    }

    Assert-Command 'uv' 'Run .\scripts\setup.ps1 first.'
    Assert-Command 'npm' 'Run .\scripts\setup.ps1 first.'

    Write-Host '==> Backend on http://127.0.0.1:8000 (API docs: /api/docs)' -ForegroundColor Cyan
    # 'python -m uvicorn' instead of the uvicorn.exe launcher: Windows Smart App Control /
    # Application Control blocks the unsigned launcher .exe files that uv generates in .venv.
    $backend = Start-Process -FilePath 'uv' -NoNewWindow -PassThru -WorkingDirectory $BackendDir `
        -ArgumentList @('run', 'python', '-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000')

    # Wait until the API answers, and stop early with a clear message if the backend dies.
    $deadline = (Get-Date).AddSeconds(30)
    $ready = $false
    while ((Get-Date) -lt $deadline -and -not $backend.HasExited) {
        if (Test-Url $HealthUrl) {
            $ready = $true
            break
        }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) {
        if (-not $backend.HasExited) { taskkill /PID $backend.Id /T /F | Out-Null }
        throw 'Backend did not start (see the error above). Frontend was not started.'
    }
    Write-Host '==> Backend is up' -ForegroundColor Green

    try {
        Write-Host "==> Frontend on $AppUrl" -ForegroundColor Cyan
        if ($Open) { Write-Host '==> Opening the browser...' -ForegroundColor Cyan }
        Push-Location $FrontendDir
        $viteArgs = @()
        if ($Open) { $viteArgs += '--open' }
        npm run dev -- @viteArgs
    } finally {
        Pop-Location
        if (-not $backend.HasExited) {
            Write-Host '==> Stopping backend' -ForegroundColor Cyan
            if ($IsWindows -or $env:OS -eq 'Windows_NT') {
                # /T kills the uvicorn reloader's child process too.
                taskkill /PID $backend.Id /T /F | Out-Null
            } else {
                Stop-Process -Id $backend.Id -Force
            }
        }
    }
}

try {
    Start-ChartLab
} catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($Open) {
        # Started from the desktop shortcut: keep the window open so the error can be read.
        Read-Host 'Press Enter to close this window'
    }
    exit 1
}
