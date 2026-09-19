/**
 * expand_catalog_30000.js — Expande o catálogo para 30.000 conteúdos online.
 * ATENÇÃO: 'online' é o status de publicação no banco, não garantia de reprodução.
 * URLs das listas locais não são validadas individualmente nesta importação.
 * DB_PATH permite selecionar um banco alternativo já existente.

 *
 * Estratégia (aditiva e idempotente — NUNCA apaga conteúdo existente):
 *   1. Fontes locais do próprio projeto (repo_content/):
 *        - Filmes-Series.m3u8  -> filmes e séries (com episódios agrupados por título)
 *        - CanaisBR01/02/03.m3u8, CanaisEuropa.m3u8, CanaisItalia.m3u8 -> canais ao vivo
 *   2. Fonte remota complementar (o que "não tem no projeto"):
 *        - Listas públicas FTA do projeto iptv-org (canais abertos), com validação de link
 *
 * Ordem de preenchimento: Séries -> Filmes -> Canais ao vivo.
 * Motivo: a fonte de séries é a mais escassa (10.401 títulos únicos), então ela é
 * priorizada para garantir a fatia dela antes do teto global ser atingido.
 *
 * Uso:
 *   node expand_catalog_30000.js
 *
 * Variáveis de ambiente opcionais:
 *   TARGET_TOTAL=30000     meta de conteúdos online (live + movie + series)
 *   MAX_SERIES=10100       teto de séries
 *   MAX_MOVIE=14000        teto de filmes
 *   MAX_LIVE=8000          teto de canais ao vivo
 *   EP_CAP=30              máximo de episódios por série nova
 *   BACKUP=0               não gerar backup do banco antes de escrever
 *   DRY_RUN=1              simula sem inserir nada
 *   SKIP_REMOTE=1          não baixar listas do iptv-org (somente fontes locais)
 *   SKIP_VALIDATE=1        não validar links remotos antes de inserir
 *   FORCE_BACKUP=1         sobrescrever backup existente
 */
const fs = require('fs');
const path = require('path');
const Database = require('./server/node_modules/better-sqlite3');

// ------------------------------------------------------------
// CONFIGURAÇÃO
// ------------------------------------------------------------
const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(__dirname, 'server', 'data', 'iptv.db');
const BACKUP_PATH = `${DB_PATH}.before_catalog_30000`;
const VOD_FILE = path.join(__dirname, 'repo_content', 'Filmes-Series.m3u8');
const LIVE_FILES = ['CanaisBR01.m3u8', 'CanaisBR02.m3u8', 'CanaisBR03.m3u8', 'CanaisEuropa.m3u8', 'CanaisItalia.m3u8']
  .map((f) => path.join(__dirname, 'repo_content', f));

const REMOTE_LIVE_SOURCES = [
  'https://iptv-org.github.io/iptv/countries/br.m3u',
  'https://iptv-org.github.io/iptv/languages/por.m3u',
  'https://iptv-org.github.io/iptv/categories/news.m3u',
  'https://iptv-org.github.io/iptv/categories/documentary.m3u',
  'https://iptv-org.github.io/iptv/categories/education.m3u',
  'https://iptv-org.github.io/iptv/categories/entertainment.m3u',
  'https://iptv-org.github.io/iptv/categories/kids.m3u',
  'https://iptv-org.github.io/iptv/categories/movies.m3u',
  'https://iptv-org.github.io/iptv/categories/science.m3u',
  'https://iptv-org.github.io/iptv/categories/sports.m3u',
  'https://iptv-org.github.io/iptv/categories/culture.m3u',
  'https://iptv-org.github.io/iptv/categories/travel.m3u',
];

const TARGET_TOTAL = Number(process.env.TARGET_TOTAL || 30000);
const MAX_SERIES = Number(process.env.MAX_SERIES || 10100);
const MAX_MOVIE = Number(process.env.MAX_MOVIE || 14000);
const MAX_LIVE = Number(process.env.MAX_LIVE || 8000);
const EP_CAP = Number(process.env.EP_CAP || 30);
const RUN_BACKUP = process.env.BACKUP !== '0';
const FORCE_BACKUP = process.env.FORCE_BACKUP === '1';
const DRY_RUN = process.env.DRY_RUN === '1';
const SKIP_REMOTE = process.env.SKIP_REMOTE === '1';
const SKIP_VALIDATE = process.env.SKIP_VALIDATE === '1';
const VALIDATE_TIMEOUT_MS = Number(process.env.VALIDATE_TIMEOUT_MS || 6500);
const VALIDATE_CONCURRENCY = Number(process.env.VALIDATE_CONCURRENCY || 18);
const REMOTE_MAX_CANDIDATES = Number(process.env.REMOTE_MAX_CANDIDATES || 3000);

