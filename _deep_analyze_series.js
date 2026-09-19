const Database = require('./server/node_modules/better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'server/data/iptv.db'), { readonly: true });

console.log('=== RESUMO GERAL DE STREAMS ===');
const streamsByType = db.prepare('SELECT type, count(*) as count FROM streams GROUP BY type').all();
console.log('Streams by type:', streamsByType);

console.log('\n=== SERIES COM E SEM EPISODIOS ===');
const seriesWithEps = db.prepare(`
  SELECT 
    COUNT(DISTINCT s.id) as total_series,
    SUM(CASE WHEN se.id IS NOT NULL THEN 1 ELSE 0 END) as series_with_at_least_one_ep
  FROM streams s
  LEFT JOIN (SELECT DISTINCT series_id as id FROM series_episodes) se ON s.id = se.id
  WHERE s.type = 'series'
`).get();
console.log(seriesWithEps);

console.log('\n=== CATEGORIAS DE SERIES (TOP 20 POR CONTAGEM DE STREAMS) ===');
const catSeries = db.prepare(`
  SELECT c.id, c.name, COUNT(s.id) as stream_count,
    SUM(CASE WHEN se.id IS NOT NULL THEN 1 ELSE 0 END) as has_episodes_count,
    SUM(CASE WHEN s.name LIKE '%S0%E%' OR s.name LIKE '%E0%' OR s.name LIKE '%EP%' THEN 1 ELSE 0 END) as episode_pattern_count
  FROM categories c
  JOIN streams s ON s.category_id = c.id
  LEFT JOIN (SELECT DISTINCT series_id as id FROM series_episodes) se ON s.id = se.id
  WHERE s.type = 'series'
  GROUP BY c.id
  ORDER BY stream_count DESC
  LIMIT 25
`).all();
console.table(catSeries);

console.log('\n=== TOTAL DE STREAMS QUE PARECEM EPISÓDIOS (Ex: S01E01) NA TABELA STREAMS ===');
const streamsLikeEp = db.prepare(`
  SELECT count(*) as total
  FROM streams
  WHERE name LIKE '%S01E%' OR name LIKE '%S02E%' OR name LIKE '%S03E%' OR name LIKE '%S10E%' OR name LIKE '%E0%' OR name LIKE '%E1%'
`).get();
console.log('Total streams with SxxExx:', streamsLikeEp.total);

console.log('\n=== AMOSTRA DE STREAMS COM SxxExx ===');
const sampleLikeEp = db.prepare(`
  SELECT id, name, type, category_id, stream_url
  FROM streams
  WHERE name LIKE '%S01E%'
  LIMIT 10
`).all();
console.log(sampleLikeEp);

db.close();
