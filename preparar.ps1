# Deixa o sistema PRONTO neste PC (novo ou existente), em um passo:
#   1. monta o .env perguntando (Enter aceita o recomendado)   2. abre o Docker   3. cria as pastas   4. baixa a imagem
#   5. baixa o ULTIMO backup do Backblaze e restaura   6. sobe o sistema e abre o navegador
#
# Uso: dois cliques em preparar.bat
#   ou: powershell -ExecutionPolicy Bypass -File preparar.ps1                      (ultimo backup do Backblaze)
#       powershell -ExecutionPolicy Bypass -File preparar.ps1 -Arquivo x.zip.enc   (backup ja baixado / pendrive)
#       powershell -ExecutionPolicy Bypass -File preparar.ps1 -SemRestaurar        (so prepara e sobe)
param([string]$Arquivo = '', [switch]$SemRestaurar, [switch]$Configurar)
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

function Passo($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }
function Aviso($t) { Write-Host "    $t" -ForegroundColor Yellow }
function Falha($t) { Write-Host "`nERRO: $t" -ForegroundColor Red; Read-Host 'Enter para sair' | Out-Null; exit 1 }
function Ok($cmd) { cmd /c "$cmd >nul 2>&1"; return ($LASTEXITCODE -eq 0) }
function Segredo($t) { $s = Read-Host $t -AsSecureString; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }

# ---- 1. configuracao: pergunta cada item; [valor] = recomendado/atual, Enter aceita
Passo 'Configuracao (.env)'
$cfg = [ordered]@{}
if (Test-Path .env) {
  Get-Content .env | Where-Object { $_ -match '^\s*([A-Za-z0-9_]+)=(.*)$' } | ForEach-Object { $cfg[$Matches[1]] = $Matches[2].Trim() }
}
$campos = @(
  @{ k = 'IMAGEM';       t = 'Imagem do sistema';                                   d = 'ghcr.io/patrickcaloriocarvalho/leilao:latest' },
  @{ k = 'GHCR_USUARIO'; t = 'Usuario do GitHub';                                   d = 'PatrickCalorioCarvalho' },
  @{ k = 'GHCR_TOKEN';   t = 'Token do GitHub (classic, so read:packages)';         s = $true },
  @{ k = 'B2_KEY_ID';    t = 'Backblaze: keyID da chave de ENVIO (Write Only)';    d = '' },
  @{ k = 'B2_APP_KEY';   t = 'Backblaze: applicationKey da chave de ENVIO';         s = $true },
  @{ k = 'B2_PASTA';     t = 'Backblaze: pasta dentro do bucket';                   d = 'leilao' },
  @{ k = 'BACKUP_SENHA'; t = 'Senha para criptografar os backups';                  s = $true; confirma = $true }
)
$faltando = @($campos | Where-Object { $_.k -in 'IMAGEM', 'GHCR_TOKEN' -and -not $cfg[$_.k] }).Count -gt 0
if ($Configurar -or $faltando -or (Read-Host '    Revisar a configuracao? (s/N)') -match '^[sS]') {
  Write-Host '    Enter = aceita o valor entre [ ]. Segredos nao aparecem na tela. Deixe o Backblaze em branco para pular.'
  foreach ($c in $campos) {
    $atual = if ($cfg[$c.k]) { $cfg[$c.k] } else { $c.d }
    if ($c.s) {
      $dica = if ($cfg[$c.k]) { '[ja configurado - Enter mantem]' } else { '[vazio]' }
      $v = Segredo "    $($c.t) $dica"
      if ($v -and $c.confirma -and $v -ne (Segredo '    Repita a senha')) { Falha 'as senhas nao conferem. Rode de novo.' }
      if ($v) { $cfg[$c.k] = $v }
    } else {
      $v = Read-Host "    $($c.t) [$atual]"
      $cfg[$c.k] = if ($v.Trim()) { $v.Trim() } else { $atual }
    }
  }
  if ($cfg['B2_KEY_ID'] -and $cfg['BACKUP_SENHA']) { Aviso 'GUARDE a senha dos backups fora deste PC: sem ela os backups nao abrem.' }
  # grava sem BOM; mantem outras linhas que ja existiam (NUVEM_DIR etc.)
  $linhas = @('# Gerado pelo preparar.ps1 em ' + (Get-Date -f 'yyyy-MM-dd HH:mm') + '. Modelo comentado em .env.exemplo. NUNCA envie este arquivo ao Git.')
  $linhas += $cfg.Keys | ForEach-Object { "$_=$($cfg[$_])" }
  [IO.File]::WriteAllLines("$PWD\.env", [string[]]$linhas, (New-Object Text.UTF8Encoding $false))
  Write-Host '    .env salvo.'
}
foreach ($k in $cfg.Keys) { if ($cfg[$k]) { Set-Item "env:$k" $cfg[$k] } }
Write-Host '    ok'

