@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-hy3-relay.ps1"
if errorlevel 1 pause
