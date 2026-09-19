/**
 * tests/high_concurrency_playback_test.js
 * Teste de Alta Concorrência — 20 Usuários Simultâneos Assistindo Filmes
 * VSAIPTV Universal Smart TV Platform
 */

const http = require('http');
const https = require('https');

const DURATION_SECONDS = 10;
const CONCURRENT_USERS_COUNT = 20;

// Lista de filmes disponíveis no catálogo para a carga concorrente
const moviesCatalog = [
  { id: 90001, name: 'Duna (4K HDR)' },
  { id: 90002, name: 'Seven Snipers (Ação)' },
  { id: 90003, name: 'Simplesmente Amor (Romance)' },
  { id: 90004, name: 'Oceans: Vida Selvagem (4K)' },
  { id: 90005, name: 'Sintel: Crônicas do Dragão (4K)' },
  { id: 90006, name: 'Big Buck Bunny (Animação 4K)' },
  { id: 90007, name: 'Mux Cinema Showcase (FHD)' },
  { id: 90008, name: 'Tears of Steel (Sci-Fi 4K)' },
  { id: 90009, name: 'Akamai Live Master Showcase' },
  { id: 90010, name: 'Surfing Pro League (Esportes)' }
];

const deviceTypes = [
  { device: 'Samsung Smart TV (Tizen 6.5)', ua: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) VSAIPTV-Tizen/2.0' },
  { device: 'LG Smart TV (webOS 6.0)', ua: 'Mozilla/5.0 (Web0S; SmartTV; LG OLED) VSAIPTV-webOS/2.0' },
  { device: 'Google TV / Sony BRAVIA 4K', ua: 'Mozilla/5.0 (Linux; Android 12; BRAVIA 4K) VSAIPTV-AndroidTV/2.0' },
  { device: 'Amazon Fire TV Stick 4K', ua: 'Mozilla/5.0 (Linux; Android 9; AFTMM) VSAIPTV-FireTV/2.0' },
  { device: 'Hisense Smart TV (VIDAA U6)', ua: 'Mozilla/5.0 (VIDAA/6.0; Hisense TV) VSAIPTV-VIDAA/2.0' },
  { device: 'Roku TV 4K HDR', ua: 'Roku/DV-11.5 (4800X; Roku Ultra) VSAIPTV-Roku/2.0' },
  { device: 'Philips Smart TV (Titan OS)', ua: 'Mozilla/5.0 (Linux; TitanOS/1.2; Philips) VSAIPTV-Titan/2.0' },
  { device: 'Apple TV 4K (tvOS)', ua: 'AppleTV14,1/tvOS 17.0 VSAIPTV-AppleTV/2.0' },
  { device: 'Chrome Web Player (Win 11)', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0' },
  { device: 'VSAIPTV Mobile App (Android 14)', ua: 'VSAIPTV-AndroidApp/2.4.0 (Galaxy S24; Android 14)' }
];

// Montar as 20 sessões de usuários
const sessions = [];
for (let i = 1; i <= CONCURRENT_USERS_COUNT; i++) {
  const movie = moviesCatalog[(i - 1) % moviesCatalog.length];
  const dev = deviceTypes[(i - 1) % deviceTypes.length];
  sessions.push({
    userId: `client_tv_${i}`,
    password: 'teste123',
    streamId: movie.id,
    movieTitle: movie.name,
    device: dev.device,
    userAgent: dev.ua,
    clientIp: `189.40.10.${10 + i}`
  });
}

function runSessionPlayback(session, index) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const stats = {
      index: index + 1,
      user: session.userId,
      device: session.device,
      movie: session.movieTitle,
      gatewayStatus: null,
      streamStatus: null,
      ttfbMs: null,
      bytesReceived: 0,
      bitrateMbps: 0,
      contentType: null,
      error: null
    };

    const gatewayUrl = `http://localhost:5000/movie/${session.userId}/${session.password}/${session.streamId}.mp4`;

    function followAndStream(targetUrl, hops = 0) {
      if (hops > 5) {
        stats.error = 'Too many redirects';
        return resolve(stats);
      }

      const parsed = new URL(targetUrl, 'http://localhost:5000');
      const mod = parsed.protocol === 'https:' ? https : http;

      const req = mod.request({
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'Range': 'bytes=0-5242880', // 5MB de buffer de leitura
          'User-Agent': session.userAgent,
          'X-Forwarded-For': session.clientIp,
          'Accept': '*/*'
        },
        timeout: 15000
      }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          const next = new URL(res.headers.location, parsed).href;
          res.resume();
          return followAndStream(next, hops + 1);
        }

        stats.streamStatus = res.statusCode;
        stats.contentType = res.headers['content-type'] || 'video/mp4';
        if (!stats.ttfbMs) stats.ttfbMs = Date.now() - startTime;

        res.on('data', (chunk) => {
          stats.bytesReceived += chunk.length;
        });

        res.on('end', () => {
          const elapsedSec = (Date.now() - startTime) / 1000;
          stats.bitrateMbps = ((stats.bytesReceived * 8) / (elapsedSec * 1000 * 1000)).toFixed(2);
          resolve(stats);
        });

        res.on('error', (err) => {
          stats.error = err.message;
          resolve(stats);
        });

        setTimeout(() => {
          req.destroy();
          const elapsedSec = (Date.now() - startTime) / 1000;
          stats.bitrateMbps = ((stats.bytesReceived * 8) / (elapsedSec * 1000 * 1000)).toFixed(2);
          resolve(stats);
        }, DURATION_SECONDS * 1000);
      });

      req.on('error', (err) => {
        stats.error = err.message;
        resolve(stats);
      });

      req.end();
    }

    const gatewayReq = http.request(gatewayUrl, {
      method: 'GET',
      headers: {
        'User-Agent': session.userAgent,
        'X-Forwarded-For': session.clientIp
      },
      timeout: 10000
    }, (res) => {
      stats.gatewayStatus = res.statusCode;
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const proxyUrl = res.headers.location.startsWith('http') ? res.headers.location : `http://localhost:5000${res.headers.location}`;
        followAndStream(proxyUrl, 0);
      } else {
        stats.error = `Gateway returned HTTP ${res.statusCode}`;
        resolve(stats);
      }
    });

    gatewayReq.on('error', (err) => {
      stats.error = err.message;
      resolve(stats);
    });

    gatewayReq.end();
  });
}

