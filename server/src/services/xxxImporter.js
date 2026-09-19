const path = require('path');
const fs = require('fs');
const db = require('../db/database');

/**
 * XXX (conteúdo adulto) service/helpers.
 *
 * Reúne:
 *  - Regras de visibilidade do pacote XXX (menu + acesso)
 *  - Parser de M3U
 *  - Importação das fontes (pasta local list/XXX + URLs adultiptv)
 */

// Fontes remotas padrão (M3U) usadas na importação.
const DEFAULT_SOURCES = [
  'http://adultiptv.net/chs.m3u',
  'https://xc.adultiptv.net/get.php?username=adultiptv&password=adultiptv&type=m3u',
];

// Nomes de pacote aceitos para liberar o conteúdo adulto.
// 'xxx' é o id usado no painel de revenda; 'adult' é o id legado gravado em algumas contas.
const XXX_PACKAGE_ALIASES = ['xxx', 'xx', 'adult', 'adulto', 'adultos', '18+', '+18', 'porn', 'porno'];

function parsePackages(packages) {
  return (packages || '')
    .toString()
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
}

function hasXxxPackage(packages) {
  const pkgs = parsePackages(packages);
  return pkgs.some((p) => XXX_PACKAGE_ALIASES.includes(p));
}

/**
 * Checagem de acesso à área XXX.
 * - master (ou usuário 'vagner'): sempre liberado
 * - reseller: sempre liberado (para testar e vender o pacote)
 * - client: apenas se o pacote XXX foi marcado na criação/edição da conta
 */
function canAccessXxx(user) {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  const username = (user.username || '').toLowerCase();
  if (role === 'master' || username === 'vagner') return true;
  if (role === 'reseller') return true;
  if (role === 'client') return hasXxxPackage(user.packages);
  return false;
}

// ---------- Parser M3U ----------

function normalizeXXXUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const t = url.trim();
  if (/\.m3u8(\?|$)/i.test(t)) return t;
  if (/\.mp4(\?|$)/i.test(t)) return t;
  // URL genérica estilo Xtream -> prefere .m3u8
  if (!t.endsWith('/') && !t.includes('.')) {
    return `${t}.m3u8`;
  }
  return t;
}

function parseExtinf(line) {
  const nameMatch = line.match(/,(.+)$/);
  const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
  const groupMatch = line.match(/group-title="([^"]+)"/i);
  const langMatch = line.match(/tvg-language="([^"]+)"/i);
  return {
    name: nameMatch ? nameMatch[1].trim() : '',
    logo: logoMatch ? logoMatch[1].trim() : '',
    group: groupMatch ? groupMatch[1].trim() : '',
    lang: langMatch ? langMatch[1].trim() : '',
  };
}

function parseXXXM3U(text, sourceLabel = 'adultiptv') {
  const lines = String(text || '').split(/\r?\n/);
  const items = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      const metadata = parseExtinf(line);
      current = {
        name: metadata.name || '',
        logo: metadata.logo || '',
        group: metadata.group || '',
        lang: metadata.lang || '',
        extinf: line,
      };
      continue;
    }

    if (/^https?:\/\//i.test(line)) {
      // URL sem EXTINF antes: normalmente sobra de lista cortada. Ignorada.
      if (!current) continue;
      current.url = normalizeXXXUrl(line);
      current.source = sourceLabel;
      // Heurística: VOD normalmente termina em mp4/mkv/mpd
      const isLikelyVod = /\.(mp4|mkv|mpd|mov|avi|m4v)(\?|$)/i.test(current.url);
      current.type = isLikelyVod ? 'movie' : 'live';
      items.push({ ...current });
      current = null;
      continue;
    }
  }

  return items;
}

// ---------- HTTP ----------

function fetchText(url, timeoutMs = 12000) {
  return new Promise((resolve) => {
    let redirects = 0;
    const attempt = (cur) => {
      let target;
      try { target = new URL(cur); } catch (e) { return resolve(null); }
      const mod = target.protocol === 'https:' ? require('https') : require('http');
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
        'Connection': 'close',
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
        if (res.statusCode < 200 || res.statusCode >= 400) {
          res.resume();
          return resolve(null);
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
      req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    };
    attempt(url);
  });
}

// ---------- Fontes locais ----------

function defaultLocalDir() {
  return process.env.XXX_LIST_DIR || path.resolve(__dirname, '../../../list/XXX');
}

/**
 * Varre a pasta list/XXX recursivamente (as listas costumam vir em subpastas,
 * ex: list/XXX/<hash>/Canais Adultos.m3u).
 */
function collectLocalM3UFiles(dir = defaultLocalDir(), maxDepth = 4) {
  const files = [];
  let totalBytes = 0;

  const walk = (currentDir, depth) => {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      try {
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (entry.isFile() && /\.m3u8?$/i.test(entry.name)) {
          try { totalBytes += fs.statSync(fullPath).size; } catch (e) { /* ignore */ }
          files.push(fullPath);
        }
      } catch (e) { /* ignore */ }
    }
  };

  walk(dir, 0);
  return { files, totalBytes };
}

function ensureXxxCategory() {
  let cat = db.prepare("SELECT id FROM categories WHERE name = 'XXX' AND type = 'live'").get();
  if (!cat) {
    const result = db.prepare("INSERT INTO categories (name, type, order_num) VALUES ('XXX', 'live', 9999)").run();
    cat = { id: result.lastInsertRowid };
  }
  return cat.id;
}

