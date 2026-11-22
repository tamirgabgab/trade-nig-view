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
$backend = Start-Process -FilePath 'uv' -NoNewWindow -PassThru -WorkingDirectory $BackendDir `
    -ArgumentList @('run', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000')

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
