require('dotenv').config();
const http = require('http');
const https = require('https');
const express = require('express');
const cors = require('cors');
const path = require('path');

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

// Xtream Codes & M3U compatibility mounted directly on root
app.use('/', xtreamRoutes);

// API REST routes
app.use('/api/auth', authRoutes);
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
  // Forçar Range para compatibilidade com redirecionadores (ex: hubby.cx)
  // que redirecionam para www-fontedecanais-gs apenas quando Range é enviado.
  if (!headers.range) headers.range = 'bytes=0-';
  const req2 = mod.get(target, { headers, family: 4 }, (up) => {
    if ([301, 302, 303, 307, 308].includes(up.statusCode) && up.headers.location) {
      up.resume();
      try {
        const next = new URL(up.headers.location, target);
        return streamProxy(next, headers, res, hops + 1);
      } catch (e) { res.status(502).end(); }
      return;
    }
    const out = {};
    ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition'].forEach(k => {
      if (up.headers[k]) out[k] = up.headers[k];
    });
    out['cache-control'] = 'no-store';
    res.writeHead(up.statusCode, out);
    up.pipe(res);
  });
  req2.on('error', () => { res.status(502).json({ error: 'Falha ao carregar o fluxo externo.' }); });
}

app.get('/media/proxy', (req, res) => {
  const src = req.query.src;
  if (!src || !/^https?:\/\//i.test(src)) {
    return res.status(400).json({ error: 'Parâmetro src inválido' });
  }
  let u;
  try { u = new URL(src); } catch (e) { return res.status(400).json({ error: 'URL inválida' }); }

  const headers = {
    'user-agent': req.headers['user-agent'] || 'VSAIPTV/1.0',
    accept: req.headers.accept || '*/*',
    'accept-encoding': 'identity',
  };
    // Sempre repassar ou forçar Range (compatível com redirecionadores)
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
  const req2 = mod.get(target, { headers, family: 4, timeout: 15000 }, (up) => {
    if ([301, 302, 303, 307, 308].includes(up.statusCode) && up.headers.location) {
      up.resume();
      try {
        const next = new URL(up.headers.location, target);
        return fetchImage(next, headers, res, hops + 1);
      } catch (e) { res.status(502).end(); }
      return;
    }
    const ctype = (up.headers['content-type'] || '').toLowerCase();
    if (up.statusCode !== 200 || !ctype.startsWith('image/')) {
      // Permite SVG sem content-type correto de alguns servidores
      if (!(up.statusCode === 200 && ctype.includes('svg'))) {
        up.resume();
        res.status(404).end();
        return;
      }
    }
    const out = {
      'content-type': ctype || 'image/jpeg',
      'cache-control': 'public, max-age=86400', // capas podem ficar 1 dia em cache
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
    console.error('Image proxy fetch error:', err.message);
    res.status(502).end();
  });
}

app.get('/api/img', (req, res) => {
  const src = req.query.url || req.query.src;
  if (!src || !/^https?:\/\//i.test(src)) {
    return res.status(400).json({ error: 'Parâmetro url inválido' });
  }
  let u;
  try { u = new URL(src); } catch (e) { return res.status(400).json({ error: 'URL inválida' }); }
  fetchImage(u, {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    referer: `${u.protocol}//${u.host}/`,
  }, res, 0);
});

// Health check endpoint (used by monitoring agent)
app.get('/api/health', (req, res) => {
  res.json({ status: 'online', timestamp: new Date().toISOString() });
});

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
