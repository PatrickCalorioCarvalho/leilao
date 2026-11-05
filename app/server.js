// Sistema de Leilão - servidor (Node + MySQL). 100% offline: só rede local, sem CDN/internet.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { q, one, run, iniciar } from './db.js';
import { estadoB2, pendentesB2, b2Configurado } from './b2.js';
import { salvarTudo, iniciarAuto, marcarAlteracao, nuvemConfigurada, ultimo, dumpSql, relatorioHtml, lotesDoLeilao, acharLogo, pacoteZip, csvResumoGeral, xlsxResumoGeral, entregaHtml } from './backup.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const ativo = async () => (await one('SELECT * FROM leilao WHERE ativo=1')) || (await one('SELECT * FROM leilao ORDER BY id DESC LIMIT 1'));
const num = v => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));
const txt = v => String(v ?? '').trim();
const editavel = async () => {
  const a = await ativo();
  if (a.historico) throw new Error('Este leilão é HISTÓRICO (somente leitura). Crie ou ative outro leilão na aba Leilões.');
  return a;
};
const dt = v => txt(v) || null;
const iso = v => (v instanceof Date ? v.toISOString().slice(0, 10) : v);
const fixLeilao = a => a && { ...a, data: iso(a.data), vencimento: iso(a.vencimento) };

// tempo real (SSE): avisa todos os PCs quando algo muda
const clients = new Set();
const notify = what => { for (const r of clients) r.write(`data: ${what}\n\n`); };

const ROTULO = "CONCAT(LPAD(l.numero, GREATEST(3, CHAR_LENGTH(l.numero)), '0'), IF(l.sub>0, CONCAT('-', l.sub), ''))";
const LOTE_SQL = `SELECT l.*, ${ROTULO} AS rotulo, p.nome AS comprador FROM lote l LEFT JOIN pessoa p ON p.id=l.pessoa_id`;
const COND = c => (['vivo', 'morto'].includes(txt(c).toLowerCase()) ? txt(c).toLowerCase() : '');
const getLote = id => one(`${LOTE_SQL} WHERE l.id=?`, id);
const getPessoa = id => one('SELECT * FROM pessoa WHERE id=?', id);

