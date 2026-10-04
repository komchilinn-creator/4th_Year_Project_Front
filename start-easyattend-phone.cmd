@echo off
setlocal
cd /d "%~dp0"
set "ATTENDQR_IP=10.62.109.42"
set "XAMPP_ROOT=C:\xampp2"

ipconfig | findstr /C:"%ATTENDQR_IP%" >nul
if errorlevel 1 (
  echo ERROR: This computer does not currently have IP %ATTENDQR_IP%.
  echo Reconnect to the intended Wi-Fi network before starting EasyAttend.
  pause
  exit /b 1
)

tasklist /FI "IMAGENAME eq mysqld.exe" | find /I "mysqld.exe" >nul
if errorlevel 1 (
  echo Starting MySQL...
  start "EasyAttend MySQL" /min "%XAMPP_ROOT%\mysql\bin\mysqld.exe" --defaults-file="%XAMPP_ROOT%\mysql\bin\my.ini" --standalone
) else (
  echo MySQL is already running.
)

tasklist /FI "IMAGENAME eq httpd.exe" | find /I "httpd.exe" >nul
if errorlevel 1 (
  echo Starting Apache HTTPS...
  start "EasyAttend Apache" /min "%XAMPP_ROOT%\apache\bin\httpd.exe"
) else (
  echo Apache is already running. Restart it from XAMPP Control Panel if it was running before the new certificate was installed.
)

timeout /t 3 /nobreak >nul
echo.
echo EasyAttend phone URL:
echo   https://%ATTENDQR_IP%/
echo.
echo Backend health check:
echo   https://%ATTENDQR_IP%/4th_Year_Pj_Backend/public/index.php?action=health
echo.
echo Public CA certificate for the phone:
echo   %CD%\local-https\attendqr-local-ca.crt
echo.
echo Keep this window for the URLs. Apache and MySQL run in their own minimized windows.
pause
