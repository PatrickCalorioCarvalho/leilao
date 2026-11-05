# Instalador do Sistema de Leilao (estilo Chocolatey). Abra o PowerShell e cole:
#
#   Set-ExecutionPolicy Bypass -Scope Process -Force; [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://gist.githubusercontent.com/PatrickCalorioCarvalho/e49b8d05b90ecfb101c61d6bba3306c6/raw/instalar.ps1'))
#
# O que faz: instala/abre o Docker Desktop, baixa a imagem privada do sistema (pede o token do GitHub),
# extrai os arquivos para a pasta escolhida e roda "leilao.ps1 preparar" (configura o .env, restaura o ultimo backup e sobe o sistema).
# Este arquivo e PUBLICO e nao contem segredos: token, chaves e senhas sao pedidos na hora.
# Rodar de novo = ATUALIZA os arquivos do sistema (o .env e a pasta local\ com os dados sao preservados).

function Install-Leilao {
  $imagem = 'ghcr.io/patrickcaloriocarvalho/leilao:latest'
  $usuarioPadrao = 'PatrickCalorioCarvalho'
  function Passo($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }
  function Erro($t) { Write-Host "`nERRO: $t" -ForegroundColor Red }
  function Ok($cmd) { cmd /c "$cmd >nul 2>&1"; return ($LASTEXITCODE -eq 0) }
  function Segredo($t) { $s = Read-Host $t -AsSecureString; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }

  Write-Host "`nSistema de Leilao - instalador" -ForegroundColor Green

  # ---- 1. Docker
  Passo 'Docker'
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host '    O Docker Desktop nao esta instalado neste PC.'
    if ((Read-Host '    Instalar agora? (S/n)') -match '^[nN]') { Write-Host '    Instale em https://www.docker.com/products/docker-desktop e rode o comando de novo.'; return }
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Erro 'winget nao encontrado. Instale o Docker Desktop pelo site e rode de novo.'; return }
    winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE) { Erro 'a instalacao do Docker falhou. Abra o PowerShell como ADMINISTRADOR e rode de novo.'; return }
    Write-Host "`n    Docker instalado. REINICIE o computador, abra o Docker Desktop uma vez (aceite os termos)" -ForegroundColor Yellow
    Write-Host '    e rode este mesmo comando de novo.' -ForegroundColor Yellow
    return
  }
  if (-not (Ok 'docker info')) {
    $dd = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dd) { Write-Host '    abrindo o Docker Desktop (1-2 minutos)...'; Start-Process $dd }
    for ($i = 0; $i -lt 60 -and -not (Ok 'docker info'); $i++) { Start-Sleep 3 }
    if (-not (Ok 'docker info')) { Erro 'o Docker nao respondeu. Abra o Docker Desktop, espere ficar pronto e rode de novo.'; return }
  }
  Write-Host '    ok'

  # ---- 2. pasta
  Passo 'Pasta de instalacao'
  $pasta = Read-Host '    Onde instalar? [C:\Leilao]'
  if (-not $pasta.Trim()) { $pasta = 'C:\Leilao' }
  New-Item -ItemType Directory -Force $pasta | Out-Null
  $envf = Join-Path $pasta '.env'
  $cfg = @{}
  if (Test-Path $envf) {
    Get-Content $envf | Where-Object { $_ -match '^\s*([A-Za-z0-9_]+)=(.*)$' } | ForEach-Object { $cfg[$Matches[1]] = $Matches[2].Trim() }
    Write-Host '    instalacao existente encontrada: os arquivos serao ATUALIZADOS (o .env e os dados ficam).'
  }
  if ($cfg.IMAGEM) { $imagem = $cfg.IMAGEM }

  # ---- 3. imagem privada
  Passo 'Acesso ao sistema (GitHub)'
  $padrao = if ($cfg.GHCR_USUARIO) { $cfg.GHCR_USUARIO } else { $usuarioPadrao }
  $usuario = Read-Host "    Usuario do GitHub [$padrao]"
  if (-not $usuario.Trim()) { $usuario = $padrao }
  $dica = if ($cfg.GHCR_TOKEN) { '[ja configurado - Enter mantem]' } else { '(classic, so read:packages)' }
  $token = Segredo "    Token do GitHub $dica"
  if (-not $token) { $token = $cfg.GHCR_TOKEN }
  if (-not $token) { Erro 'o token e obrigatorio (GitHub > Settings > Developer settings > Tokens (classic) > read:packages).'; return }
  $token | docker login ghcr.io -u $usuario --password-stdin 2>&1 | Out-Null
  if ($LASTEXITCODE) { Erro 'o GitHub recusou o usuario/token.'; return }
  Write-Host "    baixando $imagem ..."
  docker pull $imagem
  if ($LASTEXITCODE) { Erro 'nao consegui baixar a imagem.'; return }

  # ---- 4. arquivos do sistema (vem dentro da imagem)
  Passo 'Arquivos do sistema'
  $cid = (docker create $imagem | Select-Object -Last 1).Trim()
  docker cp "${cid}:/app/implantacao/." $pasta
  $copiou = $LASTEXITCODE -eq 0
  docker rm $cid | Out-Null
  if (-not $copiou -or -not (Test-Path (Join-Path $pasta 'leilao.ps1'))) { Erro 'a imagem nao tem os arquivos de instalacao.'; return }
  # versoes antigas tinham varios .bat soltos; hoje e tudo pelo Leilao.bat
  'iniciar.bat', 'parar.bat', 'abrir-sistema.bat', 'preparar.bat', 'preparar.ps1', 'utilitarios' |
    ForEach-Object { Remove-Item (Join-Path $pasta $_) -Recurse -Force -ErrorAction SilentlyContinue }
  $novo = -not (Test-Path $envf)
  if ($novo) {
    $linhas = @("IMAGEM=$imagem", "GHCR_USUARIO=$usuario", "GHCR_TOKEN=$token")
    [IO.File]::WriteAllLines($envf, [string[]]$linhas, (New-Object Text.UTF8Encoding $false))
  }
  Write-Host "    ok: $pasta"

  # ---- 5. configuracao, ultimo backup e sistema no ar
  Passo 'Configuracao, backup e sistema'
  if ($novo) { & (Join-Path $pasta 'leilao.ps1') preparar -Configurar } else { & (Join-Path $pasta 'leilao.ps1') preparar }
  Write-Host "`nNo dia a dia: dois cliques em $pasta\Leilao.bat (menu: iniciar, parar, backup...)." -ForegroundColor Green
}
Install-Leilao
