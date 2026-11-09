@echo off
title OmniDrop File Transfer - Android & Windows
cd /d "%~dp0"

echo ================================================================
echo             OmniDrop - Fast Cross-Platform File Transfer
echo ================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in your PATH.
    echo Please install Node.js from https://nodejs.org/ then try again.
    echo.
    pause
    exit /b 1
)

:: Silently ensure Windows Firewall allows inbound port 5050
:: (only works if this window was opened as Administrator)
net session >nul 2>&1
if %errorLevel% EQU 0 (
    netsh advfirewall firewall show rule name="OmniDrop Port 5050" >nul 2>&1
    if %errorLevel% NEQ 0 (
        echo [INFO] Adding Windows Firewall rule for port 5050 ^(one-time setup^)...
        netsh advfirewall firewall add rule name="OmniDrop Port 5050" dir=in action=allow protocol=TCP localport=5050 profile=private,domain,public >nul 2>&1
        echo [INFO] Firewall rule added. Your phone can now reach this PC.
    ) else (
        echo [INFO] Firewall rule OK.
    )
) else (
    echo [WARN] Not running as Administrator - firewall rule skipped.
    echo [WARN] If your phone cannot connect, right-click setup-firewall.bat
    echo [WARN] and choose "Run as administrator" once.
)
echo.

echo [INFO] Starting OmniDrop server...
start "" "http://localhost:5050"

node server/index.js

pause
