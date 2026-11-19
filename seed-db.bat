@echo off
title DeepShield AI - Database Seeder
color 0C

echo ========================================================
echo       DEEPSHIELD AI - SEEDING MONGODB DATABASE
echo ========================================================
echo.
cd /d "%~dp0server"
echo Seeding initial admin, analyst, customer accounts, AI models, and rules...
echo.
call npm.cmd run seed

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] Database seeded successfully!
) else (
    echo.
    echo [ERROR] Seeding failed. Ensure MongoDB is running.
)
echo.
pause
