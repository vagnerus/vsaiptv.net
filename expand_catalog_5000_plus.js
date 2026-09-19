/**
 * Expande o catálogo com fontes públicas/legais.
 *
 * - Mantém filmes e séries atuais, que já estão acima de 5000.
 * - Completa canais ao vivo para passar de 5000 online.
 * - Usa playlists abertas do projeto IPTV-org (canais gratuitos/FTA).
 * - Idempotente: não duplica por URL nem por nome normalizado.
 *
 * Uso:
 *   node expand_catalog_5000_plus.js
 *
 * Variáveis opcionais:
 *   TARGET_LIVE_ONLINE=5200 node expand_catalog_5000_plus.js
 *   SKIP_VALIDATE=1 node expand_catalog_5000_plus.js
 */
const path = require('path');
const Database = require('./server/node_modules/better-sqlite3');

const db = new Database(path.join(__dirname, 'server', 'data', 'iptv.db'));
db.pragma('journal_mode = WAL');

const TARGET_LIVE_ONLINE = Number(process.env.TARGET_LIVE_ONLINE || 5200);
const SKIP_VALIDATE = process.env.SKIP_VALIDATE === '1';
const FETCH_TIMEOUT_MS = 10000;
const VALIDATE_TIMEOUT_MS = 6500;
const MAX_CANDIDATES_PER_SOURCE = 1400;

const FALLBACK_LIVE_ICON = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/OOjs_UI_icon_play.svg/512px-OOjs_UI_icon_play.svg.png';
const FALLBACK_LIVE_POSTER = 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=1280&h=720&fit=crop';

const SOURCES = [
  'https://iptv-org.github.io/iptv/countries/br.m3u',
  'https://iptv-org.github.io/iptv/languages/por.m3u',
  'https://iptv-org.github.io/iptv/categories/news.m3u',
  'https://iptv-org.github.io/iptv/categories/education.m3u',
  'https://iptv-org.github.io/iptv/categories/documentary.m3u',
  'https://iptv-org.github.io/iptv/categories/entertainment.m3u',
  'https://iptv-org.github.io/iptv/categories/kids.m3u',
  'https://iptv-org.github.io/iptv/categories/sports.m3u',
  'https://iptv-org.github.io/iptv/categories/movies.m3u',
  'https://iptv-org.github.io/iptv/index.m3u',
];

function normalizeName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(4k|uhd|fhd|hd|sd|h265|hevc|h264|60fps|30fps)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function attr(line, key) {
  const re = new RegExp(`${key}="([^"]*)"`, 'i');
  const m = line.match(re);
  return m ? cleanText(m[1]) : '';
}

function titleFromExtinf(line) {
  const m = line.match(/,(.*)$/);
  return cleanText(m ? m[1] : attr(line, 'tvg-name'));
}

function categoryFromItem(item) {
  const raw = `${item.group} ${item.name}`.toLowerCase();
  if (/news|not[ií]cia|jornal|cnn|record news|euronews|gov/.test(raw)) return 'Notícias & Jornalismo';
  if (/sport|esport|futebol|soccer|nba|nfl|fight|combate|ufc/.test(raw)) return 'Esportes & PPV';
  if (/kid|infantil|cartoon|children|baby/.test(raw)) return 'Infantil';
  if (/document|doc|science|ci[eê]ncia|history|nature/.test(raw)) return 'Documentários';
  if (/music|m[uú]sica|radio/.test(raw)) return 'Música';
  if (/movie|cinema|film|filme/.test(raw)) return 'Cinema & Séries Ao Vivo';
  if (/education|educa|aula|school|univers/.test(raw)) return 'Educação';
  if (item.group) return `Canais | ${cleanText(item.group).replace(/^Canais\s*\|\s*/i, '')}`;
  return 'Canais | Públicos';
}

function getOrCreateCategory(name, type, orderNum = 50) {
  const existing = db.prepare('SELECT id FROM categories WHERE name = ? AND type = ?').get(name, type);
  if (existing) return existing.id;
  return db.prepare('INSERT INTO categories (name, type, order_num) VALUES (?, ?, ?)').run(name, type, orderNum).lastInsertRowid;
}

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

function parseM3U(text) {
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const name = titleFromExtinf(line);
      current = {
        name,
        logo: attr(line, 'tvg-logo'),
        epg: attr(line, 'tvg-id') || attr(line, 'channel-id'),
        group: attr(line, 'group-title'),
      };
      continue;
    }
    if (current && /^https?:\/\//i.test(line)) {
      if (current.name && !/adult|xxx|porn|erotic|18\+/i.test(`${current.name} ${current.group}`)) {
        out.push({ ...current, url: line });
      }
      current = null;
    }
  }
  return out;
}

