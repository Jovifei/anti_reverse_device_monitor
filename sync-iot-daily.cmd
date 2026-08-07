@echo off
cd /d "%~dp0"
title IoT daily registry sync
echo Starting IoT daily registry sync...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sync-iot-daily.ps1"
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo.
  echo [sync-iot-daily] Failed with exit code %EXITCODE%.
  echo See logs\sync-iot-daily-*.log for details.
  pause
  exit /b %EXITCODE%
)
