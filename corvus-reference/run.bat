@echo off
REM Corvus Story Core - Windows launcher
REM Runs the dev server (server + client with HMR).
REM Set CORVUS_PROD=1 before running to serve only the built bundle.

setlocal enableextensions
cd /d "%~dp0"

echo.
echo ==========================================
echo   CORVUS STORY CORE - starting
echo ==========================================
echo.

REM --- Sanity checks -------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: node is not installed or not on PATH. Run setup.bat first.
  exit /b 1
)

if not exist "node_modules" goto :needsetup
if not exist "client\node_modules" goto :needsetup
goto :launch

:needsetup
echo Dependencies missing - running setup first...
call "%~dp0setup.bat"
if errorlevel 1 exit /b 1

:launch
REM --- Network info --------------------------------------------------------
if "%PORT%"=="" set PORT=3000
if "%HOST%"=="" set HOST=127.0.0.1
echo Server will listen on http://%HOST%:%PORT%
echo Press Ctrl+C to stop.
echo.

if "%CORVUS_PROD%"=="1" (
  echo Mode: production ^(serving built client^)
  call npm run start
) else (
  echo Mode: dev ^(server + Vite HMR^)
  call npm run dev
)

endlocal
