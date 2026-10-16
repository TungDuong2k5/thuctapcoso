@echo off
rem Bam dup file nay de chay TaskFlow: mo 2 cua so (API + giao dien), Microsoft Edge tu mo khi xong.
chcp 65001 >nul
cd /d "%~dp0"

if not exist "server\node_modules" (
  echo Dang cai thu vien cho server...
  call npm --prefix server install
)
if not exist "client\node_modules" (
  echo Dang cai thu vien cho client...
  call npm --prefix client install
)
if not exist "server\.env" copy "server\.env.example" "server\.env" >nul

start "TaskFlow API - dung tat cua so nay" /d "%~dp0server" cmd /k npm run dev

rem Doi API san sang (toi da ~30 giay) de trang mo ra la dang nhap duoc ngay
echo Dang khoi dong may chu API...
for /l %%i in (1,1,30) do (
  powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5050/api/health -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1 && goto api_ready
  timeout /t 1 >nul
)
:api_ready

rem Giao dien web chay xong se tu mo Microsoft Edge (cau hinh trong client\vite.config.js)
start "TaskFlow Web - dung tat cua so nay" /d "%~dp0client" cmd /k npm run dev
