// complete_verification.js - Verificação completa da importação cdnf1.sbs
const Database = require('./server/node_modules/better-sqlite3');
const db = new Database('./server/data/iptv.db');

console.log('═══════════════════════════════════════════════════════════════');
console.log('  VERIFICAÇÃO COMPLETA - importação cdnf1.sbs');
console.log('═══════════════════════════════════════════════════════════════\n');

// 1. Verificar arquivos no sistema
const fs = require('fs');
const m3uPath = './list/cdnf1_sbs_playlist.m3u';
const scriptPath = './import_cdnf1_sbs.js';

console.log('📁 1. ARQUIVOS NO SISTEMA:');
console.log('   ──────────────────────────────────────────');
if (fs.existsSync(m3uPath)) {
  const stats = fs.statSync(m3uPath);
  console.log('   ✅ list/cdnf1_sbs_playlist.m3u');
  console.log('      Tamanho: ' + (stats.size / 1024 / 1024).toFixed(2) + ' MB');
} else {
  console.log('   ❌ list/cdnf1_sbs_playlist.m3u - NÃO ENCONTRADO');
}

if (fs.existsSync(scriptPath)) {
  console.log('   ✅ import_cdnf1_sbs.js');
} else {
  console.log('   ❌ import_cdnf1_sbs.js - NÃO ENCONTRADO');
}

// 2. Verificar banco de dados
console.log('\n🗄️  2. BANCO DE DADOS (iptv.db):');
console.log('   ──────────────────────────────────────────');
const totalLive = db.prepare("SELECT COUNT(*) as total FROM streams WHERE type='live'").get().total;
const totalMovie = db.prepare("SELECT COUNT(*) as total FROM streams WHERE type='movie'").get().total;
const totalSeries = db.prepare("SELECT COUNT(*) as total FROM streams WHERE type='series'").get().total;
const totalCats = db.prepare('SELECT COUNT(*) as total FROM categories').get().total;

console.log('   Canais ao vivo (live):   ' + totalLive.toLocaleString() + ' canais');
console.log('   Filmes (movie):          ' + totalMovie.toLocaleString() + ' canais');
console.log('   Séries (series):         ' + totalSeries.toLocaleString() + ' canais');
console.log('   Total de streams:        ' + (totalLive + totalMovie + totalSeries).toLocaleString() + ' canais');
console.log('   Categorias criadas:      ' + totalCats + ' categorias');

// 3. Verificar categorias específicas da cdnf1.sbs
console.log('\n📂 3. CATEGORIAS DA cdnf1.sbs (presentes no banco):');
console.log('   ──────────────────────────────────────────');
const sbsCats = db.prepare(`
  SELECT c.name, COUNT(s.id) as total 
  FROM categories c 
  LEFT JOIN streams s ON s.category_id = c.id 
  WHERE (c.name LIKE '%24H%' OR c.name = 'Área do Cliente') 
  GROUP BY c.id 
  ORDER BY total DESC
`).all();

if (sbsCats.length === 0) {
  console.log('   ❌ NENHUMA CATEGORIA DA cdnf1.sbs ENCONTRADA');
} else {
  let sbsTotal = 0;
  sbsCats.forEach(c => {
    console.log('   [+] ' + c.name.padEnd(40) + ': ' + c.total + ' canais');
    sbsTotal += c.total;
  });
  console.log('   ──────────────────────────────────────────');
  console.log('   ∑ TOTAL DA cdnf1.sbs:  ' + sbsTotal + ' canais');
}

// 4. Verificar integridade dos streams (amostra)
console.log('\n🔍 4. INTEGRIDADE DOS STREAMS (amostra de 20 canais):');
console.log('   ──────────────────────────────────────────');
const sampleStreams = db.prepare(`
  SELECT s.name, c.name as categoria, s.stream_url, s.icon_url, 
         CASE WHEN s.icon_url IS NOT NULL AND s.icon_url != '' THEN '✅' ELSE '⚠️' END as logo
  FROM streams s 
  JOIN categories c ON s.category_id = c.id 
  WHERE c.name LIKE '%24H%' OR c.name = 'Área do Cliente'
  ORDER BY RANDOM() 
  LIMIT 20
`).all();

sampleStreams.forEach(s => {
  const urlShort = s.stream_url.length > 50 ? s.stream_url.substring(0, 47) + '...' : s.stream_url;
  console.log('   📌 ' + s.name.substring(0, 40).padEnd(40) + ' | ' + s.logo);
  console.log('      URL: ' + urlShort);
  console.log('      Categoria: ' + s.categoria);
});

// 5. Verificar categorias com maior concentração
console.log('\n🏆 5. TOP 10 CATEGORIAS COM MAIS CANAIS (geral):');
console.log('   ──────────────────────────────────────────');
const topCats = db.prepare(`
  SELECT c.name, c.type, COUNT(s.id) as total 
  FROM categories c 
  LEFT JOIN streams s ON s.category_id = c.id 
  GROUP BY c.id 
  ORDER BY total DESC 
  LIMIT 10
`).all();
topCats.forEach((c, i) => {
  console.log('   ' + i + '. [' + c.type + '] ' + c.name + ': ' + c.total.toLocaleString());
});

db.close();

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  ✅ VERIFICAÇÃO CONCLUÍDA COM SUCESSO!');
console.log('═══════════════════════════════════════════════════════════════');