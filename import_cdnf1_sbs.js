// ============================================================
// import_cdnf1_sbs.js - Importador de playlist da cdnf1.sbs
// Username: 4168783783 | Password: 5913393778
// ============================================================
const fs = require('fs');
const path = require('path');
const Database = require('./server/node_modules/better-sqlite3');

const dbPath = path.join(__dirname, 'server/data/iptv.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const M3U_FILE = path.join(__dirname, 'list/cdnf1_sbs_playlist.m3u');

// Console colors helper
const log = {
  info: (msg) => console.log(`\x1b[34m[INFO]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m[OK]\x1b[0m ${msg}`),
  warn: (msg) => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`),
  error: (msg) => console.log(`\x1b[31m[ERR]\x1b[0m ${msg}`),
};

// Cache de categorias
const categoryCache = new Map();

function getOrCreateCategory(name, type) {
  const key = `${name}:::${type}`;
  if (categoryCache.has(key)) return categoryCache.get(key);
  
  let row = db.prepare('SELECT id FROM categories WHERE name = ? AND type = ?').get(name, type);
  if (!row) {
    const result = db.prepare('INSERT INTO categories (name, type, order_num) VALUES (?, ?, ?)').run(name, type, categoryCache.size + 1);
    categoryCache.set(key, result.lastInsertRowid);
    return result.lastInsertRowid;
  }
  return row.id;
}

// Verificar se stream já existe
const checkExistsStmt = db.prepare('SELECT id FROM streams WHERE name = ? AND stream_url = ?');
const insertStreamStmt = db.prepare(`
  INSERT INTO streams (name, category_id, type, stream_url, icon_url, poster_url, description, rating, status)
  VALUES (?, ?, 'live', ?, ?, ?, ?, '8.5', 'online')
`);

// Mapear categorias raw -> categorias padrão do projeto
function mapCategory(rawGroup) {
  const g = (rawGroup || '').trim();
  
  if (/Área do Cliente/i.test(g)) return { name: 'Área do Cliente', type: 'live' };
  if (/24H Comédia/i.test(g)) return { name: '24H Comédia', type: 'live' };
  if (/24H Reality/i.test(g)) return { name: '24H Reality e TV', type: 'live' };
  if (/24H Esporte/i.test(g)) return { name: '24H Esporte', type: 'live' };
  if (/24H Notícias/i.test(g)) return { name: '24H Notícias', type: 'live' };
  if (/24H Cinema/i.test(g)) return { name: '24H Cinema', type: 'live' };
  if (/24H Infantis/i.test(g)) return { name: '24H Infantis', type: 'live' };
  if (/24H Série/i.test(g)) return { name: '24H Séries', type: 'live' };
  if (/24H Documentário/i.test(g)) return { name: '24H Documentários', type: 'live' };
  if (/24H Variedade/i.test(g)) return { name: '24H Variedades', type: 'live' };
  if (/24H Terror/i.test(g)) return { name: '24H Terror', type: 'live' };
  if (/24H Animes/i.test(g)) return { name: '24H Animes', type: 'live' };
  if (/24H Geral/i.test(g)) return { name: '24H Geral', type: 'live' };
  
  // Fallback
  return { name: g || 'Sem Categoria', type: 'live' };
}

// Analisa e importa o arquivo M3U
function importM3u(filePath) {
  log.info(`Lendo arquivo: ${path.basename(filePath)}`);
  
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  let count = 0;
  let duplicate = 0;
  let errorCount = 0;
  let categoriesSeen = new Set();
  
  let currentInfo = null;
  
  db.transaction(() => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('#EXTINF:')) {
        const groupMatch = line.match(/group-title="([^"]*)"/i);
        const nameMatch = line.match(/^#EXTINF:[^-]*-[^,]*,(.*)$/i);
        const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
        
        const rawName = nameMatch ? nameMatch[1].trim() : '';
        const rawGroup = groupMatch ? groupMatch[1] : 'Sem Categoria';
        const logo = logoMatch ? logoMatch[1] : '';
        
        currentInfo = {
          name: rawName,
          rawGroup: rawGroup,
          logo: logo,
        };
        
        categoriesSeen.add(rawGroup);
        
      } else if (line.length > 0 && !line.startsWith('#') && currentInfo) {
        const { name, type } = mapCategory(currentInfo.rawGroup);
        const categoryId = getOrCreateCategory(name, type);
        
        // Verificar duplicata
        const exists = checkExistsStmt.get(currentInfo.name, line);
        if (exists) {
          duplicate++;
        } else {
          insertStreamStmt.run(
            currentInfo.name,
            categoryId,
            line,
            currentInfo.logo || null,
            currentInfo.logo || null,
            `Canal disponibilizado da lista cdnf1.sbs - ${name}. Transmissão em alta qualidade.`
          );
          count++;
        }
        
        currentInfo = null;
      }
    }
  })();
  
  log.success(`Importados: ${count} | Duplicatas: ${duplicate} | Erros: ${errorCount}`);
  log.info(`Categorias encontradas: ${categoriesSeen.size}`);
  
  return { imported: count, duplicates: duplicate };
}

// Main
console.log('========================================');
console.log('🚀 Importador cdnf1.sbs (SBS IPTV)');
console.log('========================================\n');

if (!fs.existsSync(M3U_FILE)) {
  log.error('Arquivo M3U não encontrado: ' + M3U_FILE);
  process.exit(1);
}

const fileSize = (fs.statSync(M3U_FILE).size / 1024 / 1024).toFixed(2);
log.info(`Tamanho do arquivo: ${fileSize} MB`);

const start = Date.now();
const result = importM3u(M3U_FILE);
const elapsed = ((Date.now() - start) / 1000).toFixed(2);

// Resumo
console.log('\n📊 Resumo da Importação:');
console.log(`  Tempo: ${elapsed}s`);
console.log(`  Canais novos: ${result.imported}`);
console.log(`  Duplicatas ignoradas: ${result.duplicates}`);

const totalLive = db.prepare("SELECT COUNT(*) as total FROM streams WHERE type='live'").get().total;
console.log(`\n📺 Total de canais ao vivo no sistema: ${totalLive}`);

// Listar categorias criadas/Atualizadas
console.log('\n📋 Categorias da cdnf1.sbs no sistema:');
const cats = db.prepare(`
  SELECT c.name, COUNT(s.id) as total 
  FROM categories c 
  LEFT JOIN streams s ON s.category_id = c.id 
  WHERE c.name LIKE '%Área do Cliente%' 
     OR c.name LIKE '24H%' 
  GROUP BY c.id 
  ORDER BY total DESC
`).all();

cats.forEach(c => console.log(`  [${c.name}] ${c.total} canais`));

db.close();
console.log('\n✅ Importação concluída!');
process.exit(0);