/**
 * channelListSyncService.js
 * Módulo de Atualização Automática de Listas IPTV (Web + Arquivos Locais).
 *
 * Funcionalidades:
 *  1. Busca canais atualizados em repositórios curados da Web (Brasil, Portugal,
 *     Notícias, Esportes, Filmes, Infantis, Documentários).
 *  2. Lê e processa todas as listas da pasta ./list (incluindo o documento Scribd
 *     912519178 e links de listas externas contidos em anotações como 504123486).
 *  3. Desencurta links (bit.ly, ow.ly, tinyurl) e recupera URLs de destino real.
 *  4. Faz probe ativo e rigoroso em cada stream (seguindo redirecionamentos,
 *     verificando MIME de mídia/HLS e rejeitando HTML de login/erro).
 *  5. Atualiza o banco de dados iptv.db:
 *     - Reativa canais offline com novas fontes funcionais.
 *     - Atualiza URLs de canais quebrados.
 *     - Cadastra novos canais em suas respectivas categorias com logo e metadados.
 *     - Remove duplicatas e rótulos genéricos.
 *  6. Pode ser executado em segundo plano periodicamente pelo scheduler,
 *     sob demanda via API Admin ou via CLI.
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const zlib = require('zlib');

const DB_PATH = path.join(__dirname, '../../data/iptv.db');
const LIST_DIR = path.join(__dirname, '../../../list');

// Fontes curadas e verificadas da Web (Foco em canais brasileiros, latinos e internacionais essenciais)
const WEB_SOURCES = [
  { name: 'IPTV-ORG Brasil', url: 'https://iptv-org.github.io/iptv/countries/br.m3u', defaultCategory: 'Canais Abertos HD' },
  { name: 'IPTV-ORG Esportes', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u', defaultCategory: 'Esportes & PPV' },
  { name: 'IPTV-ORG Notícias', url: 'https://iptv-org.github.io/iptv/categories/news.m3u', defaultCategory: 'Notícias & Jornalismo' },
  { name: 'IPTV-ORG Filmes', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u', defaultCategory: 'Cinema & Séries Ao Vivo' },
  { name: 'IPTV-ORG Infantis', url: 'https://iptv-org.github.io/iptv/categories/kids.m3u', defaultCategory: 'Infantis & Desenhos' },
  { name: 'IPTV-ORG Documentários', url: 'https://iptv-org.github.io/iptv/categories/documentary.m3u', defaultCategory: 'Documentários & Ciência' },
  { name: 'IPTV-ORG América Latina', url: 'https://iptv-org.github.io/iptv/regions/latam.m3u', defaultCategory: 'Variedades & Entretenimento' },
  { name: 'IPTV-ORG Portugal', url: 'https://iptv-org.github.io/iptv/countries/pt.m3u', defaultCategory: 'Variedades & Entretenimento' },
];

const MEDIA_MIME = /mpegurl|mp2t|mp4|matroska|webm|octet-stream|video\/|audio\/|x-mpegurl/i;
const BLOCKED_MIME = /text\/html|application\/json|xhtml/i;
const GENERIC_NAME = /^iptvtools[_\-\s]?\d+$/i;
const VOD_EXTENSION = /\.(mkv|mp4|avi|m4v|mov|wmv|flv|mpg|mpeg|webm|ogv|3gp)(\?|$)/i;
const URL_NOISE = /^(www|com|br|net|org|tv|live|lives|hls|dash|stream|streams|streaming|playlist|index|chunks|chunklist|master|media|video|audio|smil|dai|items|liveevent|manifest|mono|cdn|cdn\d+|m3u8?|ts|mp4|avi|event|events|account|accounts|[a-z]?\d+|[a-z]{1,2})$/i;

const FALLBACK_LIVE_ICON = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/OOjs_UI_icon_play.svg/512px-OOjs_UI_icon_play.svg.png';
const FALLBACK_LIVE_POSTER = 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=1280&h=720&fit=crop';

// Estado global de sincronização
const syncState = {
  state: 'idle', // 'idle' | 'running' | 'completed' | 'error'
  startedAt: null,
  completedAt: null,
  progress: {
    current: 0,
    total: 0,
    step: 'Inativo',
  },
  lastReport: null,
  error: null,
};

function getSyncStatus() {
  return { ...syncState };
}

// Utilitários de rede e formatação
function fixUrl(raw) {
  let url = String(raw || '')
    .replace(/[\u0000-\u001f\s]+/g, '')
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/g, '&')
    .replace(/&quot;/gi, '"')
    .replace(/[),.;]+$/, '');
  if (!/^https?:\/\//i.test(url)) return '';
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return '';
    return parsed.href;
  } catch (e) {
    return '';
  }
}

function normalizeName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\b(fhd|uhd|4k|hd|sd|fullhd|full|h265|hevc|h264|multi|backup|opc|opcao|\d+p)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function deriveNameFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return '';
  }

  const tokens = `${parsed.hostname} ${parsed.pathname}`
    .split(/[\/._\-+]+/)
    .map((token) => {
      let t = token.replace(/\.(m3u8?|ts|mp4|avi)$/i, '');
      let previous;
      do {
        previous = t;
        t = t.replace(/^(?:iptv|live|hls|video|web|tv)/i, '').replace(/(?:tv|hd|hls|live)$/i, '');
      } while (t !== previous);
      return t.trim().toLowerCase();
    })
    .filter((p) => p.length >= 3 && !URL_NOISE.test(p) && !/^\d+$/.test(p) && !/^[0-9a-f]{16,}$/i.test(p));

  if (tokens.length === 0) return '';
  const best = tokens.reduce((a, b) => (b.length > a.length ? b : a), tokens[0]);
  return best
    .replace(/([a-z])(\d+)/gi, '$1 $2')
    .split(' ')
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

const CATEGORY_RULES = [
  { re: /esporte|sport|espn|premiere|combate|dazn|nba|nfl|futebol|football|sportv|eurosport|bandsports|conmebol/i, name: 'Esportes & PPV' },
  { re: /noticia|news|jornal|cnn|bbc|band news|euronews|globonews|bloomberg|dw |france 24|record news|jovem pan/i, name: 'Notícias & Jornalismo' },
  { re: /infantil|kids|cartoon|disney|nick|gloob|desenho|anime|baby|topper|boomerang/i, name: 'Infantis & Desenhos' },
  { re: /document|discovery|history|natgeo|nat geo|ciencia|animal planet|smithsonian|travel|investigacao/i, name: 'Documentários & Ciência' },
  { re: /religio|gospel|crist|igreja|deus|evangel|catolic|santa|padre|israel|canção nova|aparecida|redetv|boa vontade/i, name: 'Religiosos' },
  { re: /filme|movie|cinema|telecine|hbo|max|paramount|megapix|warner|sony|space|tnt|universal|axn/i, name: 'Cinema & Séries Ao Vivo' },
  { re: /band|globo|sbt|record|cultura|aberta|tv brasil|canal gov|senado|camara|educativa|futura|gazeta/i, name: 'Canais Abertos HD' },
  { re: /m[uú]sica|music|mtv|bis|multishow|viva|arte|comedy|e!|lifetime/i, name: 'Variedades & Entretenimento' },
];

function guessCategory(name, fallback = 'Variedades & Entretenimento') {
  const clean = String(name || '');
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(clean)) return rule.name;
  }
  return fallback;
}

/**
 * Busca conteúdo texto de uma URL (com suporte a redirect e descompressão gzip/deflate)
 */
