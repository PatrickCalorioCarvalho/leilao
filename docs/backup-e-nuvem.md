# Backup, relatório final e envio para o OneDrive

O objetivo: **nunca mais perder o relatório do leilão**. Tudo funciona só com **Docker + navegador** no computador do leilão;
não precisa ter OneDrive, Node ou qualquer outro programa instalado lá.

## Os níveis de proteção

| O quê | Quando | Onde fica |
|---|---|---|
| **Backup automático** | A cada **1 hora**, só se houve alteração. Grava num **único arquivo** (`leilao_auto.sql`) que **sobrescreve** o anterior. Roda em segundo plano — **não para nem trava o sistema**; se falhar, só registra no log | `local/banco/finais/auto/` |
| **Relatório final + backup** | Quando você clica **✅ Finalizar leilão** (Leilões) ou **📦 Salvar relatório final + backup** (Relatório). Também há **💾 Salvar backup agora** | `local/banco/finais/<data>_<leilão>_<tipo>/` no servidor |
| **Pacote .zip para o OneDrive** | Botão **☁ Baixar pacote (.zip) e abrir o OneDrive** | Baixa para o aparelho que clicou e abre a sua pasta do OneDrive para você soltar o arquivo |

O **pacote .zip** é um único arquivo com tudo:
- `relatorio-final.html` — totais, por arrematante (com entrega × doado) e lista de todos os lotes, com logo e dados da entidade; abre em qualquer navegador e imprime.
- `lotes.csv` e `resumo-geral.xlsx` — todos os lotes no formato da planilha antiga (CSV e Excel com as abas ResumoGeral/ResumoDetalhado).
- `entrega.html` — relatório de entrega (fichas por comprador, sem os doados), pronto para imprimir.
- `leilao.sql` — **backup completo** do banco (todos os leilões e pessoas).

**Finalizar** = salva tudo e **trava** o leilão como histórico (somente leitura). Se não conseguir gravar, **não trava** e mostra o erro.
O ícone 💾 no topo mostra o horário do último backup (e `☁N` quando há N arquivos esperando internet para subir ao Backblaze).

## Envio automático para o Backblaze B2 (recomendado)

O próprio servidor envia os backups para um bucket **privado** no Backblaze B2, sem link público e sem ninguém precisar arrastar arquivo:

| O quê | Nome no bucket |
|---|---|
| Relatório final + backup (Finalizar / Salvar) | `leilao/finais/<data>_<leilão>_<tipo>.zip.enc` (o mesmo conteúdo do pacote .zip) |
| Backup automático de hora em hora | `leilao/auto/leilao_auto.sql.gz.enc`: sempre o mesmo nome; o B2 guarda as versões anteriores |

- **Sem internet?** O arquivo fica na fila (`local/banco/finais/fila/`) e sobe sozinho quando a conexão voltar (tentativa a cada 5 min, também depois de reiniciar). Nada trava.
- **Chave só de escrita:** quem tiver o `.env` (ou mexer no PC do leilão) consegue **enviar**, mas não consegue **ver, baixar nem apagar** os backups.
- **Criptografado:** com `BACKUP_SENHA`, os arquivos saem do PC já criptografados (AES-256). Nem o Backblaze consegue ler os CPFs e endereços.

### Configurar (uma vez, ~10 min, grátis até 10 GB, sem cartão)
1. Crie a conta em **backblaze.com → B2 Cloud Storage**.
2. **Buckets → Create a Bucket**: nome único (ex.: `leilao-backups-suaentidade`), **Files: Private**, **Default Encryption: Enable**.
   Opcional: **Object Lock** ligado, para que nem você consiga apagar um backup antes de X dias (protege contra apagar por engano e contra vírus).
3. No bucket → **Lifecycle Settings** → *Keep prior versions for this number of days*: **30**. Isso guarda 30 dias de versões do backup automático.
4. **Application Keys → Add a New Application Key**:
   - Name: `leilao-envio`
   - Allow access to Bucket(s): **o bucket criado** (não "All")
   - Type of Access: **Write Only**

   Copie o **keyID** e o **applicationKey**: a chave só aparece uma vez.
5. No PC do leilão, preencha o `.env` (modelo em `.env.exemplo`):
   ```
   B2_KEY_ID=<keyID>
   B2_APP_KEY=<applicationKey>
   BACKUP_SENHA=<uma senha forte; guarde-a no seu gerenciador de senhas>
   ```
6. Rode `iniciar.bat`; deve aparecer **Backblaze: ligado**. Clique **💾 Salvar backup agora** e confira o arquivo em *Browse Files* no site.

> **Perdeu a `BACKUP_SENHA` = perdeu os backups criptografados.** Guarde-a fora do PC do leilão.

### Recuperar um backup do Backblaze
1. Entre no site da Backblaze **com a sua conta** (a chave do `.env` não permite baixar) → *Browse Files* → baixe o arquivo.
2. Arraste o `.enc` em cima de `utilitarios/descriptografar.bat`: ele pede a senha e gera o `.zip` (relatório final) ou o `.sql` (automático).
3. Para voltar o banco: pegue o `leilao.sql`, coloque em `local/banco/leilao.sql` e rode `utilitarios/restaurar-banco.bat`.

## Configurar o envio para o OneDrive (uma vez)

Como o sistema roda offline, o envio é feito **pelo navegador, por você**, num passo simples (arrastar o arquivo):

1. No OneDrive (navegador, com a sua conta): crie uma pasta, ex.: **Leilao-backups**.
2. Na pasta: **Compartilhar → "Solicitar arquivos"** (ou "Request files") e copie o link gerado. Quem abre esse link **só consegue enviar arquivos**, sem ver o resto do seu OneDrive.
3. No sistema: **Leilões → Configuração → Link de envio do OneDrive** → cole o link → Salvar. (Os próximos leilões herdam o link.)

Depois, no fim do leilão: **✅ Finalizar leilão** → **☁ Baixar pacote (.zip) e abrir o OneDrive** → o zip baixa e a página do OneDrive abre → **solte o zip lá**. Se o local estiver sem internet, guarde o zip e envie depois (ele fica na pasta Downloads; e o backup também está em `local/banco/finais/`).

> Sem o link configurado, o botão só baixa o zip e avisa como configurar.

## Opcional: pasta sincronizada no servidor
Se o PC do leilão tiver OneDrive/Google Drive instalado, `utilitarios/configurar-nuvem.bat` define uma pasta sincronizada que receberá
automaticamente cada relatório final e backup (o OneDrive envia quando houver internet). Cria um `.env` **só nesse PC**.
Se a pasta não existir, o `iniciar.bat` avisa e segue sem ela — nada quebra.

## Restaurar
- `utilitarios/restaurar-banco.bat` usa `local/banco/leilao.sql` (gerado por `utilitarios/backup.bat`).
- Para restaurar de um pacote, relatório final ou backup automático: pegue o `leilao.sql`, coloque em `local/banco/leilao.sql` e rode `utilitarios/restaurar-banco.bat`
  (ou, num PC novo/limpo, com a pasta `local/mysql/` vazia, rode `iniciar.bat` e ele carrega sozinho).
