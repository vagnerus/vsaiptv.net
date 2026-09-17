// ============================================================
// import_content.js - Importador massivo de conteúdo IPTV
// Canais ao vivo, Filmes e Séries -> banco de dados
// Deduplica por nome-base, escolhe melhor qualidade e
// padroniza categorias. Meta: ~15.000 conteúdos.
// ============================================================
const fs = require('fs');
const path = require('path');
const Database = require('./server/node_modules/better-sqlite3');

const dbPath = path.join(__dirname, 'server/data/iptv.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// ------------------------------------------------------------
// TARGETS (totais desejados por tipo no final)
// ------------------------------------------------------------
const TARGET_LIVE = 5500;
const TARGET_MOVIE = 5600;
const TARGET_SERIES = 3900;

// Encoding: corrige mojibake (latin1 -> utf8) "PasÃ¡rgada" -> "Pasárgada"
function fixEncoding(str) {
  if (!str) return '';
  if (/Ã|Â|�|Ñ|­/.test(str)) {
    try {
      return Buffer.from(str, 'latin1').toString('utf8').replace(/\uFFFD/g, '');
    } catch (e) { /* keep */ }
  }
  return str;
}

// Limpa espaços e tokens de qualidade (para dedupe por nome-base)
function normalizeBase(name) {
  return name
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(4k|uhd|fhd|hd|sd|h265|hevc|h264|10bits|60fps|25fps|30fps)\b/g, '')
    .replace(/[²³^~°ªº]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^a-z0-9 ]/g, '');
}

// Rank de qualidade para escolher a melhor variante de um canal
function rankQuality(name) {
  const n = name.toLowerCase();
  let score = 0;
  if (/\bhd\b/.test(n)) score += 2;
  if (/\bfhd\b/.test(n)) score += 3;
  if (/\b4k\b|\buhd\b/.test(n)) score += 1;
  if (/\bsd\b/.test(n)) score += 1;
  if (/h265|hevc/.test(n)) score -= 3;
  if (/h264/.test(n)) score += 1;
  return score;
}

// Categorização de canais ao vivo por palavras-chave do nome
function liveCategory(name) {
  const n = (name || '').toLowerCase();
  if (/esport|spor|premiere|nba|nfl|nhl|ufc|combate|espn|dazn|mlb|foot|liga|f1|mma|band\s*spor|canal\s*brasil/.test(n)) return 'Esportes & PPV';
  if (/news|noticia|jornal|cnn|globo\s*news|band\s*news|record\s*news|jovem\s*pan|euronews|tv\s*cultura\s*news/.test(n)) return 'Notícias & Jornalismo';
  if (/infantil|cartoon|disney|kids|crianc|beb|nick|glub|glitch|tooncast|dreamworks/.test(n)) return 'Infantis & Desenhos';
  if (/document|discovery|history|natgeo|national\s*geographic|animal\s*planet|curiosidade|ci[êe]ncia/.test(n)) return 'Documentários & Ciência';
  if (/religi|evangel|cat[óo]lic|globo\s*cult|cana[çc][ãa]o|apar[eé]cida|gospel|santo/.test(n)) return 'Religiosos';
  if (/telecine|megapix|cine|max|hbo|paramount|amc|studies|combate|cinema|canal\s*brazil|prime|netflix|disney|star\s*channel|pipoca/.test(n)) return 'Cinema & Séries Ao Vivo';
  if (/musica|mtv|radio|fashion|food\s*network|gnt|multishow|viva|a&e|variedade|entret/.test(n)) return 'Variedades & Entretenimento';
  return 'Canais | Variados';
}

