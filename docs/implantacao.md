# Publicar e instalar (GitHub privado + imagem no GitHub)

Tudo fica no **GitHub**, num repositório **privado**:
- o **código** e esta **documentação**, que o GitHub mostra formatada;
- a **imagem Docker** pronta, na aba *Packages*, publicada sozinha a cada `git push`.

No PC do leilão não vai código: vão só o `docker-compose.yml`, os `.bat` e um `.env`.

```
você (git push) ──► GitHub privado ──► Actions constrói ──► ghcr.io (Packages, privado) ──► PC do leilão (iniciar.bat baixa)
```

## 1. Uma vez: criar o repositório

```
gh auth login
gh repo create leilao --private --source . --push
```

Pronto: o push dispara o **Actions → Imagem Docker** (2–3 min). Não precisa cadastrar nenhum segredo, porque ele usa o token automático do GitHub.
A imagem aparece na página do repositório, em **Packages**, como `ghcr.io/<seu-usuário>/leilao`.

Confira em *Packages → leilao → Package settings* que a visibilidade está **Private**.

## 2. Uma vez: token para os PCs do leilão baixarem a imagem

GitHub → foto → *Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token (classic)*:
- Note: `leilao-pc`
- Expiration: o que preferir (ex.: 1 ano; anote a data para renovar)
- Marque **somente `read:packages`**

Esse token só **baixa imagens**. Não dá acesso ao código, aos backups nem a mais nada.

## 3. Instalar num PC de leilão

O PC precisa só do **Docker Desktop**. Copie para uma pasta (ex.: `C:\Leilao`):

```
docker-compose.yml
iniciar.bat   parar.bat   abrir-sistema.bat
utilitarios\        (backup, restauração, firewall, descriptografar)
logo\logo.jpg       (opcional)
.env                (preenchido, ver abaixo)
```

`.env` (modelo completo em `.env.exemplo`):
```
IMAGEM=ghcr.io/seuusuario/leilao:latest
GHCR_USUARIO=seuusuario
GHCR_TOKEN=<token classic com read:packages>
B2_KEY_ID=<keyID da chave Write Only>
B2_APP_KEY=<applicationKey>
BACKUP_SENHA=<senha dos backups>
```

Depois é só rodar `iniciar.bat`. Ele faz o login, baixa a versão mais nova e sobe o sistema. Sem internet, usa a versão que já está no PC.
**Para atualizar** o sistema, faça `git push` no seu PC e rode `iniciar.bat` (com internet) no PC do leilão.

## O que cada credencial permite (se o `.env` vazar)

| Credencial | Permite | Não permite |
|---|---|---|
| `GHCR_TOKEN` (`read:packages`) | baixar a imagem do sistema | ver o código, alterar ou publicar |
| `B2_KEY_ID` / `B2_APP_KEY` (Write Only) | enviar backups novos | listar, baixar ou apagar backups |
| `BACKUP_SENHA` | abrir backups criptografados | nada sem o arquivo, que só você baixa |

Se um `.env` vazar: revogue o token no GitHub e a chave no Backblaze, crie novos e troque nos PCs.

## Limites do plano grátis (sobra para este uso)
- Pacotes privados: **500 MB** de armazenamento e **1 GB/mês** de download. A imagem tem ~60 MB, e um `iniciar.bat` sem mudança de versão baixa quase nada.
- Actions em repositório privado: 2.000 min/mês; cada publicação leva ~3 min.
- Para não acumular versões antigas: *Packages → leilao → Manage versions* e apague as velhas (as tags `:<commit>`).

## Desenvolvimento
No seu PC, deixe `IMAGEM` em branco: o `iniciar.bat` constrói a imagem a partir do código (`docker compose up -d --build`).
A imagem é construída só com a pasta `app/` (código). `.env` e a pasta `local/` (banco, backups, planilhas) nunca entram.
