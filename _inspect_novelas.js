const Database = require('./server/node_modules/better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'server/data/iptv.db'), { readonly: true });

console.log('=== NOVELAS CATEGORIES ===');
const cats = db.prepare("SELECT id, name, type FROM categories WHERE LOWER(name) LIKE '%novela%'").all();
console.log(cats);

console.log('\n=== ESCRAVA ISAURA STREAMS ===');
const escrava = db.prepare("SELECT id, name, type, category_id, stream_url, poster_url FROM streams WHERE name LIKE '%Escrava Isaura%' LIMIT 10").all();
console.log(`Found ${escrava.length} streams:`);
escrava.forEach(s => console.log(s));

console.log('\n=== ESCRAVA ISAURA TOTAL STREAMS COUNT ===');
const totalEscrava = db.prepare("SELECT count(id) as c FROM streams WHERE name LIKE '%Escrava Isaura%'").get();
console.log('Total Escrava Isaura streams:', totalEscrava.c);

console.log('\n=== EPISODES FOR FIRST ESCRAVA STREAM ===');
if (escrava.length > 0) {
  const eps = db.prepare("SELECT * FROM series_episodes WHERE series_id = ?").all(escrava[0].id);
  console.log(`Episodes for stream id ${escrava[0].id}:`, eps.length);
}

console.log('\n=== ANY EPISODES WITH ESCRAVA ISAURA IN TITLE ===');
const epsIsaura = db.prepare("SELECT id, series_id, season_num, episode_num, title, stream_url FROM series_episodes WHERE title LIKE '%Escrava Isaura%' LIMIT 5").all();
console.log(epsIsaura);

console.log('\n=== SAMPLE NOVELAS IN STREAMS ===');
const sampleNovelas = db.prepare("SELECT id, name, type, category_id, stream_url FROM streams WHERE type = 'series' AND category_id = 147 LIMIT 10").all();
console.log(sampleNovelas);

db.close();
