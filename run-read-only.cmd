@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo BLOCKED: Node.js 22.13 or newer is required. Nothing was installed or launched.
  pause
  exit /b 2
)
node "%~dp0tools\run-readonly-interactive.mjs"
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo Read-only public comment evidence is shown above.
) else (
  echo BLOCKED or no visible comment evidence. See reasonCode above.
)
echo No browser launch, navigation, login or publishing was performed by this tool.
pause
exit /b %RESULT%
