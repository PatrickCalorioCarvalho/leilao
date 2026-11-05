// Abre um backup criptografado (.enc) baixado do Backblaze B2.
// Uso: BACKUP_SENHA=... node descriptografar.js arquivo.zip.enc   (no Windows: arraste o arquivo em Leilao.bat (Abrir backup criptografado))
import fs from 'node:fs';
import zlib from 'node:zlib';
import { decifrar } from './b2.js';

const arq = process.argv[2], senha = process.env.BACKUP_SENHA;
if (!arq || !senha) { console.log('Uso: BACKUP_SENHA=senha node descriptografar.js arquivo.enc'); process.exit(1); }
let buf, saida = arq.replace(/\.enc$/i, '');
try { buf = decifrar(fs.readFileSync(arq), senha); }
catch (e) { console.log('Não consegui abrir:', /authenticate/.test(e.message) ? 'senha errada ou arquivo corrompido.' : e.message); process.exit(1); }
if (saida.endsWith('.gz')) { buf = zlib.gunzipSync(buf); saida = saida.slice(0, -3); } // backup automático: .sql.gz -> .sql
fs.writeFileSync(saida, buf);
console.log('Pronto:', saida);
