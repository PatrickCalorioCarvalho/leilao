# Sistema de Leilao - todos os comandos num lugar so.
#   Dois cliques em Leilao.bat           -> menu
#   Leilao.bat <comando> [arg1] [arg2]   -> direto. Comandos:
#     iniciar | abrir [tela] | parar | backup | restaurar [arquivo] | configurar | preparar [-Configurar] [-SemRestaurar]
#     importar <planilha> [ano] | descriptografar <arquivo.enc> | firewall | offline-empacotar | offline-instalar
#   Arrastar um arquivo em cima do Leilao.bat: planilha (.xlsx/.csv) = importar; backup (.enc/.zip/.sql/.gz) = restaurar
param([string]$Comando = 'menu', [string]$Arg1 = '', [string]$Arg2 = '', [switch]$Configurar, [switch]$SemRestaurar, [switch]$SemPausa)
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

# ======================================================================  utilidades
function Passo($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }
function Aviso($t) { Write-Host "    $t" -ForegroundColor Yellow }
function Falha($t) { throw $t }
function Ok($cmd) { cmd /c "$cmd >nul 2>&1"; return ($LASTEXITCODE -eq 0) }
function Segredo($t) { $s = Read-Host $t -AsSecureString; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }
function PedirArquivo($t) { (Read-Host "    $t (arraste o arquivo para esta janela e Enter)").Trim().Trim('"') }
function TemBanco { @(Get-ChildItem local\mysql -Force -ErrorAction SilentlyContinue).Count -gt 0 }

$script:cfg = [ordered]@{}
function LerEnv {
  $script:cfg = [ordered]@{}
  if (Test-Path .env) { Get-Content .env | Where-Object { $_ -match '^\s*([A-Za-z0-9_]+)=(.*)$' } | ForEach-Object { $script:cfg[$Matches[1]] = $Matches[2].Trim() } }
  foreach ($k in $script:cfg.Keys) { if ($script:cfg[$k]) { Set-Item "env:$k" $script:cfg[$k] } }
  if ($env:NUVEM_DIR -and -not (Test-Path $env:NUVEM_DIR)) { Aviso "a pasta da nuvem $env:NUVEM_DIR nao existe neste PC: backups ficam so em local\banco."; $env:NUVEM_DIR = ''; $env:NUVEM_OK = '' }
}

