@echo off
cd /d "D:\WYTU\4th_Year_Project"
echo Starting the EasyAttend HTTPS frontend on port 8000...
echo Keep this window open while using the application.
node tools\https-frontend-server.js
pause
