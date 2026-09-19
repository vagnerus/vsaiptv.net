// verify_cdnf1_sample.js - Verifica amostra de canais da cdnf1.sbs
const Database = require('./server/node_modules/better-sqlite3');
const db = new Database('./server/data/iptv.db');

console.log('🔍 VERIFICAÇÃO DE CANAIS DA cdnf1.sbs:');
console.log('======================================\n');

// Verificar se as categorias da cdnf1.sbs estão no banco
const cats = db.prepare(`
  SELECT c.name, COUNT(s.id) as total 
  FROM categories c 
  LEFT JOIN streams s ON s.category_id = c.id 
  WHERE c.name LIKE '%24H%' OR c.name LIKE '%Área do Cliente%' 
  GROUP BY c.id 
  ORDER BY total DESC
`).all();

console.log('📂 Categorias da cdnf1.sbs no banco de dados:');
cats.forEach(c => console.log('  [' + c.name + '] ' + c.total + ' canais'));

// Verificar alguns streams específicos
console.log('\n📺 Amostra de 15 canais importados da cdnf1.sbs:');
const sample = db.prepare(`
  SELECT s.name, c.name as categoria, s.stream_url 
  FROM streams s 
  JOIN categories c ON s.category_id = c.id 
  WHERE c.name LIKE '%24H%' 
  ORDER BY RANDOM() 
  LIMIT 15
`).all();
sample.forEach(s => console.log('  ' + s.name + ' -> [' + s.categoria + ']'));

// Verificar se o stream da Área do Cliente está lá
console.log('\n🔐 Canais da Área do Cliente:');
const areaClient = db.prepare(`
  SELECT s.name, s.stream_url, s.icon_url 
  FROM streams s 
  JOIN categories c ON s.category_id = c.id 
  WHERE c.name = 'Área do Cliente'
`).all();
areaClient.forEach(s => console.log('  ' + s.name + ' | Logo: ' + (s.icon_url ? 'SIM' : 'NÃO')));

db.close();
console.log('\n✅ Verificação concluída!');