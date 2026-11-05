@echo off
chcp 65001 >nul
cd /d "%~dp0.."
REM Abre um backup criptografado (.enc) baixado do Backblaze: arraste o arquivo em cima deste .bat.
REM Gera o arquivo aberto na mesma pasta (.zip do relatorio final, ou .sql do backup automatico).
if "%~1"=="" (echo Arraste o arquivo .enc baixado do Backblaze em cima deste .bat. & pause & exit /b 1)
if exist .env for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do set "%%a=%%b"
if not defined BACKUP_SENHA set /p BACKUP_SENHA=Senha dos backups:
docker run --rm -e BACKUP_SENHA -v "%~dp1:/w" -w /w leilao-app:latest node /app/descriptografar.js "%~nx1"
pause
