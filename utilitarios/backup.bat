@echo off
chcp 65001 >nul
cd /d "%~dp0.."
if exist .env for /f "usebackq tokens=1,* delims==" %%a in (".env") do set "%%a=%%b"
if not exist local\banco\backups mkdir local\banco\backups
set D=%date:~6,4%-%date:~3,2%-%date:~0,2%_%time:~0,2%%time:~3,2%
set D=%D: =0%
docker compose exec -T db mysqldump -uroot -pleilao_root --default-character-set=utf8mb4 --databases leilao > local\banco\leilao.novo 2>nul
if %errorlevel% neq 0 (echo ERRO: o banco esta rodando? & del local\banco\leilao.novo & pause & exit /b 1)
move /y local\banco\leilao.novo local\banco\leilao.sql >nul
copy /y local\banco\leilao.sql "local\banco\backups\leilao_%D%.sql" >nul
echo Backup salvo: local\banco\leilao.sql  (copia datada em local\banco\backups)
if defined NUVEM_DIR if exist "%NUVEM_DIR%" (copy /y local\banco\leilao.sql "%NUVEM_DIR%\leilao_%D%.sql" >nul & echo Copia enviada para a nuvem: %NUVEM_DIR%)
if "%1"=="" pause
