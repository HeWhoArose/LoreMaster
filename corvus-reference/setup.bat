@echo off
REM Corvus Story Core - Windows installer
REM Installs root + client deps and builds the client.

setlocal enableextensions
cd /d "%~dp0"

echo.
echo ==========================================
echo   CORVUS STORY CORE - installer
echo ==========================================
echo.

REM --- Node check ----------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: node is not installed or not on PATH.
  echo Install Node.js 18+ from https://nodejs.org/ and re-run setup.bat
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo Node %NODE_VER% detected.

REM --- npm check -----------------------------------------------------------
where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm is not installed or not on PATH.
  exit /b 1
)

for /f "tokens=*" %%v in ('npm -v') do set NPM_VER=%%v
echo npm %NPM_VER% detected.
echo.

REM --- Root deps -----------------------------------------------------------
echo [1/3] Installing server dependencies...
call npm install --no-audit --no-fund
if errorlevel 1 goto :err

REM --- Client deps ---------------------------------------------------------
echo.
echo [2/3] Installing client dependencies...
pushd client
call npm install --no-audit --no-fund
if errorlevel 1 (
  popd
  goto :err
)
popd

REM --- Build client --------------------------------------------------------
echo.
echo [3/3] Building client...
call npm run build
if errorlevel 1 goto :err

echo.
echo ==========================================
echo   Install complete.
echo   Start Corvus with:  run.bat
echo ==========================================
echo.
endlocal
exit /b 0

:err
echo.
echo Install failed. See the messages above.
endlocal
exit /b 1
