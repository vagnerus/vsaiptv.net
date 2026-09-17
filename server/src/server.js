require('dotenv').config();
const http = require('http');
const https = require('https');
const express = require('express');
const cors = require('cors');
const path = require('path');
const dns = require('dns');
const net = require('net');

// Initialize database
require('./db/database');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const resellerRoutes = require('./routes/reseller');
const clientRoutes = require('./routes/client');
const xtreamRoutes = require('./routes/xtream');
const P2PTracker = require('./services/p2pTracker');
const { startScheduler } = require('./services/scheduler');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ==========================================
// SSRF & Target Validation Helper
// Bloqueia tentativas de acesso a localhost, loopback, faixas privadas,
// link-local, metadados em nuvem e IPv4-mapped IPv6.
// ==========================================
function isPrivateOrBlockedIP(ip) {
  if (!ip || typeof ip !== 'string') return true;

  let normalized = ip.trim().toLowerCase();
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1);
  }

  // Se for IPv4-mapped IPv6 (ex: ::ffff:127.0.0.1 ou ::ffff:7f00:1)
  if (normalized.startsWith('::ffff:')) {
    const remainder = normalized.slice(7);
    if (net.isIPv4(remainder)) {
      normalized = remainder;
    } else {
      const hexMatch = remainder.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
      if (hexMatch) {
        const high = parseInt(hexMatch[1], 16);
        const low = parseInt(hexMatch[2], 16);
        const a = (high >> 8) & 0xff;
        const b = high & 0xff;
        const c = (low >> 8) & 0xff;
        const d = low & 0xff;
        normalized = `${a}.${b}.${c}.${d}`;
      }
    }
  }

  // Se for IPv4
  if (net.isIPv4(normalized)) {
    const parts = normalized.split('.').map(Number);
    if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b, c] = parts;

    if (a === 0) return true; // 0.0.0.0/8 (Broadcast / local network)
    if (a === 10) return true; // 10.0.0.0/8 (RFC 1918 Private)
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (Carrier-grade NAT RFC 6598)
    if (a === 127) return true; // 127.0.0.0/8 (Loopback)
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (Link-local, AWS/GCP/Azure metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC 1918 Private)
    if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC 1918 Private)
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (Benchmarking)
    if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 (TEST-NET-2)
    if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 (TEST-NET-3)
    if (a >= 224) return true; // 224.0.0.0/4 (Multicast) e 240.0.0.0/4 (Reserved)
    return false;
  }

  // Se for IPv6
  if (net.isIPv6(normalized)) {
    if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true; // Unspecified
    if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true; // Loopback
    if (/^f[cd][0-9a-f]{2}:/i.test(normalized)) return true; // Unique Local Address (fc00::/7)
    if (/^fe[89ab][0-9a-f]:/i.test(normalized)) return true; // Link-Local (fe80::/10)
    if (normalized.startsWith('64:ff9b::')) {
      const sub = normalized.slice(9);
      if (net.isIPv4(sub)) return isPrivateOrBlockedIP(sub);
    }
    return false;
  }

  return false;
}

function isBlockedTarget(targetUrl) {
  try {
    const u = new URL(targetUrl);
    if (!['http:', 'https:'].includes(u.protocol)) return true;

    let hostname = u.hostname.toLowerCase();
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
      hostname = hostname.slice(1, -1);
    }

    // Bloqueia localhost e sufixos locais/internos
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return true;
    }

    // Se o hostname já for um IP literal (IPv4 ou IPv6), valida imediatamente
    if (net.isIP(hostname)) {
      return isPrivateOrBlockedIP(hostname);
    }

    return false;
  } catch (e) {
    return true;
  }
}

// Custom safe lookup para http.get / https.get (previne DNS Rebinding e TOCTOU)
function safeDnsLookup(hostname, options, callback) {
  let cb = callback;
  let opts = options;
  if (typeof options === 'function') {
    cb = options;
    opts = {};
  } else if (typeof options === 'number') {
    opts = { family: options };
  } else if (!opts) {
    opts = {};
  }

  // Se já for IP, validar direto
  let cleanHost = hostname;
  if (cleanHost.startsWith('[') && cleanHost.endsWith(']')) {
    cleanHost = cleanHost.slice(1, -1);
  }
  if (net.isIP(cleanHost)) {
    if (isPrivateOrBlockedIP(cleanHost)) {
      const err = new Error(`SSRF: Destino IP ${cleanHost} bloqueado.`);
      err.code = 'ERR_SSRF_BLOCKED';
      return cb(err);
    }
    const fam = net.isIPv4(cleanHost) ? 4 : 6;
    if (opts.all) {
      return cb(null, [{ address: cleanHost, family: fam }]);
    }
    return cb(null, cleanHost, fam);
  }

  // Resolver todos os IPs retornados pelo DNS para auditoria completa
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return cb(err);
    if (!addresses || addresses.length === 0) {
      const notFound = new Error('ENOTFOUND');
      notFound.code = 'ENOTFOUND';
      return cb(notFound);
    }

    // Rejeitar conexão se QUALQUER endereço retornado pertencer a faixas privadas/reservadas
    for (const item of addresses) {
      if (isPrivateOrBlockedIP(item.address)) {
        const ssrfErr = new Error(`SSRF: IP ${item.address} (resolvido de ${hostname}) bloqueado.`);
        ssrfErr.code = 'ERR_SSRF_BLOCKED';
        return cb(ssrfErr);
      }
    }

    if (opts.all) {
      return cb(null, addresses);
    }

    let selected = addresses[0];
    if (opts.family) {
      const match = addresses.find(a => a.family === opts.family);
      if (match) selected = match;
    }
    return cb(null, selected.address, selected.family);
  });
}

