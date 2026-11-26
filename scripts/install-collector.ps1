<#
.SYNOPSIS
    Schedule collect-intraday.ps1 every weekday after the US close (Windows Task Scheduler).
.DESCRIPTION
    Creates (or replaces) the "ChartLab intraday collector" task for the current user. It runs at
    -At local time on Monday to Friday; a run missed because the computer was off runs as soon as
    it is on again. Each run appends to data\collect-intraday.log.
.PARAMETER At
    Local time of the run. Default 23:30: after the 16:00 New York close seen from Israel (22:00 or
    23:00 there). Pick a time after 16:00 New York in your own time zone.
.PARAMETER Remove
    Delete the scheduled task instead.
.EXAMPLE
    .\scripts\install-collector.ps1
.EXAMPLE
    .\scripts\install-collector.ps1 -At 23:15
.EXAMPLE
    .\scripts\install-collector.ps1 -Remove
#>
param(
    [string]$At = '23:30',
    [switch]$Remove
)
. "$PSScriptRoot\_common.ps1"

$name = 'ChartLab intraday collector'
if ($Remove) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed the '$name' task (if it existed)." -ForegroundColor Green
    exit 0
}

$psExe = (Get-Process -Id $PID).Path
$script = Join-Path $PSScriptRoot 'collect-intraday.ps1'
$action = New-ScheduledTaskAction -Execute $psExe `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`"" `
    -WorkingDirectory $RepoRoot
$days = 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $days -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
    -Description 'Download the newest ChartLab minute bars (collect-intraday.ps1)' -Force | Out-Null

Write-Host "Scheduled '$name' on weekdays at $At." -ForegroundColor Green
Write-Host 'Run it now once:   .\scripts\collect-intraday.ps1'
Write-Host 'See its log:       data\collect-intraday.log'
Write-Host 'Remove it:         .\scripts\install-collector.ps1 -Remove'
