# Como usar no dia do leilão

## Como a tela foi pensada (rápida e fácil)
- **Menu com ícones**: 🔨 Mesa · 📋 Lotes · 👥 Pessoas · 📄 Promissórias · 📊 Relatório · ⚙️ Leilões. No celular ele fica **no rodapé**, ao alcance do polegar.
- **Mesa em 3 passos numerados**: **1 Lote** (número e nome grandes, com nº do animal e vivo/morto) → **2 Quem comprou?** → **3 Por quanto?**, e um botão verde enorme **✅ ARREMATAR**.
- **Situação dos lotes por ícone**: ⏳ aberto · ✅ vendido · 🎁 doado. Mensagens de sucesso (✅) e de erro (⚠️) bem destacadas.
- Letras e botões grandes, alto contraste e foco bem visível para quem usa só o teclado (Tab/Enter).
- O logo da entidade aparece no topo (envie em **Leilões → Configuração**; fica no banco e vai no backup).

## Antes de começar
1. Ligue o servidor (`Leilao.bat → Iniciar`) e confira que os outros PCs abrem o endereço.
2. Aba **Leilões → Criar novo leilão** (ex.: "Leilão 2026"). Para ensaiar, crie um chamado **TESTE** e apague depois.
3. Na mesma aba, em **Configuração do leilão em uso**, preencha **beneficiário** (a quem se paga), **cidade** e **vencimento**.

## A tela principal: Mesa
Dá para fazer **todo o arremate sem trocar de tela**: escolher o lote, o comprador, arrematar e imprimir a nota.

**Coluna da esquerda — lotes**
- **➕ Novo lote** (recolhido quando já há lotes em andamento; abre sozinho quando não há nenhum):  item/animal (sugere os já usados em leilões anteriores), Vivo/Morto, **nº do animal (brinco)** e valor inicial. **O número do lote é automático** e fixo (o próximo da fila).
- Lista de lotes (⏳ abertos ou 📋 todos). Clique para escolher; os vendidos ficam esmaecidos com o nome do comprador.

**Coluna do meio — arremate** (nos PCs grandes, os **últimos arremates** ficam numa terceira coluna à direita)
1. Os passos **2 e 3 ficam desativados enquanto não há lote em andamento** (aparece o botão *Lançar novo lote*); quando um lote novo chega — inclusive lançado em outro aparelho — a Mesa já o seleciona. O **lote aberto mais antigo já vem selecionado** (e depois de cada arremate o sistema pula para o próximo). Também dá para clicar em outro lote ou digitar o número em *Ir para o lote* (ex.: `12` ou `012`).
   > Os lotes são sempre mostrados com **3 dígitos**: `001`, `002`, `003`… (na Mesa, promissória, relatórios e planilhas).
2. Confira/ajuste o **Nº do animal** (brinco — dá para corrigir na hora do arremate) e **Vivo / Morto** (porco, ovelha etc.).
3. Digite parte do **nome ou CPF** do comprador → setas + Enter. Se não existir, "➕ Cadastrar como novo" e preencha ali mesmo. Ao escolher, aparece **o que essa pessoa já arrematou e o total** (útil quando ela pergunta).
4. Digite o **valor final** e Enter.
5. **Nota:** a nota do lote **sai sozinha a cada arremate** (abre a janela de impressão). Para reimprimir, use os botões em **Últimos arremates**: 🖨 lote (nota só daquele lote), 🖨 tudo (nota com tudo que o comprador levou), 📄 (ver / salvar PDF).

> **Impressão direta:** abra o sistema pelo `Leilao.bat → Abrir` — ele imprime **sem mostrar a janela de impressão**, na impressora padrão do Windows (precisa de Chrome ou Edge).
> **PDF:** no navegador comum, na janela de impressão escolha o destino **"Salvar como PDF"**.
> Papel A4, margens "nenhuma", sem cabeçalho/rodapé.

## Doação
Quando um lote é **doado** (o comprador paga, mas **não há entrega**):
1. Clique no botão grande **🎁 DOADO (sem entrega)** antes de arrematar (fica laranja quando ativo; aparece um aviso).
2. Arremate normalmente. O lote **fecha como doado** e a Mesa **passa direto para o próximo lote** — nada é reaberto.

O lote doado aparece com a marca **doado** na Mesa, no Relatório e na **promissória** (`[DOADO]`).

