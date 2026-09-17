const fs = require('fs');
const path = require('path');
const Database = require('./server/node_modules/better-sqlite3');

const dbPath = path.join(__dirname, 'server/data/iptv.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Clean corrupted character encodings in the playlist
function cleanEncoding(str) {
  if (!str) return '';
  return str
    .replace(/SǸries/g, 'Séries')
    .replace(/Filmes e SǸries/g, 'Filmes e Séries')
    .replace(/Documentǭrios/g, 'Documentários')
    .replace(/NotǱcias/g, 'Notícias')
    .replace(/MǦsica/g, 'Música')
    .replace(/Religio/g, 'Religião')
    .replace(/Atenǜo/g, 'Atenção')
    .replace(/Adaptaǜo/g, 'Adaptação')
    .replace(/GǦnesis/g, 'Gênesis')
    .replace(/Abrao/g, 'Abraço')
    .replace(/Mǜe/g, 'Mãe')
    .replace(/Manaco/g, 'Maníaco')
    .replace(/Estmago/g, 'Estômago')
    .replace(/Histria/g, 'História')
    .replace(/T de Graa/g, 'Tô de Graça')
    .replace(/Lampiǜo/g, 'Lampião')
    .replace(/S/g, 'Só')
    .replace(/\?guas/g, 'Águas')
    .replace(/Ǹ/g, 'é')
    .replace(/ǭ/g, 'á')
    .replace(/ǜ/g, 'ã')
    .replace(/Ǧ/g, 'ê');
}

// Map messy raw category names into clean, high-standard categories
function standardizeCategory(rawGroup, isVod = false) {
  const g = cleanEncoding(rawGroup).trim();

  if (isVod) {
    if (/Filmes \| Nacionais/i.test(g)) return { name: 'Filmes | Cinema Nacional', type: 'movie' };
    if (/Ação|Aventura/i.test(g)) return { name: 'Filmes | Ação & Aventura', type: 'movie' };
    if (/Comédia|Romance/i.test(g)) return { name: 'Filmes | Comédia & Romance', type: 'movie' };
    if (/Ficção|Sci-Fi/i.test(g)) return { name: 'Filmes | Ficção Científica', type: 'movie' };
    if (/Terror|Suspense/i.test(g)) return { name: 'Filmes | Terror & Suspense', type: 'movie' };
    if (/Animação|Kids|Infantil/i.test(g)) return { name: 'Filmes | Animação & Família', type: 'movie' };
    if (/Séries|Series/i.test(g)) return { name: 'Séries Originais & Séries BR', type: 'series' };
    return { name: g.startsWith('Filmes') ? g : 'Filmes | ' + g, type: 'movie' };
  }

  // Live TV
  if (/Abertos/i.test(g)) return { name: 'Canais Abertos HD', type: 'live' };
  if (/Esportes|Premiere|SporTV|ESPN|DAZN|NBA/i.test(g)) return { name: 'Esportes & PPV', type: 'live' };
  if (/Notícias/i.test(g)) return { name: 'Notícias & Jornalismo', type: 'live' };
  if (/Documentários/i.test(g)) return { name: 'Documentários & Ciência', type: 'live' };
  if (/Infantis|Kids/i.test(g)) return { name: 'Infantis & Desenhos', type: 'live' };
  if (/Filmes e Séries|Telecine|HBO|Max|Paramount/i.test(g)) return { name: 'Cinema & Séries Ao Vivo', type: 'live' };
  if (/Variedades/i.test(g)) return { name: 'Variedades & Entretenimento', type: 'live' };
  if (/Religiosos/i.test(g)) return { name: 'Religiosos', type: 'live' };
  if (/Globos/i.test(g)) return { name: 'Regionais ' + g.replace('Canais | ', ''), type: 'live' };

  return { name: g.replace(/^Canais \| /, ''), type: 'live' };
}

// Cache of categories { name+type -> id }
const categoryCache = new Map();

function getOrCreateCategory(name, type) {
  const key = `${name}:::${type}`;
  if (categoryCache.has(key)) return categoryCache.get(key);

  let row = db.prepare('SELECT id FROM categories WHERE name = ? AND type = ?').get(name, type);
  if (!row) {
    const result = db.prepare('INSERT INTO categories (name, type, order_num) VALUES (?, ?, ?)')
      .run(name, type, categoryCache.size + 1);
    categoryCache.set(key, result.lastInsertRowid);
    return result.lastInsertRowid;
  }

  categoryCache.set(key, row.id);
  return row.id;
}

// Parse and import M3U file
function importM3uFile(filePath, isVod = false, maxItems = 1500) {
  if (!fs.existsSync(filePath)) {
    console.log(`❌ Arquivo não encontrado: ${filePath}`);
    return 0;
  }

  console.log(`\n📂 Lendo e processando: ${filePath}...`);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  let count = 0;
  let currentInfo = null;

  const insertStreamStmt = db.prepare(`
    INSERT INTO streams (name, category_id, type, stream_url, icon_url, poster_url, description, rating, release_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'online')
  `);

  const checkExistsStmt = db.prepare('SELECT id FROM streams WHERE name = ? AND type = ?');

  db.transaction(() => {
    for (let i = 0; i < lines.length; i++) {
      if (count >= maxItems) break;

      const line = lines[i].trim();
      if (line.startsWith('#EXTINF:')) {
        const groupMatch = line.match(/group-title="([^"]*)"/i);
        const nameMatch = line.match(/,(.*)$/);
        const logoMatch = line.match(/tvg-logo="([^"]*)"/i);

        const rawName = nameMatch ? nameMatch[1].trim() : 'Conteúdo';
        const cleanName = cleanEncoding(rawName);
        const rawGroup = groupMatch ? groupMatch[1] : (isVod ? 'Filmes' : 'Geral');
        const logo = logoMatch ? logoMatch[1] : '';

        currentInfo = {
          name: cleanName,
          rawGroup,
          logo,
        };
      } else if (line.length > 0 && !line.startsWith('#') && currentInfo) {
        // Line is stream URL
        const { name, type } = standardizeCategory(currentInfo.rawGroup, isVod);
        const categoryId = getOrCreateCategory(name, type);

        // Check if stream already exists
        const exists = checkExistsStmt.get(currentInfo.name, type);
        if (!exists) {
          insertStreamStmt.run(
            currentInfo.name,
            categoryId,
            type,
            line, // Stream URL
            currentInfo.logo,
            currentInfo.logo, // Poster
            `Disponibilizado na categoria ${name}. Transmissão em alta qualidade.`,
            '8.8',
            '2024'
          );
          count++;
        }

        currentInfo = null;
      }
    }
  })();

  console.log(`✅ ${count} conteúdos importados de ${path.basename(filePath)}`);
  return count;
}

