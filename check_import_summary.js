// check_import_summary.js - Verifica o resumo da importação cdnf1.sbs
const Database = require('./server/node_modules/better-sqlite3');
const db = new Database('./server/data/iptv.db');

console.log('📊 RESUMO DO BANCO DE DADOS APÓS IMPORTACAO cdnf1.sbs:');
console.log('====================================================\n');

const totalLive = db.prepare("SELECT COUNT(*) as total FROM streams WHERE type='live'").get().total;
const totalMovie = db.prepare("SELECT COUNT(*) as total FROM streams WHERE type='movie'").get().total;
const totalSeries = db.prepare("SELECT COUNT(*) as total FROM streams WHERE type='series'").get().total;
const totalCats = db.prepare('SELECT COUNT(*) as total FROM categories').get().total;

console.log('📈 TOTAL GERAL:');
console.log('   Canais ao vivo (live): ' + totalLive.toLocaleString());
console.log('   Filmes (movie): ' + totalMovie.toLocaleString());
console.log('   Séries (series): ' + totalSeries.toLocaleString());
console.log('   Total de streams: ' + (totalLive + totalMovie + totalSeries).toLocaleString());
console.log('   Categorias: ' + totalCats);

console.log('\n📂 TOP 20 CATEGORIAS COM MAIS CANAIS:');
const topCats = db.prepare(`
  SELECT c.name, c.type, COUNT(s.id) as total 
  FROM categories c 
  LEFT JOIN streams s ON s.category_id = c.id 
  GROUP BY c.id 
  ORDER BY total DESC 
  LIMIT 20
`).all();
topCats.forEach((c, i) => console.log('  ' + (i+1) + '. [' + c.type + '] ' + c.name + ': ' + c.total.toLocaleString() + ' canais'));

console.log('\n🏷️ CATEGORIAS DA cdnf1.sbs (24H e Area do Cliente):');
const sbsCats = db.prepare(`
  SELECT c.name, COUNT(s.id) as total 
  FROM categories c 
  LEFT JOIN streams s ON s.category_id = c.id 
  WHERE c.name LIKE '%24H%' OR c.name LIKE '%Área do Cliente%' 
  GROUP BY c.id 
  ORDER BY total DESC
`).all();
let sbsTotal = 0;
sbsCats.forEach(c => { 
  console.log('   [' + c.name + '] ' + c.total.toLocaleString() + ' canais'); 
  sbsTotal += c.total; 
});
console.log('\n   Total da cdnf1.sbs: ' + sbsTotal.toLocaleString() + ' canais');

db.close();