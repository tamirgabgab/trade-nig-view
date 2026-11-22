# Shared helpers for ChartLab PowerShell scripts. Dot-source: . "$PSScriptRoot\_common.ps1"
$ErrorActionPreference = 'Stop'
$script:RepoRoot = Split-Path -Parent $PSScriptRoot
$script:BackendDir = Join-Path $RepoRoot 'backend'
$script:FrontendDir = Join-Path $RepoRoot 'frontend'

function Assert-Command([string]$Name, [string]$Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "'$Name' was not found on PATH. $Hint"
    }
}

function Invoke-Step([string]$Title, [string]$Directory, [scriptblock]$Command) {
    Write-Host "==> $Title" -ForegroundColor Cyan
    Push-Location $Directory
    try {
        & $Command | Out-Host
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    return ($code -eq 0 -or $null -eq $code)
}
