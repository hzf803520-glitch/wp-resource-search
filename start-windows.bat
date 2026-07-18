@echo off
cd /d "%~dp0"
echo Starting website...
echo Frontend: http://localhost:8080
echo Admin: http://localhost:8080/admin
npm start
pause