const FALLBACK_LIVE_ICON = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/OOjs_UI_icon_play.svg/512px-OOjs_UI_icon_play.svg.png';
const FALLBACK_LIVE_POSTER = 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=1280&h=720&fit=crop';

const db = new Database(DB_PATH, { readonly: DRY_RUN, fileMustExist: true });
db.pragma('foreign_keys = ON');
if (!DRY_RUN) db.pragma('journal_mode = WAL');
for (const [name, value] of Object.entries({ TARGET_TOTAL, MAX_SERIES, MAX_MOVIE, MAX_LIVE, EP_CAP, VALIDATE_TIMEOUT_MS, VALIDATE_CONCURRENCY, REMOTE_MAX_CANDIDATES })) {
  if (!Number.isSafeInteger(value) || value < (name.startsWith('MAX_') ? 0 : 1)) {
    db.close();
    throw new Error(`${name} deve ser um inteiro válido.`);
  }
}

// ------------------------------------------------------------
// UTILITÁRIOS DE TEXTO
// ------------------------------------------------------------
function fix(value) {
  const s = String(value || '');
  if (!s) return '';
  if (/[\u00C3\u00C2]/.test(s)) {
    try {
      return Buffer.from(s, 'latin1').toString('utf8').replace(/\uFFFD/g, '');
    } catch (e) {
      return s;
    }
  }
  return s;
}

function cleanText(value) {
  return fix(String(value || '')).replace(/\s+/g, ' ').trim();
}

