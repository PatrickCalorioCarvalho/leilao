// Backup completo + relatório final, feito ao FINALIZAR o leilão (não há backup automático). Grava em:
//   /backups/local  (pasta local/banco/finais deste projeto)   -> sempre
//   /backups/nuvem  (pasta do OneDrive / Google Drive)   -> sincroniza sozinho quando houver internet
//   Backblaze B2    (se B2_KEY_ID/B2_APP_KEY no .env)   -> fila de envio, ver b2.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import sql from 'mysql2';
import { q } from './db.js';
import { b2Configurado, enfileirarB2, iniciarB2 } from './b2.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LOCAL = process.env.BACKUP_LOCAL || path.join(DIR, '..', 'local', 'banco', 'finais');
const NUVEM = process.env.BACKUP_NUVEM || '';
const pastaNuvemOk = () => !!NUVEM && process.env.NUVEM_OK === 'sim';
export const nuvemConfigurada = () => pastaNuvemOk() || b2Configurado();
// logo da entidade: guardado no banco (coluna leilao.logo), embutido nos relatórios para abrirem em qualquer lugar
const logoDataUri = leilao => (leilao?.logo ? `data:${leilao.logo_mime || 'image/png'};base64,${Buffer.from(leilao.logo).toString('base64')}` : '');
const esc = v => sql.escape(v);
const h = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pad = n => String(n).padStart(2, '0');
const agora = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`; };
const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'leilao';

// ---- dump SQL completo (restaura com Leilao.bat (Restaurar) ou carregando no MySQL)
export async function dumpSql() {
  const schema = fs.readFileSync(path.join(DIR, 'schema.sql'), 'utf8');
  const out = [`-- Backup do Sistema de Leilão — ${new Date().toLocaleString('pt-BR')}`, 'SET NAMES utf8mb4;',
    'CREATE DATABASE IF NOT EXISTS leilao DEFAULT CHARSET utf8mb4;', 'USE leilao;', 'SET FOREIGN_KEY_CHECKS=0;',
    'DROP TABLE IF EXISTS lote;', 'DROP TABLE IF EXISTS pessoa;', 'DROP TABLE IF EXISTS leilao;', schema];
  for (const t of ['leilao', 'pessoa', 'lote']) {
    const rows = await q(`SELECT * FROM ${t} ORDER BY id`);
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    for (let i = 0; i < rows.length; i += 200)
      out.push(`INSERT INTO ${t} (${cols.join(',')}) VALUES\n` + rows.slice(i, i + 200).map(r => '(' + cols.map(c => esc(r[c])).join(',') + ')').join(',\n') + ';');
  }
  out.push('SET FOREIGN_KEY_CHECKS=1;', '');
  return out.join('\n');
}

const ROTULO = "CONCAT(LPAD(l.numero, GREATEST(3, CHAR_LENGTH(l.numero)), '0'), IF(l.sub>0, CONCAT('-', l.sub), ''))";
export async function lotesDoLeilao(id) {
  return q(`SELECT l.*, ${ROTULO} rotulo, p.nome comprador, p.cpf, p.rg, p.telefone, p.endereco FROM lote l LEFT JOIN pessoa p ON p.id=l.pessoa_id
    WHERE l.leilao_id=? ORDER BY l.numero, l.sub`, id);
}
export function csvDeLotes(rows) {
  const e = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = 'Lote;Item;Condicao;NumeroAnimal;ValorInicial;ValorFinal;Doado;Arrematador;CPF;RG;Telefone;Endereco';
  return String.fromCharCode(0xFEFF) + [head, ...rows.map(r => [r.rotulo, r.descricao, r.condicao, r.animal_num, r.valor_inicial, r.valor_final, r.doado ? 'SIM' : '', r.comprador, r.cpf, r.rg, r.telefone, r.endereco].map(e).join(';'))].join('\r\n');
}

// ---- relatório final: HTML único, pronto para imprimir ou guardar
export function relatorioHtml(leilao, rows) {
  const vend = rows.filter(r => r.pessoa_id), soma = a => a.reduce((s, r) => s + (r.valor_final || 0), 0);
  const total = soma(vend), doado = soma(vend.filter(r => r.doado));
  const por = new Map();
  for (const r of vend) {
    const p = por.get(r.pessoa_id) || { nome: r.comprador, cpf: r.cpf, tel: r.telefone, qtd: 0, total: 0, doado: 0 };
    p.qtd++; p.total += r.valor_final; if (r.doado) p.doado += r.valor_final; por.set(r.pessoa_id, p);
  }
  const lista = [...por.values()].sort((a, b) => b.total - a.total);
  const abertos = rows.filter(r => !r.pessoa_id);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório final — ${h(leilao.nome)}</title><style>
body{font:13px/1.4 Arial,sans-serif;margin:24px;color:#111}h1{margin:0}h2{margin:22px 0 6px;border-bottom:2px solid #333;padding-bottom:2px}
table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ccc;padding:3px 6px;text-align:left}th{background:#eee}td.n,th.n{text-align:right}
.k{display:flex;gap:12px;margin:10px 0}.k div{flex:1;border:1px solid #999;padding:8px;text-align:center}.k b{display:block;font-size:20px}.d{color:#8a5200;font-weight:bold}
@media print{body{margin:8mm}}</style></head><body>
<div style="display:flex;gap:14px;align-items:center;margin-bottom:8px">${logoDataUri(leilao) ? `<img src="${logoDataUri(leilao)}" style="max-height:70px;max-width:160px">` : ''}
<div><b style="font-size:16px">${h(leilao.beneficiario)}</b><br>${leilao.cnpj ? 'CNPJ ' + h(leilao.cnpj) + '<br>' : ''}${h(leilao.endereco_entidade)} ${leilao.telefone_entidade ? '· ' + h(leilao.telefone_entidade) : ''}</div></div>
<h1>Relatório final — ${h(leilao.nome)}</h1><div>${h(leilao.data || '')} ${leilao.cidade ? '· ' + h(leilao.cidade) : ''} · gerado em ${new Date().toLocaleString('pt-BR')}</div>
<div class="k"><div>Lotes vendidos<b>${vend.length} / ${rows.length}</b></div><div>Total arrematado<b>${brl(total)}</b></div><div>Com entrega<b>${brl(total - doado)}</b></div><div>Doados (sem entrega)<b>${brl(doado)}</b></div></div>
<h2>Por arrematante</h2><table><tr><th>Arrematante</th><th>CPF</th><th>Telefone</th><th class="n">Lotes</th><th class="n">Com entrega</th><th class="n">Doado</th><th class="n">Total</th></tr>
${lista.map(p => `<tr><td>${h(p.nome)}</td><td>${h(p.cpf)}</td><td>${h(p.tel)}</td><td class="n">${p.qtd}</td><td class="n">${brl(p.total - p.doado)}</td><td class="n">${brl(p.doado)}</td><td class="n"><b>${brl(p.total)}</b></td></tr>`).join('')}
<tr><th colspan="3">Total</th><th class="n">${vend.length}</th><th class="n">${brl(total - doado)}</th><th class="n">${brl(doado)}</th><th class="n">${brl(total)}</th></tr></table>
<h2>Lotes</h2><table><tr><th>Lote</th><th>Item</th><th>V/M</th><th>Comprador</th><th>Entrega</th><th class="n">Valor</th></tr>
${rows.map(r => `<tr><td>${h(r.rotulo)}</td><td>${h(r.descricao)}${r.animal_num ? ' #' + h(r.animal_num) : ''}</td><td>${h(r.condicao)}</td><td>${h(r.comprador) || '— sem arremate'}</td><td>${r.pessoa_id ? (r.doado ? '<span class="d">DOADO</span>' : 'sim') : ''}</td><td class="n">${r.valor_final != null ? brl(r.valor_final) : ''}</td></tr>`).join('')}</table>
${abertos.length ? `<p><b>${abertos.length} lote(s) sem arremate.</b></p>` : ''}</body></html>`;
}

