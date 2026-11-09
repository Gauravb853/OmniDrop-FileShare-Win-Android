# start-windows.ps1 - PowerShell launcher for OmniDrop
Set-Location -Path $PSScriptRoot

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "         OmniDrop - Fast Cross-Platform File Transfer          " -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "[ERROR] Node.js was not found in PATH." -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit..."
    exit 1
}

Write-Host "[INFO] Starting OmniDrop Server..." -ForegroundColor Green
Start-Process "http://localhost:5050"

& node server/index.js
