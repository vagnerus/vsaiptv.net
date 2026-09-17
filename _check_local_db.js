const Database = require('./server/node_modules/better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'server/data/iptv.db');

console.log('=== VERIFICANDO BANCO LOCAL (WINDOWS) ===');

try {
  if (!fs.existsSync(dbPath)) {
    console.log('ERRO: banco não existe em', dbPath);
    process.exit(1);
  }

  const stat = fs.statSync(dbPath);
  console.log(`Tamanho: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);

  const db = new Database(dbPath, { readonly: true });

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log('\n=== TABELAS ===');
  tables.forEach(t => console.log(' -', t.name));

  console.log('\n=== CONTAGENS ===');
  try {
    const streams = db.prepare('SELECT COUNT(*) as c FROM streams').get();
    console.log('Streams:', streams.c);
  } catch (e) { console.log('Streams: ERRO', e.message); }

  try {
    const cats = db.prepare('SELECT COUNT(*) as c FROM categories').get();
    console.log('Categories:', cats.c);
  } catch (e) { console.log('Categories: ERRO', e.message); }

  try {
    const eps = db.prepare('SELECT COUNT(*) as c FROM series_episodes').get();
    console.log('Episodes:', eps.c);
  } catch (e) { console.log('Episodes: TABELA NÃO EXISTE ou ERRO', e.message); }

  try {
    const up = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_progress'").get();
    console.log('\nuser_progress:', up ? 'EXISTE' : 'NÃO EXISTE');
  } catch (e) { console.log('user_progress check: ERRO', e.message); }

  db.close();
  console.log('\n=== OK ===');
} catch (e) {
  console.log('ERRO FATAL:', e.message);
  process.exit(1);
}