function fetchHttpText(targetUrl, timeoutMs = 12000) {
  return new Promise((resolve) => {
    let redirects = 0;
    const attempt = (cur) => {
      let target;
      try { target = new URL(cur); } catch (e) { return resolve(null); }
      const mod = target.protocol === 'https:' ? https : http;
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate',
      };
      const req = mod.get(target, { headers, timeout: timeoutMs }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
          redirects++;
          res.resume();
          try {
            const next = new URL(res.headers.location, target).href;
            return attempt(next);
          } catch (e) { return resolve(null); }
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return resolve(null);
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          let buf = Buffer.concat(chunks);
          const enc = (res.headers['content-encoding'] || '').toLowerCase();
          if (enc.includes('gzip')) {
            try { buf = zlib.gunzipSync(buf); } catch (e) {}
          } else if (enc.includes('deflate')) {
            try { buf = zlib.inflateSync(buf); } catch (e) {}
          }
          resolve(buf.toString('utf8'));
        });
      });
      req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    };
    attempt(targetUrl);
  });
}

/**
 * Faz probe ativo em um stream verificando se retorna mídia/playlist de verdade
 */
function probeStream(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const started = Date.now();
    let redirects = 0;

    const attempt = (current, customUa = null) => {
      let target;
      try {
        target = new URL(current);
      } catch (e) {
        return resolve({ ok: false, status: 0, reason: 'url-invalida' });
      }

      if (target.protocol !== 'http:' && target.protocol !== 'https:') {
        return resolve({ ok: false, status: 0, reason: 'protocolo-invalido' });
      }

      const mod = target.protocol === 'https:' ? https : http;
      const isPlaylist = /\.m3u8?(\?|$)/i.test(target.href) || /playlist/i.test(target.pathname);
      const userAgent = customUa || 'IPTVSmartersPro';
      const headers = {
        'User-Agent': userAgent,
        Accept: '*/*',
        'Accept-Encoding': 'identity',
      };
      if (!isPlaylist) headers.Range = 'bytes=0-2047';

      let req;
      try {
        req = mod.get(target, { headers, family: 4, timeout: timeoutMs }, (res) => {
        const status = res.statusCode || 0;

        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirects < 5) {
          redirects += 1;
          res.resume();
          let next;
          try {
            next = new URL(res.headers.location, target).href;
          } catch (e) {
            return resolve({ ok: false, status, reason: 'redirect-invalido' });
          }
          return attempt(next, customUa);
        }

        // Se der 403 e ainda não tentamos Chrome UA, tenta uma vez
        if ((status === 401 || status === 403) && !customUa) {
          res.resume();
          return attempt(current, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36');
        }

        const contentType = String(res.headers['content-type'] || '').toLowerCase();

        if (status < 200 || status >= 300) {
          res.resume();
          return resolve({ ok: false, status, reason: `http-${status}`, contentType, ms: Date.now() - started });
        }
        if (BLOCKED_MIME.test(contentType)) {
          res.resume();
          return resolve({ ok: false, status, reason: 'html-ou-json', contentType, ms: Date.now() - started });
        }

        const chunks = [];
        let bytes = 0;
        res.on('data', (chunk) => {
          if (bytes < 2048) {
            chunks.push(chunk);
            bytes += chunk.length;
          } else {
            res.destroy();
          }
        });

        const finish = () => {
          const head = Buffer.concat(chunks).toString('utf8', 0, Math.min(64, bytes));
          const isPlaylistBody = /#EXTM3U/i.test(head.replace(/^\uFEFF/, '').trim());
          const mediaPath = /\.(ts|mp4|mkv|m4v|m4a|aac|mp3|webm|mpd|m3u8?)(\?|$)/i.test(target.pathname);
          const ok = isPlaylistBody || MEDIA_MIME.test(contentType) || (mediaPath && !contentType);
          resolve({
            ok,
            status,
            reason: ok ? 'ok' : `conteudo-${contentType || 'desconhecido'}`,
            contentType,
            finalUrl: target.href,
            ms: Date.now() - started,
          });
        };
        res.on('end', finish);
        res.on('close', finish);
      });

        req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, status: 0, reason: 'timeout', ms: Date.now() - started }); });
        req.on('error', (err) => resolve({ ok: false, status: 0, reason: err.code || 'erro-rede', ms: Date.now() - started }));
      } catch (err) {
        return resolve({ ok: false, status: 0, reason: err.message, ms: Date.now() - started });
      }
    };

    attempt(url);
  });
}