// Categorias de VOD (filmes/séries)
function vodCategory(group, isSeries) {
  const g = fixEncoding(group || '').trim();
  if (isSeries) {
    const gs = g.toLowerCase();
    if (/novela/.test(gs)) return 'Séries | Novelas';
    if (/series\s*\|\s*(.+)$/.test(g) || /s[eé]ries\s+(.+)$/i.test(g)) {
      const m = g.match(/series\s*\|\s*(.+)$/i) || g.match(/s[eé]ries\s+(.+)$/i);
      const label = (m ? m[1].trim() : '');
      const parts = label.split(/\s*\|\s*/)[0].trim();
      const cap = parts ? parts.charAt(0).toUpperCase() + parts.slice(1) : 'Diversas';
      return 'Séries | ' + cap;
    }
    if (/programas de tv|reality|talk\s*show/.test(gs)) return 'Séries | Programas de TV';
    return 'Séries | Diversas';
  }
  const gs = g.toLowerCase();
  if (/nacional/.test(gs)) return 'Filmes | Cinema Nacional';
  if (/document/.test(gs)) return 'Filmes | Documentários';
  if (/filmes\s*\|\s*(.+)$/.test(g) || /filmes\s+(.+)$/i.test(g)) {
    const m = g.match(/filmes\s*\|\s*(.+)$/i) || g.match(/filmes\s+(.+)$/i);
    const label = (m ? m[1].trim() : '');
    const parts = label.split(/\s*\|\s*/)[0].trim();
    const cap = parts ? parts.charAt(0).toUpperCase() + parts.slice(1) : 'Diversos';
    return 'Filmes | ' + cap;
  }
  return 'Filmes | Diversos';
}

// Análise de nome de série -> { titulo, season, episode }
function parseSeries(name) {
  let title = name;
  let season = 1, episode = 1;
  let m;
  if (m = title.match(/S(\d{1,3})E(\d{1,3})/i)) {
    season = parseInt(m[1]); episode = parseInt(m[2]);
    title = title.replace(/S\d{1,3}E\d{1,3}/i, '');
  } else if (m = title.match(/Temporada\s*(\d{1,2})/i)) {
    season = parseInt(m[1]);
    title = title.replace(/Temporada\s*\d{1,2}/i, '');
  } else if (m = title.match(/Season\s*(\d{1,2})\s*(?:Ep(?:isode)?\s*)?(\d{1,3})?/i)) {
    season = parseInt(m[1]);
    if (m[2]) episode = parseInt(m[2]);
    title = title.replace(/Season\s*\d{1,2}\s*(?:Ep(?:isode)?\s*\d{1,3})?/i, '');
  } else if (m = title.match(/[Cc]ap[íi]tulo\s*(\d{1,3})/)) {
    episode = parseInt(m[1]);
    title = title.replace(/Cap[íi]tulo\s*\d{1,3}/i, '');
  }
  title = title.replace(/\s*[-\u2013\u2014]\s*$/g, '').replace(/^\s+|\s+$/g, '');
  return { title: title || name, season, episode };
}

// Cache de categorias { name+type -> id }
const categoryCache = new Map();
function getOrCreateCategory(name, type) {
  const key = `${name}:::${type}`;
  if (categoryCache.has(key)) return categoryCache.get(key);
  let row = db.prepare('SELECT id FROM categories WHERE name = ? AND type = ?').get(name, type);
  if (!row) {
    const r = db.prepare('INSERT INTO categories (name, type, order_num) VALUES (?, ?, ?)')
      .run(name, type, categoryCache.size + 1);
    categoryCache.set(key, r.lastInsertRowid);
    return r.lastInsertRowid;
  }
  categoryCache.set(key, row.id);
  return row.id;
}

