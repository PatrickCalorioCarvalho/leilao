# Dados históricos, backup e compartilhamento

## Trazer uma planilha antiga (2018, 2022…)
Planilha com colunas: Lote, Item, Número Animal, ValorInicial, ValorFinal, Nome, CPF, RG, Telefone, Endereço
(`.xlsx`, primeira aba; ou `.csv` com `;`).

```
utilitarios\gerar-sql.bat planilha2018.xlsx 2018
```
(ou arraste a planilha em cima do `utilitarios/gerar-sql.bat`). Só precisa do **Docker** e do sistema ligado: o `.bat` gera o SQL em `local/historico/` **e já aplica no banco**.
Já gerados e aplicados: `local/historico/2022.sql` (de `Leilao2022.xlsx`) e `local/historico/2018.sql` (de `LeilaoCompleto(Planilha1).csv`).
O script por trás é o `gerar-sql.js`; se tiver Node instalado: `node gerar-sql.js planilha.xlsx local/historico/2018.sql --ano 2018`.
Opções: `--ano 2018`, `--nome "Leilão 2018"`, `--data 2018-05-10`. Cria o leilão **como histórico**.

Para aplicar **manualmente** um `.sql`: HeidiSQL/DBeaver em `IP:3306` (usuário `leilao`, senha `leilao`) ou:
```
docker compose exec -T db mysql -uleilao -pleilao --default-character-set=utf8mb4 leilao < local/historico/2018.sql
```
> Não deixe `.sql` soltos em `local/banco/` — tudo ali roda na primeira subida do banco. Use `local/historico/`.
- Pode rodar mais de uma vez: **não duplica** pessoas; lotes já existentes são **atualizados** (só use em leilões históricos).
- Pessoa repetida entre anos (mesmo CPF, ou mesmo nome se sem CPF) é reaproveitada.
- Limpeza automática: CPF/RG/telefone falsos (`000.000.000-00`, `00,000,000-0`…) ficam vazios; "DOADO" vira a marca *doado* (reconhece "(DOADO)", "doação" etc.); "morto/viva…" vira a coluna *Vivo/Morto* em vez de ficar no nome.
- Depois de importar, rode `utilitarios/backup.bat` para o `local/banco/leilao.sql` incluir o novo histórico.

## Backup
- `utilitarios/backup.bat` → atualiza `local/banco/leilao.sql`, guarda cópia datada em `local/banco/backups/` e copia para a pasta da nuvem (se configurada).
- `parar.bat` já faz backup antes de desligar.
- Há também o backup automático (1x/hora) e o relatório final: veja [backup-e-nuvem.md](backup-e-nuvem.md).
- Faça backup também **durante** o leilão (ex.: no intervalo) e copie `local/banco/leilao.sql` para um pendrive.

## Restaurar
- `utilitarios/restaurar-banco.bat` (pede confirmação) substitui o banco atual por `local/banco/leilao.sql`.
- Em um PC novo/limpo: copie a pasta (sem `local/mysql/`) e rode `iniciar.bat`; o banco carrega sozinho de `local/banco/leilao.sql`
  na primeira vez (quando `local/mysql/` está vazio).

## Compartilhar / guardar (e-mail, pendrive) — e o Git
- **Git = só código e docs.** O `local/banco/leilao.sql`, `local/historico/`, planilhas e backups têm CPF/telefone/endereço e estão no `.gitignore` — **nunca** os envie para um repositório.
- Guarde o `local/banco/leilao.sql` (~30 KB) à parte: OneDrive, pendrive ou o pacote `.zip` do sistema ([backup-e-nuvem.md](backup-e-nuvem.md)).
- `local/mysql/` (~200 MB) é só o motor do MySQL e é recriado a partir do `.sql`. Nunca o copie com o MySQL ligado: use sempre o `.sql`.