function GarantirDocker {
  if (Ok 'docker info') { return }
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Falha 'Docker Desktop nao instalado (docker.com/products/docker-desktop).' }
  $dd = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dd) { Write-Host '    abrindo o Docker Desktop (1-2 minutos)...'; Start-Process $dd }
  for ($i = 0; $i -lt 60 -and -not (Ok 'docker info'); $i++) { Start-Sleep 3 }
  if (-not (Ok 'docker info')) { Falha 'o Docker nao respondeu. Abra o Docker Desktop, espere ficar pronto e tente de novo.' }
}
function CriarPastas {
  'local\mysql', 'local\banco\finais', 'local\banco\backups', 'local\historico', 'local\planilhas' |
    ForEach-Object { New-Item -ItemType Directory -Force $_ | Out-Null }
}
function AtualizarImagem {
  if ($env:IMAGEM) {
    if ($env:GHCR_TOKEN) { $env:GHCR_TOKEN | docker login ghcr.io -u $env:GHCR_USUARIO --password-stdin 2>&1 | Out-Null }
    Write-Host "    buscando a versao mais nova ($env:IMAGEM)..."
    docker pull -q $env:IMAGEM | Out-Null
    if ($LASTEXITCODE -eq 0) { docker tag $env:IMAGEM leilao-app:latest }
    elseif (Ok 'docker image inspect leilao-app:latest') { Aviso 'sem internet ou token invalido: usando a versao que ja esta neste PC.' }
    else { Falha 'nao consegui baixar a imagem. Confira a internet e GHCR_USUARIO / GHCR_TOKEN (opcao Configurar).' }
  } elseif (Test-Path app\Dockerfile) {
    docker compose build app
    if ($LASTEXITCODE) { Falha 'nao consegui construir a imagem.' }
  } elseif (-not (Ok 'docker image inspect leilao-app:latest')) { Falha 'defina IMAGEM (opcao Configurar).' }
}
function Subir {
  $env:HOST_IP = (Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
    Select-Object -First 1).IPv4Address.IPAddress
  docker compose up -d --no-build
  if ($LASTEXITCODE) { Falha 'docker compose falhou.' }
}
function EsperarSistema {
  Write-Host '    aguardando o sistema responder...'
  for ($i = 0; $i -lt 90; $i++) {
    try { return Invoke-RestMethod http://localhost:3000/api/info -TimeoutSec 2 } catch { Start-Sleep 2 }
  }
  Falha 'o sistema nao respondeu. Veja: docker compose logs app'
}
function MostrarEnderecos {
  Write-Host "`nPronto!" -ForegroundColor Green
  Write-Host '  Neste PC:        http://localhost:3000'
  if ($env:HOST_IP) { Write-Host "  Outros/celular:  http://$($env:HOST_IP):3000" }
  $leiloes = try { Invoke-RestMethod http://localhost:3000/api/leiloes -TimeoutSec 5 } catch { @() }   # PS 5.1: atribuir direto mantem a lista
  Write-Host "  Leiloes no banco: $(@($leiloes).Count)"
  Write-Host ('  Backblaze:       ' + $(if ($env:B2_KEY_ID) { 'ligado (backups sobem sozinhos)' } else { 'nao configurado (opcao Configurar)' }))
  if ($env:NUVEM_DIR) { Write-Host "  Pasta nuvem:     $env:NUVEM_DIR" }
}

# ======================================================================  backup / restauracao
function FazerBackup {
  New-Item -ItemType Directory -Force local\banco\backups | Out-Null
  cmd /c "docker compose exec -T db mysqldump -uroot -pleilao_root --default-character-set=utf8mb4 --hex-blob --databases leilao > local\banco\leilao.novo 2>nul"
  if ($LASTEXITCODE -or (Get-Item local\banco\leilao.novo -ErrorAction SilentlyContinue).Length -lt 100) {
    Remove-Item local\banco\leilao.novo -ErrorAction SilentlyContinue; Falha 'backup falhou: o sistema esta rodando?' }
  Move-Item local\banco\leilao.novo local\banco\leilao.sql -Force
  $d = Get-Date -f 'yyyy-MM-dd_HHmm'
  Copy-Item local\banco\leilao.sql "local\banco\backups\leilao_$d.sql"
  Write-Host "    backup salvo: local\banco\leilao.sql (copia em local\banco\backups\leilao_$d.sql)"
  if ($env:NUVEM_DIR) { Copy-Item local\banco\leilao.sql (Join-Path $env:NUVEM_DIR "leilao_$d.sql"); Write-Host "    copia na pasta da nuvem: $env:NUVEM_DIR" }
}
# baixa o ultimo backup do Backblaze (ou abre um arquivo) e deixa em local\banco\leilao.novo
function ObterBackup($arquivo) {
  if (-not (Ok 'docker image inspect leilao-app:latest')) { AtualizarImagem }
  $docker = @('run', '--rm', '-e', 'B2_LER_KEY_ID', '-e', 'B2_LER_APP_KEY', '-e', 'BACKUP_SENHA', '-e', 'B2_PASTA', '-v', "$PWD\local\banco:/w")
  if ($arquivo) {
    if (-not (Test-Path -LiteralPath $arquivo)) { Falha "arquivo nao encontrado: $arquivo" }
    $f = Get-Item -LiteralPath $arquivo
    $docker += @('-v', "$($f.DirectoryName):/in:ro", 'leilao-app:latest', 'node', '/app/restaurar.js', '/w/leilao.novo', "/in/$($f.Name)")
  } else {
    if (-not $env:B2_LER_KEY_ID) {
      Write-Host '    Chave de LEITURA do Backblaze (Read Only). Ela NAO fica salva neste PC.'
      $env:B2_LER_KEY_ID = Read-Host '    keyID'
      $env:B2_LER_APP_KEY = Segredo '    applicationKey'
    }
    $docker += @('leilao-app:latest', 'node', '/app/restaurar.js', '/w/leilao.novo')
  }
  if (-not $env:BACKUP_SENHA) { $env:BACKUP_SENHA = Segredo '    Senha dos backups (Enter se nao forem criptografados)' }
  docker @docker
  Remove-Item env:B2_LER_APP_KEY, env:B2_LER_KEY_ID -ErrorAction SilentlyContinue
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path local\banco\leilao.novo)) {
    Remove-Item local\banco\leilao.novo -ErrorAction SilentlyContinue; Falha 'nao consegui obter o backup (veja a mensagem acima). Nada foi alterado.' }
}
# coloca leilao.novo como leilao.sql (guarda o anterior) e aplica no banco
function AplicarBackup {
  if (Test-Path local\banco\leilao.novo) {
    if (Test-Path local\banco\leilao.sql) { Move-Item local\banco\leilao.sql "local\banco\backups\leilao_antes_$(Get-Date -f yyyy-MM-dd_HHmm).sql" -Force }
    Move-Item local\banco\leilao.novo local\banco\leilao.sql
  }
  $existia = TemBanco
  Subir   # banco novo (local\mysql vazia): o MySQL carrega o local\banco\leilao.sql sozinho
  if ($existia) {
    Write-Host '    aplicando o backup no banco...'
    cmd /c "docker compose exec -T db mysql -uroot -pleilao_root --default-character-set=utf8mb4 < local\banco\leilao.sql"
    if ($LASTEXITCODE) { Falha 'o MySQL recusou o backup (o arquivo esta em local\banco\leilao.sql).' }
    docker compose restart app | Out-Null
  }
}

