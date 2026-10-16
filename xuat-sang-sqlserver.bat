@echo off
rem Bam dup de sao chep du lieu TaskFlow sang SQL Server (database TaskFlow) de xem bang SSMS.
rem Moi lan chay se cap nhat lai ban sao theo du lieu moi nhat cua app.
chcp 65001 >nul
cd /d "%~dp0server"
node scripts\export-sqlserver.js
echo.
pause