function deaccent(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function liveBase(name) {
  return deaccent(cleanText(name)).toLowerCase()
    .replace(/\b(4k|uhd|fhd|hd|sd|h265|hevc|h264|10bits|60fps|30fps|25fps)\b/g, '')
    .replace(/[²³^~°ªº]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function movieBase(name) {
  return deaccent(cleanText(name)).toLowerCase()
    .replace(/\b(4k|uhd|fhd|hd|sd|h265|hevc|h264)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function seriesBase(name) {
  return deaccent(cleanText(name)).toLowerCase()
    .replace(/\bs\d{1,3}\s*e\d{1,3}\b/g, ' ')
    .replace(/\bs\d{1,3}\b/g, ' ')
    .replace(/\btemporada\s*\d{1,2}\b/g, ' ')
    .replace(/\b(?:cap[ií]tulo|epis[óo]dio|ep|episode|parte)\s*\d{1,3}\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function parseEpisode(name) {
  const t = cleanText(name);
  let season = 1;
  let episode = 1;
  let m;
  if ((m = t.match(/\bS(\d{1,3})\s*E(\d{1,3})\b/i))) { season = Number(m[1]); episode = Number(m[2]); }
  else if ((m = t.match(/\b(\d{1,2})x(\d{1,3})\b/))) { season = Number(m[1]); episode = Number(m[2]); }
  else if ((m = t.match(/\bTemporada\s*(\d{1,2})/i))) {
    season = Number(m[1]);
    const e = t.match(/\bE(?:p(?:is[óo]dio)?)?\s*(\d{1,3})\b/i);
    if (e) episode = Number(e[1]);
  } else if ((m = t.match(/\bS(\d{1,3})\b/i))) season = Number(m[1]);
  else if ((m = t.match(/\bCap[íi]tulo\s*(\d{1,3})/i))) episode = Number(m[1]);
  return { season: season > 0 ? season : 1, episode: episode > 0 ? episode : 1 };
}

function parseYear(name) {
  const found = cleanText(name).match(/\b(19\d{2}|20\d{2})\b/g);
  if (!found) return null;
  const year = Number(found[found.length - 1]);
  return year >= 1900 && year <= new Date().getFullYear() + 1 ? String(year) : null;
}

function rankQuality(name) {
  const n = String(name || '').toLowerCase();
  let s = 0;
  if (/\bfhd\b/.test(n)) s += 3;
  if (/\bhd\b/.test(n)) s += 2;
  if (/\b4k\b|\buhd\b|\bsd\b/.test(n)) s += 1;
  if (/h265|hevc/.test(n)) s -= 3;
  return s;
}

function isBlockedContent(text) {
  return /adult|xxx|porn|erotic|18\+|\+18|fetish/i.test(String(text || ''));
}

function stripEpisodeMarkers(name) {
  return cleanText(name)
    .replace(/\bS\d{1,3}\s*E\d{1,3}\b/gi, ' ')
    .replace(/\bS\d{1,3}\b/gi, ' ')
    .replace(/\bTemporada\s*\d{1,2}\b/gi, ' ')
    .replace(/\bCap[íi]tulo\s*\d{1,3}\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

// ------------------------------------------------------------
// CATEGORIAS (reutiliza as existentes, comparação sem acento)
// ------------------------------------------------------------
const categoryIndex = new Map(); // "type:::nome-normalizado" -> id

function loadCategoryIndex() {
  const rows = db.prepare('SELECT id, name, type FROM categories').all();
  for (const row of rows) {
    categoryIndex.set(`${row.type}:::${deaccent(row.name).toLowerCase()}`, row.id);
  }
  console.log(`Categorias existentes carregadas: ${rows.length}`);
}

function getOrCreateCategory(name, type) {
  const clean = cleanText(name).slice(0, 120) || 'Diversos';
  const key = `${type}:::${deaccent(clean).toLowerCase()}`;
  if (categoryIndex.has(key)) return categoryIndex.get(key);
  if (DRY_RUN) {
    const virtualId = -(categoryIndex.size + 1);
    categoryIndex.set(key, virtualId);
    return virtualId;
  }

  const order = db.prepare('SELECT COALESCE(MAX(order_num), 0) + 1 AS n FROM categories WHERE type = ?').get(type).n;
  const id = db.prepare('INSERT INTO categories (name, type, order_num) VALUES (?, ?, ?)').run(clean, type, order).lastInsertRowid;
  categoryIndex.set(key, id);
  return id;
}

const MOVIE_GENRES = [
  [/a[çc][ãa]o|action|aventura|adventure/, 'Filmes | Ação & Aventura'],
  [/com[ée]dia|comedy|humor/, 'Filmes | Comédia'],
  [/terror|horror|suspense|thriller|slasher/, 'Filmes | Terror & Suspense'],
  [/fic[çc][ãa]o|sci-?fi|science fiction|fantasia|fantasy/, 'Filmes | Ficção & Fantasia'],
  [/anima[çc][ãa]o|anime|desenho|cartoon|infantil|kids/, 'Filmes | Animação & Infantil'],
  [/document|[áa]rio|biograf/, 'Filmes | Documentários'],
  [/romance|drama/, 'Filmes | Drama & Romance'],
  [/guerra|war|hist[óo]ria|history|faroeste|western/, 'Filmes | Guerra & Faroeste'],
  [/nacional|brasil/, 'Filmes | Cinema Nacional'],
  [/crime|policial|m[áa]fia|gangster/, 'Filmes | Crime & Policial'],
  [/fam[íi]lia|family/, 'Filmes | Família'],
];

const SERIES_GENRES = [
  [/novela|telenovela/, 'Séries | Novelas'],
  [/anime|anima[çc][ãa]o|desenho|cartoon/, 'Séries | Anime & Animação'],
  [/document|[áa]rio|reality/, 'Séries | Documentários & Reality'],
  [/infantil|kids/, 'Séries | Infantil'],
  [/crime|policial|investiga/, 'Séries | Crime & Investigação'],
  [/drama|romance/, 'Séries | Drama & Romance'],
  [/com[ée]dia|sitcom|humor/, 'Séries | Comédia'],
  [/fic[çc][ãa]o|sci-?fi|fantasia|sobrenatural|fantasy/, 'Séries | Ficção & Fantasia'],
  [/nacional|brasil/, 'Séries | Brasileiras'],
];

function movieCategoryOf(group) {
  const raw = deaccent(fix(group || '')).toLowerCase();
  for (const [re, name] of MOVIE_GENRES) {
    if (re.test(raw)) return name;
  }
  const cleaned = fix(group || '').replace(/^(filmes?|movies?|vod)\s*\|?\s*/i, '').trim();
  if (cleaned && cleaned.length > 2 && !/^(filmes?|movies?|vod|lan[çc]amentos)$/i.test(cleaned)) {
    return `Filmes | ${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`.slice(0, 120);
  }
  return 'Filmes | Diversos';
}

function seriesCategoryOf(group) {
  const raw = deaccent(fix(group || '')).toLowerCase();
  for (const [re, name] of SERIES_GENRES) {
    if (re.test(raw)) return name;
  }
  const cleaned = fix(group || '').replace(/^(s[ée]ries?|series|vod)\s*\|?\s*/i, '').trim();
  if (cleaned && cleaned.length > 2 && !/^(s[ée]ries?|series|vod|lan[çc]amentos)$/i.test(cleaned)) {
    return `Séries | ${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`.slice(0, 120);
  }
  return 'Séries | Diversas';
}

function liveCategoryOf(group, name) {
  const raw = deaccent(`${fix(group || '')} ${cleanText(name)}`).toLowerCase();
  if (/esport|spor|premiere|nba|nfl|nhl|ufc|combate|espn|dazn|mlb|foot|liga|f1\b|mma/.test(raw)) return 'Esportes & PPV';
  if (/news|noticia|jornal|cnn|band\s*news|record\s*news|jovem\s*pan|euronews|globo\s*news/.test(raw)) return 'Notícias & Jornalismo';
  if (/infantil|cartoon|disney|kids|crianc|beb|nick|tooncast/.test(raw)) return 'Infantis & Desenhos';
  if (/document|discovery|history|natgeo|national geographic|animal\s*planet|ci[êe]ncia|science/.test(raw)) return 'Documentários & Ciência';
  if (/religi|evangel|cat[óo]lic|can[çc][ãa]o|apar[eé]cida|gospel/.test(raw)) return 'Religiosos';
  if (/telecine|megapix|cine|hbo|paramount|amc|cinema|prime|star\s*channel|warner/.test(raw)) return 'Cinema & Séries Ao Vivo';
  if (/m[uú]sica|music|mtv|gnt|multishow|variedade|entret|food|fashion|a&e/.test(raw)) return 'Variedades & Entretenimento';
  if (/educa|aula|school|univers/.test(raw)) return 'Educação';
  if (fix(group || '').trim()) {
    return `Canais | ${fix(group).replace(/^canais\s*\|\s*/i, '').trim()}`.slice(0, 120);
  }
  return 'Canais | Públicos';
}

// ------------------------------------------------------------
// ESTADO ATUAL DO CATÁLOGO
// ------------------------------------------------------------
function countByType(type) {
  return db.prepare("SELECT COUNT(*) AS c FROM streams WHERE type = ? AND status = 'online'").get(type).c;
}

function countTotal() {
  return db.prepare("SELECT COUNT(*) AS c FROM streams WHERE status = 'online'").get().c;
}

function loadExistingKeys() {
  const state = {
    movieNames: new Set(), movieUrls: new Set(),
    seriesNames: new Set(), seriesUrls: new Set(),
    liveNames: new Set(), liveUrls: new Set(),
  };

  db.prepare("SELECT name, stream_url FROM streams WHERE type = 'movie'").all().forEach((r) => {
    const base = movieBase(r.name);
    if (base) state.movieNames.add(base);
    if (r.stream_url) state.movieUrls.add(String(r.stream_url).trim());
  });
  db.prepare("SELECT name FROM streams WHERE type = 'series'").all().forEach((r) => {
    const base = seriesBase(r.name);
    if (base) state.seriesNames.add(base);
  });
  db.prepare('SELECT stream_url FROM series_episodes').all().forEach((r) => {
    if (r.stream_url) state.seriesUrls.add(String(r.stream_url).trim());
  });
  db.prepare("SELECT name, stream_url FROM streams WHERE type = 'live'").all().forEach((r) => {
    const base = liveBase(r.name);
    if (base) state.liveNames.add(base);
    if (r.stream_url) state.liveUrls.add(String(r.stream_url).trim());
  });

  return state;
}

// ------------------------------------------------------------
// SQL DE INSERÇÃO
// ------------------------------------------------------------
const insertMovie = db.prepare(`
  INSERT INTO streams (name, category_id, type, stream_url, icon_url, epg_channel_id, poster_url, description, rating, release_date, status)
  VALUES (?, ?, 'movie', ?, ?, NULL, ?, ?, ?, ?, 'online')
`);

const insertSeries = db.prepare(`
  INSERT INTO streams (name, category_id, type, stream_url, icon_url, epg_channel_id, poster_url, description, rating, release_date, status)
  VALUES (?, ?, 'series', '', ?, NULL, ?, ?, ?, ?, 'online')
`);

const insertEpisode = db.prepare(`
  INSERT INTO series_episodes (series_id, season_num, episode_num, title, stream_url, duration_minutes)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertLive = db.prepare(`
  INSERT INTO streams (name, category_id, type, stream_url, icon_url, epg_channel_id, poster_url, description, rating, release_date, status)
  VALUES (?, ?, 'live', ?, ?, ?, ?, ?, NULL, NULL, 'online')
`);

// ------------------------------------------------------------
// LEITURA DAS PLAYLISTS M3U
// ------------------------------------------------------------
function readLines(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/);
}

// ------------------------------------------------------------
// POOL DE FILMES E SÉRIES (repo_content/Filmes-Series.m3u8)
// ------------------------------------------------------------
const MOVIE_POOL_CAP = Number(process.env.MOVIE_POOL_CAP || 20000);
const SERIES_POOL_CAP = Number(process.env.SERIES_POOL_CAP || 12000);

function buildVodPools() {
  if (!fs.existsSync(VOD_FILE)) {
    throw new Error(`Playlist de VOD não encontrada: ${VOD_FILE}`);
  }

  const lines = readLines(VOD_FILE);
  const movies = new Map();   // base -> { name, logo, group, url }
  const series = new Map();   // base -> { title, logo, group, episodes: Map(url -> ep) }

  let rawName = '';
  let rawGroup = '';
  let rawLogo = '';
  let movieUrls = 0;
  let seriesUrls = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('#EXTINF')) {
      const nameMatch = line.match(/,(.*)$/);
      rawName = nameMatch ? nameMatch[1].trim() : '';
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      rawGroup = groupMatch ? groupMatch[1] : '';
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      rawLogo = logoMatch ? logoMatch[1] : '';
      continue;
    }
    if (!/^https?:\/\//i.test(line) || !rawName) continue;

    const url = line;
    const name = cleanText(rawName);
    const done = () => { rawName = ''; rawGroup = ''; rawLogo = ''; };

    if (isBlockedContent(`${name} ${rawGroup}`)) { done(); continue; }

    if (/\/series\//i.test(url)) {
      seriesUrls++;
      if (series.size < SERIES_POOL_CAP) {
        const base = seriesBase(name);
        if (base) {
          if (!series.has(base)) {
            series.set(base, {
              title: stripEpisodeMarkers(name) || name,
              logo: rawLogo,
              group: rawGroup,
              episodes: new Map(),
            });
          }
          const bucket = series.get(base);
          if (bucket.episodes.size < EP_CAP && !bucket.episodes.has(url)) {
            const parsed = parseEpisode(name);
            bucket.episodes.set(url, { url, title: name, season: parsed.season, episode: parsed.episode });
          }
        }
      }
    } else if (/\/movie\//i.test(url)) {
      movieUrls++;
      if (movies.size < MOVIE_POOL_CAP) {
        const base = movieBase(name);
        if (base && !movies.has(base)) {
          movies.set(base, { name, logo: rawLogo, group: rawGroup, url });
        }
      }
    }
    done();
  }

  console.log(`📥 Playlist de VOD lida: ${movieUrls} filmes e ${seriesUrls} episódios de séries`);
  console.log(`   Únicos coletados: ${movies.size} filmes | ${series.size} séries`);

  return { movies, series };
}

// ------------------------------------------------------------
// POOL DE CANAIS AO VIVO (arquivos locais do projeto)
// ------------------------------------------------------------
function buildLocalLivePool() {
  const candidates = new Map(); // base -> { name, url, logo, epg, group, rank }
  let urls = 0;
  let liveUrls = 0;

  for (const file of LIVE_FILES) {
    if (!fs.existsSync(file)) {
      console.warn(`   ⚠️  Lista de canais ausente: ${path.basename(file)}`);
      continue;
    }
    const lines = readLines(file);
    let rawName = '';
    let rawGroup = '';
    let rawLogo = '';
    let rawEpg = '';
    let fileUrls = 0;
    let fileLiveUrls = 0;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('#EXTINF')) {
        const nameMatch = line.match(/,(.*)$/);
        rawName = nameMatch ? nameMatch[1].trim() : '';
        const groupMatch = line.match(/group-title="([^"]*)"/i);
        rawGroup = groupMatch ? groupMatch[1] : '';
        const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
        rawLogo = logoMatch ? logoMatch[1].trim() : '';
        const epgMatch = line.match(/tvg-id="([^"]*)"/i);
        rawEpg = epgMatch ? epgMatch[1].trim() : '';
        continue;
      }
      if (!/^https?:\/\//i.test(line) || !rawName) continue;

      const url = line;
      fileUrls++;
      urls++;
      if (!/\/series\/|\/movie\//i.test(url)) {
        fileLiveUrls++;
        liveUrls++;
        if (!isBlockedContent(`${rawName} ${rawGroup}`)) {
          const name = cleanText(rawName);
          const base = liveBase(name);
          if (base) {
            const rank = rankQuality(name) + (rawLogo ? 2 : 0);
            const current = candidates.get(base);
            if (!current || rank > current.rank) {
              candidates.set(base, { name, url, logo: rawLogo, epg: rawEpg, group: rawGroup, rank });
            }
          }
        }
      }
      rawName = ''; rawGroup = ''; rawLogo = ''; rawEpg = '';
    }
    console.log(`   [live] ${path.basename(file)}: ${fileUrls} URLs totais | ${fileLiveUrls} canais ao vivo`);
  }

  console.log(`📥 Canais locais: ${urls} URLs lidas (${liveUrls} ao vivo) -> ${candidates.size} canais únicos`);
  return candidates;
}

// ------------------------------------------------------------
// POOL REMOTO DE CANAIS (iptv-org — canais abertos/FTA)
// ------------------------------------------------------------
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 12000);

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'VSAIPTV-CatalogUpdater/1.0', accept: '*/*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function isPlayable(url) {
  if (SKIP_VALIDATE) return true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
  try {
    const isHls = /\.m3u8(\?|$)/i.test(url);
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'VSAIPTV-CatalogUpdater/1.0',
        accept: '*/*',
        ...(isHls ? {} : { range: 'bytes=0-1023' }),
      },
    });
    if (!res.ok && res.status !== 206) return false;
    if (isHls) {
      const body = await res.text();
      return body.includes('#EXTM3U');
    }
    return true;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function filterPlayable(candidates) {
  const alive = [];
  let index = 0;
  let checked = 0;

  async function worker() {
    while (index < candidates.length) {
      const item = candidates[index++];
      checked++;
      const ok = await isPlayable(item.url);
      if (ok) alive.push(item);
      if (checked % 200 === 0) {
        console.log(`   ... validados ${checked}/${candidates.length} | vivos: ${alive.length}`);
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(VALIDATE_CONCURRENCY, candidates.length)) }, () => worker());
  await Promise.all(workers);
  return alive;
}

async function buildRemoteLivePool(state) {
  const candidates = new Map();

  for (const source of REMOTE_LIVE_SOURCES) {
    if (candidates.size >= REMOTE_MAX_CANDIDATES) break;
    try {
      console.log(`   ️  ${source}`);
      const text = await fetchText(source);
      const lines = text.split(/\r?\n/);
      let rawName = '';
      let rawGroup = '';
      let rawLogo = '';
      let rawEpg = '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.startsWith('#EXTINF')) {
          const nameMatch = line.match(/,(.*)$/);
          rawName = nameMatch ? nameMatch[1].trim() : '';
          const groupMatch = line.match(/group-title="([^"]*)"/i);
          rawGroup = groupMatch ? groupMatch[1] : '';
          const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
          rawLogo = logoMatch ? logoMatch[1].trim() : '';
          const epgMatch = line.match(/tvg-id="([^"]*)"/i);
          rawEpg = epgMatch ? epgMatch[1].trim() : '';
          continue;
        }
        if (!/^https?:\/\//i.test(line) || !rawName) continue;

        const url = line.trim();
        const name = cleanText(rawName);
        const base = liveBase(name);
        if (base && !isBlockedContent(`${name} ${rawGroup}`) && !state.liveNames.has(base) && !state.liveUrls.has(url)) {
          const rank = rankQuality(name) + (rawLogo ? 2 : 0);
          const current = candidates.get(base);
          if (!current || rank > current.rank) {
            candidates.set(base, { name, url, logo: rawLogo, epg: rawEpg, group: rawGroup, rank });
          }
        }
        rawName = ''; rawGroup = ''; rawLogo = ''; rawEpg = '';
      }
      console.log(`   ok: ${candidates.size} candidatos remotos acumulados`);
    } catch (err) {
      console.warn(`   fonte remota falhou: ${err.message}`);
    }
  }

  const list = Array.from(candidates.values());
  console.log(`🌐 Candidatos remotos novos: ${list.length}`);
  if (!list.length) return list;

  console.log(`Validando disponibilidade dos links remotos (concorrência ${VALIDATE_CONCURRENCY})...`);
  const alive = await filterPlayable(list);
  console.log(`🔎 Links remotos ativos: ${alive.length}/${list.length}`);
  return alive;
}

// ------------------------------------------------------------
// INSERÇÃO: SÉRIES, FILMES E CANAIS
// ------------------------------------------------------------
function pseudoRating() {
  // A playlist não fornece avaliações; não inventar uma nota.
  return null;
}

function insertSeriesPool(pool, state, quota) {
  if (quota <= 0) return { inserted: 0, episodes: 0 };
  const entries = Array.from(pool.entries());
  let inserted = 0;
  let episodes = 0;

  const batchTx = db.transaction((batch) => {
    for (const [base, item] of batch) {
      if (inserted >= quota) return;
      if (state.seriesNames.has(base)) continue;

      const categoryName = seriesCategoryOf(item.group);
      const categoryId = getOrCreateCategory(categoryName, 'series');
      const logo = item.logo || null;

      if (!DRY_RUN) {
        const seriesId = insertSeries.run(
          item.title,
          categoryId,
          logo,
          logo,
          `Série com ${item.episodes.size} episódios disponível na categoria ${categoryName}.`,
          null,
          parseYear(item.title)
        ).lastInsertRowid;

        for (const ep of item.episodes.values()) {
          insertEpisode.run(seriesId, ep.season, ep.episode, ep.title, ep.url, 45);
          episodes++;
        }
      } else {
        episodes += item.episodes.size;
      }

      state.seriesNames.add(base);
      inserted++;
    }
  });

  const BATCH = 200;
  for (let i = 0; i < entries.length && inserted < quota; i += BATCH) {
    batchTx(entries.slice(i, i + BATCH));
    if (inserted && inserted % 2000 < BATCH) {
      console.log(`   séries: ${inserted}/${quota}`);
    }
  }
  return { inserted, episodes };
}

function insertMoviePool(pool, state, quota) {
  if (quota <= 0) return { inserted: 0 };
  const entries = Array.from(pool.entries());
  let inserted = 0;

  const batchTx = db.transaction((batch) => {
    for (const [base, item] of batch) {
      if (inserted >= quota) return;
      if (state.movieNames.has(base) || state.movieUrls.has(item.url)) continue;

      const categoryName = movieCategoryOf(item.group);
      const categoryId = getOrCreateCategory(categoryName, 'movie');
      const logo = item.logo || null;

      if (!DRY_RUN) {
        insertMovie.run(
          item.name,
          categoryId,
          item.url,
          logo,
          logo,
          `Filme disponível na categoria ${categoryName}.`,
          pseudoRating(item.name),
          parseYear(item.name)
        );
      }

      state.movieNames.add(base);
      state.movieUrls.add(item.url);
      inserted++;
    }
  });

  const BATCH = 300;
  for (let i = 0; i < entries.length && inserted < quota; i += BATCH) {
    batchTx(entries.slice(i, i + BATCH));
    if (inserted && inserted % 3000 < BATCH) {
      console.log(`   filmes: ${inserted}/${quota}`);
    }
  }
  return { inserted };
}

function insertLivePool(candidates, state, quota) {
  if (quota <= 0) return { inserted: 0 };
  let inserted = 0;

  const batchTx = db.transaction((batch) => {
    for (const cand of batch) {
      if (inserted >= quota) return;
      const base = liveBase(cand.name);
      if (!base || state.liveNames.has(base) || state.liveUrls.has(cand.url)) continue;

      const categoryName = liveCategoryOf(cand.group, cand.name);
      const categoryId = getOrCreateCategory(categoryName, 'live');
      const logo = cand.logo || FALLBACK_LIVE_ICON;

      if (!DRY_RUN) {
        insertLive.run(
          cand.name,
          categoryId,
          cand.url,
          logo,
          cand.epg || null,
          logo || FALLBACK_LIVE_POSTER,
          `Transmissão ao vivo na categoria ${categoryName}.`
        );
      }

      state.liveNames.add(base);
      state.liveUrls.add(cand.url);
      inserted++;
    }
  });

  const BATCH = 250;
  for (let i = 0; i < candidates.length && inserted < quota; i += BATCH) {
    batchTx(candidates.slice(i, i + BATCH));
    if (inserted && inserted % 2500 < BATCH) {
      console.log(`   canais: ${inserted}/${quota}`);
    }
  }
  return { inserted };
}

function repairMissingImages() {
  if (DRY_RUN) return 0;
  const info = db.prepare(`
    UPDATE streams
    SET icon_url = COALESCE(NULLIF(icon_url, ''), ?),
        poster_url = COALESCE(NULLIF(poster_url, ''), ?)
    WHERE (COALESCE(icon_url, '') = '' OR COALESCE(poster_url, '') = '')
  `).run(FALLBACK_LIVE_ICON, FALLBACK_LIVE_POSTER);
  return info.changes;
}

async function backupDatabase() {
  if (DRY_RUN || !RUN_BACKUP) return;
  const destination = fs.existsSync(BACKUP_PATH) && !FORCE_BACKUP
    ? `${BACKUP_PATH}.${Date.now()}` : BACKUP_PATH;
  await db.backup(destination);
  console.log(`💾 Backup consistente criado: ${destination}`);
}

// ------------------------------------------------------------
// EXECUÇÃO PRINCIPAL
// ------------------------------------------------------------
function snapshot() {
  return {
    live: countByType('live'),
    movie: countByType('movie'),
    series: countByType('series'),
    total: countTotal(),
    episodes: db.prepare('SELECT COUNT(*) AS c FROM series_episodes').get().c,
    categories: db.prepare('SELECT COUNT(*) AS c FROM categories').get().c,
  };
}

function printReport(label, s) {
  console.log(`${label} — ao vivo: ${s.live} | filmes: ${s.movie} | séries: ${s.series} | total: ${s.total} | episódios: ${s.episodes} | categorias: ${s.categories}`);
}

async function main() {
  const startedAt = Date.now();
  console.log('====================================================');
  console.log('🚀 EXPANSÃO DE CATÁLOGO — META 30.000 CONTEÚDOS ONLINE');
  console.log('====================================================');
  if (DRY_RUN) console.log('🧪 MODO SIMULAÇÃO (DRY_RUN=1) — nenhum registro será gravado.');
  console.log(`Metas: total=${TARGET_TOTAL} | séries<=${MAX_SERIES} | filmes<=${MAX_MOVIE} | canais<=${MAX_LIVE} | eps/série<=${EP_CAP}`);

  const before = snapshot();
  printReport('📦 Antes', before);

  if (before.total >= TARGET_TOTAL) {
    console.log(`✅ Meta de ${TARGET_TOTAL} conteúdos já atingida. Nada a inserir.`);
    return true;
  }
  console.log(`🎯 Faltam ${TARGET_TOTAL - before.total} conteúdos online.`);
  console.log('');

  await backupDatabase();
  loadCategoryIndex();
  const state = loadExistingKeys();

  let total = before.total;

  // 1) SÉRIES (fonte mais escassa — priorizada)
  console.log('\n--- 1/4 Séries (repo_content/Filmes-Series.m3u8) ---');
  const pools = buildVodPools();
  const seriesQuota = Math.max(0, Math.min(MAX_SERIES - before.series, TARGET_TOTAL - total));
  const seriesResult = insertSeriesPool(pools.series, state, seriesQuota);
  total += seriesResult.inserted;
  console.log(`✅ Séries inseridas: ${seriesResult.inserted} (episódios: ${seriesResult.episodes}) | total agora: ${total}`);

  // 2) FILMES
  console.log('\n--- 2/4 Filmes (repo_content/Filmes-Series.m3u8) ---');
  const movieQuota = Math.max(0, Math.min(MAX_MOVIE - before.movie, TARGET_TOTAL - total));
  const movieResult = insertMoviePool(pools.movies, state, movieQuota);
  total += movieResult.inserted;
  console.log(`✅ Filmes inseridos: ${movieResult.inserted} | total agora: ${total}`);

  // 3) CANAIS AO VIVO (listas locais do projeto)
  console.log('\n--- 3/4 Canais ao vivo (listas locais) ---');
  const localLive = buildLocalLivePool();
  let liveQuota = Math.max(0, Math.min(MAX_LIVE - before.live, TARGET_TOTAL - total));
  const liveLocalResult = insertLivePool(Array.from(localLive.values()), state, liveQuota);
  total += liveLocalResult.inserted;
  console.log(`✅ Canais locais inseridos: ${liveLocalResult.inserted} | total agora: ${total}`);

  // 4) CANAIS AO VIVO REMOTOS (o que não existe no projeto)
  if (DRY_RUN) {
    console.log('\n--- 4/4 Fontes remotas ignoradas em modo simulação ---');
  } else if (total < TARGET_TOTAL && !SKIP_REMOTE) {
    console.log('\n--- 4/4 Canais ao vivo (fontes públicas iptv-org) ---');
    const remotePool = await buildRemoteLivePool(state);
    liveQuota = Math.max(0, Math.min(MAX_LIVE - before.live - liveLocalResult.inserted, TARGET_TOTAL - total));
    const remoteResult = insertLivePool(remotePool, state, liveQuota);
    total += remoteResult.inserted;
    console.log(`✅ Canais remotos inseridos: ${remoteResult.inserted} | total agora: ${total}`);
  } else if (SKIP_REMOTE) {
    console.log('\n--- 4/4 Fontes remotas ignoradas (SKIP_REMOTE=1) ---');
  } else {
    console.log('\n--- 4/4 Fontes remotas dispensadas (meta já atingida) ---');
  }

  const imagesFixed = repairMissingImages();
  if (imagesFixed) console.log(`🖼️  Registros com imagem completados: ${imagesFixed}`);

  if (!DRY_RUN) {
    db.exec('ANALYZE');
    db.pragma('wal_checkpoint(TRUNCATE)');
  }

  if (DRY_RUN) {
    console.log(`SIMULAÇÃO: total projetado=${total}; banco permanece com ${before.total} registros online.`);
    return total >= TARGET_TOTAL;
  }
  const after = snapshot();
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log('\n====================================================');
  console.log('📊 CATÁLOGO FINAL');
  console.log('====================================================');
  printReport('📦 Antes', before);
  printReport('📦 Depois', after);
  console.log(`➕ Inseridos nesta execução: ${after.total - before.total} conteúdos | ${after.episodes - before.episodes} episódios`);
  console.log(`⏱️  Tempo total: ${elapsed}s`);
  console.log(`📺 Ao vivo: ${after.live} | 🎬 Filmes: ${after.movie} | 🍿 Séries: ${after.series} | 🎞️ Episódios: ${after.episodes}`);
  console.log(`🧾 TOTAL DE CONTEÚDOS ONLINE: ${after.total}`);

  const reached = after.total >= TARGET_TOTAL;
  console.log(reached
    ? `✅ META ATINGIDA (${TARGET_TOTAL} conteúdos online).`
    : `⚠️  Meta não atingida: faltam ${TARGET_TOTAL - after.total} conteúdos. Fontes esgotadas nesta execução.`);
  return reached;
}

main()
  .then((reached) => {
    try { db.close(); } catch (e) { /* ignore */ }
    if (process.env.DRY_RUN === '1') process.exit(0);
    process.exit(reached ? 0 : 1);
  })
  .catch((err) => {
    console.error('❌ Falha ao expandir catálogo:', err);
    try { db.close(); } catch (e) { /* ignore */ }
    process.exit(1);
  });