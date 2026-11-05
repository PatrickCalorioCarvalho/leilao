// Telas: #mesa (principal) | #lotes | #pessoas | #promissorias | #relatorio | #leiloes
const $ = (s, r = document) => r.querySelector(s);
const brl = v => (v == null ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function api(url, method = 'GET', body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.erro || 'Erro');
  return j;
}
function flash(el, text, ok = true) {
  el.innerHTML = `<div class="msg ${ok ? 'ok' : 'err'}" role="status">${ok ? '✅' : '⚠️'} ${esc(text)}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 4000);
}
const ICONES = { mesa: '🔨', lotes: '📋', pessoas: '👥', promissorias: '📄', relatorio: '📊', leiloes: '⚙️' };
const TELAS = { mesa: 'Mesa', lotes: 'Lotes', pessoas: 'Pessoas', promissorias: 'Promissórias', relatorio: 'Relatório', leiloes: 'Leilões' };
let leilao = null, refresh = () => {}, typing = false;
const condOpts = (v = '') => `<option value="">—</option><option value="vivo" ${v === 'vivo' ? 'selected' : ''}>Vivo</option><option value="morto" ${v === 'morto' ? 'selected' : ''}>Morto</option>`;
const loteNome = l => `${l.descricao}${l.condicao ? ' (' + l.condicao + ')' : ''}`;
const pad3 = n => String(n).padStart(3, '0'); // lotes sempre como 001, 002...
const hoje = () => new Date().toISOString().slice(0, 10);

// imprime sem abrir janela: iframe invisível chama print() sozinho (na janela de impressão dá para "Salvar como PDF")
function imprimirQuieto(qs) {
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0';
  f.src = `/imprimir.html?${qs}&auto=1`; document.body.append(f); setTimeout(() => f.remove(), 60000);
}
const verNota = qs => window.open(`/imprimir.html?${qs}`, '_blank');

// ---- picker de pessoa (busca por nome/CPF)
function picker(host, onPick, { novo = true } = {}) {
  host.classList.add('pick');
  host.innerHTML = `<input placeholder="Digite nome ou CPF..." autocomplete="off" style="width:100%"><ul hidden></ul>`;
  const inp = $('input', host), ul = $('ul', host);
  let list = [], sel = 0, t;
  const show = () => {
    ul.hidden = !inp.value;
    ul.innerHTML = list.map((p, i) => `<li data-i="${i}" class="${i === sel ? 'sel' : ''}">${esc(p.nome)}<small>${esc(p.cpf)} ${esc(p.telefone)} ${esc(p.endereco)}</small></li>`).join('')
      + (novo && inp.value ? `<li data-i="new" class="${sel === list.length ? 'sel' : ''}">➕ Cadastrar "${esc(inp.value)}" como novo</li>` : '');
  };
  const pick = p => { ul.hidden = true; onPick(p); };
  inp.oninput = () => { clearTimeout(t); t = setTimeout(async () => { list = inp.value ? await api('/api/pessoas?q=' + encodeURIComponent(inp.value)) : []; sel = 0; show(); }, 120); };
  inp.onkeydown = e => {
    const max = list.length + (novo && inp.value ? 1 : 0) - 1;
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, max); show(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); show(); e.preventDefault(); }
    else if (e.key === 'Enter' && !ul.hidden) { e.preventDefault(); e.stopPropagation(); if (sel < list.length) pick(list[sel]); else if (novo) pick({ novo: inp.value }); }
  };
  ul.onmousedown = e => { const li = e.target.closest('li'); if (!li) return; e.preventDefault(); li.dataset.i === 'new' ? pick({ novo: inp.value }) : pick(list[+li.dataset.i]); };
  inp.onblur = () => setTimeout(() => { ul.hidden = true; }, 150);
  return { focus: () => inp.focus(), clear: () => { inp.value = ''; ul.hidden = true; }, set: v => { inp.value = v; } };
}

// ---- formulário de pessoa
function pessoaForm(p = {}, onSave, onCancel) {
  const f = document.createElement('form');
  f.className = 'row';
  f.innerHTML = `
    <label style="flex:2 1 220px">Nome<input name="nome" required value="${esc(p.nome)}"></label>
    <label>CPF<input name="cpf" value="${esc(p.cpf)}" size="15"></label>
    <label>RG<input name="rg" value="${esc(p.rg)}" size="12"></label>
    <label>Telefone<input name="telefone" value="${esc(p.telefone)}" size="14"></label>
    <label style="flex:3 1 280px">Endereço<input name="endereco" value="${esc(p.endereco)}"></label>
    <button>💾 Salvar</button>${onCancel ? '<button type="button" class="sec">✖ Cancelar</button>' : ''}<span class="err"></span>`;
  f.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    try { onSave(p.id ? await api('/api/pessoas/' + p.id, 'PUT', d) : await api('/api/pessoas', 'POST', d)); }
    catch (er) { $('.err', f).textContent = er.message; }
  };
  if (onCancel) $('button.sec', f).onclick = onCancel;
  return f;
}
const itensDatalist = async m => { const r = await api('/api/itens'); $('#itens', m).innerHTML = r.map(i => `<option value="${esc(i.descricao)}">`).join(''); };

// ---- backup / relatório final / QR
const hhmm = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
async function atualizaInfo() {
  try {
    const i = await api('/api/info'); window.info = i;
    $('#bk').textContent = i.ultimo ? `💾 ${hhmm(i.ultimo.quando)}` : '💾 —';
    $('#bk').title = (i.ultimo ? `Último backup (${i.ultimo.tipo}) às ${hhmm(i.ultimo.quando)}` : 'Nenhum backup nesta sessão (o backup é feito ao Finalizar o leilão)')
      + (i.b2 ? `
Backblaze: ${i.b2.pendentes ? i.b2.pendentes + ' arquivo(s) aguardando internet' : 'tudo enviado'}${i.b2.ultimoEnvio ? ' · último envio ' + hhmm(i.b2.ultimoEnvio) : ''}` : '');
    if (i.b2?.pendentes) $('#bk').textContent += ' ☁' + i.b2.pendentes;
  } catch {}
}
// salva relatório final + backup (local e nuvem). travar=true também marca o leilão como histórico.
async function salvarFinal(travar, el) {
  if (travar && !confirm('Finalizar o leilão?\n\nIsso gera o relatório final, salva o backup e TRAVA o leilão (histórico, somente leitura).')) return false;
  el.innerHTML = '<div class="msg ok">Salvando…</div>';
  try {
    const r = await api('/api/finalizar', 'POST', { travar });
    el.innerHTML = `<div class="msg ok"><b>✔ Salvo neste servidor:</b> ${esc(r.pasta)}<br>${r.nuvem ? '☁ Também copiado para a pasta da nuvem do servidor.<br>' : ''}${r.b2 ? '☁ Na fila de envio para o Backblaze (sobe sozinho quando houver internet).' : ''}</div>
      <div class="row" style="margin:8px 0"><button data-enviar>☁ Baixar pacote (.zip) e abrir o OneDrive</button><span class="sub">Passo final: solte o .zip baixado na página do OneDrive que abrir.</span></div>`;
    atualizaInfo(); return true;
  } catch (er) { el.innerHTML = `<div class="msg err">${esc(er.message)}</div>`; return false; }
}
// baixa o pacote .zip e abre o link de envio do OneDrive (configurado em Leilões); o usuário só solta o arquivo lá
function enviarPacote() {
  const a = document.createElement('a'); a.href = '/api/baixar/pacote.zip'; a.download = ''; document.body.append(a); a.click(); a.remove();
  const link = leilao?.link_nuvem;
  if (link) window.open(link, '_blank');
  else alert('Pacote baixado.\n\nPara abrir o OneDrive direto aqui, cole o "link de envio" na aba Leilões → Configuração.\n(OneDrive no navegador → pasta → Compartilhar → "Solicitar arquivos" → copiar link.)');
}
document.addEventListener('click', e => { if (e.target.closest('[data-enviar]')) enviarPacote(); });
function qrSvg(texto) { const q = qrcode(0, 'M'); q.addData(texto); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }

// ================= MESA (tela principal: lote + comprador + nota, sem trocar de tela) =================
async function telaMesa(m) {
  m.classList.add('wide');
  m.innerHTML = `<div class="mesa">
  <div class="a-lotes">
    <div class="card">
      <details class="novo"><summary>➕ Novo lote <span class="sub" id="prox"></span></summary>
        <form id="nl" class="row">
          <label style="flex:3 1 150px">Item / animal<input name="descricao" required list="itens" autocomplete="off" placeholder="ex.: Novilha"></label><datalist id="itens"></datalist>
          <label>Vivo / Morto<select name="condicao">${condOpts()}</select></label>
          <label>🏷 Nº do animal<input name="animal_num" size="7" placeholder="brinco"></label>
          <label>💰 Valor inicial<input name="valor_inicial" size="7" inputmode="decimal" placeholder="0,00"></label>
          <button>➕ Lançar</button></form><div id="msg0"></div></details>
      <div class="filtros"><label class="pill"><input type="radio" name="vis" value="abertos" checked> ⏳ Abertos</label><label class="pill"><input type="radio" name="vis" value="todos"> 📋 Todos</label></div>
      <div id="lista" class="lista"></div></div>
  </div>
  <div class="a-centro">
    <div class="card" id="cab"></div>
    <div class="card" id="passos">
      <div class="passos2">
        <div>
          <div class="passo-t"><span class="n">2</span> Quem comprou?</div>
          <label>👤 Comprador — nome ou CPF<div id="pk"></div></label>
          <div id="comp" class="sub" style="margin-top:8px"></div><div id="novo"></div>
        </div>
        <div>
          <div class="passo-t"><span class="n">3</span> Por quanto?</div>
          <div class="row" style="align-items:center">
            <label class="valor">💰 Valor final (R$)<input id="val" inputmode="decimal" placeholder="0,00"></label>
            <label class="toggle" title="Doado: o comprador paga, mas não há entrega"><input type="checkbox" id="doa"> 🎁 DOADO <small>(sem entrega)</small></label></div>
          <div class="msg ok" id="doahint" hidden style="font-size:15px">🎁 Lote <b>doado</b>: fica marcado como doado, <b>não entra na entrega</b>, e a mesa passa para o próximo lote.</div>
        </div>
      </div>
      <button id="ok" class="ok-grande">✅ ARREMATAR <small>(Enter ↵)</small></button>
      <div id="msg"></div></div>
  </div>
  <div class="a-hist"><div class="card" id="hist"></div></div>
  </div>`;
  let lotes = [], sel = null, pessoa = null, vis = 'abertos';
  const val = $('#val', m), doa = $('#doa', m);
  itensDatalist(m);
  const loteSel = () => lotes.find(l => l.id === sel);
  const aberto = l => !l.pessoa_id;

  // lista de lotes
  const drawLista = () => {
    const v = lotes.filter(l => vis === 'todos' || aberto(l));
    $('#prox', m).textContent = `próximo nº: ${pad3(Math.max(0, ...lotes.map(l => l.numero)) + 1)}`;
    $('#lista', m).innerHTML = v.map(l => `<div class="it ${l.id === sel ? 'sel' : ''} ${aberto(l) ? '' : 'vendido'}" data-id="${l.id}" role="button" tabindex="0">
      <span class="st">${aberto(l) ? '⏳' : l.doado ? '🎁' : '✅'}</span><b style="min-width:48px">${esc(l.rotulo)}</b>
      <span style="flex:1">${esc(loteNome(l))}${l.animal_num ? ' <span class="sub">🏷 ' + esc(l.animal_num) + '</span>' : ''}</span>
      <span class="sub">${aberto(l) ? brl(l.valor_inicial) : esc(l.comprador)}</span></div>`).join('') || '<p class="sub">Nenhum lote.</p>';
  };
  $('#lista', m).onclick = e => { const it = e.target.closest('.it'); if (it) escolher(+it.dataset.id); };
  $('#lista', m).onkeydown = e => { const it = e.target.closest('.it'); if (it && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); escolher(+it.dataset.id); } };
  m.querySelectorAll('input[name=vis]').forEach(r => r.onchange = () => { vis = r.value; drawLista(); });

  // lote atual
  function drawCab() {
    const l = loteSel();
    $('#passos', m).classList.toggle('off', !l); $('#ok', m).disabled = !l;
    $('#cab', m).innerHTML = !l ? '<div class="vazio">🎉 Nenhum lote aberto.<br><small>Lance um novo lote para continuar.</small><br><button class="sec" data-novo style="margin-top:12px">➕ Lançar novo lote</button></div>' : `
      <div class="passo-t"><span class="n">1</span> Lote em leilão</div>
      <div class="lote-cab">
        <div class="lote-num" title="Número do lote">${esc(l.rotulo)}</div>
        <div class="lote-info"><div class="lote-nome">${esc(l.descricao)}</div>
          <div class="chips">${l.animal_num ? `<span class="chip">🏷 Nº ${esc(l.animal_num)}</span>` : ''}${l.condicao ? `<span class="chip">${l.condicao === 'vivo' ? '🐄 vivo' : '🥩 morto'}</span>` : ''}${l.doado ? '<span class="chip d">🎁 doado</span>' : ''}<span class="chip">💰 inicial ${brl(l.valor_inicial)}</span></div>
          ${l.pessoa_id ? `<div class="msg err" style="margin:10px 0 0">⚠️ Já arrematado: ${esc(l.comprador)} — ${brl(l.valor_final)} (confirmar sobrescreve)</div>` : ''}</div></div>
      <div class="row" style="margin-top:12px">
        <label>🏷 Nº do animal<input id="an" size="9" value="${esc(l.animal_num)}" placeholder="brinco / nº"></label>
        <label>🐄 Vivo / Morto<select id="cond">${condOpts(l.condicao)}</select></label>
        <label>↪ Ir para o lote<input id="ir" size="7" placeholder="ex.: 012"></label></div>`;
    const ir = $('#ir', m);
    if (ir) ir.onkeydown = e => { if (e.key === 'Enter') { const q = /^(\d+)(?:-(\d+))?$/.exec(ir.value.trim()); const x = q && lotes.find(k => k.numero === +q[1] && k.sub === +(q[2] || 0)); x ? escolher(x.id) : flash($('#msg', m), 'Lote não encontrado', false); } };
  }
  function escolher(id, foco = true) {
    sel = id; const l = loteSel();
    val.value = l?.pessoa_id ? l.valor_final : ''; doa.checked = !!l?.doado; doa.onchange();
    drawLista(); drawCab(); if (foco) pk.focus();
  }
  doa.onchange = () => { $('#doahint', m).hidden = !doa.checked; };

  // comprador
  const sp = async p => {
    pessoa = p;
    const c = $('#comp', m);
    if (!p) { c.innerHTML = ''; return; }
    const r = await api('/api/relatorio?pessoa=' + p.id);
    c.innerHTML = `✔ <b>${esc(p.nome)}</b> — ${esc(p.cpf)} ${esc(p.telefone)} ${esc(p.endereco)}` + (r.rows.length
      ? `<div style="margin-top:4px">Já arrematou ${r.qtd} lote(s), <b>${brl(r.total)}</b>${r.total_doado ? ` (doado ${brl(r.total_doado)})` : ''}: ${r.rows.map(x => esc(x.rotulo) + ' ' + esc(x.descricao) + (x.doado ? ' [doado]' : '')).join(' · ')}</div>` : '');
    val.focus();
  };
  const pk = picker($('#pk', m), p => {
    if (p.novo) {
      const box = $('#novo', m);
      const form = pessoaForm({ nome: p.novo }, np => { box.innerHTML = ''; pk.set(np.nome); sp(np); }, () => { box.innerHTML = ''; });
      box.innerHTML = '<h4>Novo comprador</h4>'; box.append(form); $('input[name=cpf]', form).focus();
    } else { pk.set(p.nome); sp(p); }
  });
  val.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
  $('#ok', m).onclick = go;

  async function go() {
    try {
      const l = loteSel();
      if (!l) throw new Error('Selecione um lote');
      if (!pessoa) throw new Error('Escolha o comprador');
      await api(`/api/lotes/${l.id}/arrematar`, 'POST', { pessoa_id: pessoa.id, valor_final: val.value, doado: doa.checked, condicao: $('#cond', m)?.value, animal_num: $('#an', m)?.value });
      flash($('#msg', m), `Lote ${l.rotulo} → ${pessoa.nome} por ${brl(Number(String(val.value).replace(',', '.')))}${doa.checked ? ' (DOADO)' : ''}`);
      imprimirQuieto('lote=' + l.id); // sempre imprime a nota do lote arrematado
      pk.clear(); sp(null); val.value = ''; doa.checked = false; doa.onchange();
      await carregar();
      proximo(l);
    } catch (er) { flash($('#msg', m), er.message, false); }
  }
  function proximo(depoisDe) {
    const ab = lotes.filter(aberto);
    const n = (depoisDe && ab.find(x => x.numero > depoisDe.numero || (x.numero === depoisDe.numero && x.sub > depoisDe.sub))) || ab[0];
    n ? escolher(n.id) : (sel = null, drawLista(), drawCab());
  }

  // cadastrar lote rápido (número automático)
  $('#nl', m).onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    try {
      const l = await api('/api/lotes', 'POST', Object.fromEntries(new FormData(f)));
      f.reset(); flash($('#msg0', m), `Lote ${l.rotulo} lançado`); f.descricao.focus();
      itensDatalist(m);
    } catch (er) { flash($('#msg0', m), er.message, false); }
  };

  // recentes + reimpressão
  const drawHist = () => {
    const v = lotes.filter(l => l.pessoa_id).sort((a, b) => b.id - a.id).slice(0, 12);
    $('#hist', m).innerHTML = '<h3 style="margin-top:0">✅ Últimos arremates</h3>' + (v.length ? v.map(l => `<div class="hrow">
      <div class="hl"><b>${esc(l.rotulo)}</b> ${esc(loteNome(l))}${l.animal_num ? ' <span class="sub">🏷 ' + esc(l.animal_num) + '</span>' : ''}${l.doado ? ' <span class="tag d">🎁 doado</span>' : ''}<br><span class="sub">👤 ${esc(l.comprador)} · 💰 ${brl(l.valor_final)}</span></div>
      <div class="hb"><button class="sm" data-pl="${l.id}" title="Imprimir a nota deste lote">🖨 lote</button><button class="sm sec" data-pt="${l.pessoa_id}" title="Nota com tudo que o comprador arrematou">🖨 tudo</button><button class="sm sec" data-pv="${l.pessoa_id}" title="Ver / salvar PDF">📄</button><button class="sm sec" data-un="${l.id}" title="Desfazer este arremate">↩</button></div></div>`).join('') : '<p class="sub">Nenhum ainda.</p>');
  };
  $('#hist', m).onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pl) imprimirQuieto('lote=' + b.dataset.pl);
    if (b.dataset.pt) imprimirQuieto('ids=' + b.dataset.pt);
    if (b.dataset.pv) verNota('ids=' + b.dataset.pv);
    if (b.dataset.un && confirm('Desfazer este arremate?')) { try { await api(`/api/lotes/${b.dataset.un}/desfazer`, 'POST'); } catch (er) { alert(er.message); } }
  };

  $('#cab', m).onclick = e => { if (e.target.closest('[data-novo]')) { $('details.novo', m).open = true; $('#nl [name=descricao]', m).focus(); } };
  async function carregar() { lotes = await api('/api/lotes'); drawLista(); drawCab(); drawHist(); }
  refresh = async () => { lotes = await api('/api/lotes'); if (sel && !loteSel()) sel = null; drawLista(); drawCab(); drawHist(); if (!sel) { const ab = lotes.find(aberto); if (ab) escolher(ab.id, false); } };
  await carregar();
  proximo(null);
  if (!lotes.some(aberto)) $('details.novo', m).open = true;
}

// ================= LOTES (lançamento, para o PC que só cadastra) =================
async function telaLotes(m) {
  m.innerHTML = `<h2>📋 Lançar lotes (animais / itens)</h2>
  <div class="card"><form id="f" class="row">
    <div class="chip" style="align-self:center" title="O número do lote é automático">🔢 Próximo lote: <b id="prox"></b></div>
    <label style="flex:3 1 260px">Descrição<input name="descricao" required list="itens" autocomplete="off"></label><datalist id="itens"></datalist>
    <label>🐄 Vivo / Morto<select name="condicao">${condOpts()}</select></label>
    <label>🏷 Nº do animal<input name="animal_num" size="8" placeholder="brinco"></label>
    <label>💰 Valor inicial<input name="valor_inicial" size="8" inputmode="decimal" placeholder="0,00"></label>
    <label style="flex-direction:row;align-items:center;gap:8px;color:var(--texto)"><input type="checkbox" name="doado"> 🎁 Doado</label>
    <button>➕ Adicionar lote</button></form><div id="msg"></div></div>
  <div class="card"><input class="filtro" id="busca" placeholder="Filtrar por item, lote, nº do animal ou comprador..."><div id="tab"></div></div>`;
  const f = $('#f', m);
  f.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f)); d.doado = f.doado.checked;
    try { const l = await api('/api/lotes', 'POST', d); f.reset(); flash($('#msg', m), `Lote ${l.rotulo} lançado`); f.descricao.focus(); itensDatalist(m); }
    catch (er) { flash($('#msg', m), er.message, false); }
  };
  f.descricao.focus(); itensDatalist(m);
  let lotes = [], edit = null;
  const draw = () => {
    $('#prox', m).textContent = pad3(Math.max(0, ...lotes.map(l => l.numero)) + 1);
    const s = $('#busca', m).value.toLowerCase();
    $('#tab', m).innerHTML = `<table><tr><th>Lote</th><th>Descrição</th><th>V/M</th><th>Animal</th><th class=n>Inicial</th><th>Situação</th><th></th></tr>` +
      lotes.filter(l => !s || (l.descricao + l.rotulo + (l.animal_num || '') + (l.comprador || '')).toLowerCase().includes(s)).map(l => edit === l.id
        ? `<tr><td>${esc(l.rotulo)}</td><td><input id="e_d" value="${esc(l.descricao)}"></td><td><select id="e_c">${condOpts(l.condicao)}</select></td><td><input id="e_a" size=6 value="${esc(l.animal_num)}"></td><td><input id="e_v" size=7 value="${l.valor_inicial}"></td>
           <td><label style="flex-direction:row;gap:4px"><input type=checkbox id="e_o" ${l.doado ? 'checked' : ''}>doado</label></td><td><button class="sm" data-ok="${l.id}">OK</button></td></tr>`
        : `<tr class="${l.pessoa_id ? 'vendido' : 'aberto'}"><td>${esc(l.rotulo)}</td><td>${esc(l.descricao)} ${l.doado ? '<span class="tag d">doado</span>' : ''}</td><td>${esc(l.condicao)}</td><td>${esc(l.animal_num)}</td>
           <td class=n>${brl(l.valor_inicial)}</td><td>${l.pessoa_id ? `<span class="tag">${esc(l.comprador)} — ${brl(l.valor_final)}</span>` : '<span class="sub">aberto</span>'}</td>
           <td><button class="sm sec" data-ed="${l.id}">✏️ editar</button> <button class="sm red" data-del="${l.id}" title="Excluir" aria-label="Excluir">🗑</button></td></tr>`).join('') + '</table>';
  };
  $('#busca', m).oninput = draw;
  m.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.ed) { edit = +b.dataset.ed; draw(); }
      if (b.dataset.ok) { await api('/api/lotes/' + edit, 'PUT', { descricao: $('#e_d').value, condicao: $('#e_c').value, animal_num: $('#e_a').value, valor_inicial: $('#e_v').value, doado: $('#e_o').checked }); edit = null; }
      if (b.dataset.del && confirm('Excluir este lote?')) await api('/api/lotes/' + b.dataset.del, 'DELETE');
    } catch (er) { alert(er.message); }
  };
  refresh = async () => { if (edit) return; lotes = await api('/api/lotes'); draw(); };
  refresh();
}

// ================= PESSOAS =================
async function telaPessoas(m) {
  m.innerHTML = `<h2>👥 Pessoas</h2><div class="card"><h3 style="margin-top:0">Cadastrar</h3><div id="nf"></div></div>
  <div class="card"><input class="filtro" id="busca" placeholder="Buscar por nome ou CPF..."><div id="tab"></div></div>`;
  let lista = [];
  const novo = () => { const h = $('#nf', m); h.innerHTML = ''; h.append(pessoaForm({}, () => { novo(); refresh(); })); $('input', h).focus(); };
  novo();
  const draw = () => {
    $('#tab', m).innerHTML = `<table><tr><th>Nome</th><th>CPF</th><th>Telefone</th><th>Endereço</th><th></th></tr>` +
      lista.map(p => `<tr><td>${esc(p.nome)}</td><td>${esc(p.cpf)}</td><td>${esc(p.telefone)}</td><td>${esc(p.endereco)}</td>
        <td><button class="sm sec" data-ed="${p.id}">✏️ editar</button> <button class="sm red" data-del="${p.id}" title="Excluir" aria-label="Excluir">🗑</button></td></tr>`).join('') + '</table>';
  };
  $('#busca', m).oninput = () => { typing = true; clearTimeout(telaPessoas.t); telaPessoas.t = setTimeout(() => { typing = false; refresh(); }, 200); };
  m.onclick = async e => {
    const b = e.target.closest('button[data-ed],button[data-del]'); if (!b) return;
    if (b.dataset.del) { if (confirm('Excluir pessoa?')) try { await api('/api/pessoas/' + b.dataset.del, 'DELETE'); } catch (er) { alert(er.message); } return; }
    const p = lista.find(x => x.id == b.dataset.ed), h = $('#nf', m);
    h.innerHTML = ''; h.append(pessoaForm(p, () => { novo(); refresh(); }, novo)); scrollTo(0, 0);
  };
  refresh = async () => { lista = await api('/api/pessoas?q=' + encodeURIComponent($('#busca', m).value)); draw(); };
  refresh();
}

// ================= PROMISSÓRIAS (impressão em lote) =================
async function telaProm(m) {
  m.innerHTML = `<h2>📄 Promissórias</h2>
  <div class="card"><div class="row"><button id="todas">🖨 Imprimir todas</button><button id="sel" class="sec">🖨 Imprimir selecionadas</button>
  <button id="entr" class="sec" title="Lista para quem faz a entrega (sem os doados)">🚚 Relatório de entrega</button>
  <span class="sub">Cada promissória sai em uma folha A4 duplicada: via do comprador (cima) e via da mesa (baixo). Na janela de impressão escolha "Salvar como PDF" para gerar o arquivo.</span></div></div>
  <div class="card"><div id="tab"></div></div>`;
  let r;
  const draw = () => {
    $('#tab', m).innerHTML = `<table><tr><th><input type=checkbox id="all"></th><th>Comprador</th><th>CPF</th><th class=n>Lotes</th><th class=n>Total</th><th></th></tr>` +
      r.compradores.map(c => `<tr><td><input type=checkbox class="ck" value="${c.id}"></td><td>${esc(c.nome)}</td><td>${esc(c.cpf)}</td><td class=n>${c.qtd}</td><td class=n>${brl(c.total)}</td>
      <td><button class="sm" data-p="${c.id}">🖨 imprimir</button> <button class="sm sec" data-v="${c.id}">📄 ver</button></td></tr>`).join('') + '</table>';
  };
  const abrir = ids => window.open('/imprimir.html' + (ids ? '?ids=' + ids : ''), '_blank');
  m.onclick = e => {
    const b = e.target.closest('button');
    if (e.target.id === 'all') m.querySelectorAll('.ck').forEach(c => c.checked = e.target.checked);
    if (!b) return;
    if (b.dataset.p) abrir(b.dataset.p);
    if (b.dataset.v) abrir(b.dataset.v);
    if (b.id === 'todas') abrir('');
    if (b.id === 'entr') window.open('/api/entrega.html', '_blank');
    if (b.id === 'sel') { const ids = [...m.querySelectorAll('.ck:checked')].map(c => c.value).join(','); ids ? abrir(ids) : alert('Marque alguém'); }
  };
  refresh = async () => { r = await api('/api/resumo'); draw(); };
  refresh();
}

// ================= RELATÓRIO (com filtros) =================
async function telaRelatorio(m) {
  m.innerHTML = `<h2>📊 Relatório</h2>
  <div class="card noprint" id="rastro"><h3 style="margin:0 0 6px">🔎 Rastrear animal pelo nº</h3>
    <input placeholder="Digite o nº do animal (brinco)..." style="max-width:360px"><div class="res" style="margin-top:8px"></div></div>
  <div class="card noprint"><div class="row">
    <label style="flex:2 1 260px">Arrematante (vazio = todos)<div id="pk"></div></label>
    <label>Doação<select id="fd"><option value="">Todos</option><option value="entrega">Só com entrega (não doados)</option><option value="doados">Só doados (sem entrega)</option></select></label>
    <label>Vivo/Morto<select id="fc"><option value="">Todos</option><option value="vivo">Vivo</option><option value="morto">Morto</option></select></label>
    <label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" id="fs"> incluir lotes sem arremate</label>
    <button id="lim" class="sec">🧹 Limpar filtros</button>
    <button id="pr">🖨 Imprimir relatório</button><a id="csv"><button class="sec" type="button" title="Mesmo formato do CSV antigo (Lote;Animal;AnimalNumero;...)">⬇ CSV</button></a><a id="xlsx"><button class="sec" type="button" title="Excel com as abas ResumoGeral e ResumoDetalhado">⬇ Excel</button></a>
    <button id="entr" title="Lista para quem faz a entrega: animal, nº, arrematante e endereço (sem os doados)">🚚 Relatório de entrega</button>
    <button id="nota" class="sec" hidden>🖨 Nota do comprador</button></div></div>
  <div class="stats" id="st"></div>
  <div class="card"><h3 style="margin-top:0" id="tit">Lotes</h3><div id="tab"></div></div>
  <div class="card noprint"><h3 style="margin-top:0">Por arrematante <span class="sub">(clique para filtrar)</span></h3><div id="por"></div></div>`;
  let pessoa = null;
  const fd = $('#fd', m), fc = $('#fc', m), fs = $('#fs', m);
  const qs = () => { const p = new URLSearchParams(); if (pessoa) p.set('pessoa', pessoa.id); if (fd.value) p.set('doado', fd.value); if (fc.value) p.set('condicao', fc.value); if (fs.checked) p.set('situacao', 'todos'); return p.toString(); };
  const pk = picker($('#pk', m), p => { pessoa = p; pk.set(p.nome); refresh(); }, { novo: false });
  $('#pk input', m).oninput = function () { if (!this.value && pessoa) { pessoa = null; refresh(); } };
  [fd, fc, fs].forEach(x => x.onchange = () => refresh());
  $('#lim', m).onclick = () => { pessoa = null; pk.clear(); fd.value = fc.value = ''; fs.checked = false; refresh(); };
  $('#pr', m).onclick = () => print();
  $('#entr', m).onclick = () => window.open('/api/entrega.html' + (pessoa ? '?pessoa=' + pessoa.id : ''), '_blank');
  $('#nota', m).onclick = () => verNota('ids=' + pessoa.id);
  const rin = $('#rastro input', m); let trk;
  rin.oninput = () => { clearTimeout(trk); trk = setTimeout(async () => {
    const v = rin.value.trim(), out = $('#rastro .res', m);
    if (!v) { out.innerHTML = ''; return; }
    const r = await api('/api/animal?num=' + encodeURIComponent(v));
    out.innerHTML = r.length ? '<table><tr><th>Leilão</th><th>Lote</th><th>Item</th><th>Comprador</th><th>Entrega</th><th class=n>Valor</th></tr>' + r.map(x => `<tr><td>${esc(x.leilao)}</td><td><b>${esc(x.rotulo)}</b></td><td>${esc(x.descricao)}${x.condicao ? ' (' + x.condicao + ')' : ''}</td><td>${esc(x.comprador) || '<span class="sub">— aberto</span>'}</td><td>${x.pessoa_id ? (x.doado ? '<span class="tag d">DOADO</span>' : 'sim') : ''}</td><td class=n>${x.valor_final != null ? brl(x.valor_final) : ''}</td></tr>`).join('') + '</table>' : '<p class="sub">Nenhum lote com esse número.</p>';
  }, 250); };
  m.onclick = e => { const tr = e.target.closest('tr[data-p]'); if (tr) { pessoa = { id: +tr.dataset.p, nome: tr.dataset.n }; pk.set(pessoa.nome); refresh(); scrollTo(0, 0); } };
  refresh = async () => {
    const [r, g] = await Promise.all([api('/api/relatorio?' + qs()), api('/api/resumo')]);
    $('#csv', m).href = '/api/export.csv?' + qs(); $('#xlsx', m).href = '/api/export.xlsx?' + qs(); $('#nota', m).hidden = !pessoa;
    $('#tit', m).textContent = `${leilao.nome}${pessoa ? ' — ' + pessoa.nome : ''}${fd.value === 'entrega' ? ' — só com entrega' : fd.value === 'doados' ? ' — só doados' : ''}${fc.value ? ' — ' + fc.value : ''}`;
    $('#st', m).innerHTML = `<div class="card">📦 Lotes listados<b>${r.qtd}</b></div><div class="card">💰 Total<b>${brl(r.total)}</b></div><div class="card">🚚 Com entrega<b>${brl(r.total_entrega)}</b></div><div class="card">🎁 Doados<b>${brl(r.total_doado)}</b></div>`;
    $('#tab', m).innerHTML = '<table><tr><th>Lote</th><th>Item</th><th>V/M</th><th>Comprador</th><th>Entrega</th><th class=n>Valor</th></tr>' + r.rows.map(l => `<tr>
      <td><b>${esc(l.rotulo)}</b></td><td>${esc(l.descricao)}${l.animal_num ? ' #' + esc(l.animal_num) : ''}</td><td>${esc(l.condicao)}</td><td>${esc(l.comprador) || '<span class="sub">— aberto</span>'}</td>
      <td>${l.pessoa_id ? (l.doado ? '<span class="tag d">DOADO</span>' : 'sim') : ''}</td><td class=n>${l.valor_final != null ? brl(l.valor_final) : ''}</td></tr>`).join('') + '</table>';
    $('#por', m).innerHTML = '<table><tr><th>Arrematante</th><th class=n>Lotes</th><th class=n>Valor</th></tr>' + g.compradores.map(c => `<tr data-p="${c.id}" data-n="${esc(c.nome)}" style="cursor:pointer"><td>${esc(c.nome)}</td><td class=n>${c.qtd}</td><td class=n>${brl(c.total)}</td></tr>`).join('') + '</table>';
  };
  refresh();
}

// ================= LEILÕES + configuração =================
async function telaLeiloes(m) {
  m.innerHTML = `<h2>⚙️ Leilões</h2>
  <div class="card"><h3 style="margin-top:0">Criar novo leilão</h3><form id="nf" class="row">
    <label style="flex:2 1 240px">Nome<input name="nome" required placeholder="Ex.: Leilão 2026 ou TESTE"></label>
    <label>Data<input type="date" name="data"></label><button>➕ Criar e usar</button></form>
    <p class="sub">O novo leilão já fica ativo e vazio. As pessoas cadastradas continuam disponíveis (são de todos os leilões).
    Para testar, crie um "TESTE" e apague depois.</p><div id="msg"></div></div>
  <div class="card"><div id="tab"></div>
    <p class="sub">🔒 Histórico = só consulta (não deixa lançar nem arrematar). Leilão histórico não pode ser excluído.</p></div>
  <div class="card"><h3 style="margin-top:0">💾 Backup e relatório final</h3>
    <div class="row"><button id="finz" ${leilao.historico ? 'disabled' : ''}>✅ Finalizar leilão</button>
      <button id="envz" class="sec">☁ Baixar pacote (.zip) e abrir o OneDrive</button>
      <a href="/api/baixar/relatorio-final.html" download><button type="button" class="sec">⬇ Relatório final</button></a></div>
    <div id="bmsg"></div>
    <p class="sub" style="margin-bottom:0"><b>Finalizar</b> = relatório final + <b>backup completo</b> (neste PC e no Backblaze, se configurado) e trava o leilão como histórico.
      É o <b>único momento</b> em que o backup é feito. Para recuperar: <b>Leilao.bat → Restaurar</b>.</p></div>
  <div class="card"><h3 style="margin-top:0">📱 Acesso pelo celular e outros PCs</h3>
    <p style="margin:0 0 6px">Conecte o aparelho na <b>mesma rede Wi-Fi</b> e aponte a câmera para o QR (ou digite o endereço).</p>
    <label style="max-width:320px">Endereço deste servidor (IP:porta)<input id="srv"></label>
    <div class="row" style="margin-top:10px;gap:24px" id="qrs"></div>
    <p class="sub" style="margin-bottom:0">No celular: menu do navegador → "Adicionar à tela inicial" para virar um ícone.</p></div>
  <div class="card"><h3 style="margin-top:0">Configuração do leilão em uso (promissórias)</h3><form id="cf" class="row">
    <label style="flex:2 1 240px">Beneficiário / entidade (a quem se paga)<input name="beneficiario"></label>
    <label>CNPJ<input name="cnpj" size="18"></label><label>Telefone<input name="telefone_entidade" size="16"></label>
    <label style="flex:2 1 300px">Endereço da entidade<input name="endereco_entidade"></label>
    <label style="flex:2 1 300px">Link de envio do OneDrive (opcional)<input name="link_nuvem" placeholder="https://1drv.ms/..."></label>
    <label>Cidade<input name="cidade"></label><label>Vencimento<input type="date" name="vencimento"></label>
    <label>Nome do leilão<input name="nome"></label><label>Data<input type="date" name="data"></label>
    <label style="flex:1 1 100%">Texto da promissória <span class="sub">(em branco = texto padrão)</span>
      <textarea name="texto_promissoria" rows="4" style="width:100%;font:inherit"></textarea></label>
    <p class="sub" style="flex:1 1 100%;margin:0">Variáveis: <code>{vencimento}</code> <code>{emissao}</code> <code>{beneficiario}</code> <code>{cnpj}</code> <code>{valor}</code>
      <code>{valor_extenso}</code> <code>{leilao}</code> <code>{cidade}</code> <code>{comprador}</code> <code>{cpf}</code> · <code>**texto**</code> = negrito</p>
    <button>💾 Salvar</button><span id="cm"></span></form>
    <div class="row" style="margin-top:10px;align-items:center;gap:12px">
      <b>Logo da entidade</b><span id="logoprev"></span>
      <input type="file" id="logoarq" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" hidden><button type="button" class="sm sec" id="logobtn">🖼 Escolher imagem</button>
      <button type="button" class="sm red" id="logodel">🗑 Remover logo</button><span id="logost" class="sub"></span></div>
    <p class="sub" style="margin-bottom:0">Dados da entidade, logo e texto ficam <b>no banco</b>: vão junto no backup e voltam na restauração. Um leilão novo herda os do leilão em uso.</p></div>`;
  $('#nf', m).elements.data.value = hoje();
  $('#nf', m).onsubmit = async e => {
    e.preventDefault();
    await api('/api/leilao', 'POST', Object.fromEntries(new FormData(e.target)));
    location.hash = '#mesa'; location.reload();
  };
  $('#envz', m).onclick = enviarPacote;
  $('#finz', m).onclick = async () => { if (await salvarFinal(true, $('#bmsg', m))) { $('#finz', m).disabled = true; await loadLeilao(); } };
  // QR code com o endereço do servidor (IP detectado pelo Leilao.bat (Iniciar), ou o que o navegador está usando)
  await atualizaInfo();
  const logoUi = () => {
    $('#logoprev', m).innerHTML = leilao.tem_logo ? `<img src="/api/logo?leilao=${leilao.id}&t=${Date.now()}" style="max-height:56px;max-width:160px;vertical-align:middle;background:#fff">` : '<span class="sub">(nenhum)</span>';
    $('#logodel', m).style.display = leilao.tem_logo ? '' : 'none';
  };
  logoUi();
  $('#logobtn', m).onclick = () => $('#logoarq', m).click();
  $('#logoarq', m).onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 2 * 1024 * 1024) return flash($('#logost', m), 'Imagem muito grande (máximo 2 MB).', false);
    const rd = new FileReader();
    rd.onload = async () => {
      try { await api('/api/logo', 'POST', { dados: rd.result }); leilao.tem_logo = true; logoUi(); flash($('#logost', m), '✔ Logo salvo no banco'); }
      catch (er) { flash($('#logost', m), er.message, false); }
      e.target.value = '';
    };
    rd.readAsDataURL(f);
  };
  $('#logodel', m).onclick = async () => {
    if (!confirm('Remover o logo deste leilão?')) return;
    await api('/api/logo', 'DELETE'); leilao.tem_logo = false; logoUi(); flash($('#logost', m), 'Logo removido');
  };
  const srv = $('#srv', m), local = ['localhost', '127.0.0.1', ''].includes(location.hostname);
  let saved = ''; try { saved = localStorage.srv || ''; } catch {}
  srv.value = saved || (local ? (window.info?.ip ? `${window.info.ip}:${window.info.porta}` : '') : location.host);
  srv.placeholder = 'ex.: 192.168.0.10:3000';
  const qrs = () => {
    const v = srv.value.trim(); try { localStorage.srv = v; } catch {}
    $('#qrs', m).innerHTML = v ? [['Lotes', 'lotes'], ['Mesa (arremate)', 'mesa']].map(([t, h]) => `<div style="text-align:center"><div style="width:170px">${qrSvg(`http://${v}/#${h}`)}</div><b>${t}</b><br><code style="font-size:12px">http://${esc(v)}/#${h}</code></div>`).join('')
      : '<span class="sub">Informe o IP do servidor (aparece no Leilao.bat (Iniciar)) para gerar o QR.</span>';
  };
  srv.oninput = qrs; qrs();
  const cf = $('#cf', m);
  for (const k of ['beneficiario', 'link_nuvem', 'cnpj', 'telefone_entidade', 'endereco_entidade', 'cidade', 'vencimento', 'nome', 'data', 'texto_promissoria']) cf[k].value = leilao[k] || '';
  cf.onsubmit = async e => { e.preventDefault(); await api('/api/leilao', 'PUT', Object.fromEntries(new FormData(cf))); flash($('#cm', m), 'Salvo'); loadLeilao(); };
  let lista = [];
  const draw = () => {
    $('#tab', m).innerHTML = '<table><tr><th>Leilão</th><th>Data</th><th class=n>Lotes</th><th class=n>Total</th><th>Situação</th><th></th></tr>' + lista.map(l =>
      `<tr><td><b>${esc(l.nome)}</b></td><td>${esc(l.data || '')}</td><td class=n>${l.lotes}</td><td class=n>${brl(l.total)}</td>
       <td>${l.ativo ? '<span class="tag">em uso</span> ' : ''}${l.historico ? '🔒 histórico' : ''}</td>
       <td>${l.ativo ? '' : `<button class="sm" data-at="${l.id}">▶ Usar</button> `}
         <button class="sm sec" data-h="${l.id}" data-v="${l.historico ? 0 : 1}">${l.historico ? '🔓 Destravar' : '🔒 Marcar histórico'}</button>
         ${l.historico ? '' : `<button class="sm red" data-del="${l.id}" data-n="${esc(l.nome)}">🗑 Excluir</button>`}</td></tr>`).join('') + '</table>';
  };
  m.onclick = async e => {
    const b = e.target.closest('button[data-at],button[data-h],button[data-del]'); if (!b) return;
    try {
      if (b.dataset.at) { await api('/api/leilao/ativar', 'POST', { id: b.dataset.at }); location.reload(); }
      else if (b.dataset.h) { await api(`/api/leilao/${b.dataset.h}/historico`, 'POST', { valor: +b.dataset.v }); location.reload(); }
      else if (b.dataset.del && confirm(`Excluir "${b.dataset.n}" e TODOS os lotes dele? Não tem volta.`)) { await api('/api/leilao/' + b.dataset.del, 'DELETE'); location.reload(); }
    } catch (er) { flash($('#msg', m), er.message, false); }
  };
  refresh = async () => { lista = await api('/api/leiloes'); draw(); };
  refresh();
}

