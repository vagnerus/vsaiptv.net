// ============================================================
// VSAIPTV IMAGE WORKER
// Varredura / validação / reparo de capas (posters) de filmes e séries.
// Fluxo de fallback: CAPA LOCAL -> CAPA EXTERNA VÁLIDA -> PLACEHOLDER VSAIPTV
// - Lotes de 100 itens + baixa concorrência de download (3 simultâneos)
// - Concorrência de validação acelerada (8 requisições HEAD)
// - Timeout + retry (máx 3) + cache negativo (nunca loop infinito)
// - Checkpoint persistente (retomada automática a partir do last_id)
// - Busca TMDB inteligente (PT + Original, tratamento de sequências e anos)
// - Geração de capa local elegante para conteúdos sem imagem externa
// ============================================================
const fs2 = require('fs');
const path2 = require('path');
const http = require('http');
const https = require('https');
const db = require('../db/database');
const imageManager = require('./imageManager');

const IMAGES_DIR = path2.join(__dirname, '../../data/images');
const STORAGE_IMAGES_DIR = path2.join(__dirname, '../../storage/images');

const BATCH_SIZE = Number(process.env.IMAGE_WORKER_BATCH_SIZE || 100);
const DOWNLOAD_CONCURRENCY = Number(process.env.IMAGE_WORKER_DOWNLOAD_CONCURRENCY || 3);
const VALIDATE_CONCURRENCY = Number(process.env.IMAGE_WORKER_VALIDATE_CONCURRENCY || 8);
const REQUEST_TIMEOUT_MS = Number(process.env.IMAGE_WORKER_TIMEOUT_MS || 10000);
const MAX_ATTEMPTS = 3;
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const IDLE_RESUME_MS = Number(process.env.IMAGE_WORKER_IDLE_RESUME_MS || 30000);

// ---------------- Schema (idempotente; preserva integridade) ----------------
let schemaReady = false;
function ensureSchema() {
  if (schemaReady) return;
  const cols = db.prepare('PRAGMA table_info(streams)').all().map((c) => c.name);
  const add = (sql) => { try { db.exec(sql); } catch (e) { /* ja existe */ } };
  if (!cols.includes('poster_status')) add("ALTER TABLE streams ADD COLUMN poster_status TEXT DEFAULT NULL");
  if (!cols.includes('poster_checked_at')) add("ALTER TABLE streams ADD COLUMN poster_checked_at DATETIME DEFAULT NULL");
  if (!cols.includes('poster_source_url')) add("ALTER TABLE streams ADD COLUMN poster_source_url TEXT DEFAULT NULL");
  db.exec('CREATE TABLE IF NOT EXISTS image_worker_state (key TEXT PRIMARY KEY, value TEXT)');

  for (const base of [IMAGES_DIR, STORAGE_IMAGES_DIR]) {
    for (const sub of ['movies', 'series']) {
      try { fs2.mkdirSync(path2.join(base, sub), { recursive: true }); } catch (e) {}
    }
  }
  schemaReady = true;
}

