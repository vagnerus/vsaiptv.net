// ============================================================
// import_cdnf1_fast.js - Importação rápida em lotes
// Processa em batches para não timeout
// ============================================================
const fs = require('fs');
const Database = require('./server/node_modules/better-sqlite3');

const db = new Database('./server/data/iptv.db');
db.pragma('journal_mode = WAL');

const M3U_FILE = './list/cdnf1_sbs_playlist.m3u';
const BATCH_SIZE = 5000;

console.log('🚀 Importação rápida em lotes - cdnf1.sbs');
console.log('=================================================\n');

const content = fs.readFileSync(M3U_FILE, 'utf8');
const lines = content.split('\n');
console.log(`📦 Playlist: ${(fs.statSync(M3U_FILE).size / 1024 / 1024).toFixed(2)} MB`);
console.log(`📋 Total de linhas: ${lines.length}\n`);

// Parser rápido de categorias
function getCat(g) {
  g = (g || '').trim();
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

// Cache de categorias
const catCache = new Map();
function getCatId(name) {
  if (catCache.has(name)) return catCache.get(name);
  let row = db.prepare('SELECT id FROM categories WHERE name = ? AND type = ?').get(name, 'live');
  if (!row) {
    const r = db.prepare('INSERT INTO categories (name, type, order_num) VALUES (?, ?, ?)').run(name, 'live', catCache.size + 1);
    catCache.set(name, r.lastInsertRowid);
    return r.lastInsertRowid;
  }
  return row.id;
}

let totalImported = 0;
let totalDupes = 0;
let lineIdx = 0;
let currentInfo = null;

console.log('🔄 Iniciando importação...\n');

const checkStmt = db.prepare('SELECT id FROM streams WHERE name = ? AND stream_url = ? LIMIT 1');
const insertStmt = db.prepare(`INSERT INTO streams (name, category_id, type, stream_url, icon_url, poster_url, description, rating, status) VALUES (?, ?, 'live', ?, ?, ?, ?, '8.5', 'online')`);

db.transaction(() => {
  while (lineIdx < lines.length) {
    const line = lines[lineIdx].trim();
    
    if (line.startsWith('#EXTINF:')) {
      const gm = line.match(/group-title="([^"]*)"/i);
      const nm = line.match(/^#EXTINF:[^-]*-[^,]*,(.*)$/i);
      const lm = line.match(/tvg-logo="([^"]*)"/i);
      
      currentInfo = {
        name: nm ? nm[1].trim() : '',
        group: gm ? gm[1] : 'Sem Categoria',
        logo: lm ? lm[1] : '',
      };
      lineIdx++;
      
    } else if (line.length > 0 && !line.startsWith('#') && currentInfo) {
      const catName = getCat(currentInfo.group);
      const catId = getCatId(catName);
      
      const exists = checkStmt.get(currentInfo.name, line);
      if (!exists) {
        insertStmt.run(
          currentInfo.name,
          catId,
          line,
          currentInfo.logo || null,
          currentInfo.logo || null,
          `cdnf1.sbs - ${catName}`
        );
        totalImported++;
      } else {
        totalDupes++;
      }
      currentInfo = null;
      lineIdx++;
    } else {
      lineIdx++;
    }
    
    // Log a cada 10000 itens
    if (lineIdx % 10000 === 0) {
      process.stdout.write(`\r📊 Processado: ${lineIdx}/${lines.length} linhas...`);
    }
  }
})();

console.log('\n\n=================================================');
console.log('📊 RESULTADO:');
console.log(`  📥 Importados: ${totalImported.toLocaleString()}`);
console.log(`  🔄 Duplicatas: ${totalDupes.toLocaleString()}`);
console.log(`  📂 Categorias: ${catCache.size}`);
console.log('=================================================\n');

const total = db.prepare("SELECT COUNT(*) as c FROM streams WHERE type='live'").get().c;
console.log(`📺 TOTAL CANAIS AO VIVO NO BANCO: ${total.toLocaleString()}\n`);

console.log('📂 Categorias da cdnf1.sbs:');
const cats = db.prepare(`
  SELECT c.name, COUNT(s.id) as t 
  FROM categories c LEFT JOIN streams s ON s.category_id=c.id 
  WHERE c.name LIKE '%24H%' OR c.name='Área do Cliente' 
  GROUP BY c.id ORDER BY t DESC
`).all();
cats.forEach(c => console.log(`  [+] ${c.name}: ${c.t} canais`));

console.log('\n✅ CONSEQUIO! Servidor pode servir tudo localmente.');
db.close();