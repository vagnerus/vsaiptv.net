// ============================================================
// playlistManager.js - Gerenciador de Playlist Local com Cache
// Baixa e mantém atualizada a playlist da cdnf1.sbs localmente
// Garante operação independente do link externo
// ============================================================
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const PLAYLIST_DIR = path.join(__dirname, '../../../list');
const CACHE_FILE = path.join(PLAYLIST_DIR, 'cdnf1_sbs_playlist.m3u');
const CACHE_JSON = path.join(PLAYLIST_DIR, 'cdnf1_sbs_cache.json');

// Configurações
const CONFIG = {
  EXTERNAL_URL: 'http://cdnf1.sbs/get.php?username=4168783783&password=5913393778&type=m3u_plus&output=mpegts',
  UPDATE_INTERVAL: 6 * 60 * 60 * 1000, // 6 horas
  DOWNLOAD_TIMEOUT: 30000,
  MAX_STREAMS: 600,
  DOWNLOAD_HEADERS: {
    'User-Agent': 'IPTVPlaylistManager/1.0',
    'Accept': '*/*',
  },
};

const cacheState = {
  lastUpdate: null,
  totalStreams: 0,
  status: 'idle',
  error: null,
};

if (!fs.existsSync(PLAYLIST_DIR)) {
  fs.mkdirSync(PLAYLIST_DIR, { recursive: true });
}

// Download da playlist externa para cache local
function downloadPlaylist() {
  return new Promise((resolve, reject) => {
    cacheState.status = 'downloading';
    cacheState.error = null;
    
    const startTime = Date.now();
    let data = '';
    
    const protocol = CONFIG.EXTERNAL_URL.startsWith('https:') ? https : http;
    
    const req = protocol.get(CONFIG.EXTERNAL_URL, { headers: CONFIG.DOWNLOAD_HEADERS }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      
      res.on('data', (chunk) => {
        data += chunk;
        if (data.length > 1000000 && data.length % 1000000 < chunk.length) {
          console.log(`  📥 Download: ${(data.length / 1024 / 1024).toFixed(1)} MB...`);
        }
      });
      
      res.on('end', () => {
        const elapsed = Date.now() - startTime;
        console.log(`  ✅ Download: ${(data.length / 1024 / 1024).toFixed(2)} MB em ${(elapsed/1000).toFixed(1)}s`);
        resolve(data);
      });
    });
    
    req.on('error', (err) => {
      cacheState.status = 'error';
      cacheState.error = err.message;
      reject(err);
    });
    
    req.setTimeout(CONFIG.DOWNLOAD_TIMEOUT, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// Processar e salvar playlist no formato local
function processAndSavePlaylist(rawContent) {
  const lines = rawContent.split('\n');
  const streams = [];
  const categories = new Set();
  let currentInfo = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith('#EXTINF:')) {
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const nameMatch = line.match(/^#EXTINF:[^-]*-[^,]*,(.*)$/i);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      
      currentInfo = {
        name: nameMatch ? nameMatch[1].trim() : '',
        group: groupMatch ? groupMatch[1] : 'Sem Categoria',
        logo: logoMatch ? logoMatch[1] : '',
      };
      categories.add(currentInfo.group);
      
    } else if (line.length > 0 && !line.startsWith('#') && currentInfo && streams.length < CONFIG.MAX_STREAMS) {
      streams.push({
        name: currentInfo.name,
        group: currentInfo.group,
        logo: currentInfo.logo,
        url: line,
        source: 'cdnf1.sbs',
      });
      currentInfo = null;
    }
  }
  
  const m3uContent = ['#EXTM3U', '#EXT-X-SESSION-DATA:DATA-ID="com.local.playlist"', ...lines].join('\n');
  fs.writeFileSync(CACHE_FILE, m3uContent, 'utf8');
  
  const cacheData = {
    version: '1.0',
    updatedAt: new Date().toISOString(),
    totalStreams: streams.length,
    totalCategories: categories.size,
    categories: [...categories],
    streams: streams,
    source: CONFIG.EXTERNAL_URL,
  };
  fs.writeFileSync(CACHE_JSON, JSON.stringify(cacheData, null, 2), 'utf8');
  
  cacheState.lastUpdate = new Date().toISOString();
  cacheState.totalStreams = streams.length;
  cacheState.status = 'ready';
  
  return { streams, categories: categories.size };
}

async function updatePlaylist() {
  try {
    console.log('[PlaylistManager] 🔄 Atualizando playlist local...');
    const rawContent = await downloadPlaylist();
    const result = processAndSavePlaylist(rawContent);
    console.log(`[PlaylistManager] ✅ Playlist atualizada: ${result.streams.length} streams, ${result.categories} categorias`);
    return { success: true, ...result };
  } catch (err) {
    console.error(`[PlaylistManager] ❌ Erro: ${err.message}`);
    cacheState.status = 'error';
    cacheState.error = err.message;
    return { success: false, error: err.message };
  }
}

function loadLocalPlaylist() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    return fs.readFileSync(CACHE_FILE, 'utf8');
  } catch (err) {
    console.error('[PlaylistManager] Erro ao carregar:', err.message);
    return null;
  }
}

