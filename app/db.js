// Conexão MySQL. Config por variáveis de ambiente (veja docker-compose.yml / .env).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'leilao',
  password: process.env.DB_PASS || 'leilao',
  database: process.env.DB_NAME || 'leilao',
  charset: 'utf8mb4', decimalNumbers: true, dateStrings: ['DATE'], connectionLimit: 10, multipleStatements: true,
});
export const q = async (sql, ...a) => (await pool.query(sql, a))[0];
export const one = async (sql, ...a) => (await q(sql, ...a))[0];
export const run = async (sql, ...a) => (await pool.query(sql, a))[0]; // .insertId

export async function iniciar() {
  for (let i = 1; ; i++) { // espera o MySQL subir
    try { await pool.query('SELECT 1'); break; }
    catch (e) { if (i >= 30) throw e; console.log(`Aguardando MySQL (${e.code})...`); await new Promise(r => setTimeout(r, 2000)); }
  }
  await pool.query(fs.readFileSync(path.join(DIR, 'schema.sql'), 'utf8'));
  if (!(await one("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='leilao' AND column_name='historico'"))) {
    await pool.query('ALTER TABLE leilao ADD COLUMN historico TINYINT NOT NULL DEFAULT 0'); // migração de bancos antigos
    await pool.query("UPDATE leilao SET historico=1 WHERE nome LIKE '%histórico%'");
  }
  const tem = (t, c) => one('SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?', t, c);
  if (!(await tem('lote', 'sub'))) { // migração: sub-lote (100-1) e nova chave única
    await pool.query('ALTER TABLE lote ADD COLUMN sub INT NOT NULL DEFAULT 0 AFTER numero');
    await pool.query('ALTER TABLE lote ADD UNIQUE KEY uq_lote2 (leilao_id, numero, sub)');
    await pool.query('ALTER TABLE lote DROP INDEX uq_lote');
  }
  if (!(await tem('leilao', 'cnpj'))) { // dados da entidade (aparecem nas promissórias e no relatório final)
    await pool.query("ALTER TABLE leilao ADD COLUMN cnpj VARCHAR(30) NOT NULL DEFAULT '', ADD COLUMN endereco_entidade VARCHAR(300) NOT NULL DEFAULT '', ADD COLUMN telefone_entidade VARCHAR(60) NOT NULL DEFAULT ''");
  }
  if (!(await tem('leilao', 'link_nuvem')))
    await pool.query("ALTER TABLE leilao ADD COLUMN link_nuvem VARCHAR(600) NOT NULL DEFAULT ''");
  if (!(await tem('lote', 'condicao')))
    await pool.query("ALTER TABLE lote ADD COLUMN condicao VARCHAR(10) NOT NULL DEFAULT '' AFTER animal_num");
  if (!(await one('SELECT 1 FROM leilao WHERE ativo=1')))
    await run('INSERT INTO leilao(nome,data,ativo) VALUES(?,CURDATE(),1)', 'Leilão ' + new Date().getFullYear());
}
