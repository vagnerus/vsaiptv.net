// Script temporário: saúde do banco antes da expansão para 30k.
const Database = require('./server/node_modules/better-sqlite3');
const db = new Database('./server/data/iptv.db', { readonly: true });

console.log('Duplicatas de nome por tipo:');
console.log(db.prepare("SELECT type, COUNT(*) AS grupos, SUM(c-1) AS extras FROM (SELECT type, name, COUNT(*) c FROM streams GROUP BY type, name HAVING c > 1)").all());
console.log('Duplicatas de URL por tipo:');
console.log(db.prepare("SELECT type, COUNT(*) AS grupos, SUM(c-1) AS extras FROM (SELECT type, stream_url, COUNT(*) c FROM streams GROUP BY type, stream_url HAVING c > 1)").all());
console.log('Séries sem episódios:', db.prepare("SELECT COUNT(*) c FROM streams s WHERE s.type='series' AND NOT EXISTS (SELECT 1 FROM series_episodes e WHERE e.series_id=s.id)").get().c);
console.log('Streams sem categoria:', db.prepare('SELECT COUNT(*) c FROM streams WHERE category_id IS NULL').get().c);
console.log('URLs não-http:', db.prepare("SELECT COUNT(*) c FROM streams WHERE stream_url NOT LIKE 'http%'").get().c);
console.log('FK check (amostra):', db.prepare('PRAGMA foreign_key_check').all().slice(0, 5));
console.log('Movies online:', db.prepare("SELECT COUNT(*) c FROM streams WHERE type='movie' AND status='online'").get().c);
console.log('Categories movie:', db.prepare("SELECT COUNT(*) c FROM categories WHERE type='movie'").get().c);

console.log('\n--- Colunas streams ---');
console.log(db.prepare('PRAGMA table_info(streams)').all().map((c) => `${c.name}:${c.type}`).join(', '));
console.log('\n--- Colunas series_episodes ---');
console.log(db.prepare('PRAGMA table_info(series_episodes)').all().map((c) => `${c.name}:${c.type}`).join(', '));
console.log('\n--- Índices ---');
console.log(db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type='index' ORDER BY tbl_name").all());
console.log('\n--- URL vazia por tipo ---');
console.log(db.prepare("SELECT type, COUNT(*) c FROM streams WHERE COALESCE(stream_url,'')='' GROUP BY type").all());
console.log('\n--- URLs duplicadas (top 6) ---');
db.prepare('SELECT type, stream_url, COUNT(*) c FROM streams GROUP BY type, stream_url HAVING c > 1 ORDER BY c DESC LIMIT 6')
  .all().forEach((r) => console.log(' ', r.type, JSON.stringify(String(r.stream_url).slice(0, 70)), r.c));
console.log('\n--- Duplicatas de nome (live) ---');
console.log(db.prepare("SELECT name, COUNT(*) c FROM streams WHERE type='live' GROUP BY name HAVING c > 1").all());
console.log('\n--- Ranges de id ---');
console.log(db.prepare('SELECT type, MIN(id) mn, MAX(id) mx FROM streams GROUP BY type').all());
db.close();