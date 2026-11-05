# Sistema de Leilão

Sistema simples para conduzir um leilão de gado/itens: cadastrar arrematantes, lançar lotes (animais ou itens),
registrar o arremate e imprimir a **nota promissória** (A4 duplicada: via do comprador + via da mesa).

- **Vários aparelhos ao mesmo tempo** (PCs e celulares): um lança lotes, outro arremata, outro imprime — tudo atualiza ao vivo.
- **100% offline**: só precisa de rede local. Nada de internet, CDN ou serviço externo.
- **Só precisa do Docker** no PC servidor. Os outros aparelhos usam apenas o navegador.
- **Histórico**: cada leilão fica guardado (2018, 2022…) e serve de base para sugerir animais/itens e reaproveitar clientes.
- **Backup**: automático a cada 1 hora; ao finalizar gera relatório final + backup. Com o Backblaze B2 configurado, tudo sobe sozinho e **criptografado** para um bucket privado (fila offline: envia quando houver internet).

## Começo rápido

Pré-requisito (só no PC "servidor"): **Docker Desktop**.

1. Dê dois cliques em `iniciar.bat`.
2. No PC servidor abra <http://localhost:3000> (ou use `abrir-sistema.bat`).
3. Nos outros aparelhos: aba **Leilões** → aponte a câmera do celular para o **QR code**, ou digite `http://IP-DO-SERVIDOR:3000`.
4. Ao terminar: aba **Leilões → ✅ Finalizar leilão**; depois `parar.bat`.

## O que tem na pasta

```
Leilao/
├── iniciar.bat  parar.bat  abrir-sistema.bat   ← o que se usa no dia a dia
├── docker-compose.yml  .env.exemplo  README.md
├── app/            código do sistema (só esta pasta vira a imagem Docker)
├── utilitarios/    scripts de uso raro
├── docs/           documentação
├── logo/           logo da entidade (promissórias e relatório final)
└── local/          DADOS PESSOAIS deste PC: fora do Git, nunca compartilhe
    ├── mysql/        arquivos internos do MySQL (~200 MB; recriado a partir do leilao.sql)
    ├── banco/        leilao.sql (banco exportado), finais/ (relatórios e backups), backups/
    ├── historico/    SQL gerado das planilhas antigas (2018, 2022)
    └── planilhas/    planilhas originais (xlsx/csv)
```

| Item | Para que serve |
|---|---|
| `iniciar.bat` / `parar.bat` | Liga o sistema / faz backup e desliga |
| `abrir-sistema.bat` | Abre o sistema numa janela própria e **imprime direto** (sem janela de impressão). Em outro PC, crie `servidor.txt` com `IP:3000` |
| `.env` | Configuração deste PC (imagem, Backblaze, senha dos backups). **Fora do Git**; modelo em `.env.exemplo` |
| `app/` | `server.js` (servidor), `db.js`, `backup.js` (backups e relatórios), `b2.js` (envio ao Backblaze), `schema.sql`, `public/` (telas) |

### Scripts em `utilitarios/` (só quando precisar)

| Script | Quando usar |
|---|---|
| `backup.bat` | Backup manual do banco em `local/banco/leilao.sql` (o `parar.bat` e o botão da aba Leilões já fazem isso) |
| `restaurar-banco.bat` | Emergência: volta o banco a partir de `local/banco/leilao.sql` |
| `gerar-sql.bat` | Importar uma planilha antiga como leilão histórico (arraste o arquivo; só precisa do Docker) |
| `liberar-firewall.bat` | Se o celular/outro PC não abrir o endereço (administrador, uma vez) |
| `configurar-nuvem.bat` | Só se o PC do leilão tiver OneDrive/Drive instalado (pasta sincronizada) |
| `descriptografar.bat` | Abrir um backup `.enc` baixado do Backblaze (arraste o arquivo) |
| `empacotar-offline.bat` / `instalar-offline.bat` | Instalar num PC sem internet |

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
1. `iniciar.bat` — sobe com o banco vazio (o sistema cria as tabelas e a pasta `local/` sozinho).
2. Para trazer os dados: coloque o seu `leilao.sql` (backup guardado à parte) em `local/banco/`, com `local/mysql/` vazia, **antes** do primeiro `iniciar.bat`
   — ele carrega sozinho — ou, com o sistema rodando, use `utilitarios/restaurar-banco.bat`.
3. Planilhas antigas: `utilitarios/gerar-sql.bat planilha.xlsx ANO`.

Os backups gerados pelo sistema (automático de hora em hora, relatório final) ficam em `local/banco/finais/` e **não vão para o Git**;
com o Backblaze configurado eles também sobem para a nuvem — veja [docs/backup-e-nuvem.md](docs/backup-e-nuvem.md).

> As senhas do MySQL em `docker-compose.yml` (`leilao` / `leilao_root`) são padrões para rede local fechada. Se o repositório for público
> ou o servidor ficar exposto, troque-as (em `docker-compose.yml`, `utilitarios/backup.bat` e `utilitarios/restaurar-banco.bat`).

## Tecnologia

Node.js 22 (sem framework) + MySQL 8.4, tudo em Docker. Front em HTML/JS puro; o único arquivo de terceiros é o
gerador de QR code (`app/public/qrcode.js`, embutido, funciona offline). Dependência única do servidor: `mysql2`.
