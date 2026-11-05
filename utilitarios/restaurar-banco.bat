@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo ATENCAO: isto SUBSTITUI o banco atual pelo conteudo de local\banco\leilao.sql
set /p R=Digite SIM para continuar: 
if /i not "%R%"=="SIM" exit /b
docker compose exec -T db mysql -uroot -pleilao_root --default-character-set=utf8mb4 < local\banco\leilao.sql
docker compose restart app
echo Banco restaurado.
pause
