@echo off
rem Bam dup de bat gui mail that (nhap Gmail + mat khau ung dung)
chcp 65001 >nul
cd /d "%~dp0server"
node scripts\setup-mail.js
echo.
pause
