# Arquitetura

```
 PC 1 (navegador) ─┐
 PC 2 (navegador) ─┼─ rede local ─►  [ app: Node.js :3000 ] ──► [ MySQL 8.4 :3306 ]
 PC 3 (navegador) ─┘                  serve as telas + API        local/mysql/ (disco)
                                      avisa mudanças (SSE)
```

Os dois serviços rodam em Docker (`docker-compose.yml`) no PC servidor. Os demais PCs só usam o navegador.

## Arquivos do código
| Arquivo | Função |
|---|---|
| `app/server.js` | Servidor HTTP: API JSON, arquivos estáticos, eventos em tempo real |
| `app/db.js` | Conexão MySQL, espera o banco subir, cria/migra tabelas na partida |
| `app/backup.js` | Dump SQL completo, relatório final (HTML/CSV), pastas local/nuvem; o backup é feito só ao Finalizar o leilão |
| `app/schema.sql` | Definição das tabelas |
| `app/public/index.html`, `app.js`, `style.css` | Telas (uma página, abas por `#hash`: mesa, lotes, pessoas, promissorias, relatorio, leiloes) |
| `app/public/imprimir.html` | Layout e impressão das promissórias + valor por extenso |
| `app/gerar-sql.js` | Planilha → INSERTs SQL |

## Banco de dados
- **leilao** — `id, nome, data, beneficiario, cidade, vencimento, ativo, historico`.
  Apenas um leilão `ativo=1`; `historico=1` bloqueia alterações.
- **pessoa** — `id, nome, cpf, rg, telefone, endereco`. Compartilhada entre leilões.
- **lote** — `id, leilao_id, numero, sub, descricao, animal_num, condicao, valor_inicial, doado, pessoa_id, valor_final`.
  `UNIQUE(leilao_id, numero, sub)`. Lote **arrematado** = `pessoa_id` e `valor_final` preenchidos.
  - `sub` está reservado (sempre 0 hoje; o rótulo do lote é o número com 3 dígitos: `001`); `condicao` = `''`, `vivo` ou `morto`;
    `doado=1` = vendido mas **sem entrega** (filtrável no relatório).

Credenciais (padrão de rede local): banco `leilao`, usuário `leilao` / senha `leilao`; root `leilao_root`.
Altere em `docker-compose.yml` se necessário. A porta 3306 está exposta para consultas/INSERTs manuais
(HeidiSQL, DBeaver, Workbench) em `IP-DO-SERVIDOR:3306`.

## API (resumo)
| Método e rota | O que faz |
|---|---|
| `GET/PUT /api/leilao` | Leilão ativo e sua configuração |
| `GET /api/leiloes`, `POST /api/leilao`, `POST /api/leilao/ativar`, `POST /api/leilao/:id/historico`, `DELETE /api/leilao/:id` | Gerenciar leilões |
| `GET/POST /api/pessoas`, `PUT/DELETE /api/pessoas/:id` | Pessoas (`?q=` busca nome/CPF) |
| `GET /api/lotes`, `POST /api/lotes`, `PUT/DELETE /api/lotes/:id` | Lotes do leilão ativo |
| `POST /api/lotes/:id/arrematar` | Arremata. Body: `pessoa_id, valor_final, doado, condicao, animal_num`. Com `doado` o lote fecha como doado (sem entrega) |
| `POST /api/lotes/:id/desfazer` | Desfaz o arremate |
| `GET /api/itens` | Sugestões de descrição (histórico) |
| `GET /api/animal?num=` | Rastreia um nº de animal em **todos** os leilões |
| `GET /api/resumo` | Totais (inclui doado/entrega) e por comprador |
| `GET /api/relatorio` | Lotes filtrados: `?pessoa=ID&doado=entrega\|doados&condicao=vivo\|morto&situacao=todos` |
| `GET /api/promissoria?ids=..` ou `?lote=ID` | Dados para impressão |
| `GET /api/export.csv`, `GET /api/export.xlsx` | Resumo geral no formato da planilha antiga (CSV / Excel com 2 abas); aceitam os filtros do relatório |
| `GET /api/entrega.html` | Relatório de entrega para imprimir (`?agrupar=0` lista por lote, `?pessoa=ID`) |
| `POST /api/finalizar` | Relatório final + backup (local/nuvem). Body `{travar:true}` também marca o leilão como histórico |
| `POST /api/backup` | Backup completo agora |
| `GET /api/info` | IP do servidor (QR), se há nuvem configurada, último backup |
| `GET /api/baixar/backup.sql`, `/api/baixar/relatorio-final.html` | Downloads pelo navegador |
| `GET /api/events` | Stream SSE: avisa os navegadores para recarregar |

## Decisões
- **Sem login**: pensado para rede local fechada do evento.
- **Sem bibliotecas no front**: funciona offline sem nada a baixar.
- **Tempo real por SSE**: cada alteração notifica todos os navegadores; eles recarregam a lista.
- **Banco exportado em `local/banco/leilao.sql`**: leve para guardar/compartilhar; `local/mysql/` é só o motor do MySQL.