// ==========================================
// In-Memory Rate Limiting (Proteção contra Brute-Force & DoS)
// ==========================================
function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60000;
  const max = options.max || 60;
  const message = options.message || { error: 'Muitas requisições. Tente novamente mais tarde.' };
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now - record.startTime > windowMs) {
        hits.delete(key);
      }
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
    const now = Date.now();
    let record = hits.get(ip);

    if (!record || now - record.startTime > windowMs) {
      record = { count: 1, startTime: now };
      hits.set(ip, record);
      return next();
    }

    record.count++;
    if (record.count > max) {
      res.setHeader('Retry-After', Math.ceil((record.startTime + windowMs - now) / 1000));
      return res.status(429).json(message);
    }
    next();
  };
}

const authLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 15, message: { error: 'Limite de tentativas de autenticação excedido. Tente novamente em 1 minuto.' } });
const imgLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 240 });
const mediaLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 1200 }); // Amplo para segmentos contínuos HLS

// Aplicar limitadores nos endpoints
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/img', imgLimiter);
app.use('/media/proxy', mediaLimiter);

// Xtream Codes & M3U compatibility mounted directly on root
app.use('/', xtreamRoutes);

// API REST routes
app.use('/api/admin', adminRoutes);
app.use('/api/reseller', resellerRoutes);
app.use('/api/client', clientRoutes);

// Direct APK download routes
app.get('/VSAIPTV-v1.0.apk', (req, res) => {
  const apkPath = path.join(__dirname, '../../VSAIPTV-v1.0.apk');
  res.download(apkPath, 'VSAIPTV-v1.0.apk');
});

app.get('/NexusIPTV-v1.0.apk', (req, res) => {
  const apkPath = path.join(__dirname, '../../VSAIPTV-v1.0.apk');
  res.download(apkPath, 'VSAIPTV-v1.0.apk');
});

// ==========================================
// Media Stream Proxy (evita bloqueio de CONTEÚDO MISTO)
// O app roda sobre HTTPS, mas muitos streams externos são http://
// O navegador bloqueia vídeo http em página https. Este endpoint
// baixa o fluxo pelo servidor e entrega via HTTPS.
// ==========================================
function streamProxy(target, headers, res, hops) {
  if (hops > 6) { res.status(502).end(); return; }
  const mod = target.protocol === 'https:' ? https : http;
  if (!headers.range) headers.range = 'bytes=0-';
  const req2 = mod.get(target, { headers, family: 4, lookup: safeDnsLookup }, (up) => {
    if ([301, 302, 303, 307, 308].includes(up.statusCode) && up.headers.location) {
      up.resume();
      try {
        const next = new URL(up.headers.location, target);
        if (isBlockedTarget(next.href)) {
          return res.status(403).json({ error: 'Redirecionamento bloqueado por segurança (SSRF).' });
        }
        return streamProxy(next, headers, res, hops + 1);
      } catch (e) { return res.status(502).end(); }
    }
    const out = {};
    ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition'].forEach(k => {
      if (up.headers[k]) out[k] = up.headers[k];
    });
    out['cache-control'] = 'no-store';
    res.writeHead(up.statusCode, out);
    up.pipe(res);
  });
  req2.on('error', (err) => {
    if (err.code === 'ERR_SSRF_BLOCKED') {
      return res.status(403).json({ error: 'Acesso ao destino bloqueado por segurança (SSRF).' });
    }
    res.status(502).json({ error: 'Falha ao carregar o fluxo externo.' });
  });
}

app.get('/media/proxy', (req, res) => {
  const src = req.query.src;
  if (!src || !/^https?:\/\//i.test(src)) {
    return res.status(400).json({ error: 'Parâmetro src inválido' });
  }
  if (isBlockedTarget(src)) {
    return res.status(403).json({ error: 'Acesso ao destino bloqueado por segurança (SSRF).' });
  }
  let u;
  try { u = new URL(src); } catch (e) { return res.status(400).json({ error: 'URL inválida' }); }

  const headers = {
    'user-agent': req.headers['user-agent'] || 'VSAIPTV/1.0',
    accept: req.headers.accept || '*/*',
    'accept-encoding': 'identity',
  };
  headers.range = req.headers.range || 'bytes=0-';
  streamProxy(u, headers, res, 0);
});

// ==========================================
// Image Proxy (capas/posters)
// Baixa a imagem pelo servidor e entrega via HTTPS.
// Resolve: hotlink bloqueado, mixed content (http em página https),
// CORS e WebViews que não carregam imagens http direto.
// ==========================================
const IMG_MAX_BYTES = 8 * 1024 * 1024; // 8MB