// ---------------- Estado persistente ----------------
function getState(key, fallback = null) {
  ensureSchema();
  const row = db.prepare('SELECT value FROM image_worker_state WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch (e) { return row.value; }
}
function setState(key, value) {
  ensureSchema();
  db.prepare('INSERT INTO image_worker_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
}

// ---------------- Estatísticas do reporte ----------------
function blankStats() {
  return {
    analisadas: 0,
    validas: 0,
    faltantes: 0,
    quebradas: 0,
    encontradas: 0,
    baixadas: 0,
    semResultado: 0,
    revisao: 0,
    falhas: 0,
  };
}
function loadStats() {
  const s = getState('stats');
  return Object.assign(blankStats(), s || {});
}
function saveStats(stats) { setState('stats', stats); }

// ---------------- Normalização / Confiança Refinada ----------------
function stripNoise(rawName) {
  return String(rawName || '')
    .replace(/\b(4k|hdr|uhd|fhd|full\s*hd|hd|sd|h265|hevc|dub|dublado|leg|legendado|hdrip|webrip|web[-\s]?dl|bluray|10bit|x264|x265|multi|dual\s*audio|completo|clássico|classico)\b/gi, ' ')
    .replace(/[\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractYear(raw) {
  const fromDate = String(raw || '').match(/\b(19\d{2}|20\d{2})\b/);
  return fromDate ? Number(fromDate[0]) : null;
}

function extractYearFromTitle(title) {
  const m = String(title || '').match(/\((19\d{2}|20\d{2})\)/);
  if (m) return Number(m[1]);
  const end = String(title || '').match(/\b(19\d{2}|20\d{2})\b$/);
  return end ? Number(end[1]) : null;
}

function cleanTitleForSearch(title) {
  let t = stripNoise(title);
  t = t.replace(/\((19\d{2}|20\d{2})\)/g, ' ');
  t = t.replace(/\b(19\d{2}|20\d{2})\b$/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

function normalizeTitle(raw) {
  return stripNoise(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // acentos
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenSet(t) {
  return new Set(t.toLowerCase().split(/\s+/).filter(Boolean));
}

function levenshteinRatio(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  const prev = new Array(lb + 1), curr = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= lb; j++) prev[j] = curr[j];
  }
  return (la + lb - prev[lb]) / (la + lb);
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const ratio = levenshteinRatio(a, b);
  const ta = tokenSet(a), tb = tokenSet(b);
  if (!ta.size || !tb.size) return ratio;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  const jac = inter / (new Set([...ta, ...tb]).size);
  return Math.max(ratio, jac);
}

function parseCandTitle(raw) {
  const parts = [];
  const s = String(raw || '').replace(/&amp;/g, '&');
  const m = s.match(/^(.*?)\s*\((.*?)\)$/);
  if (m) {
    parts.push(m[1].trim()); // Titulo em portugues
    parts.push(m[2].trim()); // Titulo original
  } else {
    parts.push(s.trim());
  }
  return parts;
}

function extractRomanOrNumber(title) {
  const m = String(title || '').match(/\b(ii|iii|iv|v|vi|vii|viii|ix|x|2|3|4|5|6|7|8|9)\b/i);
  return m ? m[0].toLowerCase() : null;
}

function isConfidentMatch(candTitle, candYear, itemTitle, itemYear) {
  const candParts = parseCandTitle(candTitle);
  const nt = normalizeTitle(itemTitle || '');
  if (!nt) return false;

  // Verificacao estrita de sequencia: Gladiador (2000) nunca recebe Gladiador II (2024)
  const itemSeq = extractRomanOrNumber(itemTitle);
  const candSeq = extractRomanOrNumber(candTitle);
  if (itemSeq && !candSeq) return false;
  if (!itemSeq && candSeq) return false;
  if (itemSeq && candSeq && itemSeq !== candSeq) {
    const map = { '2': 'ii', '3': 'iii', '4': 'iv', '5': 'v' };
    const normItem = map[itemSeq] || itemSeq;
    const normCand = map[candSeq] || candSeq;
    if (normItem !== normCand) return false;
  }

  // Verificacao de ano se o item especificou explicitamente o ano no titulo
  if (itemYear && candYear) {
    const yearDiff = Math.abs(itemYear - candYear);
    if (yearDiff > 1) return false;
  }

  // Comparar contra todas as partes do titulo (PT e Original)
  let bestSim = 0;
  for (const part of candParts) {
    const nc = normalizeTitle(part);
    if (!nc) continue;
    if (nc === nt) return true; // match exato
    const sim = similarity(nt, nc);
    if (sim > bestSim) bestSim = sim;
  }

  if (itemYear && candYear) {
    return bestSim >= 0.78;
  }
  return bestSim >= 0.88;
}

// ---------------- HTTP util (timeout + retry; 404/403 definitivos) ----------------
function fetchUrl(url, { method = 'GET', headers = {}, timeout = REQUEST_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const mod = u.protocol === 'http:' ? http : https;
      const req = mod.request(u, { method, headers, timeout }, (res) => {
        if (method === 'HEAD') {
          res.resume();
          return resolve({ ok: true, status: res.statusCode, headers: res.headers, buffer: null });
        }
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size <= 10 * 1024 * 1024) chunks.push(c);
          else res.destroy();
        });
        res.on('end', () => resolve({ ok: true, status: res.statusCode, headers: res.headers, buffer: Buffer.concat(chunks) }));
        res.on('error', () => resolve({ ok: false, status: res.statusCode || 0 }));
      });
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, timeout: true }); });
      req.on('error', () => resolve({ ok: false, status: 0 }));
      req.end();
    } catch (e) {
      resolve({ ok: false, status: 0 });
    }
  });
}

