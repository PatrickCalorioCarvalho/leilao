// Gera seed.sql (INSERTs) a partir da planilha antiga: pessoas + lotes históricos.
//   node gerar-sql.js <arquivo.xlsx|.csv> [saida.sql] [--ano 2018] [--nome "Leilão 2018"] [--data 2018-05-01]
// Cada ano vira um leilão histórico (somente leitura). Pessoas repetidas entre anos são reaproveitadas.
// Rode o .sql no MySQL manualmente, ou deixe em ./seed.sql (o Docker aplica na 1ª subida).
import fs from 'node:fs';
import zlib from 'node:zlib';

const args = process.argv.slice(2), opt = {};
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) { opt[args[i].slice(2)] = args[i + 1]; args.splice(i, 2); i--; }
const [file, saida = new URL('./seed.sql', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')] = args;
const ano = opt.ano || '2022', nomeLeilao = opt.nome || `Leilão ${ano} (histórico)`, dataLeilao = opt.data || `${ano}-01-01`;
const nomeArq = file;
if (!file) { console.log('Uso: node gerar-sql.js <arquivo.xlsx|.csv> [saida.sql]'); process.exit(1); }

// ---------- leitura xlsx (zip mínimo, sem dependências)
function unzip(buf) {
  const files = {};
  let e = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csz = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    const ds = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.subarray(ds, ds + csz);
    files[name] = method === 0 ? raw : zlib.inflateRawSync(raw);
    p += 46 + nl + el + cl;
  }
  return files;
}
const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function lerXlsx(f) {
  const z = unzip(fs.readFileSync(f));
  const ss = [...z['xl/sharedStrings.xml'].toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(m => unxml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
  const sheet = z['xl/worksheets/sheet1.xml'].toString('utf8'); // aba ResumoGeral
  const rows = [];
  for (const r of sheet.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
    const row = {};
    for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = /<v>([\s\S]*?)<\/v>/.exec(c[3] || '');
      if (!v) continue;
      row[c[1]] = /t="s"/.test(c[2]) ? ss[+v[1]] : v[1];
    }
    rows.push(row);
  }
  const head = rows[0], idx = {};
  for (const [col, name] of Object.entries(head)) idx[name.trim().toLowerCase()] = col;
  return rows.slice(1).map(r => Object.fromEntries(Object.entries(idx).map(([k, col]) => [k, r[col] ?? ''])));
}
function lerCsv(f) {
  const b = fs.readFileSync(f);
  let t; try { t = new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { t = new TextDecoder('latin1').decode(b); }
  const [h, ...ls] = t.split(/\r?\n/).filter(Boolean).map(l => l.split(';'));
  const keys = h.map(x => x.trim().toLowerCase());
  return ls.map(l => Object.fromEntries(keys.map((k, i) => [k, l[i] ?? ''])));
}

// ---------- limpeza
const limpa = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const lixo = s => /^[0\s.,()\-\/x]*$/i.test(s) || /^(\d)\1?,?(\1{3}),?\1{3}/.test(s) || /^11,111,111/.test(s);
const cpfOk = s => { const d = s.replace(/\D/g, ''); return d.length === 11 && !/^(\d)\1+$/.test(d) ? s : ''; };
const nomeKey = s => limpa(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const dinheiro = v => { const n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };

const linhas = (file.toLowerCase().endsWith('.csv') ? lerCsv(file) : lerXlsx(file)).map(r => ({
  lote: parseInt(r.lote), item: limpa(r.item ?? r.animal), animal: limpa(r['numero animal'] ?? r.animalnumero),
  vi: dinheiro(r.valorinicial), vf: r.valorfinal === '' || r.valorfinal == null ? null : dinheiro(r.valorfinal),
  nome: limpa(r.nome ?? r.arrematador), cpf: cpfOk(limpa(r.cpf)), rg: lixo(limpa(r.rg)) ? '' : limpa(r.rg),
  tel: lixo(limpa(r.telefone)) ? '' : limpa(r.telefone), end: limpa(r.endereco),
})).filter(r => r.nome || r.item);

// ---------- pessoas (dedupe por CPF, senão por nome); mantém o dado mais completo
const pessoas = new Map();
for (const r of linhas) {
  if (!r.nome) continue;
  const k = r.cpf ? 'c' + r.cpf.replace(/\D/g, '') : 'n' + nomeKey(r.nome);
  const p = pessoas.get(k) || { nome: r.nome, cpf: '', rg: '', telefone: '', endereco: '' };
  p.nome = p.nome.length >= r.nome.length ? p.nome : r.nome;
  p.cpf ||= r.cpf; p.rg ||= r.rg; p.telefone ||= r.tel;
  if (r.end.length > p.endereco.length) p.endereco = r.end;
  pessoas.set(k, p);
}
const S = v => v == null || v === '' ? "''" : "'" + String(v).replaceAll(String.fromCharCode(92), String.fromCharCode(92, 92)).replaceAll("'", "''") + "'";
// pessoa existente = mesmo CPF (se tiver) ou mesmo nome (se sem CPF) -> reaproveita, não duplica
const achaPessoa = p => p.cpf ? `cpf=${S(p.cpf)}` : `(cpf='' AND nome=${S(p.nome)})`;
const out = ['-- Gerado por gerar-sql.js a partir de ' + nomeArq, '-- Pode rodar mais de uma vez: não duplica pessoas; lotes já existentes são atualizados.', 'SET NAMES utf8mb4;', '',
  `INSERT INTO leilao(nome,data,ativo,historico) SELECT ${S(nomeLeilao)},${S(dataLeilao)},0,1 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM leilao WHERE nome=${S(nomeLeilao)});`,
  `SET @lid = (SELECT id FROM leilao WHERE nome=${S(nomeLeilao)} LIMIT 1);`, '', '-- Pessoas (arrematantes)'];
for (const p of pessoas.values())
  out.push(`INSERT INTO pessoa(nome,cpf,rg,telefone,endereco) SELECT ${S(p.nome)},${S(p.cpf)},${S(p.rg)},${S(p.telefone)},${S(p.endereco)} FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM pessoa WHERE ${achaPessoa(p)});`);
out.push('', '-- Lotes / animais / itens');
let nl = 0;
for (const l of linhas) {
  if (!l.lote || !l.item) continue;
  const k = l.nome ? (l.cpf ? 'c' + l.cpf.replace(/\D/g, '') : 'n' + nomeKey(l.nome)) : null;
  const doado = /(^|[\s(])doa/i.test(l.item) ? 1 : 0;
  const desc = l.item.replace(/\(?\s*doa[^\s)]*\s*\)?/i, '').replace(/\s+/g, ' ').trim() || l.item;
  const an = /^(sn|s\/n|0)?$/i.test(l.animal) ? '' : l.animal;
  let cond = '', d2 = desc;
  const mc = /(^|\s)(mort[oa]s?|viv[oa]s?)(?=\s|$)/i.exec(desc);
  if (mc && desc.replace(mc[0], ' ').trim()) { cond = /^mort/i.test(mc[2]) ? 'morto' : 'vivo'; d2 = desc.replace(mc[0], ' ').replace(/\s+/g, ' ').trim(); }
  const p = k ? pessoas.get(k) : null;
  const pid = p ? `(SELECT id FROM pessoa WHERE ${achaPessoa(p)} LIMIT 1)` : 'NULL';
  out.push(`INSERT INTO lote(leilao_id,numero,descricao,animal_num,condicao,valor_inicial,doado,pessoa_id,valor_final) VALUES (@lid,${l.lote},${S(d2)},${S(an)},${S(cond)},${l.vi},${doado},${pid},${p && l.vf != null ? l.vf : 'NULL'}) ON DUPLICATE KEY UPDATE descricao=VALUES(descricao),condicao=VALUES(condicao),doado=VALUES(doado);`);
  nl++;
}
fs.writeFileSync(saida, out.join('\n') + '\n', 'utf8');
console.log(`${saida}\n  Leilão "${nomeLeilao}": ${pessoas.size} pessoas, ${nl} lotes.`);