function isXxxCategoryName(name) {
  if (!name) return false;
  const n = String(name).toLowerCase();
  return n.includes('xxx') || n.includes('adult') || n.includes('+18') || n.includes('18+');
}

/** Total de itens XXX no catálogo. */
function countXxxCatalog() {
  try {
    const row = db.prepare(`
      SELECT COUNT(*) as total
      FROM streams s
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.type IN ('live', 'movie')
        AND (
          c.name = 'XXX' OR c.name = 'Adultos' OR c.name LIKE '%XXX%' OR c.name LIKE '%Adulto%'
        )
    `).get();
    return row ? row.total : 0;
  } catch (e) {
    return 0;
  }
}

/**
 * Importa as listas XXX (pasta local + URLs remotas) para o catálogo.
 * @param {{extraUrls?: string[], dryRun?: boolean, includeDefaults?: boolean, localDir?: string}} options
 */
async function importXxxSources(options = {}) {
  const extraUrls = Array.isArray(options.extraUrls) ? options.extraUrls.filter(Boolean) : [];
  const dryRun = !!options.dryRun;
  const includeDefaults = options.includeDefaults !== false;
  const localDir = options.localDir || defaultLocalDir();

  const { files: localFiles, totalBytes: localFilesTotalSizeBytes } = collectLocalM3UFiles(localDir);

  const allSources = [
    // Pasta local primeiro: é rápida e determinística (não depende de rede).
    ...localFiles.map((f) => ({ url: `file://${f}`, kind: 'local' })),
    ...(includeDefaults ? DEFAULT_SOURCES.map((u) => ({ url: u, kind: 'remote' })) : []),
    ...extraUrls.map((u) => ({ url: u, kind: 'remote' })),
  ];

  if (allSources.length === 0) {
    return {
      ok: false,
      error: 'Nenhuma origem configurada para importação XXX.',
      sourcesProcessed: 0,
      inserted: 0,
      skipped: 0,
      errors: 0,
      localFilesCount: 0,
      localFilesTotalBytes: 0,
    };
  }

  // Proteção contra pastas gigantes
  const LOCAL_IMPORT_LIMIT_BYTES = Number(process.env.XXX_LOCAL_IMPORT_LIMIT_BYTES) || 50 * 1024 * 1024;
  if (localFilesTotalSizeBytes > LOCAL_IMPORT_LIMIT_BYTES && !dryRun) {
    return {
      ok: false,
      error: `A pasta list/XXX tem ${Math.round(localFilesTotalSizeBytes / 1024 / 1024)}MB de M3U, acima do limite de ${Math.round(LOCAL_IMPORT_LIMIT_BYTES / 1024 / 1024)}MB. Aumente XXX_LOCAL_IMPORT_LIMIT_BYTES.`,
      localBytes: localFilesTotalSizeBytes,
      limitBytes: LOCAL_IMPORT_LIMIT_BYTES,
      sourcesProcessed: 0,
      inserted: 0,
      skipped: 0,
      errors: 0,
      localFilesCount: localFiles.length,
      localFilesTotalBytes: localFilesTotalSizeBytes,
    };
  }

  const categoryId = dryRun ? null : ensureXxxCategory();
  const existingStmt = db.prepare('SELECT id FROM streams WHERE LOWER(name) = LOWER(?) AND stream_url = ?');
  const insertStmt = dryRun ? null : db.prepare(`
    INSERT INTO streams (name, category_id, type, stream_url, icon_url, poster_url, description, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'online')
  `);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  let sourcesProcessed = 0;
  const seen = new Set();

  for (const src of allSources) {
    let text = null;
    if (src.url.startsWith('file://')) {
      try {
        text = fs.readFileSync(src.url.slice(7), 'utf8');
      } catch (e) {
        errors++;
        continue;
      }
    } else {
      text = await fetchText(src.url);
      if (!text) {
        errors++;
        continue;
      }
    }
    sourcesProcessed++;

    const items = parseXXXM3U(text, src.url);
    for (const it of items) {
      if (!it.name || !it.url) continue;
      const key = `${it.name.toLowerCase().trim()}|${it.url.toLowerCase().trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (dryRun) { inserted++; continue; }

      const existing = existingStmt.get(it.name, it.url);
      if (existing) {
        skipped++;
        continue;
      }

      insertStmt.run(
        String(it.name).slice(0, 200),
        categoryId,
        it.type || 'live',
        it.url,
        it.logo || '',
        it.logo || '',
        it.group ? `Grupo: ${it.group}` : '',
      );
      inserted++;
    }
  }

  if (!dryRun) {
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('xxx_last_import_at', datetime('now'))").run();
  }

  return {
    ok: true,
    dryRun,
    sourcesProcessed,
    inserted,
    skipped,
    errors,
    localFilesCount: localFiles.length,
    localFilesTotalBytes: localFilesTotalSizeBytes,
    message: dryRun
      ? `Dry-run concluído: ${inserted} novos itens seriam inseridos e ${skipped} ignorados.`
      : `Importação XXX concluída. ${inserted} novos itens adicionados e ${skipped} já existentes ignorados.`,
  };
}
module.exports = {
  DEFAULT_SOURCES,
  XXX_PACKAGE_ALIASES,
  parsePackages,
  hasXxxPackage,
  canAccessXxx,
  normalizeXXXUrl,
  parseExtinf,
  parseXXXM3U,
  fetchText,
  defaultLocalDir,
  collectLocalM3UFiles,
  ensureXxxCategory,
  isXxxCategoryName,
  countXxxCatalog,
  importXxxSources,
};