async function fetchWithRetry(url, opts = {}) {
  let last = { ok: false, status: 0 };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await fetchUrl(url, opts);
    if (last.ok && last.status >= 200 && last.status < 400) return last;
    if (last.status === 404 || last.status === 403 || last.status === 410) return last;
    await new Promise((r) => setTimeout(r, 400 * attempt));
  }
  return last;
}

// ---------------- Fonte de metadados autorizada: TMDB ----------------
const ALLOWED_SOURCE_HOSTS = ['image.tmdb.org', 'media.themoviedb.org', 'www.themoviedb.org', 'api.themoviedb.org'];
function isAllowedSourceUrl(url) {
  try { return ALLOWED_SOURCE_HOSTS.includes(new URL(url).hostname.toLowerCase()); }
  catch (e) { return false; }
}

function tmdbPosterUrl(posterPath) {
  return 'https://image.tmdb.org/t/p/w780' + posterPath;
}

async function searchTmdbApi(title, year, type) {
  if (!TMDB_API_KEY) return null;
  const kind = type === 'series' ? 'tv' : 'movie';
  const q = new URLSearchParams({ query: title, api_key: TMDB_API_KEY, language: 'pt-BR' });
  if (year && kind === 'movie') q.set('year', String(year));
  if (year && kind === 'tv') q.set('first_air_date_year', String(year));
  const res = await fetchWithRetry('https://api.themoviedb.org/3/search/' + kind + '?' + q);
  if (!res.ok || !res.buffer) return null;
  try {
    const data = JSON.parse(res.buffer.toString('utf8'));
    return (data.results || []).map((r) => ({
      title: r.title || r.name || '',
      year: extractYear(r.release_date || r.first_air_date || ''),
      posterPath: r.poster_path || null,
    })).filter((r) => r.posterPath);
  } catch (e) { return null; }
}

async function searchTmdbHtml(title, year, type) {
  const kind = type === 'series' ? 'tv' : 'movie';
  const q = encodeURIComponent(title + (year ? ' y:' + year : ''));
  const url = 'https://www.themoviedb.org/search/' + kind + '?query=' + q;
  const res = await fetchWithRetry(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' },
  });
  if (!res.ok || !res.buffer) return null;
  const html = res.buffer.toString('utf8');
  const results = [];
  const cardRe = /class="comp:media-card[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
  let m;
  while ((m = cardRe.exec(html)) !== null && results.length < 10) {
    const block = m[0];
    const hrefMatch = block.match(/href="\/(movie|tv)\/(\d+)-[^"]*"/);
    const imgMatch = block.match(/src="[^"]*?t\/p\/[^"]*?\/([A-Za-z0-9_]+\.(?:jpg|png|webp))"/);
    const h2Match = block.match(/<h2[^>]*>([\s\S]{0,200}?)<\/h2>/);
    const dateMatch = block.match(/class="release_date[^"]*"[^>]*>([^<]*)</);
    if (!hrefMatch || !imgMatch || !h2Match) continue;
    const t = h2Match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const dateText = (dateMatch && dateMatch[1] ? dateMatch[1] : '').trim();
    const y = extractYear(dateText.split(/[, ]/).reverse().join(' ')) || extractYear(dateText);
    results.push({ title: t, year: y, posterPath: '/' + imgMatch[1] });
  }
  if (!results.length) {
    const looseRe = /href="\/(movie|tv)\/(\d+)-[^"]*"[\s\S]{0,1500}src="[^"]*?t\/p\/[^"]*?\/([A-Za-z0-9_]+\.(?:jpg|png|webp))"[\s\S]{0,2000}<h2[^>]*>([\s\S]{0,200}?)<\/h2>[\s\S]{0,600}release_date[^>]*>([^<]*)</g;
    while ((m = looseRe.exec(html)) !== null && results.length < 10) {
      const t = m[4].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const dateText = (m[5] || '').trim();
      const y = extractYear(dateText.split(/[, ]/).reverse().join(' ')) || extractYear(dateText);
      results.push({ title: t, year: y, posterPath: '/' + m[3] });
    }
  }
  return results;
}

