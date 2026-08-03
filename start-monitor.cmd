@echo off
cd /d "%~dp0"
title Anti-reverse monitor launcher
echo Starting launcher...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-monitor.ps1"
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo.
  echo [launcher] Failed with exit code %EXITCODE%.
  echo If the window flashed closed before, this pause keeps the error visible.
  pause
  exit /b %EXITCODE%
)