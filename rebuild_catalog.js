// ============================================================
// rebuild_catalog.js - Reconstrói o catálogo com dedup GLOBAL
// Corrige:
//  - Séries duplicadas (cada episódio virava uma "série")
//  - Filmes quase-duplicados (nomes corrompidos "S"->"ó")
//  - Canais duplicados entre arquivos
// Reimporta Canais/Filmes/Séries de forma limpa e única.
// ============================================================
const fs = require('fs');
const path = require('path');
const Database = require('./server/node_modules/better-sqlite3');

const db = new Database(path.join(__dirname, 'server/data/iptv.db'));
db.pragma('journal_mode = WAL');

// Alvos por tipo (total ~15000)
const TARGET_LIVE = 4300;
const TARGET_MOVIE = 5500;
const TARGET_SERIES = 5200;
const EP_CAP = 60; // máx. episódios por série

// Corrige mojibake (Ã¡ -> á, Ã£ -> ã, ...)
function fix(s) {
  if (!s) return '';
  if (/[\u00C3\u00C2]/.test(s)) {
    try { return Buffer.from(s, 'latin1').toString('utf8').replace(/\uFFFD/g, ''); }
    catch (e) { return s; }
  }
  return s;
}

// Normaliza para dedupe de CANAIS (remove qualidade/pontuação)
function liveBase(name) {
  return name.toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(4k|uhd|fhd|hd|sd|h265|hevc|h264|10bits|60fps|30fps|25fps)\b/g, '')
    .replace(/[²³^~°ªº]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ').trim();
}