async function findTrustedPoster(item) {
  const rawTitle = cleanTitleForSearch(item.name);
  const explicitTitleYear = extractYearFromTitle(item.name);
  const itemYear = explicitTitleYear; // Não utiliza o dummy 2024 para pesquisa forcada

  let candidates = await searchTmdbApi(rawTitle, itemYear, item.type);
  if (!candidates || !candidates.length) {
    candidates = (await searchTmdbHtml(rawTitle, itemYear, item.type)) || [];
  }

  // Se nao achou e o titulo possui apelido como 'Classico' ou algo similar, busca nome simplificado
  if (!candidates.length && /\b(clássico|classico|completo|saga)\b/i.test(item.name)) {
    const simplified = rawTitle.replace(/\b(clássico|classico|completo|saga)\b/gi, '').trim();
    if (simplified.length >= 3) {
      candidates = (await searchTmdbHtml(simplified, itemYear, item.type)) || [];
    }
  }

  for (const c of candidates) {
    if (!c.posterPath) continue;
    if (isConfidentMatch(c.title, c.year, item.name, explicitTitleYear)) {
      return { url: tmdbPosterUrl(c.posterPath), title: c.title, year: c.year };
    }
  }
  return null;
}

// ---------------- Armazenamento Local e Fallback Customizado ----------------
function kindDir(type) { return type === 'series' ? 'series' : 'movies'; }
function localUrlFor(type, id) { return '/img-local/' + kindDir(type) + '/' + id; }

function findLocalPosterFile(type, id) {
  const kind = kindDir(type);
  for (const base of [IMAGES_DIR, STORAGE_IMAGES_DIR]) {
    const dir = path2.join(base, kind, String(id));
    if (fs2.existsSync(dir)) {
      for (const f of fs2.readdirSync(dir)) {
        if (/^poster\.(webp|jpg|jpeg|png|gif|svg)$/i.test(f)) return path2.join(dir, f);
      }
    }
  }
  return null;
}

async function downloadPosterToLocal(type, id, url) {
  if (!isAllowedSourceUrl(url)) return { ok: false, reason: 'fonte nao autorizada' };
  const res = await fetchWithRetry(url, { method: 'GET' });
  if (!res.ok || !res.buffer) return { ok: false, reason: 'http ' + res.status };
  const v = imageManager.validateMagicBytes(res.buffer, res.headers['content-type'] || '');
  if (!v.valid) return { ok: false, reason: (v.reason || 'formato invalido') };

  const kind = kindDir(type);
  for (const base of [IMAGES_DIR, STORAGE_IMAGES_DIR]) {
    const dir = path2.join(base, kind, String(id));
    try {
      fs2.mkdirSync(dir, { recursive: true });
      fs2.writeFileSync(path2.join(dir, 'poster.' + v.ext), res.buffer);
    } catch (e) {}
  }
  return { ok: true, ext: v.ext, size: res.buffer.length };
}