/**
 * Parser de texto M3U tolerante a quebras de linhas, entidades e atributos
 */
function parseM3uText(text, sourceTag = 'm3u') {
  const lines = String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u000c/g, '\n')
    .split('\n');

  const entries = [];
  let pending = null;

  const flush = () => {
    if (!pending) return;
    const url = fixUrl(pending.url);
    if (pending.name && url && !VOD_EXTENSION.test(url)) {
      let name = pending.name;
      if (GENERIC_NAME.test(name)) {
        name = deriveNameFromUrl(url);
      }
      if (name) {
        entries.push({
          name: name.trim(),
          url,
          logo: pending.logo || '',
          group: pending.group || '',
          sourceTag,
        });
      }
    }
    pending = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^#EXTINF/i.test(line)) {
      flush();
      pending = { name: '', url: '', logo: '', group: '' };

      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      if (logoMatch) pending.logo = logoMatch[1].trim();

      const groupMatch = line.match(/group-title="([^"]*)"/i);
      if (groupMatch) pending.group = groupMatch[1].trim();

      const nameMatch = line.match(/,(.*)$/);
      if (nameMatch) {
        pending.name = nameMatch[1].replace(/\[[^\]]*\]/g, '').trim();
      }
      continue;
    }

    if (line.startsWith('#')) continue;
    if (!pending) continue;
    pending.url += line;
  }
  flush();

  return entries;
}