// Normaliza para dedupe de FILMES (mantém ano)
function movieBase(name) {
  return name.toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(4k|uhd|fhd|hd|sd|h265|hevc|h264)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Normaliza para agrupar SÉRIES (remove marcadores de episódio/temporada)
function seriesBase(name) {
  return name.toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bs\d{1,3}\s*e\d{1,3}\b/g, ' ')          // S01E01 / S01 E01
    .replace(/\bs\d{1,3}\b/g, ' ')                      // S01 avulso
    .replace(/\btemporada\s*\d{1,2}\b/g, ' ')           // Temporada 1
    .replace(/\b(?:cap[íi]tulo|epis[óo]dio|ep|episode|parte)\s*\d{1,3}\b/g, ' ') // Cap X
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Extrai temporada/episódio de um nome de episódio de série
function parseEpisode(name) {
  let t = name, season = 1, episode = null;
  let m;
  if (m = t.match(/\bS(\d{1,3})\s*E(\d{1,3})\b/i)) { season = +m[1]; episode = +m[2]; }
  else if (m = t.match(/\bS(\d{1,3})\b/i)) { season = +m[1]; }
  else if (m = t.match(/Temporada\s*(\d{1,2})/i)) { season = +m[1]; }
  if (m = t.match(/\bE(?:p(?:isode)?)?\s*(\d{1,3})\b/i)) { if (!episode) episode = +m[1]; }
  else if (m = t.match(/\bCap[íi]tulo\s*(\d{1,3})/i)) { if (!episode) episode = +m[1]; }
  return { season, episode };
}

// Rank de qualidade de um canal
function rankQuality(name) {
  const n = name.toLowerCase();
  let s = 0;
  if (/\bfhd\b/.test(n)) s += 3;
  if (/\bhd\b/.test(n)) s += 2;
  if (/\b4k\b|\buhd\b|\bsd\b/.test(n)) s += 1;
  if (/h265|hevc/.test(n)) s -= 3;
  return s;
}

// Categoria de canal ao vivo por palavras-chave
function liveCategory(name) {
  const n = (name || '').toLowerCase();
  if (/esport|spor|premiere|nba|nfl|nhl|ufc|combate|espn|dazn|mlb|foot|liga|f1|mma/.test(n)) return 'Esportes & PPV';
  if (/news|noticia|jornal|cnn|globo\s*news|band\s*news|record\s*news|jovem\s*pan|euronews/.test(n)) return 'Notícias & Jornalismo';
  if (/infantil|cartoon|disney|kids|crianc|beb|nick|tooncast/.test(n)) return 'Infantis & Desenhos';
  if (/document|discovery|history|natgeo|animal\s*planet|curiosidade|ci[êe]ncia/.test(n)) return 'Documentários & Ciência';
  if (/religi|evangel|cat[óo]lic|cana[çc][ãa]o|apar[eé]cida|gospel/.test(n)) return 'Religiosos';
  if (/telecine|megapix|cine|max|hbo|paramount|amc|cinema|prime|netflix|disney|star\s*channel/.test(n)) return 'Cinema & Séries Ao Vivo';
  if (/musica|mtv|gnt|multishow|variedade|entret|a&e|food|fashion/.test(n)) return 'Variedades & Entretenimento';
  return 'Canais | Variados';
}

// Categoria de VOD
function vodCategory(group, isSeries) {
  const g = fix(group || '');
  if (isSeries) {
    const gs = g.toLowerCase();
    if (/novela/.test(gs)) return 'Séries | Novelas';
    if (/series\s*\|/i.test(g)) {
      const part = g.replace(/series\s*\|/i, '').trim();
      const cap = part.charAt(0).toUpperCase() + part.slice(1);
      return 'Séries | ' + cap;
    }
    return 'Séries | Diversas';
  }
  const gs = g.toLowerCase();
  if (/nacional/.test(gs)) return 'Filmes | Cinema Nacional';
  if (/document/.test(gs)) return 'Filmes | Documentários';
  if (/filmes\s*\|/i.test(g)) {
    const part = g.replace(/filmes\s*\|/i, '').trim();
    const cap = part.charAt(0).toUpperCase() + part.slice(1);
    return 'Filmes | ' + cap;
  }
  return 'Filmes | Diversos';
}

const categoryCache = new Map();
function getOrCreateCategory(name, type) {
  const key = type + ':::' + name;
  if (categoryCache.has(key)) return categoryCache.get(key);
  let row = db.prepare('SELECT id FROM categories WHERE name = ? AND type = ?').get(name, type);
  if (!row) {
    const r = db.prepare('INSERT INTO categories (name, type, order_num) VALUES (?, ?, ?)').run(name, type, categoryCache.size + 1);
    categoryCache.set(key, r.lastInsertRowid);
    return r.lastInsertRowid;
  }
  categoryCache.set(key, row.id);
  return row.id;
}

// ------------------------------------------------------------
// CANAIS AO VIVO: dedup global por nome-base entre todos os arquivos
// ------------------------------------------------------------
const LIVE_FILES = [
  'repo_content/CanaisBR01.m3u8',
  'repo_content/CanaisBR02.m3u8',
  'repo_content/CanaisBR03.m3u8',
  'repo_content/CanaisEuropa.m3u8',
  'repo_content/CanaisItalia.m3u8',
];

function importLive() {
  const globalMap = new Map(); // base -> best candidate
  for (const file of LIVE_FILES) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    let rawName = null, rawGroup = null, rawLogo = null, rawEpg = null;
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith('#EXTINF')) {
        const gm = t.match(/group-title="([^"]*)"/i);
        const lm = t.match(/tvg-logo="([^"]*)"/i);
        const em = t.match(/tvg-id="([^"]*)"/i);
        const nm = t.match(/,(.*)$/);
        rawName = nm ? nm[1].trim() : '';
        rawGroup = gm ? gm[1] : '';
        rawLogo = lm ? lm[1] : '';
        rawEpg = em ? em[1] : '';
      } else if (t.startsWith('http') && rawName) {
        if (!/\/series\//.test(t) && !/\/movie\//.test(t)) {
          const name = fix(rawName);
          const base = liveBase(name);
          if (base) {
            const cur = globalMap.get(base);
            const rank = rankQuality(name) + (rawLogo ? 1 : 0);
            if (!cur || rank > cur.rank) {
              globalMap.set(base, { name, url: t, logo: rawLogo, group: rawGroup, epg: rawEpg, rank });
            }
          }
        }
        rawName = null;
      }
    }
    console.log('  [live] ' + path.basename(file) + ' processado, únicos acumulados=' + globalMap.size);
  }

  const insert = db.prepare([
    'INSERT INTO streams (name, category_id, type, stream_url, icon_url, epg_channel_id, poster_url, description, rating, release_date, status)',
    "VALUES (?, ?, 'live', ?, ?, ?, ?, ?, ?, '2024', 'online')"
  ].join(' '));

  let count = 0;
  const tx = db.transaction(() => {
    for (const cand of globalMap.values()) {
      if (count >= TARGET_LIVE) break;
      const catName = cand.group && cand.group.trim()
        ? 'Canais | ' + fix(cand.group).replace(/^Canais\s*\|/i, '').trim()
        : liveCategory(cand.name);
      const cid = getOrCreateCategory(catName, 'live');
      insert.run(cand.name, cid, cand.url, cand.logo || null, cand.epg || null, cand.logo || null,
        'Transmissão ao vivo na categoria ' + catName + '.', '8.7');
      count++;
    }
  });
  tx();
  console.log('✅ Ao vivo importados: ' + count + ' (únicos na fonte: ' + globalMap.size + ')');
  return count;
}

