// ============================================================
// VSAIPTV IMAGE MANAGER
// Cache Persistente em Disco + Validação Real (Magic Bytes) +
// Cache Negativo + Proteção SSRF + Fallbacks Visuais
// ============================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const db = require('../db/database');

const BASE_CACHE_DIR = path.join(__dirname, '../../data/image-cache');
const NEGATIVE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const REQUEST_TIMEOUT_MS = 10000; // 10s

// Extensões permitidas e suas assinaturas (Magic Bytes)
const MAGIC_BYTES = {
  jpeg: [0xFF, 0xD8, 0xFF],
  png: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  gif: [0x47, 0x49, 0x46, 0x38],
  webp: { riff: [0x52, 0x49, 0x46, 0x46], webp: [0x57, 0x45, 0x42, 0x50] },
};

// Mapeamento de tipos permitidos
const VALID_MEDIA_TYPES = ['channel', 'movie', 'series', 'episode', 'backdrop'];

// Garante que a estrutura de diretórios exista
function ensureDirs() {
  for (const t of [...VALID_MEDIA_TYPES, 'fallbacks']) {
    const d = path.join(BASE_CACHE_DIR, t);
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
    }
  }
}
ensureDirs();

// Normalizar URL para cálculo de hash
function normalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let u = rawUrl.trim();
  // Normalização para Wikimedia
  if (u.includes('upload.wikimedia.org') && u.includes('/512px-')) {
    u = u.replace(/\/512px-/g, '/960px-');
  }
  return u;
}

// Calcular Hash SHA-256
function getUrlHash(url) {
  return crypto.createHash('sha256').update(normalizeUrl(url)).digest('hex');
}

// Validar assinatura binária do buffer da imagem
function validateMagicBytes(buffer, contentType) {
  if (!buffer || buffer.length < 4) return { valid: false, reason: 'Arquivo vazio ou muito curto' };

  // SVG (texto)
  if (contentType && contentType.includes('svg')) {
    const head = buffer.slice(0, 1024).toString('utf8').trim().toLowerCase();
    if (head.includes('<svg') || head.includes('<?xml')) {
      return { valid: true, ext: 'svg', mime: 'image/svg+xml' };
    }
    return { valid: false, reason: 'Payload SVG inválido' };
  }

  // PNG
  if (
    buffer[0] === MAGIC_BYTES.png[0] &&
    buffer[1] === MAGIC_BYTES.png[1] &&
    buffer[2] === MAGIC_BYTES.png[2] &&
    buffer[3] === MAGIC_BYTES.png[3]
  ) {
    return { valid: true, ext: 'png', mime: 'image/png' };
  }

  // JPEG
  if (
    buffer[0] === MAGIC_BYTES.jpeg[0] &&
    buffer[1] === MAGIC_BYTES.jpeg[1] &&
    buffer[2] === MAGIC_BYTES.jpeg[2]
  ) {
    return { valid: true, ext: 'jpg', mime: 'image/jpeg' };
  }

  // WebP: starts with 'RIFF' and contains 'WEBP' at byte 8..12
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer.length >= 12 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return { valid: true, ext: 'webp', mime: 'image/webp' };
  }

  // GIF
  if (
    buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38
  ) {
    return { valid: true, ext: 'gif', mime: 'image/gif' };
  }

  // Se Content-Type for image/* mas formato não for padrão reconhecido, rejeitar se for HTML/JSON
  const headStr = buffer.slice(0, 200).toString('utf8').trim().toLowerCase();
  if (headStr.startsWith('<!doctype html') || headStr.startsWith('<html') || headStr.startsWith('{')) {
    return { valid: false, reason: 'Servidor retornou HTML/JSON em vez de imagem binária' };
  }

  return { valid: false, reason: 'Assinatura binária de imagem desconhecida' };
}

// Determinar subdiretório baseado no media_type
function getSubdir(mediaType) {
  if (VALID_MEDIA_TYPES.includes(mediaType)) return mediaType;
  if (mediaType === 'channels') return 'channel';
  if (mediaType === 'movies') return 'movie';
  return 'channel';
}

// Consultar registro na tabela image_cache
function getCacheRecord(urlHash) {
  return db.prepare('SELECT * FROM image_cache WHERE url_hash = ?').get(urlHash);
}

