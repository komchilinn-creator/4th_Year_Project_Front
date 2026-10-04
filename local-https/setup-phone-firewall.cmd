@echo off
net session >nul 2>&1
if not %errorlevel%==0 (
  echo Right-click this file and select "Run as administrator".
  pause
  exit /b 1
)

netsh advfirewall firewall show rule name="EasyAttend Apache HTTPS" >nul 2>&1
if errorlevel 1 (
  netsh advfirewall firewall add rule name="EasyAttend Apache HTTPS" dir=in action=allow protocol=TCP localport=443 remoteip=LocalSubnet profile=private
) else (
  netsh advfirewall firewall set rule name="EasyAttend Apache HTTPS" new enable=yes remoteip=LocalSubnet profile=private
)

netsh advfirewall firewall show rule name="EasyAttend Apache HTTP" >nul 2>&1
if errorlevel 1 (
  netsh advfirewall firewall add rule name="EasyAttend Apache HTTP" dir=in action=allow protocol=TCP localport=80 remoteip=LocalSubnet profile=private
) else (
  netsh advfirewall firewall set rule name="EasyAttend Apache HTTP" new enable=yes remoteip=LocalSubnet profile=private
)

echo EasyAttend firewall access is enabled for TCP ports 80 and 443.
pause
