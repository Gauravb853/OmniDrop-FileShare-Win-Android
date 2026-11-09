@echo off
:: OmniDrop - Windows Firewall Setup
:: This script adds the inbound firewall rule needed for your phone to reach the PC.
:: Must run as Administrator (it will auto-elevate itself).

net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo.
echo ============================================
echo   OmniDrop Firewall Setup
echo ============================================
echo.

:: Remove old rule if exists
netsh advfirewall firewall delete rule name="OmniDrop Port 5050" >nul 2>&1

:: Add inbound TCP rule for port 5050 on all network profiles
netsh advfirewall firewall add rule ^
    name="OmniDrop Port 5050" ^
    dir=in ^
    action=allow ^
    protocol=TCP ^
    localport=5050 ^
    profile=private,domain,public ^
    description="OmniDrop file transfer - allow phone to reach PC on port 5050"

if %errorLevel% EQU 0 (
    echo.
    echo [SUCCESS] Firewall rule added!
    echo Your phone can now reach this PC at:
    echo.
    for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr "192.168"') do (
        echo   http:%%a:5050
    )
    echo.
    echo You can close this window and restart OmniDrop.
) else (
    echo.
    echo [ERROR] Failed to add firewall rule. Please run as Administrator.
)

echo.
pause