// Atualizar acesso (debounced em memória para performance)
const accessUpdateQueue = new Set();
setInterval(() => {
  if (accessUpdateQueue.size === 0) return;
  const hashes = Array.from(accessUpdateQueue);
  accessUpdateQueue.clear();
  try {
    const updateStmt = db.prepare(`
      UPDATE image_cache 
      SET access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP 
      WHERE url_hash = ?
    `);
    db.transaction(() => {
      for (const h of hashes) updateStmt.run(h);
    })();
  } catch (e) {}
}, 5000).unref();

function recordAccess(urlHash) {
  accessUpdateQueue.add(urlHash);
}

// Gravar sucesso no cache
function saveCacheSuccess(urlHash, sourceUrl, localRelPath, contentType, sizeBytes, mediaType, httpStatus) {
  const existing = db.prepare('SELECT url_hash FROM image_cache WHERE url_hash = ?').get(urlHash);
  if (existing) {
    db.prepare(`
      UPDATE image_cache 
      SET local_path = ?, content_type = ?, size_bytes = ?, media_type = ?,
          status = 'cached', http_status = ?, last_checked = CURRENT_TIMESTAMP,
          access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP
      WHERE url_hash = ?
    `).run(localRelPath, contentType, sizeBytes, mediaType, httpStatus, urlHash);
  } else {
    db.prepare(`
      INSERT INTO image_cache (
        url_hash, source_url, local_path, content_type, size_bytes, media_type,
        status, http_status, last_checked, access_count, last_accessed
      ) VALUES (?, ?, ?, ?, ?, ?, 'cached', ?, CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP)
    `).run(urlHash, sourceUrl, localRelPath, contentType, sizeBytes, mediaType, httpStatus);
  }
}

// Gravar cache negativo (falha / broken)
function saveNegativeCache(urlHash, sourceUrl, mediaType, httpStatus) {
  const existing = db.prepare('SELECT url_hash FROM image_cache WHERE url_hash = ?').get(urlHash);
  if (existing) {
    db.prepare(`
      UPDATE image_cache 
      SET status = 'broken', http_status = ?, last_checked = CURRENT_TIMESTAMP
      WHERE url_hash = ?
    `).run(httpStatus || 502, urlHash);
  } else {
    db.prepare(`
      INSERT INTO image_cache (
        url_hash, source_url, local_path, content_type, size_bytes, media_type,
        status, http_status, last_checked, access_count, last_accessed
      ) VALUES (?, ?, NULL, NULL, 0, ?, 'broken', ?, CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP)
    `).run(urlHash, sourceUrl, mediaType, httpStatus || 502);
  }
}

