const Database = require('./server/node_modules/better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'server/data/iptv.db'), { readonly: true });

console.log('=== EXEMPLO DE SÉRIE CORRETA NA TABELA STREAMS ===');
const goodSeries = db.prepare(`
  SELECT s.*, count(se.id) as ep_count
  FROM streams s
  JOIN series_episodes se ON s.id = se.series_id
  GROUP BY s.id
  ORDER BY ep_count DESC
  LIMIT 3
`).all();
console.log(goodSeries);

console.log('\n=== EXEMPLO DE EPISODIOS DE UMA SÉRIE CORRETA ===');
if (goodSeries.length > 0) {
  const eps = db.prepare(`
    SELECT id, series_id, season_num, episode_num, title, stream_url, duration_minutes
    FROM series_episodes
    WHERE series_id = ?
    ORDER BY season_num ASC, episode_num ASC
    LIMIT 5
  `).all(goodSeries[0].id);
  console.log(eps);
}

console.log('\n=== SCHEMA DAS TABELAS STREAMS E SERIES_EPISODES ===');
const schemaStreams = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='streams'").get();
console.log(schemaStreams.sql);
const schemaEps = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='series_episodes'").get();
console.log(schemaEps.sql);

db.close();
