@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-HeartNest.ps1"
if errorlevel 1 echo Startup failed. Please check the error above.
pause