# ======================================================================  comandos
function Cmd-Iniciar { Passo 'Iniciando'; GarantirDocker; CriarPastas; AtualizarImagem; Subir; EsperarSistema | Out-Null; MostrarEnderecos }

function Cmd-Abrir($tela) {
  # abre numa janela propria e imprime DIRETO na impressora padrao. Em outro PC: servidor.txt com IP:3000
  $srv = if (Test-Path servidor.txt) { (Get-Content servidor.txt -TotalCount 1).Trim() } else { 'localhost:3000' }
  if (-not $tela) { $tela = 'mesa' }
  $url = "http://$srv/#$tela"
  $nav = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($nav) { Start-Process $nav "--kiosk-printing --app=$url --user-data-dir=`"$env:LOCALAPPDATA\leilao-janela`" --no-first-run" }
  else { Aviso 'Chrome/Edge nao encontrado: abrindo no navegador padrao (a janela de impressao vai aparecer).'; Start-Process $url }
}

function Cmd-Parar {
  Passo 'Backup antes de parar'
  try { FazerBackup } catch { Aviso $_.Exception.Message }
  Passo 'Parando'; docker compose stop; Write-Host '    sistema parado.'
}

function Cmd-Backup { Passo 'Backup do banco'; FazerBackup }

function Cmd-Restaurar($arquivo) {
  Passo 'Restaurar backup'
  GarantirDocker; CriarPastas
  if (-not $arquivo) {
    Write-Host '    1 = ultimo backup do Backblaze   2 = local\banco\leilao.sql   3 = outro arquivo'
    switch (Read-Host '    Qual? [1]') { '2' { $local = $true } '3' { $arquivo = PedirArquivo 'Arquivo do backup' } }
  }
  if (TemBanco) {
    Aviso 'Isto SUBSTITUI o banco atual (o atual fica guardado em local\banco\backups).'
    if ((Read-Host '    Digite SIM para continuar') -ne 'SIM') { Write-Host '    cancelado.'; return }
    try { FazerBackup } catch { }   # guarda o estado atual antes, se o sistema estiver rodando
  }
  if (-not $local) { ObterBackup $arquivo }
  elseif (-not (Test-Path local\banco\leilao.sql)) { Falha 'nao existe local\banco\leilao.sql.' }
  AplicarBackup; EsperarSistema | Out-Null; MostrarEnderecos
}

function Cmd-Configurar {
  Passo 'Configuracao (.env)'
  $cfg = $script:cfg
  $campos = @(
    @{ k = 'IMAGEM';       t = 'Imagem do sistema (vazio = construir do codigo)';   d = 'ghcr.io/patrickcaloriocarvalho/leilao:latest' },
    @{ k = 'GHCR_USUARIO'; t = 'Usuario do GitHub';                                 d = 'PatrickCalorioCarvalho' },
    @{ k = 'GHCR_TOKEN';   t = 'Token do GitHub (classic, so read:packages)';       s = $true },
    @{ k = 'B2_KEY_ID';    t = 'Backblaze: keyID da chave de ENVIO (Write Only)';  d = '' },
    @{ k = 'B2_APP_KEY';   t = 'Backblaze: applicationKey da chave de ENVIO';       s = $true },
    @{ k = 'B2_PASTA';     t = 'Backblaze: pasta dentro do bucket';                 d = 'leilao' },
    @{ k = 'BACKUP_SENHA'; t = 'Senha para criptografar os backups';                s = $true; confirma = $true },
    @{ k = 'NUVEM_DIR';    t = 'Pasta do OneDrive/Drive neste PC (opcional)';       d = '' }
  )
  Write-Host '    Enter = aceita o valor entre [ ]. Segredos nao aparecem na tela. Backblaze/OneDrive em branco = nao usar.'
  foreach ($c in $campos) {
    $atual = if ($cfg.Contains($c.k)) { $cfg[$c.k] } else { $c.d }
    if ($c.s) {
      $dica = if ($cfg[$c.k]) { '[ja configurado - Enter mantem]' } else { '[vazio]' }
      $v = Segredo "    $($c.t) $dica"
      if ($v -and $c.confirma -and $v -ne (Segredo '    Repita a senha')) { Falha 'as senhas nao conferem. Nada foi salvo.' }
      if ($v) { $cfg[$c.k] = $v }
    } else {
      $v = Read-Host "    $($c.t) [$atual]"
      $cfg[$c.k] = if ($v.Trim()) { $v.Trim().Trim('"') } else { $atual }
    }
  }
  if ($cfg['NUVEM_DIR']) { $cfg['NUVEM_DIR'] = $cfg['NUVEM_DIR'] -replace '\\', '/'; New-Item -ItemType Directory -Force $cfg['NUVEM_DIR'] | Out-Null; $cfg['NUVEM_OK'] = 'sim' }
  else { $cfg['NUVEM_OK'] = '' }
  if ($cfg['B2_KEY_ID'] -and $cfg['BACKUP_SENHA']) { Aviso 'GUARDE a senha dos backups fora deste PC: sem ela os backups nao abrem.' }
  $linhas = @('# Gerado pelo leilao.ps1 em ' + (Get-Date -f 'yyyy-MM-dd HH:mm') + '. Modelo comentado em .env.exemplo. NUNCA envie este arquivo ao Git.')
  $linhas += $cfg.Keys | ForEach-Object { "$_=$($cfg[$_])" }
  [IO.File]::WriteAllLines("$PWD\.env", [string[]]$linhas, (New-Object Text.UTF8Encoding $false))
  Write-Host '    .env salvo.'
  LerEnv
  if (Ok 'docker compose ps -q app') { Aviso 'reinicie o sistema (Iniciar) para aplicar.' }
}

function Cmd-Preparar {
  # PC novo ou recuperacao: configuracao + Docker + pastas + imagem + ultimo backup + sistema no ar
  $faltando = (-not $script:cfg['IMAGEM'] -and -not (Test-Path app\Dockerfile)) -or ($script:cfg['IMAGEM'] -and -not $script:cfg['GHCR_TOKEN'])
  if ($Configurar -or $faltando -or (Read-Host "`n    Revisar a configuracao? (s/N)") -match '^[sS]') { Cmd-Configurar }
  Passo 'Docker';  GarantirDocker; Write-Host '    ok'
  Passo 'Pastas';  CriarPastas;    Write-Host '    ok'
  Passo 'Imagem do sistema'; AtualizarImagem
  $restaurar = -not $SemRestaurar
  if ($restaurar -and (TemBanco)) {
    Aviso 'Este PC ja tem um banco com dados.'
    $restaurar = (Read-Host '    Substituir pelo ultimo backup? (s/N)') -match '^[sS]'
  }
  if ($restaurar) { Passo 'Ultimo backup'; ObterBackup $Arg1; Passo 'Subindo o sistema'; AplicarBackup }
  else { Passo 'Subindo o sistema'; Subir }
  EsperarSistema | Out-Null; MostrarEnderecos
  Start-Process http://localhost:3000
}

function Cmd-Importar($planilha, $ano) {
  # leilao antigo (planilha) -> SQL em local\historico -> aplicado no banco como HISTORICO
  Passo 'Importar planilha antiga'
  if (-not $planilha) { $planilha = PedirArquivo 'Planilha .xlsx ou .csv' }
  if (-not (Test-Path -LiteralPath $planilha)) { Falha "arquivo nao encontrado: $planilha" }
  if (-not $ano) { $ano = Read-Host '    Ano deste leilao (ex.: 2018)' }
  $f = Get-Item -LiteralPath $planilha
  GarantirDocker; CriarPastas
  docker run --rm -v "$($f.DirectoryName):/in:ro" -v "$PWD\local\historico:/out" leilao-app:latest node gerar-sql.js "/in/$($f.Name)" "/out/$ano.sql" --ano $ano
  if ($LASTEXITCODE) { Falha 'erro ao gerar o SQL.' }
  Write-Host '    aplicando no banco...'
  cmd /c "docker compose exec -T db mysql -uleilao -pleilao --default-character-set=utf8mb4 leilao < local\historico\$ano.sql"
  if ($LASTEXITCODE) { Falha 'o banco recusou o SQL (o sistema esta rodando?).' }
  Write-Host "    pronto: leilao $ano importado como historico. Faca um Backup para guardar."
}

function Cmd-Descriptografar($arquivo) {
  # abre um .enc baixado do Backblaze: gera o .zip (relatorio final) ou o .sql (automatico) na mesma pasta
  Passo 'Abrir backup criptografado'
  if (-not $arquivo) { $arquivo = PedirArquivo 'Arquivo .enc' }
  if (-not (Test-Path -LiteralPath $arquivo)) { Falha "arquivo nao encontrado: $arquivo" }
  if (-not $env:BACKUP_SENHA) { $env:BACKUP_SENHA = Segredo '    Senha dos backups' }
  $f = Get-Item -LiteralPath $arquivo
  GarantirDocker
  docker run --rm -e BACKUP_SENHA -v "$($f.DirectoryName):/w" -w /w leilao-app:latest node /app/descriptografar.js $f.Name
}

function Cmd-Firewall {
  # libera a porta 3000 para celulares e outros PCs (precisa de administrador; pede sozinho)
  $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $admin) {
    Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" firewall"
    Write-Host '    confirmando como administrador em outra janela...'; return
  }
  Passo 'Firewall'
  netsh advfirewall firewall delete rule name="Leilao 3000" | Out-Null
  netsh advfirewall firewall add rule name="Leilao 3000" dir=in action=allow protocol=TCP localport=3000 profile=any | Out-Null
  Write-Host '    porta 3000 liberada: celulares e outros PCs da rede ja podem acessar.'
}