// ---- ZIP mínimo (sem dependências): vários arquivos num só, para enviar de uma vez ao OneDrive/e-mail
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
export function zip(files) {
  const d = new Date(), t = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const parts = [], central = []; let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const comp = zlib.deflateRawSync(raw), crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(t, 10); lh.writeUInt16LE(dt, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(t, 12); ch.writeUInt16LE(dt, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    parts.push(lh, name, comp); central.push(ch, name);
    offset += lh.length + name.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
export async function pacoteZip(leilao) {
  const rows = await lotesDoLeilao(leilao.id);
  const nome = `leilao-${slug(leilao.nome)}-${agora()}.zip`;
  return { nome, dados: zip([
    { name: 'relatorio-final.html', data: relatorioHtml(leilao, rows) },
    { name: 'lotes.csv', data: csvResumoGeral(rows) },
    { name: 'resumo-geral.xlsx', data: xlsxResumoGeral(rows) },
    { name: 'entrega.html', data: entregaHtml(leilao, rows) },
    { name: 'leilao.sql', data: await dumpSql() }]) };
}

// ---- grava tudo em pasta datada (local sempre; nuvem se configurada)
export async function salvarTudo(leilao, tipo = 'backup') {
  const rows = await lotesDoLeilao(leilao.id);
  const arquivos = { 'leilao.sql': await dumpSql(), 'relatorio-final.html': relatorioHtml(leilao, rows), 'lotes.csv': csvResumoGeral(rows), 'resumo-geral.xlsx': xlsxResumoGeral(rows), 'entrega.html': entregaHtml(leilao, rows) };
  const nome = `${agora()}_${slug(leilao.nome)}_${tipo}`;
  const destinos = [['local', LOCAL]]; if (NUVEM) destinos.push(['nuvem', NUVEM]);
  const resultado = { pasta: nome, destinos: [] };
  for (const [rotulo, base] of destinos) {
    try {
      const dir = path.join(base, nome); fs.mkdirSync(dir, { recursive: true });
      for (const [f, c] of Object.entries(arquivos)) fs.writeFileSync(path.join(dir, f), c, 'utf8');
      resultado.destinos.push({ destino: rotulo, ok: true });
    } catch (e) { resultado.destinos.push({ destino: rotulo, ok: false, erro: e.message }); }
  }
  resultado.nuvem = pastaNuvemOk() && resultado.destinos.some(d => d.destino === 'nuvem' && d.ok);
  resultado.b2 = enfileirarB2(`finais/${nome}.zip`, zip(Object.entries(arquivos).map(([name, data]) => ({ name, data }))));
  ultimo = { quando: new Date().toISOString(), tipo, nuvem: resultado.nuvem || resultado.b2 };
  return resultado;
}

// ---- o backup acontece SÓ ao finalizar o leilão (salvarTudo, acima). Aqui só liga a fila de envio ao Backblaze,
// que retoma sozinha o que ficou pendente (ex.: finalizou sem internet).
export let ultimo = null;
export function iniciarBackup() { iniciarB2(LOCAL); }

// ======================================================================
// Exportação no formato da planilha antiga (ResumoGeral / ResumoDetalhado)
// ======================================================================
const nomeAnimal = r => `${r.descricao}${r.condicao ? ' (' + r.condicao + ')' : ''}${r.doado ? ' (DOADO)' : ''}`;
const numBR = v => (v == null ? '' : Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toFixed(2).replace('.', ','));

// CSV igual ao antigo: Lote;Animal;AnimalNumero;ValorInicial;ValorFinal;Arrematador;CPF;Telefone;Endereco;RG; + linha Total
export function csvResumoGeral(rows) {
  const e = v => { const s = String(v ?? ''); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const total = rows.reduce((s, r) => s + (r.valor_final || 0), 0);
  const linhas = rows.map(r => [r.rotulo, nomeAnimal(r), r.animal_num, numBR(r.valor_inicial), numBR(r.valor_final), r.comprador, r.cpf, r.telefone, r.endereco, r.rg].map(e).join(';') + ';');
  return String.fromCharCode(0xFEFF) + ['Lote;Animal;AnimalNumero;ValorInicial;ValorFinal;Arrematador;CPF;Telefone;Endereco;RG;', ...linhas, 'Total' + ';'.repeat(10) + numBR(total)].join('\r\n') + '\r\n';
}

// XLSX (sem bibliotecas) com as duas abas da planilha antiga: ResumoGeral (B1:K..) e ResumoDetalhado (TOTAL em B2:C2; arrematantes em I3:J..)
const xmlEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colLetra = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
// cells: [{r:linha(1..), c:coluna(0..), v:valor, st:0|1|2|3}]  (st: 1 negrito, 2 dinheiro, 3 negrito+dinheiro)
function folhaXml(cells, widths) {
  const porLinha = new Map();
  for (const x of cells) { if (!porLinha.has(x.r)) porLinha.set(x.r, []); porLinha.get(x.r).push(x); }
  const linhas = [...porLinha.keys()].sort((a, b) => a - b).map(r => '<row r="' + r + '">' + porLinha.get(r).sort((a, b) => a.c - b.c).map(x => {
    const ref = colLetra(x.c) + r, s = x.st ? ` s="${x.st}"` : '';
    if (x.v == null || x.v === '') return `<c r="${ref}"${s}/>`;
    return typeof x.v === 'number' ? `<c r="${ref}"${s}><v>${x.v}</v></c>` : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(x.v)}</t></is></c>`;
  }).join('') + '</row>').join('');
  const cols = '<cols>' + widths.map((w, i) => w ? `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>` : '').join('') + '</cols>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + cols + '<sheetData>' + linhas + '</sheetData></worksheet>';
}
export function xlsxResumoGeral(rows) {
  const vend = rows.filter(r => r.pessoa_id), soma = a => a.reduce((s, r) => s + (r.valor_final || 0), 0);
  const total = soma(vend), doado = soma(vend.filter(r => r.doado));
  // ---- aba 1: ResumoGeral  (cabeçalho em B1:K1, como na planilha antiga)
  const g = [];
  ['Lote', 'Item', 'Numero Animal', 'ValorInicial', 'ValorFinal', 'Nome', 'CPF', 'RG', 'Telefone', 'Endereco'].forEach((t, i) => g.push({ r: 1, c: 1 + i, v: t, st: 1 }));
  rows.forEach((r, k) => {
    const L = k + 2, lote = r.rotulo; // texto "001": mantém os zeros à esquerda
    [[lote, 0], [nomeAnimal(r), 0], [r.animal_num, 0], [r.valor_inicial, 2], [r.valor_final, 2], [r.comprador, 0], [r.cpf, 0], [r.rg, 0], [r.telefone, 0], [r.endereco, 0]]
      .forEach(([v, st], i) => g.push({ r: L, c: 1 + i, v: v === null ? '' : v, st }));
  });
  // ---- aba 2: ResumoDetalhado  (TOTAL em B2:C2; tabela de arrematantes em I3:J..)
  const por = new Map();
  for (const r of vend) { const p = por.get(r.pessoa_id) || { nome: r.comprador, total: 0 }; p.total += r.valor_final; por.set(r.pessoa_id, p); }
  const d = [{ r: 2, c: 1, v: 'TOTAL ', st: 1 }, { r: 2, c: 2, v: total, st: 3 },
    { r: 3, c: 1, v: 'Com entrega' }, { r: 3, c: 2, v: total - doado, st: 2 }, { r: 4, c: 1, v: 'Doados (sem entrega)' }, { r: 4, c: 2, v: doado, st: 2 },
    { r: 3, c: 8, v: 'Arremadador', st: 1 }, { r: 3, c: 9, v: 'Valor', st: 1 }];
  [...por.values()].sort((a, b) => b.total - a.total).forEach((p, k) => { d.push({ r: 4 + k, c: 8, v: p.nome }); d.push({ r: 4 + k, c: 9, v: p.total, st: 2 }); });
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const hdr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return zip([
    { name: '[Content_Types].xml', data: hdr + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', data: hdr + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: hdr + `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="ResumoGeral" sheetId="1" r:id="rId1"/><sheet name="ResumoDetalhado" sheetId="2" r:id="rId2"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: hdr + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${rel}/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: hdr + `<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    { name: 'xl/worksheets/sheet1.xml', data: folhaXml(g, [0, 9, 38, 13, 13, 13, 34, 16, 14, 16, 60]) },
    { name: 'xl/worksheets/sheet2.xml', data: folhaXml(d, [0, 22, 14, 0, 0, 0, 0, 0, 34, 14]) },
  ]);
}

// ======================================================================
// Relatório de ENTREGA (imprimir e passar para quem entrega): só lotes vendidos COM entrega (doados ficam de fora)
// agrupar=true  -> uma ficha por comprador (nome, telefone, endereço + animais + assinatura)
// agrupar=false -> lista única por lote
// ======================================================================
export function entregaHtml(leilao, rows, { agrupar = true, barra = null } = {}) {
  const lista = rows.filter(r => r.pessoa_id && !r.doado);
  const grupos = new Map();
  for (const r of lista) { const g = grupos.get(r.pessoa_id) || { nome: r.comprador, tel: r.telefone, end: r.endereco, itens: [] }; g.itens.push(r); grupos.set(r.pessoa_id, g); }
  const gs = [...grupos.values()].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt'));
  const logo = logoDataUri(leilao);
  const item = r => `${h(r.descricao)}${r.condicao ? ' <i>(' + h(r.condicao) + ')</i>' : ''}`;
  const corpo = !lista.length ? '<p>Nenhum lote com entrega.</p>'
    : agrupar ? gs.map(g => `<div class="bloco"><div class="top"><b>${h(g.nome)}</b> ${g.tel ? '· Tel: ' + h(g.tel) : ''}<br><span>Endereço: ${h(g.end) || '<u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>'}</span></div>
      <table><tr><th style="width:28px"></th><th style="width:50px">Lote</th><th>Animal / item</th><th style="width:110px">Nº do animal</th></tr>
      ${g.itens.map(r => `<tr><td class="ck">☐</td><td><b>${h(r.rotulo)}</b></td><td>${item(r)}</td><td><b>${h(r.animal_num)}</b></td></tr>`).join('')}</table>
      <div class="ass">Recebido por: ______________________________ &nbsp; Data: ___/___/______</div></div>`).join('')
    : `<table class="lista"><tr><th style="width:26px"></th><th>Lote</th><th>Animal / item</th><th>Nº animal</th><th>Arrematante</th><th>Telefone</th><th>Endereço</th></tr>
      ${lista.map(r => `<tr><td class="ck">☐</td><td><b>${h(r.rotulo)}</b></td><td>${item(r)}</td><td><b>${h(r.animal_num)}</b></td><td>${h(r.comprador)}</td><td>${h(r.telefone)}</td><td>${h(r.endereco)}</td></tr>`).join('')}</table>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de entrega — ${h(leilao.nome)}</title><style>
@page{size:A4;margin:10mm}*{box-sizing:border-box}body{font:12px/1.35 Arial,sans-serif;margin:0;color:#111}.pg{max-width:190mm;margin:0 auto;padding:8px}
.cab{display:flex;gap:12px;align-items:center;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:8px}.cab img{max-height:56px;max-width:140px}.cab small{display:block}
h1{font-size:17px;margin:0}.res{margin:4px 0 8px}.bloco{border:1px solid #000;margin:0 0 8px;padding:6px 8px;page-break-inside:avoid}
.top{font-size:13px;margin-bottom:4px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #999;padding:3px 5px;text-align:left}th{background:#eee;font-size:11px}
.ck{font-size:16px}.ass{margin-top:10px;font-size:11px}.lista td{vertical-align:top}.bar{background:#333;color:#fff;padding:8px;text-align:center;font-size:13px}.bar a{color:#fc6;margin:0 8px}.bar button{font-size:15px;padding:5px 14px}
@media print{.bar{display:none}.pg{padding:0}}</style></head><body>
${barra ? `<div class="bar"><button onclick="print()">🖨 Imprimir</button> ${barra}</div>` : ''}
<div class="pg"><div class="cab">${logo ? `<img src="${logo}">` : ''}<div><b>${h(leilao.beneficiario)}</b>${leilao.cnpj ? '<small>CNPJ ' + h(leilao.cnpj) + '</small>' : ''}</div></div>
<h1>RELATÓRIO DE ENTREGA — ${h(leilao.nome)}</h1>
<div class="res"><b>${lista.length}</b> lote(s) para entregar · <b>${gs.length}</b> comprador(es) · gerado em ${new Date().toLocaleString('pt-BR')}<br><small>Lotes doados não entram (sem entrega).</small></div>
${corpo}</div></body></html>`;
}
