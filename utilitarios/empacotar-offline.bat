@echo off
REM Rode UMA vez num PC com internet: gera leilao-offline.tar com as imagens Docker.
cd /d "%~dp0.."
docker compose build
docker compose pull db
docker save -o leilao-offline.tar leilao-app:latest mysql:8.4
echo Gerado leilao-offline.tar. Copie esta pasta inteira + o tar para o PC sem internet e rode instalar-offline.bat
pause