function Cmd-OfflineEmpacotar {
  # num PC COM internet: gera leilao-offline.tar com as imagens (leve a pasta + o tar no pendrive)
  Passo 'Empacotar para instalacao offline'
  GarantirDocker; AtualizarImagem
  docker pull mysql:8.4
  docker save -o leilao-offline.tar leilao-app:latest mysql:8.4
  if ($LASTEXITCODE) { Falha 'nao consegui gerar o pacote.' }
  Write-Host '    gerado leilao-offline.tar. Copie a pasta inteira + o tar para o PC sem internet e use "Instalacao offline > instalar".'
}
function Cmd-OfflineInstalar {
  Passo 'Instalar offline'
  if (-not (Test-Path leilao-offline.tar)) { Falha 'leilao-offline.tar nao esta nesta pasta.' }
  GarantirDocker; CriarPastas
  docker load -i leilao-offline.tar
  Subir; EsperarSistema | Out-Null; MostrarEnderecos
}

# ======================================================================  menu / despacho
function Executar($cmd, $a1, $a2) {
  switch ($cmd) {
    'iniciar'           { Cmd-Iniciar }
    'abrir'             { Cmd-Abrir $a1 }
    'parar'             { Cmd-Parar }
    'backup'            { Cmd-Backup }
    'restaurar'         { Cmd-Restaurar $a1 }
    'configurar'        { Cmd-Configurar }
    'preparar'          { Cmd-Preparar }
    'importar'          { Cmd-Importar $a1 $a2 }
    'descriptografar'   { Cmd-Descriptografar $a1 }
    'firewall'          { Cmd-Firewall }
    'offline-empacotar' { Cmd-OfflineEmpacotar }
    'offline-instalar'  { Cmd-OfflineInstalar }
    default             { Falha "comando desconhecido: $cmd" }
  }
}
function Menu {
  while ($true) {
    Write-Host ''
    Write-Host '  ==========  Sistema de Leilao  ==========' -ForegroundColor Green
    Write-Host '   1  Iniciar o sistema'
    Write-Host '   2  Abrir o sistema (impressao direta)'
    Write-Host '   3  Parar (faz backup antes)'
    Write-Host '   4  Backup agora'
    Write-Host '   5  Restaurar backup'
    Write-Host '   6  Configurar (.env: GitHub, Backblaze, senha, OneDrive)'
    Write-Host '   7  Preparar/recuperar este PC (tudo de uma vez)'
    Write-Host '   8  Importar planilha antiga'
    Write-Host '   9  Abrir backup criptografado (.enc)'
    Write-Host '  10  Liberar firewall (celulares e outros PCs)'
    Write-Host '  11  Instalacao offline (pendrive)'
    Write-Host '   0  Sair'
    $op = Read-Host "`n  Opcao"
    $cmd = switch ($op) { '1' { 'iniciar' } '2' { 'abrir' } '3' { 'parar' } '4' { 'backup' } '5' { 'restaurar' } '6' { 'configurar' }
      '7' { 'preparar' } '8' { 'importar' } '9' { 'descriptografar' } '10' { 'firewall' } '0' { return }
      '11' { if ((Read-Host '    1 = empacotar (PC com internet)  2 = instalar (PC sem internet)') -eq '2') { 'offline-instalar' } else { 'offline-empacotar' } }
      default { $null } }
    if (-not $cmd) { continue }
    try { Executar $cmd } catch { Write-Host "`nERRO: $($_.Exception.Message)" -ForegroundColor Red }
  }
}

LerEnv
# arquivo arrastado em cima do Leilao.bat
if ($Comando -and (Test-Path -LiteralPath $Comando -PathType Leaf)) {
  $Arg1 = $Comando
  $Comando = if ($Comando -match '\.(xlsx|xls|csv)$') { 'importar' } else { 'restaurar' }
}
if ($Comando -eq 'menu') { Menu; return }
$falhou = $false
try { Executar $Comando.ToLower() $Arg1 $Arg2 } catch { $falhou = $true; Write-Host "`nERRO: $($_.Exception.Message)" -ForegroundColor Red }
if (-not $SemPausa) { Read-Host "`nEnter para fechar" | Out-Null }
if ($falhou) { exit 1 }
