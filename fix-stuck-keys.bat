@echo off
title Reset Stuck Modifier Keys
echo Releasing all virtual modifier keys (Windows Key, Shift, Ctrl, Alt)...
powershell -ExecutionPolicy Bypass -File "%~dp0fix-stuck-keys.ps1"
pause
