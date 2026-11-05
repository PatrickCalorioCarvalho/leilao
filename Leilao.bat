@echo off
REM Sistema de Leilao. Dois cliques = menu. Tambem: Leilao.bat iniciar / parar / backup / abrir / restaurar ...
REM Arraste um arquivo em cima: planilha = importar, backup (.enc/.zip/.sql) = restaurar.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0leilao.ps1" %*