console.log('🚀 Iniciando processamento e separação por categorias...');

// 1. Import Live Channels from CanaisBR03.m3u8 (clean and fast)
const liveCount = importM3uFile('repo_content/CanaisBR03.m3u8', false, 1200);

// 2. Import Movies & Series from Filmes-Series.m3u8
const vodCount = importM3uFile('repo_content/Filmes-Series.m3u8', true, 1200);

console.log('\n📊 Resumo Geral do Catálogo:');
const totalCats = db.prepare('SELECT COUNT(*) as total FROM categories').get().total;
const totalLive = db.prepare("SELECT COUNT(*) as total FROM streams WHERE type = 'live'").get().total;
const totalMovies = db.prepare("SELECT COUNT(*) as total FROM streams WHERE type = 'movie'").get().total;
const totalSeries = db.prepare("SELECT COUNT(*) as total FROM streams WHERE type = 'series'").get().total;

console.log(`📁 Total de Categorias Criadas: ${totalCats}`);
console.log(`📺 Canais Ao Vivo no Sistema: ${totalLive}`);
console.log(`🎬 Filmes (VOD) no Sistema:     ${totalMovies}`);
console.log(`🍿 Séries no Sistema:           ${totalSeries}`);

// List categories
const categoriesList = db.prepare(`
  SELECT c.name, c.type, COUNT(s.id) as total_streams 
  FROM categories c 
  LEFT JOIN streams s ON s.category_id = c.id 
  GROUP BY c.id 
  HAVING total_streams > 0
  ORDER BY c.type ASC, total_streams DESC
`).all();

console.log('\n📋 Categorias Ativas e Quantidade de Conteúdo:');
categoriesList.forEach(c => {
  console.log(`  [${c.type.toUpperCase()}] ${c.name} -> ${c.total_streams} conteúdos`);
});
