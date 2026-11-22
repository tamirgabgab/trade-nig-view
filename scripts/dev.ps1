<#
.SYNOPSIS
    Run the backend (http://127.0.0.1:8000) and the frontend (http://localhost:5173) together.
    Press Ctrl+C to stop both.
.EXAMPLE
    .\scripts\dev.ps1
#>
. "$PSScriptRoot\_common.ps1"

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
    try {
        Invoke-WebRequest -Uri 'http://127.0.0.1:8000/api/health' -UseBasicParsing -TimeoutSec 2 | Out-Null
        $ready = $true
        break
    } catch {
        Start-Sleep -Milliseconds 500
    }
}
if (-not $ready) {
    if (-not $backend.HasExited) { taskkill /PID $backend.Id /T /F | Out-Null }
    throw 'Backend did not start (see the error above). Frontend was not started.'
}
Write-Host '==> Backend is up' -ForegroundColor Green

try {
    Write-Host '==> Frontend on http://localhost:5173' -ForegroundColor Cyan
    Push-Location $FrontendDir
    npm run dev
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
