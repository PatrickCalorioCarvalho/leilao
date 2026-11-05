@echo off
REM Em PC SEM internet (precisa do Docker Desktop instalado): carrega as imagens e sobe.
cd /d "%~dp0.."
docker load -i leilao-offline.tar
docker compose up -d --no-build
echo Pronto. Abra http://localhost:3000
pause
