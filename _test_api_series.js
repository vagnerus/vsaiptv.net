const Database = require('./server/node_modules/better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'server/data/iptv.db'), { readonly: true });

console.log('=== TESTE ROTA /api/client/series/25501/episodes ===');
const start = Date.now();
const stream = db.prepare('SELECT s.*, c.name as category_name FROM streams s LEFT JOIN categories c ON s.category_id = c.id WHERE s.id = ?').get(25501);
const episodes = db.prepare('SELECT * FROM series_episodes WHERE series_id = ? ORDER BY season_num ASC, episode_num ASC').all(25501);
const dur = Date.now() - start;

console.log(`Tempo de resposta: ${dur}ms`);
console.log('Stream:', stream.name, '| Categoria:', stream.category_name);
console.log('Total de episódios retornados:', episodes.length);
console.log('Primeiro episódio:', episodes[0]);
console.log('Último episódio:', episodes[episodes.length - 1]);

console.log('\n=== TESTE ROTA /api/client/streams?type=novelas (Amostra de 10) ===');
const novelas = db.prepare(`
  SELECT s.id, s.name, s.poster_url, c.name as category_name
  FROM streams s 
  LEFT JOIN categories c ON s.category_id = c.id 
  WHERE s.status = 'online' AND s.type = 'series' AND (s.category_id = 147 OR LOWER(c.name) LIKE '%novela%' OR LOWER(s.name) LIKE '%novela%')
  ORDER BY s.id DESC
  LIMIT 10
`).all();
console.table(novelas);

db.close();
