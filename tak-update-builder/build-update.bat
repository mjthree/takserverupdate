@echo off
REM Build ATAK update files (product.inf and product.infz)
REM Usage: build-update.bat [folder_path]

setlocal

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Get the folder path (default to current directory)
set "FOLDER=%~1"
if "%FOLDER%"=="" set "FOLDER=%CD%"

REM Check if folder exists
if not exist "%FOLDER%" (
    echo ERROR: Folder does not exist: %FOLDER%
    pause
    exit /b 1
)

REM Check if node_modules exists, if not run npm install
if not exist "%~dp0node_modules" (
    echo Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Run the build script
echo.
echo Building update files for folder: %FOLDER%
echo.
node "%~dp0build-update.js" "%FOLDER%"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo Done!
pause