// ------------------------------------------------------------
// FILMES E SÉRIES (de Filmes-Series.m3u8) com agrupamento/unique
// ------------------------------------------------------------
function importVod() {
  const lines = fs.readFileSync('repo_content/Filmes-Series.m3u8', 'utf8').split('\n');
  const movies = new Map(); // movieBase -> item
  const series = new Map(); // seriesBase -> { title, logo, group, episodes[] }
  let rawName = null, rawGroup = null, rawLogo = null;

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('#EXTINF')) {
      const gm = t.match(/group-title="([^"]*)"/i);
      const lm = t.match(/tvg-logo="([^"]*)"/i);
      const nm = t.match(/,(.*)$/);
      rawName = nm ? nm[1].trim() : '';
      rawGroup = gm ? gm[1] : '';
      rawLogo = lm ? lm[1] : '';
    } else if (t.startsWith('http') && rawName) {
      const name = fix(rawName);
      if (/\/series\//.test(t)) {
        const base = seriesBase(name);
        if (base) {
          if (!series.has(base)) {
            // Título de exibição = nome limpo sem marcadores de episódio
            const ttitle = name
              .replace(/\bS\d{1,3}\s*E\d{1,3}\b/gi, '')
              .replace(/\bTemporada\s*\d{1,2}\b/gi, '')
              .replace(/\bCap[íi]tulo\s*\d{1,3}\b/gi, '')
              .replace(/\s+/g, ' ').trim() || name;
            series.set(base, { title: ttitle, logo: rawLogo, group: rawGroup, episodes: [] });
          }
          const s = series.get(base);
          if (s.episodes.length < EP_CAP && !s.episodes.some(e => e.url === t)) {
            const { season, episode } = parseEpisode(name);
            s.episodes.push({ url: t, season, episode, title: name });
          }
        }
      } else if (/\/movie\//.test(t)) {
        const base = movieBase(name);
        if (base && !movies.has(base)) {
          movies.set(base, { name, logo: rawLogo, group: rawGroup, url: t });
        }
      }
      rawName = null;
    }
  }

  console.log('  [vod] filmes únicos=' + movies.size + ' | séries distintas=' + series.size);

  // --- Filmes ---
  const checkMovie = db.prepare('SELECT id FROM streams WHERE name = ? AND type = ?');
  const insMovie = db.prepare([
    'INSERT INTO streams (name, category_id, type, stream_url, icon_url, epg_channel_id, poster_url, description, rating, release_date, status)',
    "VALUES (?, ?, 'movie', ?, ?, NULL, ?, ?, ?, ?, 'online')"
  ].join(' '));

  let mCount = 0;
  const tm = db.transaction(() => {
    for (const m of movies.values()) {
      if (mCount >= TARGET_MOVIE) break;
      if (checkMovie.get(m.name, 'movie')) continue;
      const cat = vodCategory(m.group, false);
      const cid = getOrCreateCategory(cat, 'movie');
      insMovie.run(m.name, cid, m.url, m.logo || null, m.logo || null,
        'Filme disponível na categoria ' + cat + '.', '8.6', '2024');
      mCount++;
    }
  });
  tm();
  console.log('✅ Filmes importados: ' + mCount);

  // --- Séries (as mais completas primeiro) ---
  const checkSer = db.prepare('SELECT id FROM streams WHERE name = ? AND type = ?');
  const insSer = db.prepare([
    'INSERT INTO streams (name, category_id, type, stream_url, icon_url, epg_channel_id, poster_url, description, rating, release_date, status)',
    "VALUES (?, ?, 'series', '', ?, NULL, ?, ?, ?, ?, 'online')"
  ].join(' '));
  const insEp = db.prepare([
    'INSERT INTO series_episodes (series_id, season_num, episode_num, title, stream_url, duration_minutes)',
    'VALUES (?, ?, ?, ?, ?, 45)'
  ].join(' '));

  const sorted = [...series.values()].sort((a, b) => b.episodes.length - a.episodes.length);
  let sCount = 0;
  const ts = db.transaction(() => {
    for (const s of sorted) {
      if (sCount >= TARGET_SERIES) break;
      if (checkSer.get(s.title, 'series')) continue;
      const cat = vodCategory(s.group, true);
      const cid = getOrCreateCategory(cat, 'series');
      const r = insSer.run(s.title, cid, s.logo || null, s.logo || null,
        'Série com ' + s.episodes.length + ' episódios disponível na categoria ' + cat + '.', '8.8', '2024');
      const sid = r.lastInsertRowid;
      for (const ep of s.episodes) {
        insEp.run(sid, ep.season, ep.episode ? ep.episode : 1, ep.title, ep.url);
      }
      sCount++;
    }
  });
  ts();
  console.log('✅ Séries importadas: ' + sCount);
  return { live: 0, movie: mCount, series: sCount };
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------
console.log('🚀 Reconstruindo catálogo (dedup global)...');
console.log('🗑️  Apagando streams e episódios existentes...');
db.exec('DELETE FROM series_episodes; DELETE FROM streams;');

importLive();
const r = importVod();

console.log('\n📊 CATÁLOGO FINAL:');
const tl = db.prepare("SELECT COUNT(*) n FROM streams WHERE type='live'").get().n;
const tmv = db.prepare("SELECT COUNT(*) n FROM streams WHERE type='movie'").get().n;
const tsr = db.prepare("SELECT COUNT(*) n FROM streams WHERE type='series'").get().n;
const tep = db.prepare('SELECT COUNT(*) n FROM series_episodes').get().n;
console.log('📺 Ao vivo:', tl, '| 🎬 Filmes:', tmv, '| 🍿 Séries:', tsr, '| 🎞️ Episódios:', tep);
console.log('🧾 TOTAL:', tl + tmv + tsr);