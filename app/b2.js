// Envio dos backups para o Backblaze B2 (bucket PRIVADO). Sem dependências: usa a API nativa do B2 com fetch.
// Tudo passa por uma FILA em disco (local/banco/finais/fila): sem internet, o arquivo espera e o envio é tentado de novo a cada 5 min.
// Segurança: use uma chave SÓ DE ESCRITA (capacidade writeFiles) presa ao bucket. Quem tiver o .env consegue ENVIAR,
// mas não consegue listar, baixar nem apagar os backups. Com BACKUP_SENHA, os arquivos sobem criptografados (AES-256-GCM).
// Qualquer falha só vai para o log e NUNCA derruba o sistema.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ID = process.env.B2_KEY_ID || '', KEY = process.env.B2_APP_KEY || '', BUCKET_ID = process.env.B2_BUCKET_ID || '';
const PASTA = (process.env.B2_PASTA || 'leilao').replace(/^\/+|\/+$/g, '');
const SENHA = process.env.BACKUP_SENHA || '';
const MINUTOS = 5;
export const b2Configurado = () => !!(ID && KEY);

let FILA = '';
export let estadoB2 = { ultimoEnvio: null, erro: null };
const naFila = () => { try { return fs.readdirSync(FILA).filter(n => !/\.(tmp|enviando)$/.test(n)); } catch { return []; } };
export const pendentesB2 = () => naFila().length;

// ---- criptografia (chave derivada da senha com scrypt). Formato: "LEIL1" + sal(16) + iv(12) + tag(16) + dados
export function cifrar(buf, senha = SENHA) {
  const sal = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', crypto.scryptSync(senha, sal, 32), iv);
  const dados = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([Buffer.from('LEIL1'), sal, iv, c.getAuthTag(), dados]);
}
export function decifrar(buf, senha) {
  if (buf.subarray(0, 5).toString() !== 'LEIL1') throw new Error('não é um backup criptografado deste sistema');
  const d = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(senha, buf.subarray(5, 21), 32), buf.subarray(21, 33));
  d.setAuthTag(buf.subarray(33, 49));
  return Buffer.concat([d.update(buf.subarray(49)), d.final()]);
}

// ---- põe um arquivo na fila de envio. nome: caminho dentro do bucket, ex. "finais/2026-11-04_1530_leilao_final.zip"
export function enfileirarB2(nome, dados) {
  if (!b2Configurado() || !FILA) return false;
  try {
    let buf = Buffer.isBuffer(dados) ? dados : Buffer.from(dados, 'utf8');
    if (SENHA) { buf = cifrar(buf); nome += '.enc'; }
    fs.mkdirSync(FILA, { recursive: true });
    const f = path.join(FILA, encodeURIComponent((PASTA ? PASTA + '/' : '') + nome));
    fs.writeFileSync(f + '.tmp', buf); fs.renameSync(f + '.tmp', f); // mesmo nome = substitui o pendente (ex.: backup automático)
    setImmediate(processarFila);
    return true;
  } catch (e) { console.log('B2: não consegui pôr na fila:', e.message); return false; }
}

// ---- API nativa do B2
const tempo = () => AbortSignal.timeout(120_000);
let auth = null;
async function autorizar() {
  const r = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', { signal: tempo(),
    headers: { Authorization: 'Basic ' + Buffer.from(`${ID}:${KEY}`).toString('base64') } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`chave recusada pelo B2 (${j.message || r.status})`);
  const s = j.apiInfo?.storageApi || {};
  const bucketId = BUCKET_ID || s.allowed?.buckets?.[0]?.id || s.allowed?.bucketId;
  if (!bucketId) throw new Error('a chave não está presa a um bucket: defina B2_BUCKET_ID no .env');
  return { apiUrl: s.apiUrl, token: j.authorizationToken, bucketId };
}
async function enviar(nome, buf) {
  auth ||= await autorizar();
  const r = await fetch(`${auth.apiUrl}/b2api/v3/b2_get_upload_url?bucketId=${encodeURIComponent(auth.bucketId)}`, { signal: tempo(), headers: { Authorization: auth.token } });
  const u = await r.json().catch(() => ({}));
  if (!r.ok) { auth = null; throw new Error(`B2 recusou (${u.message || r.status})`); }
  const up = await fetch(u.uploadUrl, { method: 'POST', body: buf, signal: tempo(), headers: {
    Authorization: u.authorizationToken, 'Content-Type': 'b2/x-auto',
    'X-Bz-File-Name': encodeURIComponent(nome).replace(/%2F/g, '/'),
    'X-Bz-Content-Sha1': crypto.createHash('sha1').update(buf).digest('hex') } });
  if (!up.ok) { const e = await up.json().catch(() => ({})); throw new Error(`envio recusado (${e.message || up.status})`); }
}

// ---- esvazia a fila (um por vez; para no primeiro erro e tenta de novo depois)
let rodando = false;
export async function processarFila() {
  if (!b2Configurado() || rodando) return;
  rodando = true;
  try {
    for (const f of naFila().sort()) {
      const arq = path.join(FILA, f), env = arq + '.enviando';
      fs.renameSync(arq, env); // se um arquivo novo com o mesmo nome entrar na fila durante o envio, ele não é perdido
      try { await enviar(decodeURIComponent(f), fs.readFileSync(env)); fs.unlinkSync(env); }
      catch (e) { if (fs.existsSync(arq)) fs.unlinkSync(env); else fs.renameSync(env, arq); throw e; }
      estadoB2 = { ultimoEnvio: new Date().toISOString(), erro: null };
    }
  } catch (e) {
    estadoB2 = { ...estadoB2, erro: e.cause?.code || e.message };
    console.log(`B2: envio adiado, tenta de novo em ${MINUTOS} min (${e.cause?.code || e.message})`);
  } finally { rodando = false; }
}

export function iniciarB2(dirLocal) {
  FILA = path.join(dirLocal, 'fila');
  if (!b2Configurado()) return;
  for (const f of fs.existsSync(FILA) ? fs.readdirSync(FILA) : []) // sobra de um envio interrompido (sistema desligado no meio)
    if (f.endsWith('.enviando')) { const o = path.join(FILA, f.slice(0, -9)); fs.existsSync(o) ? fs.unlinkSync(path.join(FILA, f)) : fs.renameSync(path.join(FILA, f), o); }
  console.log(`B2: backups serão enviados para o bucket (pasta "${PASTA}")${SENHA ? ', criptografados' : ' SEM criptografia (defina BACKUP_SENHA)'}.`);
  processarFila();
  setInterval(processarFila, MINUTOS * 60 * 1000).unref();
}
