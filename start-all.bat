@echo off
title DeepShield AI - Master Launcher
color 0A

echo ========================================================
echo       DEEPSHIELD AI - LAUNCHING FULL MERN STACK
echo ========================================================
echo.
echo [1/3] Changing to project root...
cd /d "%~dp0"

echo [2/3] Launching Express Backend Server (Port 5000)...
start "DeepShield AI - Backend Server [Port 5000]" cmd.exe /k "cd /d "%~dp0server" && title DeepShield AI - Backend [5000] && echo Starting Server... && npm.cmd run dev"

echo Waiting 3 seconds for server to initialize...
timeout /t 3 /nobreak >nul

echo [3/3] Launching React Client UI (Port 5173)...
start "DeepShield AI - React Frontend [Port 5173]" cmd.exe /k "cd /d "%~dp0client" && title DeepShield AI - Frontend [5173] && echo Starting Vite Client... && npm.cmd run dev"

echo Waiting 2 seconds for client to spin up...
timeout /t 2 /nobreak >nul

echo.
echo ========================================================
echo  SUCCESS: Both Server and Client are running!
echo.
echo  - Backend API: http://localhost:5000
echo  - Frontend UI: http://localhost:5173
echo.
echo  Opening browser now...
echo ========================================================
start http://localhost:5173

pause
