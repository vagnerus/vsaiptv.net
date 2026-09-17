const Database = require('/home/vsai/vsaiptv/server/node_modules/better-sqlite3');
const path = require('path');

const dbPath = '/home/vsai/vsaiptv/server/data/iptv.db';

console.log('=== CHECK DB ===');
try {
  const db = new Database(dbPath, { readonly: true });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  console.log('TABLES:', tables.join(', '));
  console.log('COUNT streams:', db.prepare('SELECT COUNT(*) as c FROM streams').get().c);
  console.log('COUNT categories:', db.prepare('SELECT COUNT(*) as c FROM categories').get().c);
  db.close();
  console.log('STATUS: Banco saudável (readonly)');
} catch (e) {
  console.log('ERRO READONLY:', e.message);
  console.log('Tentando reparo...');
  try {
    const db = new Database(dbPath);
    db.pragma('journal_mode=DELETE');
    db.pragma('integrity_check');
    console.log('Integridade OK após reparo');
    db.close();
  } catch (e2) {
    console.log('REPARO FALHOU:', e2.message);
    console.log('Restaurando backup...');
    const fs = require('fs');
    fs.copyFileSync('/home/vsai/vsaiptv/server/data/iptv.db.before_update', dbPath);
    console.log('Backup restaurado');
    try {
      const db = new Database(dbPath);
      db.pragma('journal_mode=WAL');
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
      console.log('TABLES após restore:', tables.join(', '));
      console.log('COUNT streams:', db.prepare('SELECT COUNT(*) as c FROM streams').get().c);
      db.close();
      console.log('STATUS: Restaurado com sucesso');
    } catch (e3) {
      console.log('ERRO PÓS RESTORE:', e3.message);
    }
  }
}
