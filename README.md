# Sistema de Leilão

Sistema simples para conduzir um leilão de gado/itens: cadastrar arrematantes, lançar lotes (animais ou itens),
registrar o arremate e imprimir a **nota promissória** (A4 duplicada: via do comprador + via da mesa).

- **Vários aparelhos ao mesmo tempo** (PCs e celulares): um lança lotes, outro arremata, outro imprime — tudo atualiza ao vivo.
- **100% offline**: só precisa de rede local. Nada de internet, CDN ou serviço externo.
- **Só precisa do Docker** no PC servidor. Os outros aparelhos usam apenas o navegador.
- **Histórico**: cada leilão fica guardado (2018, 2022…) e serve de base para sugerir animais/itens e reaproveitar clientes.
- **Backup**: automático a cada 1 hora; ao finalizar gera relatório final + backup. Com o Backblaze B2 configurado, tudo sobe sozinho e **criptografado** para um bucket privado (fila offline: envia quando houver internet).

## Instalar num PC novo (um comando)

Do mesmo jeito que o Chocolatey: um comando no PowerShell instala e deixa tudo pronto.

**Antes, tenha à mão:**
- o **token do GitHub** (classic, só `read:packages`), para baixar o sistema;
- as chaves do **Backblaze**: a de **envio** (Write Only) e a de **leitura** (Read Only), para restaurar o último backup;
- a **senha dos backups**.

**Passo a passo:**
1. Clique com o botão direito no menu Iniciar → **Terminal (Administrador)** ou **Windows PowerShell (Administrador)**.
   O Administrador só é necessário se o Docker ainda não estiver instalado.
2. Cole e aperte Enter:
   ```powershell
   Set-ExecutionPolicy Bypass -Scope Process -Force; [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('URL_DO_INSTALADOR'))
   ```
3. Responda às perguntas. O valor entre `[ ]` é o recomendado e o **Enter aceita**:

   | Pergunta | O que responder |
   |---|---|
   | Instalar o Docker agora? | **Enter** (sim). Depois **reinicie o PC**, abra o Docker Desktop uma vez e **rode o comando de novo** |
   | Onde instalar? `[C:\Leilao]` | Enter |
   | Usuário do GitHub `[PatrickCalorioCarvalho]` | Enter |
   | Token do GitHub | cole o token (não aparece na tela) |
   | Backblaze: keyID / applicationKey de ENVIO | as da chave **Write Only** (ou Enter para pular) |
   | Pasta dentro do bucket `[leilao]` | Enter |
   | Senha para criptografar os backups | a senha dos backups (duas vezes) |
   | Chave de LEITURA do Backblaze | as da chave **Read Only**. Ela **não fica salva** |

4. No fim, o navegador abre o sistema com o último backup já carregado.

