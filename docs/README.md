# Passo a passo — do zero ao leilão com backup na nuvem

Guia único para quem vai instalar e usar o sistema. Cada etapa tem um link para o detalhe.

| Etapa | Quem faz | Quando |
|---|---|---|
| [1. Preparar a nuvem](#1-preparar-a-nuvem-uma-vez) | responsável pelo sistema | uma vez |
| [2. Publicar o sistema](#2-publicar-o-sistema-uma-vez) | responsável pelo sistema | uma vez (e a cada atualização) |
| [3. Instalar no PC do leilão](#3-instalar-no-pc-do-leilão) | qualquer pessoa com o `.env` | uma vez por PC |
| [4. No dia do leilão](#4-no-dia-do-leilão) | equipe da mesa | todo leilão |
| [5. Depois do leilão](#5-depois-do-leilão) | equipe da mesa | todo leilão |
| [6. Recuperar um backup](#6-recuperar-um-backup) | responsável pelo sistema | só em emergência |

---

## 1. Preparar a nuvem (uma vez)

**Backblaze B2**, onde ficam os backups (grátis até 10 GB, sem cartão):
1. Crie a conta em backblaze.com → *B2 Cloud Storage*.
2. Crie um bucket **Private** com *Default Encryption* ligado.
3. Em *Lifecycle Settings*, guarde as versões anteriores por **30 dias**.
4. Crie uma *Application Key* **Write Only**, presa a esse bucket. Anote o `keyID` e o `applicationKey`.
5. Escolha uma **senha dos backups** e guarde no seu gerenciador de senhas.

➡ Detalhes campo a campo: [backup-e-nuvem.md](backup-e-nuvem.md#configurar-uma-vez-10-min-grátis-até-10-gb-sem-cartão)

## 2. Publicar o sistema (uma vez)

Já está feito: o repositório e a imagem (`ghcr.io/patrickcaloriocarvalho/leilao`) são **públicos** e não precisam de token.

**Atualizar depois:** `git add -A && git commit -m "..." && git push`. A imagem nova sai em ~1 min.

➡ Detalhes: [implantacao.md](implantacao.md)

## 3. Instalar no PC do leilão

1. Instale o **Docker Desktop**.
2. Copie a pasta com `Leilao.bat`, `leilao.ps1`, `docker-compose.yml`, `.env.exemplo` e o **`.env`**. Mais fácil ainda: use o [instalador de um comando](../README.md#instalar-num-pc-novo-um-comando), que traz tudo isso sozinho:
   ```
   IMAGEM=ghcr.io/patrickcaloriocarvalho/leilao:latest
   B2_KEY_ID=...
   B2_APP_KEY=...
   BACKUP_SENHA=...
   ```
3. Dê dois cliques em **`Leilao.bat`** e escolha **6 – Preparar**. Ele faz tudo sozinho:
   - monta o `.env` **perguntando item a item**. O valor entre `[ ]` é o recomendado e o **Enter aceita**. Se você não trouxe o `.env`, ele cria;
     para revisar depois, responda **s** em "Revisar a configuração?";
   - abre o Docker, se estiver fechado;
   - cria as pastas e baixa a imagem;
   - pede a **chave de leitura** do Backblaze (não fica salva), baixa o **último backup** e o restaura;
   - sobe o sistema e abre o navegador.
4. Se o celular ou outro PC não abrir o endereço, use **9 – Liberar firewall** (ele pede administrador sozinho; uma vez).
5. Teste: crie um leilão `TESTE`, clique em **✅ Finalizar leilão** e veja o arquivo chegar no Backblaze (*Browse Files*).

Nos dias seguintes, use **1 – Iniciar**. O **Preparar** é para instalar ou para **recuperar** o PC.

Local sem internet? Prepare antes com [instalacao-offline.md](instalacao-offline.md).

## 4. No dia do leilão

1. `Leilao.bat → Iniciar` (com internet, já baixa a versão mais nova).
2. No PC da mesa: `Leilao.bat → Abrir` (imprime as promissórias direto).
3. Nos celulares e outros PCs: aba **Leilões** → aponte a câmera para o **QR code**.
4. Lance os lotes, registre os arremates e imprima as promissórias.

Não há backup automático: **o backup é feito ao Finalizar o leilão** (próximo passo). Até lá, os dados ficam no banco deste PC.
O 💾 no topo mostra o horário do último backup, e `☁N` indica N arquivos esperando internet.

➡ Cada tela em detalhe: [uso.md](uso.md)

## 5. Depois do leilão

1. Aba **Leilões → ✅ Finalizar leilão**. Isso gera o relatório final + backup, envia para o Backblaze e trava o leilão como histórico.
2. Imprima o **relatório de entrega** para quem vai entregar os animais.
3. Antes de desligar, confira que o 💾 **não** mostra `☁` (tudo enviado). Se mostrar, deixe o PC ligado com internet mais um pouco.
4. `Leilao.bat → Parar`.

## 6. Recuperar um backup

**Jeito fácil:** `Leilao.bat` → **4 – Restaurar** (ou **6 – Preparar**) e responda **s** quando ele perguntar se deve substituir o banco.
Ele baixa o backup mais recente do Backblaze (relatório final ou automático, o que for mais novo) e o aplica.
O banco anterior fica guardado em `local\banco\backups\leilao_antes_<data>.sql`.

**Sem internet**, com o backup num pendrive: arraste o arquivo (`.enc`, `.zip` ou `.sql`) em cima do `Leilao.bat`.

**Manual:**
1. Entre no Backblaze **com a sua conta** → *Browse Files* → baixe o arquivo (`finais/...zip.enc`).
2. `Leilao.bat` → **8 – Abrir backup criptografado**, arraste o arquivo para a janela e digite a senha dos backups.
3. Pegue o `leilao.sql` (de dentro do `.zip`, ou o próprio `.sql`), coloque em `local\banco\leilao.sql` e rode `Leilao.bat → Restaurar`.

➡ Mais opções: [backup-e-nuvem.md](backup-e-nuvem.md#restaurar) · [dados-historicos.md](dados-historicos.md)

---

### Mais documentação
- [arquitetura.md](arquitetura.md): como o sistema é montado, banco e API
- [dados-historicos.md](dados-historicos.md): importar planilhas antigas (2018, 2022…)
- [instalacao-offline.md](instalacao-offline.md): instalar sem internet e problemas comuns