function loadCacheData() {
  try {
    if (!fs.existsSync(CACHE_JSON)) return null;
    return JSON.parse(fs.readFileSync(CACHE_JSON, 'utf8'));
  } catch (err) {
    console.error('[PlaylistManager] Erro ao carregar JSON:', err.message);
    return null;
  }
}

function needsUpdate() {
  if (!cacheState.lastUpdate) return true;
  return (Date.now() - new Date(cacheState.lastUpdate).getTime()) > CONFIG.UPDATE_INTERVAL;
}

function startAutoUpdate() {
  updatePlaylist().then(() => {
    setInterval(() => {
      if (needsUpdate()) updatePlaylist();
    }, CONFIG.UPDATE_INTERVAL);
    console.log(`[PlaylistManager] 🔄 Auto-update agendado a cada ${CONFIG.UPDATE_INTERVAL / 3600000}h`);
  });
}

function generateLocalPlaylist() {
  const cacheData = loadCacheData();
  if (!cacheData) return null;
  
  return [
    '#EXTM3U',
    '#EXT-X-SESSION-DATA:DATA-ID="com.local.playlist"',
    `#PLAYLIST_VERSION:1.0`,
    `#LAST_UPDATED:${cacheData.updatedAt}`,
    `#TOTAL_STREAMS:${cacheData.totalStreams}`,
    '',
    ...cacheData.streams.map(s => 
      `#EXTINF:-1 tvg-id="" tvg-name="${s.name}" tvg-logo="${s.logo}" group-title="${s.group}",${s.name}\n${s.url}`
    )
  ].join('\n');
}

function getStatus() {
  return {
    ...cacheState,
    config: {
      updateInterval: CONFIG.UPDATE_INTERVAL,
      maxStreams: CONFIG.MAX_STREAMS,
    },
    cacheExists: fs.existsSync(CACHE_FILE),
  };
}

function healthCheck() {
  const cacheData = loadCacheData();
  if (!cacheData) return { healthy: false, reason: 'Cache vazio' };
  
  return {
    healthy: true,
    totalStreams: cacheData.totalStreams,
    totalCategories: cacheData.categories.length,
    lastUpdated: cacheData.updatedAt,
  };
}

if (require.main === module) {
  console.log('[PlaylistManager] Iniciando...');
  console.log(`[PlaylistManager] URL: ${CONFIG.EXTERNAL_URL.replace(/password=\w+/, 'password=***')}`);
  startAutoUpdate();
  setTimeout(() => console.log('[PlaylistManager] Status:', JSON.stringify(getStatus(), null, 2)), 2000);
}

module.exports = {
  downloadPlaylist,
  processAndSavePlaylist,
  updatePlaylist,
  loadLocalPlaylist,
  loadCacheData,
  needsUpdate,
  startAutoUpdate,
  generateLocalPlaylist,
  getStatus,
  healthCheck,
  CONFIG,
};