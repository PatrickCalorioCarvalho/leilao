// Painel do Backblaze: listar e baixar backups (SOMENTE LEITURA). Roda dentro do Docker, chamado pelo Leilao.bat (opção Backblaze).
// Usa a chave de LEITURA (Read Only) digitada na hora: NÃO fica salva no .env. Não apaga nada.
// Variáveis: B2_LER_KEY_ID, B2_LER_APP_KEY, B2_PASTA, B2_BUCKET_NOME (só se a chave não estiver presa a um bucket).
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

const ID = process.env.B2_LER_KEY_ID || process.env.B2_KEY_ID, KEY = process.env.B2_LER_APP_KEY || process.env.B2_APP_KEY; // sem chave de leitura, tenta a de envio do .env
const PASTA = (process.env.B2_PASTA || 'leilao').replace(/^\/+|\/+$/g, '');
const SAIDA = '/w/baixados';
const sair = m => { console.log('ERRO: ' + m); process.exit(1); };
if (!ID || !KEY) sair('informe a chave do Backblaze');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const perguntar = t => rl.question(t);
const fmtData = ms => new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const fmtTam = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

// ---- autorização + bucket
const a = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account',
  { headers: { Authorization: 'Basic ' + Buffer.from(`${ID}:${KEY}`).toString('base64') } }).catch(e => sair('sem internet? ' + (e.cause?.code || e.message)));
const auth = await a.json().catch(() => ({}));
if (!a.ok) sair('chave recusada pelo Backblaze (' + (auth.message || a.status) + ')');
const s = auth.apiInfo.storageApi, H = { Authorization: auth.authorizationToken };
const api = async (op, corpo) => {
  const r = await fetch(`${s.apiUrl}/b2api/v3/${op}`, { method: 'POST', headers: H, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || r.status);
  return j;
};
let bucket = s.bucketId ? { id: s.bucketId, name: s.bucketName } : s.allowed?.buckets?.[0];
if (!bucket?.id || !bucket?.name) {
  const lista = (await api('b2_list_buckets', { accountId: auth.accountId })).buckets;
  bucket = lista.find(b => b.bucketName === process.env.B2_BUCKET_NOME) || (lista.length === 1 ? { id: lista[0].bucketId, name: lista[0].bucketName } : null);
  if (bucket && !bucket.id) bucket = { id: bucket.bucketId, name: bucket.bucketName };
  if (!bucket) sair('a chave enxerga vários buckets: defina B2_BUCKET_NOME no .env. Buckets: ' + lista.map(b => b.bucketName).join(', '));
}
console.log(`\nConectado. Bucket: ${bucket.name}  |  pasta: "${PASTA}"`);
console.log(`Permissões da chave: ${(s.capabilities || ['(todas)']).join(', ')}`);

// ---- listagem (mais novo primeiro)
async function listar() {
  const todos = []; let inicio = null;
  do {
    const j = await api('b2_list_file_names', { bucketId: bucket.id, prefix: PASTA ? PASTA + '/' : '', maxFileCount: 1000, startFileName: inicio });
    todos.push(...j.files.filter(f => f.action === 'upload'));
    inicio = j.nextFileName;
  } while (inicio);
  return todos.sort((x, y) => y.uploadTimestamp - x.uploadTimestamp);
}
function mostrar(arqs) {
  if (!arqs.length) return console.log('\n(nenhum arquivo)');
  console.log('');
  arqs.forEach((f, i) => console.log(`${String(i + 1).padStart(3)}  ${fmtData(f.uploadTimestamp)}  ${fmtTam(f.contentLength).padStart(9)}  ${f.fileName}`));
  const total = arqs.reduce((t, f) => t + f.contentLength, 0);
  console.log(`\n${arqs.length} arquivo(s), ${fmtTam(total)} no total. Mais recente: ${fmtData(arqs[0].uploadTimestamp)}`);
}
async function escolher(arqs, verbo) {
  const n = parseInt(await perguntar(`  Número do arquivo a ${verbo} (Enter cancela): `), 10);
  return arqs[n - 1];
}

let arqs = [];
try { arqs = await listar(); mostrar(arqs); } catch (e) { console.log('Não consegui listar: ' + e.message + (s.capabilities && !s.capabilities.includes('listFiles') ? '\n  Esta chave não tem permissão de listar (listFiles): crie uma chave Read Only no Backblaze.' : '')); }
while (true) {
  const op = (await perguntar('\n  [L] atualizar lista   [B] baixar   [S] sair: ')).trim().toLowerCase();
  try {
    if (op === 's' || op === '') break;
    if (op === 'l') { arqs = await listar(); mostrar(arqs); }
    else if (op === 'b') {
      const f = await escolher(arqs, 'baixar'); if (!f) continue;
      const d = await fetch(`${s.downloadUrl}/file/${bucket.name}/${f.fileName.split('/').map(encodeURIComponent).join('/')}`, { headers: H });
      if (!d.ok) throw new Error('download falhou (' + d.status + ')');
      fs.mkdirSync(SAIDA, { recursive: true });
      const destino = path.join(SAIDA, path.basename(f.fileName));
      fs.writeFileSync(destino, Buffer.from(await d.arrayBuffer()));
      console.log(`  Baixado em local\\banco\\baixados\\${path.basename(f.fileName)}  (para abrir um .enc use a opção "Abrir backup criptografado")`);
    }
  } catch (e) { console.log('  ERRO: ' + e.message); }
}
rl.close();
