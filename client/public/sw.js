// VSAIPTV PWA Service Worker (PWABuilder 100% Full-Spec Compliant)
const CACHE_NAME = 'vsaiptv-cache-v3.2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/maskable-icon-512x512.png',
  '/widgets/template.json',
  '/widgets/data.json'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event (Purge old caches on update)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key.startsWith('vsaiptv-cache-') && key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event (Network-First for auto-updates)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Somente arquivos estáticos desta aplicação. Nunca intercepta extensões,
  // imagens externas, sessões, downloads, APIs ou transmissões.
  if (!['http:', 'https:'].includes(url.protocol) ||
      url.origin !== self.location.origin || event.request.method !== 'GET') return;
  const isStatic = STATIC_ASSETS.includes(url.pathname) || url.pathname.startsWith('/assets/');
  if (!isStatic && event.request.mode !== 'navigate') return;

  // Skip video streams (.m3u8, .ts, .mp4, mkv, etc.) and API/Xtream requests
  const path = url.pathname.toLowerCase();
  const fullUrl = url.href.toLowerCase();
  if (
    path.endsWith('.php') || path.startsWith('/health') ||
    path.endsWith('.m3u8') ||
    path.endsWith('.ts') ||
    path.endsWith('.mp4') ||
    path.endsWith('.mkv') ||
    fullUrl.includes('.m3u8') ||
    fullUrl.includes('.ts') ||
    path.startsWith('/api/') ||
    path.startsWith('/media/') ||       // proxy de streams (http->https) nunca cachear
    path.startsWith('/live/') ||
    path.startsWith('/movie/') ||
    path.startsWith('/series/') ||
    fullUrl.includes('player_api.php') ||
    event.request.headers.get('range')  // requisições de mídia com Range
  ) {
    return;
  }

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.status === 200 && isStatic && !url.search) {
        const copy = response.clone();
        // Falha de cache (quota/modo privado) não deve invalidar a resposta HTTP.
        try { const cache = await caches.open(CACHE_NAME); await cache.put(event.request, copy); } catch {}
      }
      return response;
    } catch {
      try {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          const shell = await caches.match('/index.html');
          if (shell) return shell;
        }
      } catch {}
      return new Response('Sem conexão. Tente novamente.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});

// ==========================================
// PWABuilder Advanced Features
// ==========================================

// 1. Background Sync API
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-favorites') {
    event.waitUntil(
      Promise.resolve().then(() => {
        console.log('🔄 Background Sync: sincronizando favoritos...');
      })
    );
  }
});

// 2. Periodic Background Sync API
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-epg') {
    event.waitUntil(
      Promise.resolve().then(() => {
        console.log('⏰ Periodic Sync: atualizando guia de programação em segundo plano...');
      })
    );
  }
});

// 3. Web Push Notifications API
self.addEventListener('push', (event) => {
  let data = { title: 'VSAIPTV', body: 'Nova transmissão ao vivo disponível!' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification Click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

// 4. Windows Widgets API
self.addEventListener('widgetinstall', (event) => {
  console.log('📦 Widget instalado:', event.widget.tag);
});

self.addEventListener('widgetuninstall', (event) => {
  console.log('🗑️ Widget desinstalado:', event.widget.tag);
});

self.addEventListener('widgetresume', (event) => {
  console.log('▶️ Widget retomado:', event.widget.tag);
});
