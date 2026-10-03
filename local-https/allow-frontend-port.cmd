@echo off
net session >nul 2>&1
if not %errorlevel%==0 (
  echo Right-click this file and select "Run as administrator".
  pause
  exit /b 1
)
netsh advfirewall firewall set rule name="AttendQR HTTPS Frontend" new profile=private,public >nul 2>&1
if not %errorlevel%==0 (
  netsh advfirewall firewall add rule name="AttendQR HTTPS Frontend" dir=in action=allow protocol=TCP localport=8000 profile=private,public
)
echo Port 8000 is allowed on private and public networks.
pause
