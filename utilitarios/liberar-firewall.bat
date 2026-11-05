@echo off
chcp 65001 >nul
net session >nul 2>&1
if %errorlevel% neq 0 (echo Clique com o botao direito neste arquivo e escolha "Executar como administrador" & pause & exit /b)
netsh advfirewall firewall delete rule name="Leilao 3000" >nul 2>&1
netsh advfirewall firewall add rule name="Leilao 3000" dir=in action=allow protocol=TCP localport=3000 profile=any
echo Porta 3000 liberada: celulares e outros PCs da rede ja podem acessar.
pause
