@echo off
title dweb Desktop App
cd /d "%~dp0"
echo.
echo  Starting dweb Desktop Server...
echo  Press Ctrl+C to stop.
echo.
node "%~dp0tools\dweb-server.cjs"
pause
