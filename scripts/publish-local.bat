@echo off
REM Local publish script for testing npm package installation on Windows

echo Building Rust binary...
cargo build --release
if %errorlevel% neq 0 exit /b %errorlevel%

echo Copying binary to platform package...
set PLATFORM=win32-x64
set BINARY=git-ai.exe

if not exist npm-platform\%PLATFORM%\bin mkdir npm-platform\%PLATFORM%\bin
copy target\release\%BINARY% npm-platform\%PLATFORM%\bin\

echo Publishing platform package locally...
cd npm-platform\%PLATFORM%
call npm pack
cd ..\..

echo Publishing main package locally...
cd npm
call npm pack
cd ..

echo.
echo ✅ Packages created successfully!
echo.
echo To test installation:
echo   npm install -g .\npm-platform\%PLATFORM%\*.tgz
echo   npm install -g .\npm\*.tgz
echo.
echo Or test locally:
echo   cd npm ^&^& npm link