## No celular
**Não existe tela separada para celular:** são as **mesmas telas**, que se adaptam ao tamanho da tela. O celular precisa estar na **mesma rede Wi-Fi** do servidor (não precisa de internet).
- A **Mesa** funciona inteira no celular: o painel de arremate vem primeiro e a lista de lotes embaixo.
- A aba **Lotes** serve para lançar lotes (no PC ou no celular).
- **QR code** na aba **Leilões → 📱 Acesso**: aponte a câmera do celular (um QR abre *Lotes*, outro a *Mesa*). Se o IP não aparecer sozinho, digite-o no campo (o `Leilao.bat → Iniciar` mostra). No navegador do celular, menu → *Adicionar à tela inicial* cria um ícone.
- Se o celular não abrir o endereço, rode `Leilao.bat → Liberar firewall` **como administrador** no servidor (uma vez).
- Sem roteador no local? Use um roteador Wi-Fi simples (sem internet) ou o "Hotspot móvel" do Windows no notebook servidor.

## Outras abas
- **Lotes:** cadastro de lotes para quem só lança (PC separado). Nº automático; editar/excluir enquanto o leilão não for histórico.
- **Pessoas:** cadastro com busca por nome/CPF. Valem para **todos** os leilões.
- **Promissórias:** imprime uma, as marcadas ou todas — 1 folha A4 por comprador (via do comprador em cima, via da mesa embaixo, valor por extenso, lista de lotes com vivo/morto e doado).
- **Relatório:** veja abaixo.
- **Leilões:** criar, usar, marcar **histórico 🔒** (somente leitura), excluir (só os não-históricos) e a configuração das promissórias.

## Relatório de entrega (para quem faz a entrega)
Em **Relatório → 🚚 Relatório de entrega** (ou na aba **Promissórias**): abre uma página pronta para imprimir com **uma ficha por comprador** — nome, telefone, **endereço**, os animais (lote, item, **nº do animal**, vivo/morto) com ☐ para marcar e linha de **assinatura de recebimento**.
- **Lotes doados não entram** (sem entrega).
- Botão no topo alterna para **lista única por lote** (uma tabela com arrematante, telefone e endereço de cada animal).
- Se houver um arrematante selecionado no Relatório, sai só a ficha dele.

## Exportar para planilha (igual à antiga)
No **Relatório**: **⬇ CSV** (mesmo formato do CSV antigo: `Lote;Animal;AnimalNumero;ValorInicial;ValorFinal;Arrematador;CPF;Telefone;Endereco;RG;` e a linha `Total` no fim)
e **⬇ Excel** (arquivo `.xlsx` com as abas **ResumoGeral** e **ResumoDetalhado**, como a planilha antiga: total e valor por arrematante). Respeitam os filtros da tela.
Lotes doados saem com "(DOADO)" no nome e o vivo/morto entre parênteses. Esses mesmos arquivos (e o relatório de entrega) vão dentro do pacote `.zip` ao finalizar.

## Rastrear um animal pelo número
No **Relatório → 🔎 Rastrear animal pelo nº** digite o número (brinco): aparecem **todos os lotes com esse nº em todos os leilões** — onde foi, quem comprou, por quanto e se foi doado.
O nº também aparece na Mesa, na lista de lotes e no relatório, e o filtro da aba Lotes busca por ele.
> Atenção: o número do brinco pode se repetir entre anos ou espécies; o resultado mostra tudo o que tem aquele número, então confira o item/leilão.

## Relatório (com filtros)
Filtros: **arrematante** (ou clique no nome na tabela "Por arrematante"), **doação** (todos / só com entrega / só doados), **vivo/morto** e "incluir lotes sem arremate".
- Mostra total, **total com entrega** e **total doado**.
- **🖨 Imprimir relatório** (só o conteúdo, sem menus) e **⬇ CSV** (respeita os filtros).
- Com um arrematante selecionado: lista tudo o que ele arrematou + botão **🖨 Nota do comprador**.
- Para a lista de **entrega**, filtre *Só com entrega* — os doados ficam de fora.

## Depois do leilão
1. Relatório → imprimir / exportar CSV (opcional).
2. Aba **Leilões → ✅ Finalizar leilão**: gera o **relatório final + backup completo** e **trava** o leilão como histórico. Em seguida clique **☁ Baixar pacote (.zip) e abrir o OneDrive** e solte o arquivo na página que abrir. Detalhes (e como criar o link de envio) em [backup-e-nuvem.md](backup-e-nuvem.md).
3. `Leilao.bat → Parar` — faz um último backup e desliga.

> O sistema também salva sozinho **a cada 1 hora** (sobrescrevendo o anterior), sem parar nada. O ícone 💾 no topo mostra a hora do último backup.