# ---- 2. Docker
Passo 'Docker'
if (-not (Ok 'docker info')) {
  $dd = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  if (-not (Test-Path $dd)) { Falha 'Docker Desktop nao encontrado. Instale (docker.com/products/docker-desktop) e rode de novo.' }
  Write-Host '    abrindo o Docker Desktop (pode levar 1-2 minutos)...'
  Start-Process $dd
  for ($i = 0; $i -lt 60 -and -not (Ok 'docker info'); $i++) { Start-Sleep 3 }
  if (-not (Ok 'docker info')) { Falha 'o Docker nao iniciou. Abra o Docker Desktop, espere ficar pronto e rode de novo.' }
}
Write-Host '    ok'

# ---- 3. pastas (dados pessoais ficam todos em local\)
Passo 'Pastas'
'local\mysql', 'local\banco\finais', 'local\banco\backups', 'local\historico', 'local\planilhas', 'logo' |
  ForEach-Object { New-Item -ItemType Directory -Force $_ | Out-Null }
Write-Host '    ok'

# ---- 4. imagem do sistema
Passo 'Imagem do sistema'
if ($env:IMAGEM) {
  if ($env:GHCR_TOKEN) { $env:GHCR_TOKEN | docker login ghcr.io -u $env:GHCR_USUARIO --password-stdin 2>&1 | Out-Null }
  docker pull $env:IMAGEM
  if ($LASTEXITCODE -eq 0) { docker tag $env:IMAGEM leilao-app:latest }
  elseif (Ok 'docker image inspect leilao-app:latest') { Aviso 'sem acesso ao GitHub: usando a versao que ja esta neste PC.' }
  else { Falha 'nao consegui baixar a imagem. Confira a internet e GHCR_USUARIO / GHCR_TOKEN no .env.' }
} elseif (Test-Path app\Dockerfile) {
  docker compose build app
  if ($LASTEXITCODE) { Falha 'nao consegui construir a imagem.' }
} else { Falha 'defina IMAGEM no .env (ex.: ghcr.io/usuario/leilao:latest).' }

# ---- 5. ultimo backup
$temBanco = @(Get-ChildItem local\mysql -Force).Count -gt 0
$restaurar = -not $SemRestaurar
if ($restaurar -and $temBanco) {
  Passo 'Backup'
  Aviso 'Este PC ja tem um banco com dados.'
  $restaurar = (Read-Host '    Substituir pelo ultimo backup? (s/N)') -match '^[sS]'
}
if ($restaurar) {
  Passo 'Baixando e abrindo o ultimo backup'
  $docker = @('run', '--rm', '-e', 'B2_LER_KEY_ID', '-e', 'B2_LER_APP_KEY', '-e', 'BACKUP_SENHA', '-e', 'B2_PASTA', '-v', "$PWD\local\banco:/w")
  if ($Arquivo) {
    if (-not (Test-Path $Arquivo)) { Falha "arquivo nao encontrado: $Arquivo" }
    $f = Get-Item $Arquivo
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
  Remove-Item env:B2_LER_APP_KEY -ErrorAction SilentlyContinue
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path local\banco\leilao.novo)) {
    Remove-Item local\banco\leilao.novo -ErrorAction SilentlyContinue
    Falha 'nao consegui obter o backup (veja a mensagem acima). Nada foi alterado.'
  }
  if (Test-Path local\banco\leilao.sql) { Move-Item local\banco\leilao.sql "local\banco\backups\leilao_antes_$(Get-Date -f yyyy-MM-dd_HHmm).sql" -Force }
  Move-Item local\banco\leilao.novo local\banco\leilao.sql
}

# ---- 6. subir
Passo 'Subindo o sistema'
$env:HOST_IP = (Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
  Select-Object -First 1).IPv4Address.IPAddress
docker compose up -d --no-build
if ($LASTEXITCODE) { Falha 'docker compose falhou.' }
if ($restaurar -and $temBanco) {
  # banco ja existia: aplica o backup por cima (em PC novo o MySQL carrega o local\banco\leilao.sql sozinho)
  Write-Host '    aplicando o backup no banco...'
  cmd /c "docker compose exec -T db mysql -uroot -pleilao_root --default-character-set=utf8mb4 < local\banco\leilao.sql"
  if ($LASTEXITCODE) { Falha 'o MySQL recusou o backup (o arquivo esta em local\banco\leilao.sql).' }
  docker compose restart app | Out-Null
}
Write-Host '    aguardando o sistema responder...'
$info = $null
for ($i = 0; $i -lt 90 -and -not $info; $i++) {
  try { $info = Invoke-RestMethod http://localhost:3000/api/info -TimeoutSec 2 } catch { Start-Sleep 2 }
}
if (-not $info) { Falha 'o sistema nao respondeu. Veja: docker compose logs app' }
$leiloes = @(try { Invoke-RestMethod http://localhost:3000/api/leiloes -TimeoutSec 5 } catch { })

Write-Host "`nPronto!" -ForegroundColor Green
Write-Host "  Neste PC:       http://localhost:3000"
if ($env:HOST_IP) { Write-Host "  Outros/celular: http://$($env:HOST_IP):3000" }
Write-Host "  Leiloes no banco: $($leiloes.Count)"
Write-Host ("  Backblaze:      " + $(if ($env:B2_KEY_ID) { 'ligado (backups sobem sozinhos)' } else { 'nao configurado' }))
Start-Process http://localhost:3000
Read-Host "`nEnter para fechar" | Out-Null
