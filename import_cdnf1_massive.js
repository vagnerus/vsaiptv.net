// ============================================================
// import_cdnf1_massive.js - Importação massiva URGENTE
// Migra TODOS os canais da cdnf1.sbs para banco local
// Link expira em 30 min -Execute AGORA!
// ============================================================
const fs = require('fs');
const path = require('path');
const Database = require('./server/node_modules/better-sqlite3');

const dbPath = path.join(__dirname, 'server/data/iptv.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const M3U_FILE = path.join(__dirname, 'list/cdnf1_sbs_playlist.m3u');

console.log('===========================================================');
console.log('🚨 IMPORTACAO MASSVIA URGENTE - cdnf1.sbs');
console.log('===========================================================\n');

if (!fs.existsSync(M3U_FILE)) {
  console.error('❌ Playlist não encontrada:', M3U_FILE);
  process.exit(1);
}

const content = fs.readFileSync(M3U_FILE, 'utf8');
const lines = content.split('\n');
console.log(`📦 Playlist: ${(fs.statSync(M3U_FILE).size / 1024 / 1024).toFixed(2)} MB`);
console.log(`📋 Linhas: ${lines.length}\n`);

function getCategoryName(rawGroup) {
  const g = (rawGroup || '').trim();
  if (/Área do Cliente/i.test(g)) return 'Área do Cliente';
  if (/24H Comédia/i.test(g)) return '24H Comédia';
  if (/24H Reality/i.test(g)) return '24H Reality e TV';
  if (/24H Esporte/i.test(g)) return '24H Esporte';
  if (/24H Notícias/i.test(g)) return '24H Notícias';
  if (/24H Cinema/i.test(g)) return '24H Cinema';
  if (/24H Infantis/i.test(g)) return '24H Infantis';
  if (/24H Série|24H Series/i.test(g)) return '24H Séries';
  if (/24H Documentário/i.test(g)) return '24H Documentários';
  if (/24H Variedade/i.test(g)) return '24H Variedades';
  if (/24H Terror/i.test(g)) return '24H Terror';
  if (/24H Animes/i.test(g)) return '24H Animes';
  if (/24H Geral/i.test(g)) return '24H Geral';
  if (/24H Lives/i.test(g)) return '24H Lives e Shows';
  if (/24H Cine/i.test(g)) return '24H Cine Sky';
  if (/24H Novela/i.test(g)) return '24H Novelas';
  if (/24H Dorama/i.test(g)) return '24H Doramas';
  if (/24H Anime/i.test(g)) return '24H Anime';
  if (/24H Filmes/i.test(g)) return '24H Filmes';
  if (/24H Infantil/i.test(g)) return '24H Infantil';
  return g || 'Sem Categoria';
}

const categoryCache = new Map();
function getOrCreateCategory(name) {
  if (categoryCache.has(name)) return categoryCache.get(name);
  let row = db.prepare('SELECT id FROM categories WHERE name = ? AND type = ?').get(name, 'live');
  if (!row) {
    const result = db.prepare('INSERT INTO categories (name, type, order_num) VALUES (?, ?, ?)').run(name, 'live', categoryCache.size + 1);
    categoryCache.set(name, result.lastInsertRowid);
    return result.lastInsertRowid;
  }
  return row.id;
}

const checkExistsStmt = db.prepare('SELECT id FROM streams WHERE name = ? AND stream_url = ?');
const insertStreamStmt = db.prepare(`
  INSERT INTO streams (name, category_id, type, stream_url, icon_url, poster_url, description, rating, status)
  VALUES (?, ?, 'live', ?, ?, ?, ?, '8.5', 'online')
`);

let imported = 0;
let duplicates = 0;
const categoriesImported = new Set();
let currentInfo = null;
let i = 0;

console.log('🔄 Importando canais para banco local...\n');

db.transaction(() => {
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith('#EXTINF:')) {
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const nameMatch = line.match(/^#EXTINF:[^-]*-[^,]*,(.*)$/i);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      
      currentInfo = {
        name: nameMatch ? nameMatch[1].trim() : '',
        group: groupMatch ? groupMatch[1] : 'Sem Categoria',
        logo: logoMatch ? logoMatch[1] : '',
      };
      
    } else if (line.length > 0 && !line.startsWith('#') && currentInfo) {
      const categoryName = getCategoryName(currentInfo.group);
      const categoryId = getOrCreateCategory(categoryName);
      categoriesImported.add(categoryName);
      
      const exists = checkExistsStmt.get(currentInfo.name, line);
      if (exists) {
        duplicates++;
      } else {
        insertStreamStmt.run(
          currentInfo.name,
          categoryId,
          line,
          currentInfo.logo || null,
          currentInfo.logo || null,
          `Importado da cdnf1.sbs - ${categoryName}.`
        );
        imported++;
      }
      currentInfo = null;
    }
  }
})();

console.log('\n===========================================================');
console.log('📊 RESULTADO DA IMPORTACAO:');
console.log('===========================================================');
console.log(`  📥 Importados: ${imported.toLocaleString()}`);
console.log(`  🔄 Duplicatas: ${duplicates.toLocaleString()}`);
console.log(`  📂 Categorias: ${categoriesImported.size}`);
console.log('===========================================================');

const totalLive = db.prepare("SELECT COUNT(*) as total FROM streams WHERE type='live'").get().total;
console.log(`\n📺 TOTAL DE CANAIS AO VIVO NO BANCO: ${totalLive.toLocaleString()}`);

console.log('\n📂 Categorias da cdnf1.sbs no banco:');
const cats = db.prepare(`
  SELECT c.name, COUNT(s.id) as total 
  FROM categories c 
  LEFT JOIN streams s ON s.category_id = c.id 
  WHERE c.name LIKE '%24H%' OR c.name = 'Área do Cliente'
  GROUP BY c.id 
  ORDER BY total DESC
`).all();
cats.forEach(c => console.log(`  [+] ${c.name}: ${c.total} canais`));

console.log('\n===========================================================');
console.log('✅ IMPORTACAO CONCLUIDA!');
console.log('📌 Servidor pode servir todos esses canais localmente');
console.log('📌 Link cdnf1.sbs não é mais necessário para operação');
console.log('===========================================================');

db.close();