// ================= roteador / tempo real =================
const telas = { mesa: telaMesa, lotes: telaLotes, pessoas: telaPessoas, promissorias: telaProm, relatorio: telaRelatorio, leiloes: telaLeiloes };
async function loadLeilao() {
  leilao = await api('/api/leilao');
  $('#leilaoSel').innerHTML = leilao.leiloes.map(l => `<option value="${l.id}" ${l.ativo ? 'selected' : ''}>${l.historico ? '🔒 ' : ''}${esc(l.nome)}</option>`).join('');
}
$('#leilaoSel').onchange = async e => { await api('/api/leilao/ativar', 'POST', { id: e.target.value }); location.reload(); };
function route() {
  const t = telas[location.hash.slice(1)] ? location.hash.slice(1) : 'mesa';
  $('#nav').innerHTML = Object.entries(TELAS).map(([k, v]) => `<a href="#${k}" class="${k === t ? 'on' : ''}"><span class="ic">${ICONES[k]}</span><span class="tx">${v}</span></a>`).join('');
  const m = $('#main'); m.onclick = null; m.className = ''; refresh = () => {};
  telas[t](m);
  if (leilao.historico && t !== 'leiloes') m.insertAdjacentHTML('afterbegin', '<div class="msg err">🔒 Leilão HISTÓRICO (somente consulta). Para lançar, crie ou use outro leilão na aba Leilões.</div>');
}
const live = () => {
  const es = new EventSource('/api/events');
  es.onopen = () => { $('#live').textContent = '● ao vivo'; $('#live').style.color = '#7fdc7f'; };
  es.onerror = () => { $('#live').textContent = '● offline'; $('#live').style.color = '#f88'; };
  es.onmessage = () => { if (!typing) refresh(); };
};
window.onhashchange = route;
loadLeilao().then(() => { route(); live(); atualizaInfo(); setInterval(atualizaInfo, 60000); });