// Gerar Fallback SVG elegante para Canais
function generateChannelFallbackSvg(channelName = 'VSA CANAL') {
  const clean = String(channelName || 'CANAL').replace(/[<>&"]/g, '').trim();
  const title = clean.length > 20 ? clean.substring(0, 18) + '..' : clean;

  // Gradiente determinístico
  let hash = 0;
  for (let i = 0; i < clean.length; i++) hash = clean.charCodeAt(i) + ((hash << 5) - hash);
  const hue1 = Math.abs(hash % 360);
  const hue2 = (hue1 + 45) % 360;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="hsl(${hue1}, 45%, 12%)"/>
          <stop offset="100%" stop-color="hsl(${hue2}, 55%, 6%)"/>
        </linearGradient>
      </defs>
      <rect width="300" height="200" rx="12" fill="url(#bg)"/>
      <rect x="0.5" y="0.5" width="299" height="199" rx="11.5" fill="none" stroke="rgba(255,255,255,0.08)"/>
      <g transform="translate(150, 75)">
        <circle cx="0" cy="0" r="24" fill="rgba(255,255,255,0.06)"/>
        <circle cx="0" cy="0" r="36" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.2"/>
        <rect x="-10" y="-8" width="20" height="16" rx="2.5" fill="none" stroke="#818cf8" stroke-width="2"/>
        <path d="M -4 -11 L -1 -8 M 4 -11 L 1 -8" stroke="#818cf8" stroke-width="1.6" stroke-linecap="round"/>
        <circle cx="6" cy="0" r="1.5" fill="#818cf8"/>
      </g>
      <text x="150" y="145" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#f8fafc" text-anchor="middle" letter-spacing="-0.02em">
        ${title}
      </text>
      <text x="150" y="172" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="600" fill="#64748b" text-anchor="middle" letter-spacing="0.04em">
        VSA IPTV
      </text>
    </svg>
  `.trim();
}

// Gerar Fallback SVG elegante para Filmes/Séries
function generateMediaFallbackSvg(title = 'VSA FILMES', type = 'movie') {
  const clean = String(title || 'VOD').replace(/[<>&"]/g, '').trim();
  const label = clean.length > 22 ? clean.substring(0, 20) + '..' : clean;
  const isSeries = type === 'series' || type === 'novelas';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#141926"/>
          <stop offset="100%" stop-color="#090c13"/>
        </linearGradient>
      </defs>
      <rect width="300" height="450" rx="12" fill="url(#g)"/>
      <rect x="0.5" y="0.5" width="299" height="449" rx="11.5" fill="none" stroke="rgba(255,255,255,0.06)"/>
      <g transform="translate(150, 180)">
        <circle cx="0" cy="0" r="44" fill="${isSeries ? 'rgba(99,102,241,0.12)' : 'rgba(236,72,153,0.12)'}"/>
        <polygon points="-8,-14 16,0 -8,14" fill="${isSeries ? '#818cf8' : '#f43f5e'}"/>
      </g>
      <text x="150" y="275" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="17" font-weight="700" fill="#f1f5f9" text-anchor="middle" letter-spacing="-0.02em">
        ${label}
      </text>
      <rect x="105" y="305" width="90" height="22" rx="11" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)"/>
      <text x="150" y="320" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" fill="#94a3b8" text-anchor="middle">
        ${isSeries ? 'SÉRIE' : 'FILME'}
      </text>
    </svg>
  `.trim();
}

// Download com validação binária, seguimento de redirects e gravação em disco
function downloadAndValidate(sourceUrl, mediaType, safeDnsLookup, isBlockedTarget) {
  return new Promise((resolve) => {
    let hops = 0;
    const normUrl = normalizeUrl(sourceUrl);

    function step(targetUrl) {
      if (hops > 5) {
        return resolve({ success: false, status: 502, error: 'Muitos redirecionamentos' });
      }
      hops++;

      let parsed;
      try {
        parsed = new URL(targetUrl);
      } catch (e) {
        return resolve({ success: false, status: 400, error: 'URL inválida' });
      }

      if (isBlockedTarget && isBlockedTarget(parsed.href)) {
        return resolve({ success: false, status: 403, error: 'Destino bloqueado por SSRF' });
      }

      const mod = parsed.protocol === 'https:' ? https : http;
      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Referer': `${parsed.protocol}//${parsed.host}/`,
        },
        family: 4,
        timeout: REQUEST_TIMEOUT_MS,
      };

      if (safeDnsLookup) {
        options.lookup = safeDnsLookup;
      }

      const req = mod.request(options, (res) => {
        // Redirecionamento
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          try {
            const next = new URL(res.headers.location, targetUrl);
            return step(next.href);
          } catch (e) {
            return resolve({ success: false, status: 502, error: 'Redirect malformado' });
          }
        }

        if (res.statusCode !== 200) {
          res.resume();
          return resolve({ success: false, status: res.statusCode, error: `HTTP ${res.statusCode}` });
        }

        const rawCtype = (res.headers['content-type'] || '').toLowerCase();
        const chunks = [];
        let totalBytes = 0;

        res.on('data', (chunk) => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_IMAGE_BYTES) {
            req.destroy();
            return resolve({ success: false, status: 413, error: 'Imagem excede tamanho máximo (10MB)' });
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          if (buffer.length === 0) {
            return resolve({ success: false, status: 502, error: 'Conteúdo vazio (0 bytes)' });
          }

          // Validação Real por Magic Bytes
          const validation = validateMagicBytes(buffer, rawCtype);
          if (!validation.valid) {
            return resolve({ success: false, status: 502, error: validation.reason });
          }

          resolve({
            success: true,
            status: 200,
            buffer,
            contentType: validation.mime,
            ext: validation.ext,
            sizeBytes: buffer.length,
          });
        });

        res.on('error', (err) => {
          resolve({ success: false, status: 502, error: err.message });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, status: 504, error: 'Timeout de rede (10s)' });
      });

      req.on('error', (err) => {
        resolve({ success: false, status: 502, error: err.message });
      });

      req.end();
    }

    step(normUrl);
  });
}