**Atualizar** o sistema num PC já instalado: rode o mesmo comando. Os arquivos são atualizados, e o `.env` e os dados (`local\`) ficam como estavam.

> O instalador ([instalar.ps1](instalar.ps1)) é público e não tem segredos: ele baixa a imagem **privada** com o seu token
> e extrai dela os arquivos do sistema. Sem o token, ninguém instala.

## Começo rápido (dia a dia)

Pré-requisito (só no PC "servidor"): **Docker Desktop**.

Tudo é feito pelo **`Leilao.bat`**. Dois cliques nele abrem o menu:

```
  ==========  Sistema de Leilao  ==========
   1  Iniciar o sistema
   2  Abrir o sistema (impressao direta)
   3  Parar (faz backup antes)
   4  Backup agora
   5  Restaurar backup
   6  Configurar (.env: GitHub, Backblaze, senha, OneDrive)
   7  Preparar/recuperar este PC (tudo de uma vez)
   8  Importar planilha antiga
   9  Abrir backup criptografado (.enc)
  10  Liberar firewall (celulares e outros PCs)
  11  Instalacao offline (pendrive)
   0  Sair
```

1. **1 – Iniciar**: mostra o endereço do sistema (`http://localhost:3000` e o IP para celulares).
2. No PC da mesa: **2 – Abrir** (janela própria que imprime as promissórias direto).
3. Nos outros aparelhos: aba **Leilões** → aponte a câmera do celular para o **QR code**, ou digite `http://IP-DO-SERVIDOR:3000`.
4. Ao terminar: aba **Leilões → ✅ Finalizar leilão**; depois **3 – Parar**.

**Atalhos:** arraste um arquivo em cima do `Leilao.bat`. Uma planilha (`.xlsx`/`.csv`) é importada como leilão histórico; um backup (`.enc`, `.zip`, `.sql`) é restaurado.
Pela linha de comando também funciona: `Leilao.bat iniciar`, `Leilao.bat parar`, `Leilao.bat backup`, `Leilao.bat abrir`…

## O que tem na pasta

```
Leilao/
├── Leilao.bat      ← o único arquivo que você precisa abrir (menu)
├── leilao.ps1      a lógica de todas as opções do menu
├── instalar.ps1    instalador de um comando (público, sem segredos)
├── docker-compose.yml  .env.exemplo  README.md
├── app/            código do sistema (só esta pasta vira a imagem Docker)
├── docs/           documentação
├── logo/           logo da entidade (promissórias e relatório final)
└── local/          DADOS PESSOAIS deste PC: fora do Git, nunca compartilhe
    ├── mysql/        arquivos internos do MySQL (~200 MB; recriado a partir do leilao.sql)
    ├── banco/        leilao.sql (banco exportado), finais/ (relatórios e backups), backups/
    ├── historico/    SQL gerado das planilhas antigas (2018, 2022)
    └── planilhas/    planilhas originais (xlsx/csv)
```

| Opção do menu | Quando usar |
|---|---|
| **Iniciar** / **Parar** | Liga o sistema (já baixa a versão mais nova) / faz backup e desliga |
| **Abrir** | Janela própria que **imprime direto**. Em outro PC: copie `Leilao.bat` + `leilao.ps1` e crie `servidor.txt` com `IP:3000` |
| **Backup** | Backup manual em `local/banco/leilao.sql` + cópia datada em `local/banco/backups/` (o Parar e o botão da aba Leilões já fazem isso) |
| **Restaurar** | Volta o banco: o último backup do Backblaze, o `local/banco/leilao.sql` ou um arquivo. O banco atual é guardado antes |
| **Configurar** | Monta o `.env`, perguntando item a item (Enter aceita o valor sugerido): GitHub, Backblaze, senha dos backups, pasta do OneDrive |
| **Preparar** | **Instala ou recupera** o PC num passo: configuração, Docker, pastas, imagem, último backup e sistema no ar |
| **Importar planilha** | Leilão antigo (`.xlsx`/`.csv`) como histórico |
| **Abrir backup criptografado** | Abre um `.enc` baixado do Backblaze (gera o `.zip`/`.sql`) |
| **Liberar firewall** | Se o celular/outro PC não abrir o endereço (pede administrador sozinho; uma vez) |
| **Instalação offline** | Empacotar as imagens num PC com internet e instalar num PC sem internet (pendrive) |

O `.env` guarda a configuração deste PC (imagem, Backblaze, senha dos backups). Ele fica **fora do Git**; o modelo está em `.env.exemplo`.
Em `app/` ficam `server.js` (servidor), `db.js`, `backup.js` (backups e relatórios), `b2.js` (envio ao Backblaze), `restaurar.js`, `schema.sql` e `public/` (telas).

## Documentação

> **Começando agora?** Siga o [passo a passo completo](docs/README.md).

- [docs/uso.md](docs/uso.md) — como usar cada tela no dia do leilão
- [docs/backup-e-nuvem.md](docs/backup-e-nuvem.md) — backup, relatório final, Backblaze B2 e como recuperar
- [docs/implantacao.md](docs/implantacao.md) — GitHub privado, imagem no GitHub (ghcr.io) e instalar num PC só com o `.env`
- [docs/arquitetura.md](docs/arquitetura.md) — como o sistema é montado, banco de dados e API
- [docs/dados-historicos.md](docs/dados-historicos.md) — importar planilhas antigas (2018, 2022…), restaurar e compartilhar
- [docs/instalacao-offline.md](docs/instalacao-offline.md) — instalar sem internet e solução de problemas

## Versionamento (Git) e dados

O repositório guarda **só o código e a documentação**. Tudo que tem dados pessoais (CPF, telefone, endereço) fica **fora do Git**
(`.gitignore`): a pasta **`local/`** inteira e o `.env` de cada PC. Como segunda trava, `.sql` (exceto `app/schema.sql`), planilhas e `.zip`/`.tar` também são ignorados em qualquer lugar.

**Clonou num PC novo?**
1. `Leilao.bat → Iniciar` — sobe com o banco vazio (o sistema cria as tabelas e a pasta `local/` sozinho).
2. Para trazer os dados: coloque o seu `leilao.sql` (backup guardado à parte) em `local/banco/`, com `local/mysql/` vazia, **antes** do primeiro `Leilao.bat → Iniciar`
   — ele carrega sozinho — ou, com o sistema rodando, use `Leilao.bat → Restaurar`.
3. Planilhas antigas: arraste a planilha em cima do `Leilao.bat` (ou `Leilao.bat importar planilha.xlsx 2018`).

Os backups gerados pelo sistema (automático de hora em hora, relatório final) ficam em `local/banco/finais/` e **não vão para o Git**;
com o Backblaze configurado eles também sobem para a nuvem — veja [docs/backup-e-nuvem.md](docs/backup-e-nuvem.md).

> As senhas do MySQL em `docker-compose.yml` (`leilao` / `leilao_root`) são padrões para rede local fechada. Se o repositório for público
> ou o servidor ficar exposto, troque-as (em `docker-compose.yml` e no `leilao.ps1`).

## Tecnologia

Node.js 22 (sem framework) + MySQL 8.4, tudo em Docker. Front em HTML/JS puro; o único arquivo de terceiros é o
gerador de QR code (`app/public/qrcode.js`, embutido, funciona offline). Dependência única do servidor: `mysql2`.
