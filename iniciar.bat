@echo off
chcp 65001 >nul
cd /d "%~dp0"
REM le .env (imagem, Backblaze, pasta da nuvem deste PC - tudo opcional)
if exist .env for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do set "%%a=%%b"
if defined NUVEM_DIR if not exist "%NUVEM_DIR%" (
  echo AVISO: a pasta da nuvem "%NUVEM_DIR%" nao existe neste PC. Backups ficarao so em local\banco\finais.
  set "NUVEM_DIR="
  set "NUVEM_OK="
)
REM descobre o IP deste PC na rede (para o QR code); se falhar, o sistema usa o endereco do navegador
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object {$_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up'} | Select-Object -First 1).IPv4Address.IPAddress" 2^>nul`) do set "HOST_IP=%%i"
if defined IMAGEM goto imagem
echo Subindo MySQL + sistema (Docker, construindo a partir do codigo)...
docker compose up -d --build
goto conferir
:imagem
if defined GHCR_TOKEN (echo %GHCR_TOKEN%| docker login ghcr.io -u %GHCR_USUARIO% --password-stdin >nul 2>&1)
echo Buscando a versao mais nova do sistema (%IMAGEM%)...
docker pull %IMAGEM%
if errorlevel 1 (echo AVISO: sem internet ou token do GitHub invalido ^(GHCR_USUARIO/GHCR_TOKEN no .env^). Usando a versao que ja esta neste PC.) else (docker tag %IMAGEM% leilao-app:latest)
echo Subindo MySQL + sistema (Docker)...
docker compose up -d --no-build
:conferir
if errorlevel 1 (echo. & echo ERRO: abra o Docker Desktop, espere iniciar e rode de novo. & pause & exit /b 1)
echo.
echo Pronto!
echo   Neste PC:      http://localhost:3000
if defined HOST_IP echo   Outros/celular: http://%HOST_IP%:3000
if defined NUVEM_DIR (echo   Pasta nuvem:   %NUVEM_DIR%) else (echo   Pasta nuvem:   nao configurada)
if defined B2_KEY_ID (echo   Backblaze:     ligado - os backups sobem sozinhos quando houver internet) else (echo   Backblaze:     nao configurado ^(ver .env.exemplo^))
pause