// Serviço Principal: Atende a rota de entrega de imagem /api/img
async function serveImage(req, res, options = {}) {
  const { safeDnsLookup, isBlockedTarget } = options;
  const src = req.query.url || req.query.src;
  const mediaType = getSubdir(req.query.type || 'channel');
  const fallbackTitle = req.query.title || 'VSA';

  if (!src || !/^https?:\/\//i.test(src)) {
    // Retornar fallback elegante diretamente se não houver URL
    const svg = mediaType === 'channel' 
      ? generateChannelFallbackSvg(fallbackTitle) 
      : generateMediaFallbackSvg(fallbackTitle, mediaType);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(svg);
  }

  const normUrl = normalizeUrl(src);
  const urlHash = getUrlHash(normUrl);

  // 1. Checar registro no cache do banco
  const record = getCacheRecord(urlHash);

  // 2. Se já estiver no cache e o arquivo existir no disco -> Servir direto
  if (record && record.status === 'cached' && record.local_path) {
    const absPath = path.join(BASE_CACHE_DIR, record.local_path);
    if (fs.existsSync(absPath)) {
      recordAccess(urlHash);

      // Suporte a ETag e 304 Not Modified
      const etag = `"${urlHash}"`;
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }

      res.setHeader('Content-Type', record.content_type || 'image/jpeg');
      res.setHeader('Content-Length', record.size_bytes);
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable'); // 30 dias
      res.setHeader('X-Cache-Status', 'HIT');
      return fs.createReadStream(absPath).pipe(res);
    }
  }

  // 3. Cache Negativo: Se a URL falhou recentemente, não bater na rede
  if (record && record.status === 'broken') {
    const lastCheck = new Date(record.last_checked).getTime();
    if (Date.now() - lastCheck < NEGATIVE_CACHE_TTL_MS) {
      // Retornar fallback elegante com Cache Negativo ativo
      const svg = mediaType === 'channel'
        ? generateChannelFallbackSvg(fallbackTitle)
        : generateMediaFallbackSvg(fallbackTitle, mediaType);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-Cache-Status', 'NEGATIVE-HIT');
      return res.status(200).send(svg);
    }
  }

  // 4. Baixar e validar imagem sob demanda
  const result = await downloadAndValidate(normUrl, mediaType, safeDnsLookup, isBlockedTarget);

  if (result.success && result.buffer) {
    // Gravar no disco
    const sub = getSubdir(mediaType);
    const relPath = `${sub}/${urlHash}.${result.ext}`;
    const absPath = path.join(BASE_CACHE_DIR, relPath);

    try {
      fs.writeFileSync(absPath, result.buffer);
      saveCacheSuccess(urlHash, normUrl, relPath, result.contentType, result.sizeBytes, sub, 200);

      const etag = `"${urlHash}"`;
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Length', result.sizeBytes);
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
      res.setHeader('X-Cache-Status', 'MISS-CACHED');
      return res.status(200).send(result.buffer);
    } catch (writeErr) {
      console.error('[ImageManager] Erro ao gravar cache em disco:', writeErr.message);
    }
  }

  // 5. Se o download falhou ou a assinatura de imagem é inválida
  saveNegativeCache(urlHash, normUrl, mediaType, result.status || 502);

  // Entregar fallback visual de alta qualidade do VSAIPTV (nunca ícone quebrado do navegador)
  const fallbackSvg = mediaType === 'channel'
    ? generateChannelFallbackSvg(fallbackTitle)
    : generateMediaFallbackSvg(fallbackTitle, mediaType);

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('X-Cache-Status', 'FALLBACK');
  return res.status(200).send(fallbackSvg);
}