// IMPORTADOR M3U de canais ao vivo (com dedupe por nome-base)
function importLiveFile(filePath, budgetNeeded) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const candidates = new Map();
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
      const isSeries = /\/series\//.test(t);
      const isMovie = /\/movie\//.test(t);
      if (!isSeries && !isMovie) {
        const name = fixEncoding(rawName);
        const base = normalizeBase(name);
        if (base) {
          const cur = candidates.get(base);
          const rank = rankQuality(name);
          if (!cur || rank > cur.rank) {
            candidates.set(base, { base, name, url: t, logo: rawLogo, cat: rawGroup || null, epg: rawEpg || null, rank });
          }
        }
      }
      rawName = null;
    }
  }

  const checkExists = db.prepare('SELECT id FROM streams WHERE name = ? AND type = ?');
  const insert = db.prepare([
    'INSERT INTO streams (name, category_id, type, stream_url, icon_url, epg_channel_id, poster_url, description, rating, release_date, status)',
    "VALUES (?, ?, 'live', ?, ?, ?, ?, ?, ?, '2024', 'online')"
  ].join(' '));

  let count = 0;
  const tx = db.transaction(() => {
    for (const cand of candidates.values()) {
      if (count >= budgetNeeded) break;
      if (checkExists.get(cand.name, 'live')) continue;
      const catName = (cand.cat && cand.cat.trim())
        ? 'Canais | ' + fixEncoding(cand.cat).replace(/^Canais\s*\|\s*/i, '')
        : liveCategory(cand.name);
      const categoryId = getOrCreateCategory(catName, 'live');
      insert.run(
        cand.name, categoryId, cand.url, cand.logo || null, cand.epg || null, cand.logo || null,
        'Transmissao ao vivo disponibilizada na categoria ' + catName + '.', '8.7'
      );
      count++;
    }
  });
  tx();
  console.log('✅ Ao vivo: ' + count + ' importados de ' + path.basename(filePath));
  return count;
}

// IMPORTADOR de Filmes e Séries (de Filmes-Series.m3u8)
function importVodFile(filePath, movieBudget, seriesBudget) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const movies = new Map();
  const series = new Map();
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
      const url = t;
      const name = fixEncoding(rawName);
      const isSeries = /\/series\//.test(url);
      if (isSeries) {
        const { title, season, episode } = parseSeries(name);
        const base = normalizeBase(title);
        if (!base) { rawName = null; continue; }
        if (!series.has(base)) {
          series.set(base, { title, logo: rawLogo, group: rawGroup, episodes: [] });
        }
        const s = series.get(base);
        if (!s.episodes.some(e => e.url === url)) {
          s.episodes.push({ url, season, episode, title: name, duration: 45 });
        }
      } else if (/\/movie\//.test(url)) {
        const base = normalizeBase(name);
        if (base && !movies.has(base)) {
          movies.set(base, { name, logo: rawLogo, group: rawGroup, url });
        }
      }
      rawName = null;
    }
  }

  console.log('   (Filmes-Series) filmes únicos: ' + movies.size + ' | séries únicas: ' + series.size);

  const checkMovie = db.prepare('SELECT id FROM streams WHERE name = ? AND type = ?');
  const insertMovie = db.prepare([
    'INSERT INTO streams (name, category_id, type, stream_url, icon_url, epg_channel_id, poster_url, description, rating, release_date, status)',
    "VALUES (?, ?, 'movie', ?, ?, NULL, ?, ?, ?, ?, 'online')"
  ].join(' '));

  let mCount = 0;
  const tm = db.transaction(() => {
    for (const m of movies.values()) {
      if (mCount >= movieBudget) break;
      if (checkMovie.get(m.name, 'movie')) continue;
      const catName = vodCategory(m.group, false);
      const categoryId = getOrCreateCategory(catName, 'movie');
      insertMovie.run(
        m.name, categoryId, m.url, m.logo || null, m.logo || null,
        'Filme disponibilizado na categoria ' + catName + '.', '8.6', '2024'
      );
      mCount++;
    }
  });
  tm();
  console.log('✅ Filmes: ' + mCount + ' importados de ' + path.basename(filePath));

  const checkSeries = db.prepare('SELECT id FROM streams WHERE name = ? AND type = ?');
  const insertSeries = db.prepare([
    'INSERT INTO streams (name, category_id, type, stream_url, icon_url, epg_channel_id, poster_url, description, rating, release_date, status)',
    "VALUES (?, ?, 'series', '', ?, NULL, ?, ?, ?, ?, 'online')"
  ].join(' '));
  const insertEp = db.prepare([
    'INSERT INTO series_episodes (series_id, season_num, episode_num, title, stream_url, duration_minutes)',
    'VALUES (?, ?, ?, ?, ?, ?)'
  ].join(' '));

  let sCount = 0;
  const ts = db.transaction(() => {
    for (const s of series.values()) {
      if (sCount >= seriesBudget) break;
      let sid = checkSeries.get(s.title, 'series');
      if (!sid) {
        const catName = vodCategory(s.group, true);
        const categoryId = getOrCreateCategory(catName, 'series');
        const r = insertSeries.run(
          s.title, categoryId, s.logo || null, s.logo || null,
          'Série com ' + s.episodes.length + ' episódio(s) disponibilizada na categoria ' + catName + '.',
          '8.8', '2024'
        );
        sid = { id: r.lastInsertRowid };
        sCount++;
      }
      for (const ep of s.episodes) {
        insertEp.run(sid.id, ep.season, ep.episode, ep.title, ep.url, ep.duration);
      }
    }
  });
  ts();
  console.log('✅ Séries: ' + sCount + ' importadas de ' + path.basename(filePath));
  return { movies: mCount, series: sCount };
}

