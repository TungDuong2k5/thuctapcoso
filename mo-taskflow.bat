@echo off
rem Mo TaskFlow nhu mot ung dung: tu bat may chu (neu chua chay) roi mo cua so app rieng.
rem Bieu tuong TaskFlow ngoai Desktop / menu Start chay file nay.
chcp 65001 >nul
cd /d "%~dp0"
title TaskFlow - dang mo ung dung

rem Giao dien da chay san -> mo app luon
call :check_web && goto open_app

if not exist "server\node_modules" (
  echo Dang cai thu vien cho server, lan dau se hoi lau...
  call npm --prefix server install
)
if not exist "client\node_modules" (
  echo Dang cai thu vien cho client...
  call npm --prefix client install
)
if not exist "server\.env" copy "server\.env.example" "server\.env" >nul

rem Khong tu mo them tab trinh duyet (app se mo cua so rieng)
set "TASKFLOW_NO_OPEN=1"

call :check_api || start "TaskFlow API - dung tat cua so nay" /min /d "%~dp0server" cmd /k npm run dev
echo Dang khoi dong may chu (SQL Server lan dau co the mat 20-60 giay)...
for /l %%i in (1,1,90) do (
  call :check_api && goto api_ready
  timeout /t 1 >nul
)
:api_ready

start "TaskFlow Web - dung tat cua so nay" /min /d "%~dp0client" cmd /k npm run dev
for /l %%i in (1,1,60) do (
  call :check_web && goto open_app
  timeout /t 1 >nul
)

:open_app
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app=http://localhost:5180/
) else (
  start "" http://localhost:5180/
)
exit /b 0

:check_api
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5050/api/health -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
exit /b %errorlevel%

:check_web
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://localhost:5180/manifest.webmanifest -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
exit /b %errorlevel%
