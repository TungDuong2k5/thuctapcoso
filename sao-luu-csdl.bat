@echo off
rem Sao luu database TaskFlow (SQL Server) ra file .bak, ten file kem ngay gio.
rem File nam trong thu muc Backup mac dinh cua SQL Server (MSSQL\Backup).
rem Chay bang tay hoac dang ky chay hang ngay bang dang-ky-sao-luu.bat
chcp 65001 >nul
sqlcmd -S localhost -E -b -Q "DECLARE @ten NVARCHAR(100) = N'TaskFlow-tu-dong-' + FORMAT(GETDATE(), 'yyyyMMdd-HHmm'); DECLARE @duong NVARCHAR(4000) = CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS NVARCHAR(4000)) + N'\' + @ten; BACKUP DATABASE [TaskFlow] TO DISK = @duong WITH INIT, NAME = @ten; BACKUP LOG [TaskFlow] TO DISK = @duong WITH NOINIT; PRINT N'Da sao luu vao: ' + @duong;"
if errorlevel 1 (
  echo Sao luu THAT BAI. Kiem tra SQL Server dang chay va tai khoan Windows co quyen sao luu.
  exit /b 1
)
echo Sao luu xong.
