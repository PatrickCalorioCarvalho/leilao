# Backup: guardar ao finalizar, recuperar quando precisar

O backup tem **duas rotinas**, e só elas:

| Rotina | Como | O que acontece |
|---|---|---|
| **Guardar** | No sistema: **Leilões → ✅ Finalizar leilão** | Gera o relatório final + **backup completo**, grava **neste PC** (`local/banco/finais/`), **envia ao Backblaze** (criptografado) e trava o leilão como histórico |
| **Recuperar** | `Leilao.bat` → **4 – Restaurar** (ou **6 – Preparar**, num PC novo) | Volta o banco a partir do último leilão finalizado: do Backblaze, deste PC ou de um arquivo |

Não existe backup automático de hora em hora. **Durante o leilão, os dados ficam no banco deste PC** (`local/mysql`);
eles só viram backup ao **Finalizar**.

## O que vai no backup
O backup é **o banco inteiro**: todos os leilões, lotes, arrematantes **e** tudo da entidade, que fica no banco:
dados (beneficiário, CNPJ, endereço, cidade), **logo** e **texto da promissória**. Restaurar traz tudo de volta, igual estava.

Cada Finalizar gera uma pasta `local/banco/finais/<data>_<leilão>_final/` (e o mesmo conteúdo em `.zip` no Backblaze) com:
- `leilao.sql`: **o backup completo do banco** (é o que a restauração usa);
- `relatorio-final.html`: totais, por arrematante e todos os lotes, com logo e dados da entidade;
- `lotes.csv` e `resumo-geral.xlsx`: no formato da planilha antiga;
- `entrega.html`: relatório de entrega (fichas por comprador, sem os doados).

**Finalizar** só trava o leilão se conseguir gravar o backup; se falhar, mostra o erro e não trava.
O 💾 no topo mostra o horário do último backup e `☁N` quando há N arquivos esperando internet para subir.

## Backblaze B2

O servidor envia o backup ao Finalizar para um bucket **privado** no Backblaze, sem link público:
`leilao/finais/<data>_<leilão>_final.zip.enc`.

- **Sem internet ao finalizar?** O arquivo fica na fila (`local/banco/finais/fila/`) e sobe sozinho quando a conexão voltar
  (nova tentativa a cada 5 min, também depois de reiniciar). Antes de desligar o PC, confira que o 💾 **não** mostra `☁`.
- **Chave só de escrita:** quem tiver o `.env` consegue **enviar**, mas não consegue **ver, baixar nem apagar** os backups.
- **Criptografado:** com `BACKUP_SENHA`, o arquivo sai do PC já criptografado (AES-256). Nem o Backblaze lê os dados.

### Configurar (uma vez, ~10 min, grátis até 10 GB, sem cartão)
1. Crie a conta em **backblaze.com → B2 Cloud Storage**.
2. **Buckets → Create a Bucket**: nome único (ex.: `leilao-backups-suaentidade`), **Files: Private**, **Default Encryption: Enable**.
   Opcional: **Object Lock**, para que nem você consiga apagar um backup antes de X dias (protege contra engano e vírus).
3. **Application Keys → Add a New Application Key** (chave de **envio**):
   - Name: `leilao-envio`
   - Allow access to Bucket(s): **o bucket criado** (não "All")
   - Type of Access: **Write Only**

   Copie o **keyID** e o **applicationKey**: a chave só aparece uma vez.
4. Crie uma **segunda** chave (de **leitura**, para restaurar): Name `leilao-restaurar`, o mesmo bucket, Type of Access **Read Only**.
   Ela **não vai no `.env`**: guarde no seu gerenciador de senhas. O Restaurar/Preparar pede essa chave só na hora.
5. No PC do leilão: `Leilao.bat` → **5 – Configurar** → informe a chave de envio e a **senha dos backups**.
6. `Leilao.bat` → **1 – Iniciar**: deve aparecer **Backblaze: ligado**.
7. Teste: no sistema, crie um leilão `TESTE` (aba Leilões) e clique **✅ Finalizar leilão**. Confira o arquivo em *Browse Files* no site.
   O leilão de teste fica como histórico; para apagar, use **🔓 Destravar** e depois **🗑 Excluir**.

> **Perdeu a `BACKUP_SENHA` = perdeu os backups criptografados.** Guarde-a fora do PC do leilão.

## Recuperar
`Leilao.bat` → **4 – Restaurar** pergunta de onde:

| Opção | De onde vem |
|---|---|
| **1** (Enter) | o último leilão finalizado **no Backblaze**: pede a chave **Read Only** e a senha dos backups |
| **2** | o último leilão finalizado **neste PC** (`local/banco/finais/`) |
| **3** | um **arquivo**: `.enc` baixado do Backblaze, o `.zip` do relatório final ou um `leilao.sql` (pendrive) |

Antes de substituir, o banco atual é guardado em `local/banco/backups/leilao_antes_<data>.sql`.

**Atalho:** arraste o arquivo (`.enc`, `.zip` ou `.sql`) em cima do `Leilao.bat`.
**PC novo:** o instalador de um comando (ou **6 – Preparar**) já restaura o último backup do Backblaze sozinho.

**Só quero ver o relatório de um backup criptografado:** baixe o `.enc` no site do Backblaze (com a sua conta) →
`Leilao.bat` → **8 – Abrir backup criptografado** → ele gera o `.zip` com o relatório final, as planilhas e o `leilao.sql`.

## Opcional: OneDrive
- **Pasta sincronizada no servidor:** se o PC do leilão tiver OneDrive/Google Drive instalado, informe a pasta em **5 – Configurar**.
  Cada Finalizar também é copiado para lá (o OneDrive envia quando houver internet).
- **Pelo navegador:** em **Leilões → Configuração**, cole um link "Solicitar arquivos" do OneDrive. Depois de finalizar,
  **☁ Baixar pacote (.zip) e abrir o OneDrive** baixa o zip e abre a página para você soltar o arquivo.
