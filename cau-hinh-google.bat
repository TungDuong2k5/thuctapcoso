@echo off
rem Bam dup de bat nut "Dang nhap bang Google" (dan Google Client ID)
chcp 65001 >nul
cd /d "%~dp0server"
node scripts\setup-google.js
echo.
pause