/**
 * Coleta todos os canais de fontes locais (pasta ./list) e fontes web curadas
 */
async function collectAllEntries(onProgress) {
  const allEntries = [];

  // 1. Arquivos locais em ./list
  if (fs.existsSync(LIST_DIR)) {
    const files = fs.readdirSync(LIST_DIR).filter(f => /\.(txt|m3u|m3u8)$/i.test(f));
    for (const file of files) {
      if (onProgress) onProgress(`Lendo arquivo local: ${file}`);
      const filePath = path.join(LIST_DIR, file);
      const text = fs.readFileSync(filePath, 'utf8');

      // Se for M3U estruturado (ex: 912519178 ou 396750820)
      if (/#EXTINF/i.test(text)) {
        const parsed = parseM3uText(text, file);
        allEntries.push(...parsed);
      } else {
        // Se for arquivo de anotações com links de listas externas (ex: 504123486)
        const urls = [...new Set(text.match(/https?:\/\/[^\s\)\"\'\<\>]+/gi) || [])];
        const rawPlaylists = urls.filter(u =>
          /\.(m3u8?|txt)$/i.test(u) ||
          u.includes('pastebin.com/raw/') ||
          u.includes('gitlab.com/') ||
          u.includes('raw.githubusercontent.com')
        );

        if (onProgress) onProgress(`Baixando links externos do bloco de notas...`);
        const fetches = rawPlaylists.slice(0, 20).map(async (pUrl) => {
          try {
            const externalContent = await fetchHttpText(pUrl, 3500);
            if (externalContent && /#EXTINF/i.test(externalContent)) {
              return parseM3uText(externalContent, `bloco-${path.basename(pUrl)}`);
            }
          } catch (e) {}
          return [];
        });
        const batchResults = await Promise.all(fetches);
        batchResults.forEach((arr) => allEntries.push(...arr));
      }
    }
  }

  // 2. Fontes Curadas da Web
  for (const src of WEB_SOURCES) {
    if (onProgress) onProgress(`Baixando fonte web: ${src.name}...`);
    try {
      const webText = await fetchHttpText(src.url, 15000);
      if (webText && /#EXTINF/i.test(webText)) {
        const parsed = parseM3uText(webText, src.name);
        parsed.forEach(p => {
          if (!p.group) p.group = src.defaultCategory;
        });
        allEntries.push(...parsed);
      }
    } catch (err) {
      console.warn(`[SyncModule] Aviso ao buscar ${src.name}:`, err.message);
    }
  }

  // Desduplica por nome normalizado + URL
  const seen = new Set();
  const unique = [];
  for (const item of allEntries) {
    const key = `${normalizeName(item.name)}|${item.url}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

/**
 * Executa probes em lote com paralelismo controlado
 */
async function probeBatch(items, concurrency = 20, timeoutMs = 6000, onProgress) {
  const results = new Array(items.length);
  let index = 0;
  let completed = 0;

  const worker = async () => {
    while (true) {
      const i = index++;
      if (i >= items.length) break;
      results[i] = await probeStream(items[i].url, timeoutMs);
      completed++;
      if (onProgress && (completed % 25 === 0 || completed === items.length)) {
        onProgress(completed, items.length);
      }
    }
  };

  const workers = [];
  const limit = Math.min(concurrency, items.length || 1);
  for (let w = 0; w < limit; w++) workers.push(worker());
  await Promise.all(workers);

  return results;
}

/**
 * Aplica as atualizações no banco de dados SQLite
 */
function applySyncToDatabase(workingItems, options = {}) {
  const Database = require('../../node_modules/better-sqlite3');
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Banco de dados não encontrado em: ${DB_PATH}`);
  }

  // Cria backup antes de gravar
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupTarget = path.join(path.dirname(DB_PATH), `iptv.db.before_auto_sync.${stamp}`);
  try {
    fs.copyFileSync(DB_PATH, backupTarget);
    console.log(`[SyncModule] 💾 Backup criado: ${path.basename(backupTarget)}`);
  } catch (e) {
    console.warn('[SyncModule] Aviso ao criar backup:', e.message);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const now = new Date().toISOString();

  // Limpa rótulos genéricos do Scribd gravados anteriormente ("iptvtools_*")
  db.prepare("DELETE FROM streams WHERE type = 'live' AND name GLOB 'iptvtools_*'").run();

  // Remove duplicatas exatas de URL já existentes
  db.prepare(`
    DELETE FROM streams
    WHERE type = 'live'
      AND id NOT IN (SELECT MIN(id) FROM streams WHERE type = 'live' GROUP BY stream_url)
  `).run();

  const existingRows = db.prepare("SELECT id, name, stream_url, status, icon_url, category_id FROM streams WHERE type='live'").all();
  const byName = new Map();
  const usedUrls = new Set();

  for (const row of existingRows) {
    const key = normalizeName(row.name);
    if (key && !byName.has(key)) byName.set(key, row);
    if (row.stream_url) usedUrls.add(row.stream_url);
  }

  const findCategory = db.prepare('SELECT id FROM categories WHERE name = ? AND type = ?');
  const insertCategory = db.prepare("INSERT INTO categories (name, type, order_num) VALUES (?, 'live', ?)");
  const insertStream = db.prepare(`
    INSERT INTO streams (name, category_id, type, stream_url, icon_url, poster_url, description, rating, release_date, status, last_check)
    VALUES (?, ?, 'live', ?, ?, ?, ?, '8.5', '2024', 'online', ?)
  `);
  const updateStream = db.prepare(`
    UPDATE streams
    SET stream_url = ?, status = 'online', last_check = ?, icon_url = COALESCE(NULLIF(?, ''), icon_url), category_id = COALESCE(category_id, ?)
    WHERE id = ?
  `);
  const touchOnline = db.prepare("UPDATE streams SET status = 'online', last_check = ? WHERE id = ?");

  const categoryCache = new Map();
  const getCategoryId = (name) => {
    if (categoryCache.has(name)) return categoryCache.get(name);
    const found = findCategory.get(name, 'live');
    const id = found ? found.id : insertCategory.run(name, 90).lastInsertRowid;
    categoryCache.set(name, id);
    return id;
  };

  const stats = { inseridos: 0, atualizados: 0, ja_ok: 0, ignorados_duplicados: 0 };

  db.transaction(() => {
    for (const item of workingItems) {
      const key = normalizeName(item.name);
      const current = key ? byName.get(key) : null;
      const targetCat = getCategoryId(guessCategory(item.name, item.group || 'Variedades & Entretenimento'));
      const targetIcon = item.logo || FALLBACK_LIVE_ICON;

      if (current) {
        if (current.stream_url === item.finalUrl) {
          touchOnline.run(now, current.id);
          stats.ja_ok += 1;
        } else if (usedUrls.has(item.finalUrl)) {
          touchOnline.run(now, current.id);
          stats.ignorados_duplicados += 1;
        } else {
          // Atualiza com o novo stream que está comprovadamente funcionando
          updateStream.run(item.finalUrl, now, targetIcon, targetCat, current.id);
          usedUrls.add(item.finalUrl);
          stats.atualizados += 1;
        }
        continue;
      }

      if (usedUrls.has(item.finalUrl)) {
        stats.ignorados_duplicados += 1;
        continue;
      }

      insertStream.run(
        item.name,
        targetCat,
        item.finalUrl,
        targetIcon,
        FALLBACK_LIVE_POSTER,
        `Sincronizado automaticamente via Web/List em ${now.slice(0, 10)}.`,
        now,
      );
      usedUrls.add(item.finalUrl);
      if (key) byName.set(key, { id: -1, name: item.name, stream_url: item.finalUrl, status: 'online' });
      stats.inseridos += 1;
    }
  })();

  const summary = db.prepare("SELECT status, COUNT(*) AS total FROM streams WHERE type='live' GROUP BY status ORDER BY status").all();
  db.close();

  return { stats, summary };
}

/**
 * Função principal pública de sincronização
 */
async function syncAllChannels(options = {}) {
  if (syncState.state === 'running') {
    return { ok: false, message: 'Uma sincronização já está em andamento.' };
  }

  syncState.state = 'running';
  syncState.startedAt = new Date().toISOString();
  syncState.completedAt = null;
  syncState.error = null;
  syncState.progress = { current: 0, total: 0, step: 'Coletando fontes...' };

  const concurrency = options.concurrency || 35;
  const timeoutMs = options.timeoutMs || 4500;
  const apply = options.apply !== false;

  try {
    console.log('[SyncModule] 🚀 Iniciando sincronização automática de listas...');
    const allEntries = await collectAllEntries((step) => {
      syncState.progress.step = step;
      console.log(`[SyncModule] ${step}`);
    });

    console.log(`[SyncModule] 📋 ${allEntries.length} canais coletados para verificação.`);
    syncState.progress = { current: 0, total: allEntries.length, step: 'Verificando integridade dos streams...' };

    const probeResults = await probeBatch(allEntries, concurrency, timeoutMs, (cur, tot) => {
      syncState.progress.current = cur;
      syncState.progress.total = tot;
      if (cur % 50 === 0 || cur === tot) {
        process.stdout.write(`\r[SyncModule] ⏳ Verificando streams: ${cur}/${tot} (${Math.round((cur / tot) * 100)}%)...`);
      }
    });
    process.stdout.write('\n');

    const working = [];
    allEntries.forEach((entry, i) => {
      const res = probeResults[i];
      if (res && res.ok) {
        working.push({
          ...entry,
          finalUrl: res.finalUrl || entry.url,
          status: res.status,
          latency: res.ms,
        });
      }
    });

    console.log(`[SyncModule] ✅ Streams ativos e validados: ${working.length}/${allEntries.length}`);

    let dbResult = null;
    if (apply && working.length > 0) {
      syncState.progress.step = 'Gravando alterações no catálogo...';
      dbResult = applySyncToDatabase(working, options);
      console.log('[SyncModule] 💾 Atualização gravada com sucesso no banco de dados.');
    }

    const report = {
      timestamp: new Date().toISOString(),
      totalColetados: allEntries.length,
      totalAtivos: working.length,
      dbResult,
    };

    syncState.state = 'completed';
    syncState.completedAt = new Date().toISOString();
    syncState.progress.step = 'Concluído com sucesso';
    syncState.lastReport = report;

    return { ok: true, report };
  } catch (err) {
    console.error('[SyncModule] ❌ Erro durante a sincronização:', err);
    syncState.state = 'error';
    syncState.error = err.message;
    syncState.progress.step = `Erro: ${err.message}`;
    return { ok: false, error: err.message };
  }
}

// Suporte para execução via CLI direta
if (require.main === module) {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  console.log('Executando módulo de sincronização em modo CLI (apply =', apply, ')...');
  syncAllChannels({ apply }).then((res) => {
    console.log('Resultado final:', JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 1);
  });
}

module.exports = {
  syncAllChannels,
  getSyncStatus,
  collectAllEntries,
  probeStream,
  parseM3uText,
};
