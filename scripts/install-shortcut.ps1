<#
.SYNOPSIS
    Create a "ChartLab" shortcut on the Desktop (and in the Start menu). Double-click it to start
    the backend and frontend and open the app in the browser. Close its window to stop ChartLab.
.EXAMPLE
    .\scripts\install-shortcut.ps1
#>
. "$PSScriptRoot\_common.ps1"

# Use the same PowerShell that runs this script (powershell.exe 5.1 or pwsh.exe 7).
$psExe = (Get-Process -Id $PID).Path
$devScript = Join-Path $PSScriptRoot 'dev.ps1'
$icon = Join-Path $PSScriptRoot 'assets\chartlab.ico'

$targets = @(
    [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('Programs')
)

$shell = New-Object -ComObject WScript.Shell
foreach ($folder in $targets) {
    $path = Join-Path $folder 'ChartLab.lnk'
    $link = $shell.CreateShortcut($path)
    $link.TargetPath = $psExe
    $link.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$devScript`" -Open"
    $link.WorkingDirectory = $RepoRoot
    $link.IconLocation = "$icon,0"
    $link.Description = 'Start ChartLab and open it in the browser'
    $link.WindowStyle = 1  # normal window: shows logs and errors; closing it stops ChartLab
    $link.Save()
    Write-Host "Created $path" -ForegroundColor Green
}

Write-Host ''
Write-Host 'Double-click "ChartLab" on the Desktop (or search "ChartLab" in Start) to open the app.'
Write-Host 'To stop ChartLab, close the black "ChartLab" window.'