// Geração de poster vertical de alta definição local ("se precisar crie essas capas que faltam")
function createCustomLocalPoster(type, id, title) {
  const cleanTitle = String(title || 'VSAIPTV').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 70);
  const isSeries = type === 'series';
  const label = isSeries ? 'SÉRIE' : 'FILME';
  const kind = kindDir(type);

  // Hash determinístico para variações sutis no gradiente premium
  let hash = 0;
  for (let i = 0; i < cleanTitle.length; i++) hash = (hash * 31 + cleanTitle.charCodeAt(i)) & 0xFFFFFF;
  const hue1 = (hash % 60) + 215; // 215-275 (azuis e roxos sofisticados)
  const hue2 = (hue1 + 35) % 360;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" width="600" height="900">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${hue1}, 45%, 11%)" />
      <stop offset="50%" stop-color="#0b111e" />
      <stop offset="100%" stop-color="hsl(${hue2}, 55%, 7%)" />
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="30%" r="55%">
      <stop offset="0%" stop-color="hsl(${hue1}, 80%, 40%)" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>
  <rect width="600" height="900" fill="url(#bg)" />
  <circle cx="300" cy="320" r="260" fill="url(#glow)" />

  <!-- Marca VSAIPTV Superior -->
  <g transform="translate(300, 70)" text-anchor="middle">
    <rect x="-70" y="-18" width="140" height="36" rx="18" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
    <circle cx="-42" cy="0" r="4" fill="#38bdf8"/>
    <text x="6" y="5" fill="#e2e8f0" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="13" font-weight="700" letter-spacing="2">VSAIPTV</text>
  </g>

  <!-- Ícone de Conteúdo Central -->
  <g transform="translate(300, 310)" text-anchor="middle" filter="url(#shadow)">
    <circle cx="0" cy="0" r="68" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
    ${isSeries ? `
      <!-- Monitor TV para Série -->
      <rect x="-36" y="-24" width="72" height="48" rx="8" fill="none" stroke="#38bdf8" stroke-width="3.5"/>
      <line x1="-12" y1="30" x2="12" y2="30" stroke="#38bdf8" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="0" y1="24" x2="0" y2="30" stroke="#38bdf8" stroke-width="3.5"/>
      <polygon points="-8,-8 14,0 -8,8" fill="#38bdf8"/>
    ` : `
      <!-- Rolo / Claquete para Filme -->
      <circle cx="0" cy="0" r="32" fill="none" stroke="#f43f5e" stroke-width="3.5"/>
      <circle cx="0" cy="0" r="10" fill="#f43f5e"/>
      <circle cx="-16" cy="-16" r="4" fill="#f43f5e"/>
      <circle cx="16" cy="-16" r="4" fill="#f43f5e"/>
      <circle cx="-16" cy="16" r="4" fill="#f43f5e"/>
      <circle cx="16" cy="16" r="4" fill="#f43f5e"/>
    `}
  </g>

  <!-- Tag do Formato -->
  <g transform="translate(300, 480)" text-anchor="middle">
    <rect x="-45" y="-14" width="90" height="28" rx="14" fill="${isSeries ? 'rgba(56,189,248,0.15)' : 'rgba(244,63,94,0.15)'}" stroke="${isSeries ? 'rgba(56,189,248,0.3)' : 'rgba(244,63,94,0.3)'}" stroke-width="1"/>
    <text x="0" y="5" fill="${isSeries ? '#7dd3fc' : '#fda4af'}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="12" font-weight="700" letter-spacing="1.5">${label}</text>
  </g>

  <!-- Título Principal -->
  <foreignObject x="40" y="540" width="520" height="260">
    <div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;height:100%;text-align:center;padding:0 10px;">
      <h1 style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:32px;font-weight:700;line-height:1.25;margin:0;word-break:break-word;text-shadow:0 4px 12px rgba(0,0,0,0.8);">${cleanTitle}</h1>
    </div>
  </foreignObject>

  <!-- Borda Sutil do Card -->
  <rect x="2" y="2" width="596" height="896" rx="8" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
