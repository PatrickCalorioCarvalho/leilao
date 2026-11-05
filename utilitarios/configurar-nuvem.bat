@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo Configurar a pasta da nuvem (OPCIONAL) - OneDrive, Google Drive ou qualquer pasta sincronizada.
echo Os relatorios finais e backups serao copiados para la; a nuvem sincroniza quando houver internet.
echo (Para enviar direto ao Backblaze B2, sem programa instalado, preencha B2_* no .env - veja .env.exemplo.)
echo.
echo Exemplos:  C:\Users\SEU_USUARIO\OneDrive\Leilao-backups
echo            G:\Meu Drive\Leilao-backups
echo Deixe em branco para NAO usar pasta de nuvem (o backup fica em local\banco\finais).
echo.
set "P="
set /p P=Pasta:
REM mantem as outras configuracoes do .env (Backblaze, imagem...) e troca so as linhas da pasta
if exist .env (findstr /v /b /c:"NUVEM_DIR=" /c:"NUVEM_OK=" .env > .env.tmp) else (type nul > .env.tmp)
if "%P%"=="" goto semnuvem
if not exist "%P%" mkdir "%P%"
set "P=%P:\=/%"
(echo NUVEM_DIR=%P%) >> .env.tmp
(echo NUVEM_OK=sim) >> .env.tmp
move /y .env.tmp .env >nul
echo Configurado: %P%
goto reiniciar
:semnuvem
(echo NUVEM_DIR=) >> .env.tmp
(echo NUVEM_OK=) >> .env.tmp
move /y .env.tmp .env >nul
echo Pasta de nuvem desativada.
:reiniciar
echo Reiniciando o sistema...
call iniciar.bat