async function runHighConcurrencyTest() {
  console.log('========================================================================================================');
  console.log(`TESTE DE ALTA CONCORRÊNCIA: ${CONCURRENT_USERS_COUNT} USUÁRIOS ASSISTINDO FILMES SIMULTANEAMENTE`);
  console.log(`Plataforma: VSAIPTV High-Performance Stream Engine | Duração: ${DURATION_SECONDS} segundos`);
  console.log('========================================================================================================\n');

  console.log(`Iniciando ${CONCURRENT_USERS_COUNT} sessões simultâneas...`);
  const initialMemory = process.memoryUsage();
  const testStart = Date.now();

  const promises = sessions.map(async (session, index) => {
    // Jitter natural humano de 50ms entre o início das reproduções
    await new Promise(r => setTimeout(r, index * 50));
    return runSessionPlayback(session, index);
  });

  const results = await Promise.all(promises);
  const totalElapsed = (Date.now() - testStart) / 1000;
  const finalMemory = process.memoryUsage();

  console.log('\n========================================================================================================');
  console.log(`RELATÓRIO DE ALTA CONCORRÊNCIA: ${CONCURRENT_USERS_COUNT} USUÁRIOS SIMULTÂNEOS`);
  console.log('========================================================================================================');
  console.log(
    '#'.padEnd(4) +
    'Usuário'.padEnd(16) +
    'Dispositivo'.padEnd(30) +
    'Filme'.padEnd(30) +
    'Stream'.padEnd(10) +
    'TTFB'.padEnd(10) +
    'Volume'.padEnd(12) +
    'Taxa Média'
  );
  console.log('-'.repeat(120));

  let totalBytes = 0;
  let successCount = 0;

  results.forEach((r) => {
    totalBytes += r.bytesReceived;
    const isOk = (r.gatewayStatus === 302) && (r.streamStatus === 200 || r.streamStatus === 206);
    if (isOk) successCount++;

    const mb = (r.bytesReceived / (1024 * 1024)).toFixed(2) + ' MB';
    const mbps = `${r.bitrateMbps} Mbps`;
    const ttfb = r.ttfbMs ? `${r.ttfbMs}ms` : 'N/A';

    console.log(
      String(r.index).padEnd(4) +
      r.user.padEnd(16) +
      r.device.padEnd(30) +
      r.movie.slice(0, 28).padEnd(30) +
      String(r.streamStatus || '-').padEnd(10) +
      ttfb.padEnd(10) +
      mb.padEnd(12) +
      mbps
    );
  });

  console.log('-'.repeat(120));
  console.log(`\nRESUMO DA ALTA CONCORRÊNCIA:`);
  console.log(` - Usuários ativos simultâneos:   ${results.length}`);
  console.log(` - Reproduções bem-sucedidas:     ${successCount} / ${results.length} (${Math.round((successCount / results.length) * 100)}%)`);
  console.log(` - Volume total transferido:       ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(` - Throughput agregado da rede:    ${((totalBytes * 8) / (totalElapsed * 1000 * 1000)).toFixed(2)} Mbps`);
  console.log(` - Variação de Heap Memory:        ${((finalMemory.heapUsed - initialMemory.heapUsed) / (1024 * 1024)).toFixed(2)} MB`);
  console.log(` - Tempo total de execução:        ${totalElapsed.toFixed(2)}s`);
  console.log('========================================================================================================\n');
}

runHighConcurrencyTest().catch(console.error);