</svg>`;

  const buffer = Buffer.from(svg, 'utf8');
  for (const base of [IMAGES_DIR, STORAGE_IMAGES_DIR]) {
    const dir = path2.join(base, kind, String(id));
    try {
      fs2.mkdirSync(dir, { recursive: true });
      fs2.writeFileSync(path2.join(dir, 'poster.svg'), buffer);
    } catch (e) {}
  }
  return { ok: true, ext: 'svg', size: buffer.length };
}

// ---------------- Classificação + Validação do Poster Atual ----------------
function isPlaceholderUrl(url) {
  const lower = String(url || '').toLowerCase();
  return !lower || lower.includes('placeholder') || lower.startsWith('data:image/svg');
}

function classifyPoster(item) {
  const url = (item.poster_url || '').trim();
  if (!url || isPlaceholderUrl(url)) return 'missing';
  if (url.startsWith('/img-local/') || url.startsWith('/storage/images/')) return 'local';
  return 'external';
}

async function validateExternalPoster(url) {
  const head = await fetchWithRetry(url, { method: 'HEAD' });
  if (head.ok && head.status >= 200 && head.status < 300) {
    const ct = String(head.headers['content-type'] || '');
    if (ct.startsWith('image/')) return { valid: true };
    const get = await fetchWithRetry(url, { method: 'GET' });
    if (get.ok && get.buffer) {
      const v = imageManager.validateMagicBytes(get.buffer, get.headers['content-type'] || '');
      return { valid: !!v.valid };
    }
    return { valid: false };
  }
  return { valid: false };
}

function markPoster(id, status, posterUrl, sourceUrl) {
  db.prepare('UPDATE streams SET poster_status = ?, poster_url = ?, poster_source_url = ?, poster_checked_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, posterUrl, sourceUrl || null, id);
}

// ---------------- Processamento de um Item ----------------
async function processItem(item, stats = {}, { createMissingIfNotFound = false } = {}) {
  const classification = classifyPoster(item);

  // 1. Capa local já salva e válida -> manter (nunca baixar novamente)
  if (classification === 'local') {
    const file = findLocalPosterFile(item.type, item.id);
    if (file) {
      markPoster(item.id, 'valid', item.poster_url, item.poster_source_url);
      return 'valid';
    }
  }

  // 2. Capa externa -> validar. Válida: manter. Quebrada: reparar.
  if (classification === 'external') {
    const v = await validateExternalPoster(item.poster_url);
    if (v.valid) {
      markPoster(item.id, 'valid', item.poster_url, item.poster_url);
      return 'valid';
    }
    stats.quebradas = (stats.quebradas || 0) + 1;
    markPoster(item.id, 'broken', item.poster_url, item.poster_url);
  } else if (classification !== 'local') {
    stats.faltantes = (stats.faltantes || 0) + 1;
    markPoster(item.id, 'missing', '', item.poster_source_url);
  }

  // 3. Reparo: procurar capa confiável no TMDB
  const match = await findTrustedPoster(item);
  if (match) {
    const dl = await downloadPosterToLocal(item.type, item.id, match.url);
    if (dl.ok) {
      markPoster(item.id, 'valid', localUrlFor(item.type, item.id), item.poster_source_url || item.poster_url);
      return 'downloaded';
    }
  }

  // 4. Sem resultado externo confiável:
  // Se solicitado criar as que faltam, cria poster local elegante ("se precisar crie essas capas que faltam")
  if (createMissingIfNotFound) {
    const created = createCustomLocalPoster(item.type, item.id, item.name);
    if (created.ok) {
      markPoster(item.id, 'valid', localUrlFor(item.type, item.id), item.poster_source_url || item.poster_url);
      return 'created';
    }
  }

  // Senão, marca como revisão necessária sem aplicar capa incorreta de outro filme
  markPoster(item.id, 'review', item.poster_source_url || item.poster_url || '', item.poster_source_url);
  return 'review';
}

// ---------------- Fila em Lotes (Checkpoint Persistente) ----------------
function pendingItems(limit, afterId) {
  ensureSchema();
  return db.prepare(`
    SELECT id, name, type, poster_url, poster_status, poster_source_url, release_date
    FROM streams
    WHERE type IN ('movie', 'series')
      AND id > ?
      AND (poster_status IS NULL OR poster_status IN ('missing', 'broken'))
    ORDER BY id ASC
    LIMIT ?
  `).all(afterId || 0, limit);
}

// ---------------- Loop de Execução com Concorrência Controlada ----------------
const workerState = {
  status: 'idle',
  lastId: 0,
  stats: loadStats(),
  current: '',
  startedAt: null,
  finishedAt: null,
  lastError: null,
  stopRequested: false,
};

async function runQueue(maxItems = Infinity, { createMissingIfNotFound = false } = {}) {
  workerState.status = 'running';
  workerState.startedAt = workerState.startedAt || Date.now();
  workerState.stopRequested = false;
  let processed = 0;

  while (!workerState.stopRequested && processed < maxItems) {
    const batch = pendingItems(Math.min(BATCH_SIZE, maxItems - processed), workerState.lastId);
    if (!batch.length) break;

    const queue = [...batch];
    async function next() {
      while (queue.length && !workerState.stopRequested) {
        const item = queue.shift();
        workerState.current = item.type + '#' + item.id + ' ' + item.name;
        try {
          const result = await processItem(item, workerState.stats, { createMissingIfNotFound });
          const s = workerState.stats;
          s.analisadas++;
          if (result === 'valid') {
            s.validas++;
          } else if (result === 'downloaded') {
            s.encontradas++;
            s.baixadas++;
          } else if (result === 'created') {
            s.encontradas++;
            s.baixadas++;
          } else if (result === 'review') {
            s.revisao++;
          } else {
            s.semResultado++;
          }
        } catch (e) {
          workerState.stats.falhas++;
          workerState.lastError = e.message;
        }
        processed++;
        workerState.lastId = item.id;
      }
    }

    const concurrency = Math.min(VALIDATE_CONCURRENCY, batch.length);
    const workers = [];
    for (let i = 0; i < concurrency; i++) workers.push(next());
    await Promise.all(workers);

    // Checkpoint por lote: nunca reinicia varredura completa após restart
    saveStats(workerState.stats);
    setState('last_id', workerState.lastId);
  }

  workerState.finishedAt = Date.now();
  workerState.status = workerState.stopRequested ? 'paused' : 'idle';
  saveStats(workerState.stats);
  setState('worker_status', workerState.status);
  return processed;
}

// ---------------- Hook para Novas Importações Futuras (Requisito 16) ----------------
async function onContentImported(itemOrId) {
  ensureSchema();
  const item = typeof itemOrId === 'object' ? itemOrId : db.prepare('SELECT * FROM streams WHERE id = ?').get(itemOrId);
  if (!item || !['movie', 'series'].includes(item.type)) return null;
  return processItem(item, workerState.stats, { createMissingIfNotFound: true });
}

// ---------------- API Pública ----------------
function startScan({ limit, requeueReview, createMissingIfNotFound } = {}) {
  ensureSchema();
  if (workerState.status === 'running') {
    return { success: false, message: 'ImageWorker já está em execução.' };
  }
  if (requeueReview) {
    db.prepare("UPDATE streams SET poster_status = 'missing' WHERE type IN ('movie','series') AND poster_status = 'review'").run();
  }
  const p = runQueue(limit || Infinity, { createMissingIfNotFound: !!createMissingIfNotFound });
  p.catch((e) => {
    workerState.lastError = e.message;
    workerState.status = 'paused';
    setState('worker_status', 'paused');
  });
  return { success: true, message: 'ImageWorker iniciado (retomando do último checkpoint).', fromId: workerState.lastId };
}

function stopScan() {
  workerState.stopRequested = true;
  return { success: true, message: 'Parada solicitada; checkpoint preservado.' };
}

function getStatus() {
  const totals = db.prepare(`
    SELECT
      COUNT(*) total,
      SUM(CASE WHEN poster_status = 'valid' THEN 1 ELSE 0 END) valid,
      SUM(CASE WHEN poster_status = 'review' THEN 1 ELSE 0 END) review,
      SUM(CASE WHEN poster_status IN ('missing', 'broken') THEN 1 ELSE 0 END) pending,
      SUM(CASE WHEN poster_status IS NULL THEN 1 ELSE 0 END) unscanned
    FROM streams WHERE type IN ('movie','series')
  `).get();
  return {
    status: workerState.status,
    current: workerState.current,
    lastId: workerState.lastId,
    stats: workerState.stats,
    totals,
    lastError: workerState.lastError,
  };
}

function getReport() {
  const s = workerState.stats;
  return [
    'CAPAS ANALISADAS: ' + s.analisadas,
    'CAPAS JÁ VÁLIDAS: ' + s.validas,
    'CAPAS FALTANTES: ' + s.faltantes,
    'CAPAS QUEBRADAS: ' + s.quebradas,
    'CAPAS ENCONTRADAS: ' + s.encontradas,
    'CAPAS BAIXADAS: ' + s.baixadas,
    'SEM RESULTADO: ' + s.semResultado,
    'REVISÃO NECESSÁRIA: ' + s.revisao,
    'FALHAS: ' + s.falhas,
  ].join('\n');
}

// ---------------- Inicialização ----------------
function init() {
  ensureSchema();
  workerState.lastId = Number(getState('last_id', 0)) || 0;
  if (getState('worker_status') === 'running') setState('worker_status', 'paused');
  const resumeLoop = setInterval(() => {
    if (workerState.status !== 'idle') return;
    const pending = db.prepare("SELECT COUNT(*) c FROM streams WHERE type IN ('movie','series') AND (poster_status IS NULL OR poster_status IN ('missing','broken'))").get();
    if (pending.c > 0) runQueue(BATCH_SIZE).catch(() => {});
  }, IDLE_RESUME_MS);
  resumeLoop.unref();
}

module.exports = {
  init,
  startScan,
  stopScan,
  getStatus,
  getReport,
  ensureSchema,
  normalizeTitle,
  stripNoise,
  extractYear,
  extractYearFromTitle,
  cleanTitleForSearch,
  isConfidentMatch,
  isPlaceholderUrl,
  findLocalPosterFile,
  createCustomLocalPoster,
  localUrlFor,
  onContentImported,
  runQueue,
  IMAGES_DIR,
  STORAGE_IMAGES_DIR,
  _internal: {
    processItem, classifyPoster, validateExternalPoster, findTrustedPoster,
    similarity, pendingItems, searchTmdbHtml, searchTmdbApi, downloadPosterToLocal,
  },
};