async function isPlayable(url) {
  if (SKIP_VALIDATE) return true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'VSAIPTV-CatalogUpdater/1.0',
        accept: '*/*',
        range: /\.m3u8(\?|$)/i.test(url) ? undefined : 'bytes=0-1023',
      },
    });
    if (!res.ok && res.status !== 206) return false;
    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    if (/\.m3u8(\?|$)/i.test(url)) {
      const body = await res.text();
      return body.includes('#EXTM3U') || contentType.includes('mpegurl');
    }
    return true;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function getExistingSets() {
  const rows = db.prepare("SELECT name, stream_url FROM streams WHERE type = 'live'").all();
  return {
    names: new Set(rows.map((r) => normalizeName(r.name)).filter(Boolean)),
    urls: new Set(rows.map((r) => String(r.stream_url || '').trim()).filter(Boolean)),
  };
}

const insertLive = db.prepare(`
  INSERT INTO streams (name, category_id, type, stream_url, icon_url, epg_channel_id, poster_url, description, rating, release_date, status)
  VALUES (?, ?, 'live', ?, ?, ?, ?, ?, '8.5', '2024', 'online')
`);

async function main() {
  const startOnline = db.prepare("SELECT COUNT(*) AS total FROM streams WHERE type = 'live' AND status = 'online'").get().total;
  console.log(`Canais online atuais: ${startOnline}`);
  console.log(`Meta de canais online: ${TARGET_LIVE_ONLINE}`);

  if (startOnline >= TARGET_LIVE_ONLINE) {
    console.log('Meta já atingida. Nada a inserir.');
    return;
  }

  const needed = TARGET_LIVE_ONLINE - startOnline;
  const existing = getExistingSets();
  const candidates = [];
  const seenCandidateUrls = new Set();
  const seenCandidateNames = new Set();

  for (const source of SOURCES) {
    try {
      console.log(`Baixando fonte: ${source}`);
      const text = await fetchText(source);
      const parsed = parseM3U(text).slice(0, MAX_CANDIDATES_PER_SOURCE);
      console.log(`  itens lidos: ${parsed.length}`);
      for (const item of parsed) {
        const nameKey = normalizeName(item.name);
        const urlKey = String(item.url || '').trim();
        if (!nameKey || !urlKey) continue;
        if (existing.urls.has(urlKey) || existing.names.has(nameKey)) continue;
        if (seenCandidateUrls.has(urlKey) || seenCandidateNames.has(nameKey)) continue;
        seenCandidateUrls.add(urlKey);
        seenCandidateNames.add(nameKey);
        candidates.push(item);
      }
    } catch (err) {
      console.warn(`  falhou: ${err.message}`);
    }
    if (candidates.length >= needed * 4) break;
  }

  console.log(`Candidatos novos únicos: ${candidates.length}`);

  let inserted = 0;
  let checked = 0;
  const insertTx = db.transaction((items) => {
    for (const item of items) {
      const categoryId = getOrCreateCategory(categoryFromItem(item), 'live', 50);
      const logo = item.logo || FALLBACK_LIVE_ICON;
      insertLive.run(
        cleanText(item.name),
        categoryId,
        item.url,
        logo,
        item.epg || null,
        logo || FALLBACK_LIVE_POSTER,
        `Canal público importado de fonte aberta (${item.group || 'sem categoria'}).`
      );
    }
  });

  const batch = [];
  for (const item of candidates) {
    if (inserted + batch.length >= needed) break;
    checked++;
    const ok = await isPlayable(item.url);
    if (!ok) continue;
    batch.push(item);
    if (batch.length >= 25) {
      insertTx(batch.splice(0, batch.length));
      inserted += 25;
      console.log(`Inseridos até agora: ${inserted}/${needed} | verificados: ${checked}`);
    }
  }
  if (batch.length) {
    insertTx(batch);
    inserted += batch.length;
  }

  db.prepare(`
    UPDATE streams
    SET icon_url = COALESCE(NULLIF(icon_url, ''), ?),
        poster_url = COALESCE(NULLIF(poster_url, ''), ?)
    WHERE type = 'live' AND status = 'online' AND (COALESCE(icon_url, '') = '' OR COALESCE(poster_url, '') = '')
  `).run(FALLBACK_LIVE_ICON, FALLBACK_LIVE_POSTER);

  const endOnline = db.prepare("SELECT COUNT(*) AS total FROM streams WHERE type = 'live' AND status = 'online'").get().total;
  console.log(`Inseridos nesta execução: ${inserted}`);
  console.log(`Canais online finais: ${endOnline}`);
  console.log('Totais online:', db.prepare("SELECT type, COUNT(*) AS total FROM streams WHERE status = 'online' GROUP BY type ORDER BY type").all());
}

main().catch((err) => {
  console.error('Falha ao expandir catálogo:', err);
  process.exit(1);
});
