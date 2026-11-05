@echo off
REM Prepara o sistema neste PC: pastas, imagem, ULTIMO backup do Backblaze e sistema no ar. Detalhes em preparar.ps1.
REM Tambem aceita arrastar um backup (.enc/.zip/.sql) em cima deste arquivo.
cd /d "%~dp0"
if "%~1"=="" (powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0preparar.ps1") else (powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0preparar.ps1" -Arquivo "%~1")
