@echo off
rem Tao bieu tuong TaskFlow ngoai Desktop va trong menu Start (bam vao la mo app).
rem chay-du-an.bat tu goi file nay; chay rieng cung duoc.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = (Resolve-Path '.').Path;" ^
  "$sh = New-Object -ComObject WScript.Shell;" ^
  "foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {" ^
  "  $lnk = $sh.CreateShortcut((Join-Path $dir 'TaskFlow.lnk'));" ^
  "  $lnk.TargetPath = (Join-Path $root 'mo-taskflow.bat');" ^
  "  $lnk.WorkingDirectory = $root;" ^
  "  $lnk.IconLocation = (Join-Path $root 'scripts\taskflow.ico') + ',0';" ^
  "  $lnk.WindowStyle = 7;" ^
  "  $lnk.Description = 'TaskFlow - Quan ly cong viec nhom';" ^
  "  $lnk.Save()" ^
  "}"
if "%~1"=="" echo Da tao bieu tuong TaskFlow ngoai Desktop va trong menu Start.
