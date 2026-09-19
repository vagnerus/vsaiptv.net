const Database = require('./server/node_modules/better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'server/data/iptv.db'), { readonly: true });

console.log('=== VERIFICAÇÃO "A ESCRAVA ISAURA" APÓS A MIGRAÇÃO ===');
const escravaStreams = db.prepare("SELECT id, name, category_id, type, stream_url, poster_url FROM streams WHERE name LIKE '%Escrava Isaura%'").all();
console.log(`Total de cards de "A Escrava Isaura" na tabela streams: ${escravaStreams.length}`);
escravaStreams.forEach(s => console.log('Card:', s));

if (escravaStreams.length > 0) {
  for (const s of escravaStreams) {
    const eps = db.prepare("SELECT id, season_num, episode_num, title, stream_url FROM series_episodes WHERE series_id = ? ORDER BY season_num, episode_num").all(s.id);
    console.log(`\nCapítulos vinculados ao Card ID ${s.id} ("${s.name}"): ${eps.length}`);
    if (eps.length > 0) {
      console.log('  Primeiro capítulo:', eps[0]);
      console.log('  Último capítulo:', eps[eps.length - 1]);
    }
  }
}

console.log('\n=== CATEGORIAS DE NOVELAS (CONTAGEM DE TÍTULOS E EPISÓDIOS) ===');
const novelasCats = db.prepare(`
  SELECT c.id, c.name, COUNT(s.id) as stream_count, SUM(se_count.cnt) as total_episodes
  FROM categories c
  JOIN streams s ON s.category_id = c.id
  LEFT JOIN (
    SELECT series_id, COUNT(*) as cnt FROM series_episodes GROUP BY series_id
  ) se_count ON s.id = se_count.series_id
  WHERE c.name LIKE '%Novela%'
  GROUP BY c.id
`).all();
console.table(novelasCats);

db.close();
