@echo off
chcp 65001 >nul
cd /d "%~dp0.."
REM Uso: arraste a planilha (.xlsx ou .csv) sobre este arquivo, ou:  gerar-sql.bat planilha.xlsx 2018
REM Importa o leilao antigo como HISTORICO. Precisa so do Docker (o sistema precisa estar rodando).
if "%~1"=="" (echo Arraste a planilha .xlsx/.csv em cima deste arquivo, ou use: gerar-sql.bat planilha.xlsx ANO & pause & exit /b)
set "ANO=%~2"
if "%ANO%"=="" set /p ANO=Ano deste leilao (ex.: 2018): 
if not exist local\historico mkdir local\historico
docker run --rm -v "%~dp1:/in:ro" -v "%CD%\local\historico:/out" leilao-app:latest node gerar-sql.js "/in/%~nx1" "/out/%ANO%.sql" --ano %ANO%
if errorlevel 1 (echo ERRO ao gerar o SQL & pause & exit /b 1)
echo Aplicando no banco...
docker compose exec -T db mysql -uleilao -pleilao --default-character-set=utf8mb4 leilao < "local\historico\%ANO%.sql"
echo Pronto: leilao %ANO% (historico). Rode backup.bat para guardar.
pause