function fetchImage(target, headers, res, hops) {
  if (hops > 6) { res.status(502).end(); return; }
  const mod = target.protocol === 'https:' ? https : http;
  headers.host = target.host;
  const req2 = mod.get(target, { headers, family: 4, lookup: safeDnsLookup, timeout: 15000 }, (up) => {
    if ([301, 302, 303, 307, 308].includes(up.statusCode) && up.headers.location) {
      up.resume();
      try {
        const next = new URL(up.headers.location, target);
        if (isBlockedTarget(next.href)) {
          return res.status(403).json({ error: 'Redirecionamento bloqueado por segurança (SSRF).' });
        }
        return fetchImage(next, headers, res, hops + 1);
      } catch (e) { return res.status(502).end(); }
    }
    const ctype = (up.headers['content-type'] || '').toLowerCase();
    if (up.statusCode !== 200 || !ctype.startsWith('image/')) {
      if (!(up.statusCode === 200 && ctype.includes('svg'))) {
        up.resume();
        res.status(404).end();
        return;
      }
    }
    const out = {
      'content-type': ctype || 'image/jpeg',
      'cache-control': 'public, max-age=86400',
      'access-control-allow-origin': '*',
    };
    if (up.headers['content-length']) out['content-length'] = up.headers['content-length'];
    res.writeHead(200, out);
    let sent = 0;
    up.on('data', (chunk) => {
      sent += chunk.length;
      if (sent > IMG_MAX_BYTES) { req2.destroy(); res.end(); return; }
      res.write(chunk);
    });
    up.on('end', () => res.end());
    up.on('error', () => res.end());
  });
  req2.on('timeout', () => { req2.destroy(); res.status(504).end(); });
  req2.on('error', (err) => {
    if (err.code === 'ERR_SSRF_BLOCKED') {
      return res.status(403).json({ error: 'Acesso ao destino bloqueado por segurança (SSRF).' });
    }
    console.error('Image proxy fetch error:', err.message);
    res.status(502).end();
  });
}

app.get('/api/img', (req, res) => {
  const src = req.query.url || req.query.src;
  if (!src || !/^https?:\/\//i.test(src)) {
    return res.status(400).json({ error: 'Parâmetro url inválido' });
  }
  if (isBlockedTarget(src)) {
    return res.status(403).json({ error: 'Acesso ao destino bloqueado por segurança (SSRF).' });
  }
  let u;
  try { u = new URL(src); } catch (e) { return res.status(400).json({ error: 'URL inválida' }); }
  fetchImage(u, {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    referer: `${u.protocol}//${u.host}/`,
  }, res, 0);
});

// Health check endpoint (used by monitoring agent, load balancers and container orchestrators)
const healthHandler = (req, res) => {
  try {
    const db = require('./db/database');
    db.prepare('SELECT 1').get();
    res.json({
      status: 'ok',
      db: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      db: 'unavailable',
      timestamp: new Date().toISOString(),
    });
  }
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// Serve static frontend in production if built
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist, {
  setHeaders: (res, filePath) => {
    const normalized = filePath.replace(/\\/g, '/');

    // O WebView/PWA precisa sempre buscar index e service worker novos.
    // Se cachear estes arquivos, o app fica preso em bundles antigos.
    if (normalized.endsWith('/index.html') || normalized.endsWith('/sw.js')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return;
    }

    // Assets do Vite têm hash no nome; estes podem cachear forte.
    if (normalized.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// SPA fallback
app.use((req, res, next) => {
  const acceptsHtml = (req.headers.accept || '').includes('text/html') || (req.headers.accept || '').includes('*/*');
  const hasFileExtension = path.extname(req.path) !== '';
  if (
    req.method === 'GET' &&
    acceptsHtml &&
    !hasFileExtension &&
    !req.path.startsWith('/api') &&
    !req.path.startsWith('/health') &&
    !req.path.endsWith('.php') &&
    !req.path.startsWith('/live') &&
    !req.path.startsWith('/movie') &&
    !req.path.startsWith('/series') &&
    !req.path.startsWith('/media')
  ) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.sendFile(path.join(clientDist, 'index.html'));
  }
  next();
});

// Initialize P2P WebSocket Tracker
const p2pTracker = new P2PTracker(server);

// P2P Tracker Stats Endpoint
app.get('/api/p2p/stats', (req, res) => {
  res.json(p2pTracker.getSwarmStats());
});

// Start Background Worker
startScheduler();

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 VSAIPTV P2P Server running on 0.0.0.0:${PORT}`);
  console.log(`📡 Xtream Codes API: http://localhost:${PORT}/player_api.php`);
  console.log(`📋 M3U Export:       http://localhost:${PORT}/get.php`);
  console.log(`📺 EPG XMLTV:        http://localhost:${PORT}/xmltv.php`);
  console.log(`🌐 Web Tracker P2P:  ws://localhost:${PORT}/tracker`);
  console.log(`====================================================`);
});

module.exports = {
  app,
  server,
  isPrivateOrBlockedIP,
  isBlockedTarget,
  safeDnsLookup,
};
