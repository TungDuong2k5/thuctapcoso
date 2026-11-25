@echo off
rem Dang ky Windows tu chay sao-luu-csdl.bat moi ngay luc 21:00 (Task Scheduler).
rem Bam dup 1 lan la xong. Muon huy: schtasks /Delete /TN "TaskFlow - Sao luu CSDL" /F
cd /d "%~dp0"
schtasks /Create /SC DAILY /ST 21:00 /TN "TaskFlow - Sao luu CSDL" /TR "\"%~dp0sao-luu-csdl.bat\"" /F
if errorlevel 1 (
  echo Dang ky that bai.
) else (
  echo Da dang ky: moi ngay 21:00 tu sao luu database TaskFlow.
)
pause
