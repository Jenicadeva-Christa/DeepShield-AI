@echo off
title DeepShield AI - React Frontend [Port 5173]
color 0D

echo ========================================================
echo       DEEPSHIELD AI - STARTING REACT FRONTEND CLIENT
echo ========================================================
echo.
cd /d "%~dp0client"
echo Working directory: %cd%
echo.
echo Running Vite Dev Server via npm.cmd...
echo.
call npm.cmd run dev

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Frontend encountered an error.
    pause
)
