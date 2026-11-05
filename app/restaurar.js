// Pega o backup MAIS RECENTE (relatório final ou automático), descriptografa e grava o leilao.sql pronto para carregar.
//   node restaurar.js <saida.sql>                 -> baixa do Backblaze (precisa da chave de LEITURA: B2_LER_KEY_ID / B2_LER_APP_KEY)
//   node restaurar.js <saida.sql> <arquivo>       -> usa um arquivo já baixado (.enc, .zip, .sql.gz ou .sql)
// Usado pelo preparar.ps1. A chave de leitura é diferente da chave de envio do .env (que é só de escrita) e não fica salva.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { decifrar } from './b2.js';

const [saida = '/w/leilao.sql', local] = process.argv.slice(2);
const SENHA = process.env.BACKUP_SENHA || '';
const PASTA = (process.env.B2_PASTA || 'leilao').replace(/^\/+|\/+$/g, '');
const sair = m => { console.log('ERRO: ' + m); process.exit(1); };

let buf, nome;
if (local) { buf = fs.readFileSync(local); nome = path.basename(local); console.log('Usando o arquivo:', nome); }
else ({ buf, nome } = await baixarUltimo());

if (nome.endsWith('.enc')) {
  if (!SENHA) sair('o backup está criptografado: informe a senha dos backups (BACKUP_SENHA)');
  try { buf = decifrar(buf, SENHA); } catch { sair('senha dos backups errada (ou arquivo corrompido)'); }
  nome = nome.slice(0, -4);
}
if (nome.endsWith('.gz')) buf = zlib.gunzipSync(buf);
else if (nome.endsWith('.zip')) buf = doZip(buf, 'leilao.sql');
if (!buf.toString('utf8', 0, 400).includes('leilao')) sair('o arquivo não parece um backup deste sistema');
fs.writeFileSync(saida, buf);
console.log(`Backup pronto: ${saida} (${Math.round(buf.length / 1024)} KB)`);

// ---- Backblaze: lista finais/ e auto/ e baixa o envio mais recente
async function baixarUltimo() {
  const ID = process.env.B2_LER_KEY_ID, KEY = process.env.B2_LER_APP_KEY;
  if (!ID || !KEY) sair('informe a chave de LEITURA do Backblaze');
  const a = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account',
    { headers: { Authorization: 'Basic ' + Buffer.from(`${ID}:${KEY}`).toString('base64') } }).catch(e => sair('sem internet? ' + (e.cause?.code || e.message)));
  const auth = await a.json().catch(() => ({}));
  if (!a.ok) sair('chave de leitura recusada pelo Backblaze (' + (auth.message || a.status) + ')');
  const s = auth.apiInfo.storageApi, bucket = s.allowed?.buckets?.[0];
  if (!bucket?.id || !bucket?.name) sair('a chave de leitura precisa estar presa ao bucket dos backups');
  let arquivos = [], inicio = null;
  do {
    const r = await fetch(`${s.apiUrl}/b2api/v3/b2_list_file_names`, { method: 'POST', headers: { Authorization: auth.authorizationToken },
      body: JSON.stringify({ bucketId: bucket.id, prefix: PASTA ? PASTA + '/' : '', maxFileCount: 1000, startFileName: inicio }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) sair('não consegui listar o bucket (' + (j.message || r.status) + ')');
    arquivos.push(...j.files.filter(f => f.action === 'upload' && /\/(finais|auto)\//.test('/' + f.fileName)));
    inicio = j.nextFileName;
  } while (inicio);
  if (!arquivos.length) sair(`nenhum backup no bucket "${bucket.name}" (pasta "${PASTA}")`);
  const f = arquivos.sort((x, y) => y.uploadTimestamp - x.uploadTimestamp)[0];
  console.log(`Backup mais recente: ${f.fileName}  (enviado em ${new Date(f.uploadTimestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})`);
  const d = await fetch(`${s.downloadUrl}/file/${bucket.name}/${f.fileName.split('/').map(encodeURIComponent).join('/')}`,
    { headers: { Authorization: auth.authorizationToken } });
  if (!d.ok) sair('download falhou (' + d.status + ')');
  return { buf: Buffer.from(await d.arrayBuffer()), nome: f.fileName };
}

// ---- tira um arquivo de dentro do .zip (lê o diretório central: funciona com zips do sistema e do Windows)
function doZip(z, alvo) {
  let fim = z.length - 22;
  while (fim >= 0 && z.readUInt32LE(fim) !== 0x06054b50) fim--;
  if (fim < 0) sair('.zip inválido');
  for (let p = z.readUInt32LE(fim + 16), n = z.readUInt16LE(fim + 10); n-- > 0;) {
    const metodo = z.readUInt16LE(p + 10), comp = z.readUInt32LE(p + 20), nl = z.readUInt16LE(p + 28);
    const ex = z.readUInt16LE(p + 30), cm = z.readUInt16LE(p + 32), loc = z.readUInt32LE(p + 42);
    const nomeArq = z.toString('utf8', p + 46, p + 46 + nl);
    if (path.posix.basename(nomeArq) === alvo) {
      const ini = loc + 30 + z.readUInt16LE(loc + 26) + z.readUInt16LE(loc + 28), dados = z.subarray(ini, ini + comp);
      return metodo === 8 ? zlib.inflateRawSync(dados) : dados;
    }
    p += 46 + nl + ex + cm;
  }
  sair(`${alvo} não encontrado dentro do .zip`);
}
