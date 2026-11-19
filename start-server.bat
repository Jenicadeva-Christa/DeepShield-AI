@echo off
title DeepShield AI - Backend Server [Port 5000]
color 0B

echo ========================================================
echo       DEEPSHIELD AI - STARTING EXPRESS BACKEND SERVER
echo ========================================================
echo.
cd /d "%~dp0server"
echo Working directory: %cd%
echo.
echo Running Express Server via npm.cmd...
echo.
call npm.cmd run dev

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server encountered an error.
    pause
)