const routes = {
  'GET /api/leilao': async () => ({ ...fixLeilao(await ativo()), leiloes: await q('SELECT id,nome,ativo,historico FROM leilao ORDER BY historico, id DESC') }),
  'PUT /api/leilao': async b => {
    const a = await ativo();
    await run('UPDATE leilao SET nome=?,data=?,beneficiario=?,cidade=?,vencimento=?,cnpj=?,endereco_entidade=?,telefone_entidade=?,link_nuvem=? WHERE id=?',
      txt(b.nome) || a.nome, dt(b.data), txt(b.beneficiario), txt(b.cidade), dt(b.vencimento), txt(b.cnpj), txt(b.endereco_entidade), txt(b.telefone_entidade), txt(b.link_nuvem), a.id);
    return fixLeilao(await ativo());
  },
  'GET /api/leiloes': async () => (await q(`SELECT l.id,l.nome,l.data,l.ativo,l.historico,COUNT(o.id) lotes,
      COALESCE(SUM(o.valor_final),0) total FROM leilao l LEFT JOIN lote o ON o.leilao_id=l.id GROUP BY l.id ORDER BY l.historico, l.id DESC`))
      .map(l => ({ ...l, data: iso(l.data), lotes: Number(l.lotes), total: Number(l.total) })),
  'POST /api/leilao': async b => { // cria e já ativa; copia beneficiário/cidade do leilão atual
    const o = await ativo();
    await run('UPDATE leilao SET ativo=0');
    const r = await run('INSERT INTO leilao(nome,data,beneficiario,cidade,cnpj,endereco_entidade,telefone_entidade,link_nuvem,ativo) VALUES(?,?,?,?,?,?,?,?,1)',
      txt(b.nome) || 'Novo leilão', dt(b.data) || new Date().toISOString().slice(0, 10), o?.beneficiario || '', o?.cidade || '', o?.cnpj || '', o?.endereco_entidade || '', o?.telefone_entidade || '', o?.link_nuvem || '');
    return { id: r.insertId };
  },
  'POST /api/leilao/:id/historico': async (b, _, p) => {
    await run('UPDATE leilao SET historico=? WHERE id=?', b.valor ? 1 : 0, p.id); return {};
  },
  'DELETE /api/leilao/:id': async (_, __, p) => {
    const l = await one('SELECT * FROM leilao WHERE id=?', p.id);
    if (!l) throw new Error('Leilão não existe');
    if (l.historico) throw new Error('Leilão histórico não pode ser excluído (desmarque "histórico" antes).');
    await run('DELETE FROM lote WHERE leilao_id=?', p.id);
    await run('DELETE FROM leilao WHERE id=?', p.id);
    if (!(await one('SELECT 1 FROM leilao WHERE ativo=1'))) await run('UPDATE leilao SET ativo=1 ORDER BY historico, id DESC LIMIT 1');
    return {};
  },
  'POST /api/leilao/ativar': async b => { await run('UPDATE leilao SET ativo=0'); await run('UPDATE leilao SET ativo=1 WHERE id=?', b.id); return {}; },

  'GET /api/pessoas': async (_, u) => {
    const s = txt(u.searchParams.get('q')).toLowerCase();
    const dig = s.replace(/\D/g, '');
    if (!s) return q('SELECT * FROM pessoa ORDER BY nome LIMIT 1000');
    return q(`SELECT * FROM pessoa WHERE nome LIKE ? ${dig ? "OR REPLACE(REPLACE(cpf,'.',''),'-','') LIKE ?" : ''} ORDER BY nome LIMIT 30`,
      '%' + s + '%', ...(dig ? ['%' + dig + '%'] : []));
  },
  'POST /api/pessoas': async b => {
    if (!txt(b.nome)) throw new Error('Informe o nome');
    const r = await run('INSERT INTO pessoa(nome,cpf,rg,telefone,endereco) VALUES(?,?,?,?,?)', txt(b.nome), txt(b.cpf), txt(b.rg), txt(b.telefone), txt(b.endereco));
    return getPessoa(r.insertId);
  },
  'PUT /api/pessoas/:id': async (b, _, p) => {
    if (!txt(b.nome)) throw new Error('Informe o nome');
    await run('UPDATE pessoa SET nome=?,cpf=?,rg=?,telefone=?,endereco=? WHERE id=?', txt(b.nome), txt(b.cpf), txt(b.rg), txt(b.telefone), txt(b.endereco), p.id);
    return getPessoa(p.id);
  },
  'DELETE /api/pessoas/:id': async (_, __, p) => {
    if (await one('SELECT 1 FROM lote WHERE pessoa_id=?', p.id)) throw new Error('Pessoa tem arremates; não pode excluir');
    await run('DELETE FROM pessoa WHERE id=?', p.id); return {};
  },

  // sugestões de descrição (animais/itens já usados em qualquer leilão) -> menos digitação
  'GET /api/itens': async () => (await q('SELECT descricao, COUNT(*) n, MAX(valor_inicial) vi FROM lote GROUP BY descricao ORDER BY n DESC, descricao LIMIT 300')),
  'GET /api/lotes': async () => q(`${LOTE_SQL} WHERE l.leilao_id=? ORDER BY l.numero, l.sub`, (await ativo()).id),
  'POST /api/lotes': async b => { // número do lote é sempre automático (próximo da fila)
    const a = await editavel();
    if (!txt(b.descricao)) throw new Error('Informe a descrição');
    const numero = (await one('SELECT COALESCE(MAX(numero),0)+1 n FROM lote WHERE leilao_id=?', a.id)).n;
    const r = await run('INSERT INTO lote(leilao_id,numero,descricao,animal_num,condicao,valor_inicial,doado) VALUES(?,?,?,?,?,?,?)',
      a.id, numero, txt(b.descricao), txt(b.animal_num), COND(b.condicao), num(b.valor_inicial) || 0, b.doado ? 1 : 0);
    return getLote(r.insertId);
  },
  'PUT /api/lotes/:id': async (b, _, p) => {
    await editavel();
    await run('UPDATE lote SET descricao=?,animal_num=?,condicao=?,valor_inicial=?,doado=? WHERE id=?', txt(b.descricao), txt(b.animal_num), COND(b.condicao), num(b.valor_inicial) || 0, b.doado ? 1 : 0, p.id);
    return getLote(p.id);
  },
  'DELETE /api/lotes/:id': async (_, __, p) => { await editavel(); await run('DELETE FROM lote WHERE id=?', p.id); return {}; },
  // body: pessoa_id, valor_final, doado (lote fecha como doado: sem entrega), condicao (vivo/morto), animal_num
  'POST /api/lotes/:id/arrematar': async (b, _, p) => {
    await editavel();
    if (!b.pessoa_id) throw new Error('Escolha o comprador');
    const v = num(b.valor_final);
    if (!(v >= 0)) throw new Error('Informe o valor final');
    const l = await one('SELECT * FROM lote WHERE id=?', p.id);
    if (!l) throw new Error('Lote não existe');
    const doado = b.doado ? 1 : 0;
    const an = b.animal_num === undefined ? l.animal_num : txt(b.animal_num); // nº do animal pode ser corrigido na hora do arremate
    await run('UPDATE lote SET pessoa_id=?, valor_final=?, doado=?, condicao=?, animal_num=? WHERE id=?',
      b.pessoa_id, v, doado, b.condicao === undefined ? l.condicao : COND(b.condicao), an, p.id);
    return { lote: await getLote(p.id) };
  },
  'POST /api/lotes/:id/desfazer': async (_, __, p) => { await editavel(); await run('UPDATE lote SET pessoa_id=NULL, valor_final=NULL WHERE id=?', p.id); return {}; },

  // Relatório final + backup completo (local e nuvem). travar=true também marca o leilão como histórico.
  'POST /api/finalizar': async b => {
    const a = await ativo();
    const r = await salvarTudo(a, b.travar ? 'final' : 'relatorio');
    if (!r.destinos.some(d => d.ok)) throw new Error('Não foi possível gravar o backup: ' + r.destinos.map(d => d.erro).join('; '));
    if (b.travar) await run('UPDATE leilao SET historico=1 WHERE id=?', a.id);
    return r;
  },
  'POST /api/backup': async () => salvarTudo(await ativo(), 'backup'),
  'GET /api/info': async () => ({ ip: process.env.HOST_IP || '', porta: Number(process.env.PUBLIC_PORT) || PORT, nuvem: nuvemConfigurada(), logo: !!acharLogo(), ultimo,
    b2: b2Configurado() ? { pendentes: pendentesB2(), ...estadoB2 } : null }),
  // rastrear um animal pelo nº (brinco) em TODOS os leilões: onde foi, quem comprou, por quanto, se foi doado/reaberto
  'GET /api/animal': async (_, u) => {
    const n = txt(u.searchParams.get('num'));
    if (!n) return [];
    return q(`SELECT le.nome leilao, ${ROTULO} rotulo, l.descricao, l.condicao, l.animal_num, l.doado, l.valor_final, l.pessoa_id, p.nome comprador
      FROM lote l JOIN leilao le ON le.id=l.leilao_id LEFT JOIN pessoa p ON p.id=l.pessoa_id
      WHERE l.animal_num=? ORDER BY le.data, le.id, l.numero, l.sub`, n);
  },
  'GET /api/resumo': async () => {
    const a = await ativo();
    const tot = await one(`SELECT COUNT(*) lotes, CAST(COALESCE(SUM(pessoa_id IS NOT NULL),0) AS UNSIGNED) vendidos, COALESCE(SUM(valor_final),0) total,
      COALESCE(SUM(CASE WHEN doado=1 THEN valor_final END),0) total_doado FROM lote WHERE leilao_id=?`, a.id);
    const compradores = await q(`SELECT p.id,p.nome,p.cpf,p.telefone,COUNT(*) qtd,SUM(l.valor_final) total FROM lote l JOIN pessoa p ON p.id=l.pessoa_id
      WHERE l.leilao_id=? GROUP BY p.id,p.nome,p.cpf,p.telefone ORDER BY total DESC`, a.id);
    const total = Number(tot.total), total_doado = Number(tot.total_doado);
    return { lotes: Number(tot.lotes), vendidos: Number(tot.vendidos), total, total_doado, total_entrega: total - total_doado, compradores };
  },
  // ?pessoa=ID  ?doado=entrega|doados  ?condicao=vivo|morto  ?situacao=todos (inclui lotes sem arremate)
  'GET /api/relatorio': async (_, u) => relatorio(u),
  // ?ids=pessoa,pessoa  |  ?lote=ID (promissória de um lote só)  |  sem parâmetro = todos
  'GET /api/promissoria': async (_, u) => {
    const a = await ativo();
    const loteId = Number(u.searchParams.get('lote')) || 0;
    let ids = txt(u.searchParams.get('ids')).split(',').map(Number).filter(Boolean);
    if (loteId) ids = [(await one('SELECT pessoa_id FROM lote WHERE id=?', loteId))?.pessoa_id].filter(Boolean);
    if (!ids.length) ids = (await q('SELECT DISTINCT pessoa_id id FROM lote WHERE leilao_id=? AND pessoa_id IS NOT NULL', a.id)).map(r => r.id);
    const cols = `${ROTULO} rotulo, l.descricao, l.animal_num, l.condicao, l.doado, l.valor_final`;
    const itens = [];
    for (const id of ids) {
      const lotes = loteId
        ? await q(`SELECT ${cols} FROM lote l WHERE l.id=?`, loteId)
        : await q(`SELECT ${cols} FROM lote l WHERE l.leilao_id=? AND l.pessoa_id=? ORDER BY l.numero, l.sub`, a.id, id);
      const pessoa = await getPessoa(id);
      if (pessoa && lotes.length) itens.push({ pessoa, lotes });
    }
    return { leilao: fixLeilao(a), itens };
  },
};
async function relatorio(u) {
  const a = await ativo(), w = ['l.leilao_id=?'], par = [a.id];
  const pessoa = Number(u.searchParams.get('pessoa')) || 0, doado = u.searchParams.get('doado'), cond = COND(u.searchParams.get('condicao'));
  if (pessoa) { w.push('l.pessoa_id=?'); par.push(pessoa); } else if (u.searchParams.get('situacao') !== 'todos') w.push('l.pessoa_id IS NOT NULL');
  if (doado === 'entrega') w.push('l.doado=0'); else if (doado === 'doados') w.push('l.doado=1');
  if (cond) { w.push('l.condicao=?'); par.push(cond); }
  const rows = await q(`SELECT l.*, ${ROTULO} rotulo, p.nome comprador, p.cpf, p.rg, p.telefone, p.endereco FROM lote l LEFT JOIN pessoa p ON p.id=l.pessoa_id
    WHERE ${w.join(' AND ')} ORDER BY l.numero, l.sub`, ...par);
  const soma = f => rows.filter(f).reduce((s, r) => s + (r.valor_final || 0), 0);
  return { leilao: a.nome, rows, qtd: rows.length, total: soma(() => true), total_doado: soma(r => r.doado), total_entrega: soma(r => !r.doado) };
}
const compiled = Object.entries(routes).map(([k, fn]) => {
  const [method, pat] = k.split(' ');
  return { method, re: new RegExp('^' + pat.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn };
});

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

await iniciar();
iniciarAuto(60);
process.on('unhandledRejection', e => console.log('Erro não tratado:', e?.message || e)); // nada derruba o servidor
process.on('uncaughtException', e => console.log('Erro inesperado:', e?.message || e));
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('retry: 1500\n\n');
      clients.add(res); req.on('close', () => clients.delete(res));
      return;
    }
    if (u.pathname === '/api/logo') { // logo da entidade (opcional, pasta logo/)
      const l = acharLogo();
      if (!l) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': l.mime, 'Cache-Control': 'no-cache' });
      return fs.createReadStream(l.arquivo).pipe(res);
    }
    // downloads pelo navegador (funcionam em qualquer PC, sem pasta de nuvem)
    if (u.pathname === '/api/baixar/pacote.zip') { // relatório final + lotes + backup num arquivo só
      const z = await pacoteZip(await ativo());
      res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${z.nome}"` });
      return res.end(z.dados);
    }
    if (u.pathname === '/api/baixar/backup.sql') {
      res.writeHead(200, { 'Content-Type': 'application/sql; charset=utf-8', 'Content-Disposition': 'attachment; filename="leilao-backup.sql"' });
      return res.end(await dumpSql());
    }
    if (u.pathname === '/api/baixar/relatorio-final.html') {
      const a = await ativo();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': 'attachment; filename="relatorio-final.html"' });
      return res.end(relatorioHtml(a, await lotesDoLeilao(a.id)));
    }
    if (u.pathname === '/api/export.csv') { // mesmo formato do CSV antigo (Lote;Animal;AnimalNumero;...;Total)
      const rel = await relatorio(u);
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="leilao-resumo-geral.csv"' });
      return res.end(csvResumoGeral(rel.rows));
    }
    if (u.pathname === '/api/export.xlsx') { // Excel com as abas ResumoGeral e ResumoDetalhado, como a planilha antiga
      const rel = await relatorio(u);
      res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="leilao-resumo-geral.xlsx"' });
      return res.end(xlsxResumoGeral(rel.rows));
    }
    if (u.pathname === '/api/entrega.html') { // relatório de entrega (abre no navegador para imprimir)
      const rel = await relatorio(u), agr = u.searchParams.get('agrupar') !== '0', pq = u.searchParams.get('pessoa') ? '&pessoa=' + Number(u.searchParams.get('pessoa')) : '';
      const barra = `<a href="?agrupar=1${pq}">por comprador</a> | <a href="?agrupar=0${pq}">lista por lote</a>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(entregaHtml(await ativo(), rel.rows, { agrupar: agr, barra }));
    }
    if (u.pathname.startsWith('/api/')) {
      for (const r of compiled) {
        const m = r.method === req.method && r.re.exec(u.pathname);
        if (!m) continue;
        let body = {};
        if (req.method !== 'GET') { let s = ''; for await (const c of req) s += c; body = s ? JSON.parse(s) : {}; }
        const out = await r.fn(body, u, m.groups || {});
        if (req.method !== 'GET') { notify(u.pathname.split('/')[2]); marcarAlteracao(); }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(out));
      }
      res.writeHead(404); return res.end('{"erro":"não encontrado"}');
    }
    const root = path.join(DIR, 'public');
    const f = path.normalize(path.join(root, u.pathname === '/' ? 'index.html' : u.pathname));
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(f).pipe(res);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ erro: e.code === 'ER_DUP_ENTRY' ? 'Registro duplicado' : e.message }));
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log('\n=== SISTEMA DE LEILÃO ===');
  console.log(`Neste PC:    http://localhost:${PORT}`);
  for (const l of Object.values(os.networkInterfaces()).flat())
    if (l.family === 'IPv4' && !l.internal) console.log(`Outros PCs:  http://${l.address}:${PORT}`);
});
