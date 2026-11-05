# Instalação offline e problemas comuns

## Instalar num PC sem internet
Só a **primeira instalação** precisa baixar imagens do Docker. Para evitar isso no local do leilão:

1. Num PC **com** internet (com Docker Desktop): rode `Leilao.bat → Instalação offline → empacotar`. Gera `leilao-offline.tar` (imagens do MySQL e do app).
2. Copie a pasta do projeto (sem `local/mysql/`) + `leilao-offline.tar` para o PC servidor (pendrive).
3. No PC servidor (com Docker Desktop instalado): rode `Leilao.bat → Instalação offline → instalar`.

Depois disso, o sistema não usa internet. Os outros PCs só precisam estar na mesma rede (switch/roteador, mesmo sem internet).

## O que precisa estar instalado
No PC servidor: **somente o Docker Desktop**. Node, Python, OneDrive e Chrome/Edge são opcionais (o Edge já vem no Windows; ele só é usado pelo `Leilao.bat → Abrir` para impressão direta). Os demais aparelhos só precisam de um navegador.

## Descobrir o IP do servidor
`Leilao.bat → Iniciar` mostra os endereços IPv4. Use o da rede local (ex.: `192.168.0.10`) → `http://192.168.0.10:3000`.

## Problemas comuns
| Sintoma | Solução |
|---|---|
| Outro PC ou celular não abre o endereço | Rodar `Leilao.bat → Liberar firewall` **como administrador** no servidor (libera a porta 3000); conferir que estão na mesma rede/Wi-Fi |
| "● offline" no topo | Perdeu conexão com o servidor; recarregar a página (F5) |
| `docker` não encontrado / erro de pipe | Abrir o **Docker Desktop** e esperar iniciar |
| Não imprime em A4 duplo | Na impressão: A4, margens "nenhuma", desmarcar cabeçalhos e rodapés |
| Lote não deixa lançar | Leilão ativo está 🔒 histórico — criar/usar outro na aba Leilões |
| Quero começar do zero | `Leilao.bat → Parar`, apagar a pasta `local/mysql/` **e** renomear `local/banco/leilao.sql`, `Leilao.bat → Iniciar` |
| Banco corrompido | `Leilao.bat → Restaurar` com o último `local/banco/leilao.sql` (ou de `local/banco/backups/`) |
