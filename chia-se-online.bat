@echo off
rem Chia se TaskFlow len Internet qua duong ham Cloudflare (mien phi, khong can tai khoan).
rem Ca nhom o moi noi mo duoc cung 1 link https://....trycloudflare.com de dung web, nhan tin, goi nhom.
rem May nay phai BAT va giu cua so nay trong suot luc moi nguoi dung.
cd /d "%~dp0"

set "CF=cloudflared"
where cloudflared >nul 2>&1 || set "CF=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
if not exist "%CF%" if not "%CF%"=="cloudflared" set "CF=%ProgramFiles%\cloudflared\cloudflared.exe"
if not "%CF%"=="cloudflared" if not exist "%CF%" (
  echo Chua cai cloudflared. Mo PowerShell va chay lenh:
  echo     winget install --id Cloudflare.cloudflared
  echo roi chay lai file nay.
  pause
  exit /b 1
)

echo [1/4] Kiem tra mat khau mac dinh...
call node server\scripts\check-default-passwords.js
if errorlevel 2 (
  echo Hay doi mat khau cac tai khoan tren truoc khi chia se online.
  choice /c YN /m "Van tiep tuc chia se (Y = co, N = dung lai)"
  if errorlevel 2 exit /b 1
)

echo [2/4] Dong goi giao dien web...
call npm --prefix client run build >nul
if errorlevel 1 (
  echo Loi khi dong goi giao dien.
  pause
  exit /b 1
)

echo [3/4] Kiem tra may chu API...
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5050/api/health -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  start "TaskFlow API - dung tat cua so nay" /d "%~dp0server" cmd /k npm run dev
  for /l %%i in (1,1,30) do (
    powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5050/api/health -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1 && goto api_ready
    timeout /t 1 >nul
  )
)
:api_ready

echo [4/4] Mo duong ham Cloudflare...
set "LOG=%TEMP%\taskflow-tunnel.log"
if exist "%LOG%" del "%LOG%"
start "TaskFlow Online - dung tat cua so nay (tat = ngung chia se)" "%CF%" tunnel --no-autoupdate --url http://localhost:5050 --logfile "%LOG%"

set "URL="
for /l %%i in (1,1,40) do (
  for /f "delims=" %%u in ('powershell -NoProfile -Command "if (Test-Path $env:LOG) { $m = Select-String -Path $env:LOG -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1; if ($m) { $m.Matches[0].Value } }"') do set "URL=%%u"
  if defined URL goto got_url
  timeout /t 1 >nul
)
echo Khong lay duoc link. Xem cua so "TaskFlow Online" de biet loi.
pause
exit /b 1

:got_url
echo %URL%| clip
echo.
echo ==============================================================
echo   LINK TASKFLOW ONLINE (da sao chep, dan vao Zalo/Messenger):
echo.
echo       %URL%
echo.
echo   - Gui link nay cho ca nhom, moi nguoi dang nhap bang email + mat khau.
echo   - Link doi moi moi lan chay file nay.
echo   - Giu may bat va KHONG tat cua so "TaskFlow Online" va "TaskFlow API".
echo ==============================================================
echo.
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (start "" "%EDGE%" %URL%) else (start "" %URL%)
pause
