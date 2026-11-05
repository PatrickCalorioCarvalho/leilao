@echo off
cd /d "%~dp0"
call utilitarios\backup.bat nopause
docker compose stop
pause