// MAIN
console.log('🚀 Iniciando importação massiva de conteúdo...\n');

const cur = {
  live: db.prepare("SELECT COUNT(*) total FROM streams WHERE type='live'").get().total,
  movie: db.prepare("SELECT COUNT(*) total FROM streams WHERE type='movie'").get().total,
  series: db.prepare("SELECT COUNT(*) total FROM streams WHERE type='series'").get().total,
};
console.log('📊 Atuais -> live:' + cur.live + ' movie:' + cur.movie + ' series:' + cur.series);
console.log('🎯 Alvos  -> live:' + TARGET_LIVE + ' movie:' + TARGET_MOVIE + ' series:' + TARGET_SERIES + '\n');

const liveNeed = Math.max(0, TARGET_LIVE - cur.live);
const movieNeed = Math.max(0, TARGET_MOVIE - cur.movie);
const seriesNeed = Math.max(0, TARGET_SERIES - cur.series);

if (movieNeed > 0 || seriesNeed > 0) {
  importVodFile('repo_content/Filmes-Series.m3u8', movieNeed, seriesNeed);
}

if (liveNeed > 0) {
  const liveFiles = [
    'repo_content/CanaisBR01.m3u8',
    'repo_content/CanaisBR02.m3u8',
    'repo_content/CanaisBR03.m3u8',
    'repo_content/CanaisEuropa.m3u8',
    'repo_content/CanaisItalia.m3u8',
  ];
  let done = 0;
  for (const f of liveFiles) {
    const rem = liveNeed - done;
    if (rem <= 0) break;
    done += importLiveFile(f, rem);
  }
}

console.log('\n📊 RESUMO FINAL:');
const totalLive = db.prepare("SELECT COUNT(*) total FROM streams WHERE type='live'").get().total;
const totalMovie = db.prepare("SELECT COUNT(*) total FROM streams WHERE type='movie'").get().total;
const totalSeries = db.prepare("SELECT COUNT(*) total FROM streams WHERE type='series'").get().total;
const totalEpisodes = db.prepare('SELECT COUNT(*) total FROM series_episodes').get().total;
console.log('📺 Canais Ao Vivo: ' + totalLive);
console.log('🎬 Filmes (VOD):   ' + totalMovie);
console.log('🍿 Séries:         ' + totalSeries);
console.log('🎞️  Episódios:      ' + totalEpisodes);
console.log('🧾 TOTAL CATÁLOGO: ' + (totalLive + totalMovie + totalSeries));

const cats = db.prepare([
  'SELECT c.name, c.type, COUNT(s.id) n FROM categories c',
  'LEFT JOIN streams s ON s.category_id=c.id WHERE s.id IS NOT NULL GROUP BY c.id ORDER BY c.type, n DESC'
].join(' ')).all();
console.log('\n📋 Categorias ativas:');
cats.forEach(c => console.log('  [' + c.type.toUpperCase() + '] ' + c.name + ' -> ' + c.n));
