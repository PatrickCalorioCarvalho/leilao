# Publicar e instalar (repositório e imagem públicos no GitHub)

O **código** e a **imagem Docker** são **públicos**: não têm nenhum dado de ninguém.
O que é de cada entidade (leilões, arrematantes, CPFs, logo, texto da promissória) fica no **banco do PC do leilão**
e nos **backups criptografados do Backblaze**, que são privados. Nada disso vai para o GitHub.

```
você (git push) ──► GitHub ──► Actions constrói ──► ghcr.io (imagem pública) ──► PC do leilão (Leilao.bat → Iniciar baixa)
```

## Publicar uma versão nova
```
git add -A && git commit -m "..." && git push
```
O push dispara **Actions → Imagem Docker** (~1 min) e a imagem `ghcr.io/patrickcaloriocarvalho/leilao:latest` é atualizada.
Nos PCs do leilão, **1 – Iniciar** (com internet) já baixa a versão nova.

## O instalador de um comando
O `instalar.ps1` fica num **Gist público**: https://gist.github.com/PatrickCalorioCarvalho/e49b8d05b90ecfb101c61d6bba3306c6

O comando do [README](../README.md#instalar-num-pc-novo-um-comando) baixa sempre a versão mais nova do Gist.
Quando mudar o `instalar.ps1`, atualize o Gist: `gh gist edit e49b8d05b90ecfb101c61d6bba3306c6 -f instalar.ps1 instalar.ps1`.

Os arquivos que o instalador entrega (`Leilao.bat`, `leilao.ps1`, `docker-compose.yml`, `.env.exemplo`) vão **dentro da imagem**:
o Actions os copia para `app/implantacao/` antes do build. Por isso, qualquer mudança neles chega aos PCs com um `git push`.

## Instalar à mão (sem o comando de uma linha)
O PC precisa só do **Docker Desktop**. Copie para uma pasta (ex.: `C:\Leilao`) os arquivos `Leilao.bat`, `leilao.ps1`,
`docker-compose.yml` e `.env.exemplo`. Depois: dois cliques em **`Leilao.bat`** → **6 – Preparar**.
Ele pergunta a configuração, baixa o sistema, restaura o último backup do Backblaze (pede a chave **Read Only**, que não fica salva) e sobe tudo.

O `.env` que ele monta (modelo em `.env.exemplo`):
```
IMAGEM=ghcr.io/patrickcaloriocarvalho/leilao:latest
B2_KEY_ID=<keyID da chave Write Only>
B2_APP_KEY=<applicationKey>
BACKUP_SENHA=<senha dos backups>
```

## Segurança

| Credencial (no `.env` do PC) | Permite | Não permite |
|---|---|---|
| `B2_KEY_ID` / `B2_APP_KEY` (Write Only) | enviar backups novos (e apagar, se o **Object Lock** estiver desligado) | listar ou baixar backups; apagar com Object Lock ligado |
| `BACKUP_SENHA` | abrir backups criptografados | nada sem o arquivo, que só você baixa |

- A chave **Read Only** do Backblaze nunca fica no PC: é pedida só na hora de restaurar.
- O **MySQL** só aceita conexões **do próprio PC** (`127.0.0.1:3306`). As senhas padrão do banco são públicas (estão no
  `docker-compose.yml`), por isso a porta nunca deve ser aberta para a rede.
- Se um `.env` vazar: apague a chave no Backblaze, crie outra e troque nos PCs.

## Desenvolvimento
No seu PC, deixe `IMAGEM` em branco: o `Leilao.bat → Iniciar` constrói a imagem a partir do código (`docker compose up -d --build`).
A imagem é construída só com a pasta `app/` (código). `.env` e a pasta `local/` (banco, backups, planilhas) nunca entram.