// Métricas completas para o Master Admin Dashboard
function getStats() {
  const totalCached = db.prepare("SELECT COUNT(*) as c FROM image_cache WHERE status = 'cached'").get().c;
  const totalBroken = db.prepare("SELECT COUNT(*) as c FROM image_cache WHERE status = 'broken'").get().c;
  const totalRecords = db.prepare("SELECT COUNT(*) as c FROM image_cache").get().c;

  // Tamanho total ocupado no disco
  const totalBytesRow = db.prepare("SELECT SUM(size_bytes) as total FROM image_cache WHERE status = 'cached'").get();
  const totalBytes = totalBytesRow ? (totalBytesRow.total || 0) : 0;

  // Breakdown por media_type
  const byType = db.prepare(`
    SELECT media_type, status, COUNT(*) as count 
    FROM image_cache 
    GROUP BY media_type, status
  `).all();

  // Quantidade de streams com/sem imagem
  const streamsTotal = db.prepare("SELECT COUNT(*) as c FROM streams").get().c;
  const streamsWithIcon = db.prepare("SELECT COUNT(*) as c FROM streams WHERE (icon_url IS NOT NULL AND icon_url != '') OR (poster_url IS NOT NULL AND poster_url != '')").get().c;

  const chRow = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN icon_url IS NOT NULL AND icon_url != '' THEN 1 ELSE 0 END) as with_img FROM streams WHERE type = 'live'").get() || { total: 0, with_img: 0 };
  const movRow = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN (poster_url IS NOT NULL AND poster_url != '') OR (icon_url IS NOT NULL AND icon_url != '') THEN 1 ELSE 0 END) as with_img FROM streams WHERE type = 'movie'").get() || { total: 0, with_img: 0 };
  const serRow = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN (poster_url IS NOT NULL AND poster_url != '') OR (icon_url IS NOT NULL AND icon_url != '') THEN 1 ELSE 0 END) as with_img FROM streams WHERE type = 'series'").get() || { total: 0, with_img: 0 };

  const novRow = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN (poster_url IS NOT NULL AND poster_url != '') OR (icon_url IS NOT NULL AND icon_url != '') THEN 1 ELSE 0 END) as with_img FROM streams WHERE category_id IN (147, 163, 350, 454, 472, 477, 481, 488) OR LOWER(name) LIKE '%novela%'").get() || { total: 0, with_img: 0 };

  const catalog = {
    channels: { total: chRow.total, with_image: chRow.with_img || 0, without_image: chRow.total - (chRow.with_img || 0) },
    movies: { total: movRow.total, with_image: movRow.with_img || 0, without_image: movRow.total - (movRow.with_img || 0) },
    series: { total: serRow.total, with_image: serRow.with_img || 0, without_image: serRow.total - (serRow.with_img || 0) },
    novelas: { total: novRow.total, with_image: novRow.with_img || 0, without_image: novRow.total - (novRow.with_img || 0) }
  };

  const cache = {
    totalFiles: totalCached,
    totalSizeBytes: totalBytes,
    negativeEntries: totalBroken,
    hits: 0,
    misses: 0
  };

  return {
    totalCached,
    totalBroken,
    totalRecords,
    cacheSizeBytes: totalBytes,
    cacheSizeMB: (totalBytes / 1024 / 1024).toFixed(2),
    cacheSizeGB: (totalBytes / 1024 / 1024 / 1024).toFixed(3),
    streamsTotal,
    streamsWithImage: streamsWithIcon,
    streamsWithoutImage: streamsTotal - streamsWithIcon,
    byType,
    catalog,
    cache,
  };
}

// Limpar cache expirado e registros antigos
function cleanExpiredCache() {
  // Limpar cache negativo mais velho que o TTL
  const deletedBroken = db.prepare(`
    DELETE FROM image_cache 
    WHERE status = 'broken' AND datetime(last_checked) < datetime('now', '-7 days')
  `).run().changes;

  return { deletedBroken };
}

// Validador anti-SSRF de destino
function isBlockedTarget(targetUrl) {
  const net = require('net');
  try {
    const raw = targetUrl.startsWith('http') ? targetUrl : `http://${targetUrl}`;
    const u = new URL(raw);
    if (!['http:', 'https:'].includes(u.protocol)) return true;

    let hostname = u.hostname.toLowerCase();
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
      hostname = hostname.slice(1, -1);
    }

    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return true;
    }

    if (net.isIP(hostname)) {
      const parts = hostname.split('.').map(Number);
      if (parts[0] === 127) return true; // Loopback
      if (parts[0] === 10) return true; // RFC1918
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // RFC1918
      if (parts[0] === 192 && parts[1] === 168) return true; // RFC1918
      if (parts[0] === 169 && parts[1] === 254) return true; // Link-local
    }

    return false;
  } catch (e) {
    return true;
  }
}

module.exports = {
  serveImage,
  downloadAndValidate,
  validateMagicBytes,
  isBlockedTarget,
  getStats,
  cleanExpiredCache,
  generateChannelFallbackSvg,
  generateMediaFallbackSvg,
  getUrlHash,
  normalizeUrl,
  BASE_CACHE_DIR,
};

