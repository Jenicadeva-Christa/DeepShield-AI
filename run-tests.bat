@echo off
title DeepShield AI - Automated Test Runner
color 0E

echo ========================================================
echo       DEEPSHIELD AI - AUTOMATED JEST TEST RUNNER
echo ========================================================
echo.
cd /d "%~dp0server"
echo Working directory: %cd%
echo.
echo [1/2] Running Agile Sprint Test Suites (Sprints 1-4)...
echo.
call npm.cmd run test:agile

echo.
echo ========================================================
echo [2/2] Running Local AI Voice Recognition & Forensics Suite...
echo.
call npm.cmd run test:voice

echo.
echo ========================================================
echo               TEST EXECUTION FINISHED
echo ========================================================
echo.
pause
