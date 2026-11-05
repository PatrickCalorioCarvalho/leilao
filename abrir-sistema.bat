@echo off
chcp 65001 >nul
cd /d "%~dp0"
REM Abre o sistema numa janela propria (sem barra de enderco) e IMPRIME DIRETO na impressora padrao, sem janela de impressao.
REM Em outro PC: crie servidor.txt com o endereco, ex.:  192.168.0.10:3000   (padrao: localhost:3000)
set "SRV=localhost:3000"
if exist servidor.txt set /p SRV=<servidor.txt
set "TELA=%~1"
if "%TELA%"=="" set "TELA=mesa"
set "URL=http://%SRV%/#%TELA%"
set "PROF=%LOCALAPPDATA%\leilao-janela"
set "B="
for %%p in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe") do if not defined B if exist %%p set "B=%%~p"
if defined B (
  start "" "%B%" --kiosk-printing --app=%URL% --user-data-dir="%PROF%" --no-first-run
) else (
  echo Chrome/Edge nao encontrado; abrindo no navegador padrao (a janela de impressao vai aparecer).
  start "" %URL%
)
