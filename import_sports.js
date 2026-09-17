/**
 * Importa TODOS os canais de esportes das listas M3U grandes
 * (CanaisBR01.m3u8, CanaisBR02.m3u8 etc.) para o banco do VSAIPTV.
 *
 * As listas não possuem group-title, então o filtro é feito pelo NOME
 * do canal (SporTV, Premiere, ESPN, Combate, DAZN, BandSports...).
 *
 * - Deduplica variantes (SD/HD/FHD/UHD/4K/H265/LEG/²) mantendo a melhor qualidade;
 * - Deduplica por nome e por URL;
 * - Organiza em subcategorias "Esportes | <Grupo>" (Premiere, SporTV, ESPN...).
 *
 * Uso: node import_sports.js [lista1.m3u8 lista2.m3u8 ...]
 * Banco: IPTV_DB env var ou server/data/iptv.db
 */
const fs = require('fs');
const path = require('path');
const Database = require('./server/node_modules/better-sqlite3');

const args = process.argv.slice(2);
const files = args.length
  ? args
  : ['repo_content/CanaisBR01.m3u8', 'repo_content/CanaisBR02.m3u8'];

const dbPath = process.env.IPTV_DB || path.join(__dirname, 'server/data/iptv.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Canais de esportes reconhecidos pelo nome
const SPORTS_NAME_RE = /(spor\s*t?tv|premiere|espn|dazn|combate|ufc|band\s*sports|fox\s*sports|arena\s*sports|gol\s*tv|nba\s*tv|nfl\s*network|esporte[s]?\s*(interativo|hoje)|ei\s*plus|pfc|basket|bein\s*sports|sports\+|futebol|futvolei|world\s*poker|ticket\s*sports|astro\s*stadium)/i;

// Subcategoria conforme o nome do canal
function categoryFor(name) {
  const n = name.toLowerCase();
  if (/premiere/.test(n)) return 'Esportes | Premiere';
  if (/spor\s*t?tv|arena\s*sports/.test(n)) return 'Esportes | SporTV & Arena';
  if (/espn/.test(n)) return 'Esportes | ESPN';
  if (/dazn/.test(n)) return 'Esportes | DAZN';
  if (/combate|ufc|fight/.test(n)) return 'Esportes | UFC & Combate';
  if (/nba|basket/.test(n)) return 'Esportes | NBA & Basquete';
  if (/nfl/.test(n)) return 'Esportes | NFL & Futebol Americano';
  if (/bein/.test(n)) return 'Esportes | beIN Sports';
  if (/band\s*sports/.test(n)) return 'Esportes | BandSports';
  if (/fox\s*sports/.test(n)) return 'Esportes | Fox Sports';
  if (/gol\s*tv|futebol|pfc/.test(n)) return 'Esportes | Futebol ao Vivo';
  if (/ei\s*plus|esportes?\s*interativo/.test(n)) return 'Esportes | Esporte Interativo';
  if (/ticket|astro/.test(n)) return 'Esportes | Outros Esportes';
  return 'Esportes & PPV';
}

// Remove sufixos/qualificadores para agrupar variantes do mesmo canal
function baseName(name) {
  let n = name
    .replace(/\[(.*?)\]/g, ' ')       // [H265], [LEG]...
    .replace(/²|³/g, ' ')
    .replace(/\b(4k|uhd|fhd|full\s*hd|hd|sd|h265|h\.265|hevc|leg|legendado|dublado|alternat|backup|opc?\d*|novo)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return n;
}

// Ranking de qualidade (maior = melhor). H265 perde pontos (compatibilidade de dispositivos antigos).
function qualityRank(name) {
  const n = name.toLowerCase();
  let score = 0;
  if (/4k|uhd/.test(n)) score += 40;
  else if (/fhd|full\s*hd|1080/.test(n)) score += 30;
  else if (/\bhd\b/.test(n)) score += 20;
  else if (/\bsd\b/.test(n)) score += 10;
  if (/h265|h\.265|hevc/.test(n)) score -= 5;
  if (/leg|legendado/.test(n)) score += 2;
  return score;
}

// ---------- 1. Coletar candidatos das listas ----------
// best: baseName -> { name, url, logo, rank, source }
const candidates = new Map();
const seenUrls = new Set();
let totalEntries = 0, sportsEntries = 0;

function cleanEncoding(str) {
  if (!str) return '';
  return str
    .replace(/SǸries/g, 'Séries')
    .replace(/ǭ/g, 'á')
    .replace(/ǜ/g, 'ã')
    .replace(/Ǧ/g, 'ê')
    .replace(/Ǹ/g, 'é');
}

for (const file of files) {
  const filePath = path.isAbsolute(file) ? file : path.join(__dirname, file);
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Lista não encontrada: ${filePath}`);
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF:')) {
      const nameMatch = line.match(/,(.*)$/);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      current = {
        name: nameMatch ? cleanEncoding(nameMatch[1].trim()) : '',
        logo: logoMatch ? logoMatch[1].trim() : '',
      };
    } else if (line.length > 0 && !line.startsWith('#') && current && current.name) {
      totalEntries++;
      const name = current.name;
      if (SPORTS_NAME_RE.test(name) && !seenUrls.has(line)) {
        sportsEntries++;
        seenUrls.add(line);
        const base = baseName(name);
        const rank = qualityRank(name);
        const prev = candidates.get(base);
        if (!prev || rank > prev.rank) {
          candidates.set(base, { name, url: line, logo: current.logo, rank, source: path.basename(file) });
        }
      }
      current = null;
    }
  }
  console.log(`✅ ${path.basename(filePath)} processada.`);
}

console.log(`\n🔎 Entradas: ${totalEntries} | Canais de esportes: ${sportsEntries} | Após dedup de variantes: ${candidates.size}`);

// ---------- 2. Inserir no banco (dedup contra catálogo existente) ----------
const categoryCache = new Map();
function getOrCreateCategory(name, type) {
  const key = `${name}:::${type}`;
  if (categoryCache.has(key)) return categoryCache.get(key);
  let row = db.prepare('SELECT id FROM categories WHERE name = ? AND type = ?').get(name, type);
  if (!row) {
    const result = db.prepare('INSERT INTO categories (name, type, order_num) VALUES (?, ?, ?)')
      .run(name, type, 20); // esportes no topo
    row = { id: result.lastInsertRowid };
  }
  categoryCache.set(key, row.id);
  return row.id;
}

const existingNames = new Set(
  db.prepare("SELECT LOWER(name) as n FROM streams WHERE type = 'live'").all().map(r => r.n)
);
const existingUrls = new Set(
  db.prepare("SELECT stream_url FROM streams WHERE type = 'live'").all().map(r => r.stream_url)
);

const insertStream = db.prepare(`
  INSERT INTO streams (name, category_id, type, stream_url, icon_url, poster_url, description, rating, release_date, status)
  VALUES (?, ?, 'live', ?, ?, ?, ?, '8.8', '2024', 'online')
`);

let inserted = 0, dupName = 0, dupUrl = 0;
const perCategory = {};

db.transaction(() => {
  for (const [base, ch] of candidates) {
    if (existingNames.has(base)) { dupName++; continue; }
    if (existingUrls.has(ch.url)) { dupUrl++; continue; }
    const cat = categoryFor(ch.name);
    const categoryId = getOrCreateCategory(cat, 'live');
    insertStream.run(
      ch.name,
      categoryId,
      ch.url,
      ch.logo,
      ch.logo,
      `Canal de esportes ao vivo. Fonte: ${ch.source}.`
    );
    existingNames.add(base);
    existingUrls.add(ch.url);
    perCategory[cat] = (perCategory[cat] || 0) + 1;
    inserted++;
  }
})();

console.log('\n📊 RESUMO DA IMPORTAÇÃO DE ESPORTES:');
console.log(`   ✅ Novos canais inseridos:  ${inserted}`);
console.log(`   ⏭️  Já existiam (nome):     ${dupName}`);
console.log(`   ⏭️  Já existiam (URL):      ${dupUrl}`);
console.log('\n📋 Por categoria:');
Object.entries(perCategory).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => {
  console.log(`   ${c}: +${n} canais`);
});
const totalSports = db.prepare("SELECT COUNT(*) as t FROM streams s JOIN categories c ON s.category_id = c.id WHERE c.name LIKE 'Esportes%'").get().t;
console.log(`\n🏆 Total de canais na área de Esportes agora: ${totalSports}`);
