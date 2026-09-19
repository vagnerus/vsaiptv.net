/**
 * tests/concurrent_playback_stress_test.js
 * Teste de Carga de Reprodução Concorrente — VSAIPTV Universal Smart TV
 * 
 * Simula 10 usuários distintos assistindo simultaneamente a 10 filmes diferentes
 * através da arquitetura completa do VSAIPTV:
 * - Autenticação individual por usuário via Gateway Xtream (/movie/:user/:pass/:streamId)
 * - Registro de sessões ativas no ConnectionManager (tabela active_connections)
 * - Proxy de streaming resiliente com Range HTTP 206 e headers adaptativos
 * - Medição de TTFB, Throughput, Volume Transferido e Estabilidade Concorrente
 */

const http = require('http');
const https = require('https');
const db = require('../server/src/db/database.js');

const DURATION_SECONDS = 10;

// Configuração dos 10 usuários e seus respectivos dispositivos/filmes
const concurrentSessions = [
  {
    userId: 'client_tv_1',
    password: 'teste123',
    streamId: 90001,
    movieTitle: 'Duna (4K HDR)',
    device: 'Samsung Smart TV (Tizen 6.5)',
    userAgent: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5; SAMSUNG SM-Q90T) VSAIPTV-Tizen/2.0',
    clientIp: '189.40.10.11'
  },
  {
    userId: 'client_tv_2',
    password: 'teste123',
    streamId: 90002,
    movieTitle: 'Seven Snipers (Ação)',
    device: 'LG Smart TV (webOS 6.0)',
    userAgent: 'Mozilla/5.0 (Web0S; SmartTV; LG OLED55C1) VSAIPTV-webOS/2.0',
    clientIp: '177.18.25.42'
  },
  {
    userId: 'client_tv_3',
    password: 'teste123',
    streamId: 90003,
    movieTitle: 'Simplesmente Amor (Romance)',
    device: 'Google TV / Sony BRAVIA 4K',
    userAgent: 'Mozilla/5.0 (Linux; Android 12; BRAVIA 4K VH2) VSAIPTV-AndroidTV/2.0',
    clientIp: '201.55.12.83'
  },
  {
    userId: 'client_tv_4',
    password: 'teste123',
    streamId: 90004,
    movieTitle: 'Oceans: Vida Selvagem (4K)',
    device: 'Amazon Fire TV Stick 4K',
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM) VSAIPTV-FireTV/2.0',
    clientIp: '179.124.8.99'
  },
  {
    userId: 'client_tv_5',
    password: 'teste123',
    streamId: 90005,
    movieTitle: 'Sintel: Crônicas do Dragão (4K)',
    device: 'Hisense Smart TV (VIDAA U6)',
    userAgent: 'Mozilla/5.0 (VIDAA/6.0; Hisense 65U8H) VSAIPTV-VIDAA/2.0',
    clientIp: '187.60.200.15'
  },
  {
    userId: 'client_tv_6',
    password: 'teste123',
    streamId: 90006,
    movieTitle: 'Big Buck Bunny (Animação 4K)',
    device: 'Roku TV 4K HDR',
    userAgent: 'Roku/DV-11.5 (4800X; Roku Ultra) VSAIPTV-Roku/2.0',
    clientIp: '177.85.110.4'
  },
  {
    userId: 'client_tv_7',
    password: 'teste123',
    streamId: 90007,
    movieTitle: 'Mux Cinema Showcase (FHD)',
    device: 'Philips Smart TV (Titan OS)',
    userAgent: 'Mozilla/5.0 (Linux; TitanOS/1.2; Philips The One) VSAIPTV-Titan/2.0',
    clientIp: '191.33.45.67'
  },
  {
    userId: 'client_tv_8',
    password: 'teste123',
    streamId: 90008,
    movieTitle: 'Tears of Steel (Sci-Fi 4K)',
    device: 'Apple TV 4K (tvOS)',
    userAgent: 'AppleTV14,1/tvOS 17.0 VSAIPTV-AppleTV/2.0',
    clientIp: '186.220.15.30'
  },
  {
    userId: 'client_tv_9',
    password: 'teste123',
    streamId: 90009,
    movieTitle: 'Akamai Live Master Showcase',
    device: 'Chrome Web Player (Windows 11)',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36',
    clientIp: '200.147.2.100'
  },
  {
    userId: 'client_tv_10',
    password: 'teste123',
    streamId: 90010,
    movieTitle: 'Surfing Pro League (Esportes)',
    device: 'VSAIPTV Mobile App (Android 14)',
    userAgent: 'VSAIPTV-AndroidApp/2.4.0 (Samsung Galaxy S24 Ultra; Android 14)',
    clientIp: '189.120.88.5'
  }
];

function runSinglePlayback(session, index) {
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

    // 1. Requisitar o Gateway Xtream
    const gatewayUrl = `http://localhost:5000/movie/${session.userId}/${session.password}/${session.streamId}.mp4`;
    
    function consumeStream(targetUrl, hops = 0) {
      if (hops > 5) {
        stats.error = 'Too many redirects';
        return resolve(stats);
      }

      const parsed = new URL(targetUrl, 'http://localhost:5000');
      const mod = parsed.protocol === 'https:' ? https : http;

      const clientReq = mod.request({
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'Range': 'bytes=0-10485760', // 10MB de buffer de inicialização Smart TV
          'User-Agent': session.userAgent,
          'X-Forwarded-For': session.clientIp,
          'Accept': '*/*'
        },
        timeout: 15000
      }, (res) => {
        // Seguir redirecionamento se houver
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          const nextUrl = new URL(res.headers.location, parsed).href;
          res.resume(); // consumir buffer pendente
          return consumeStream(nextUrl, hops + 1);
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

        // Limite da janela de teste
        setTimeout(() => {
          clientReq.destroy();
          const elapsedSec = (Date.now() - startTime) / 1000;
          stats.bitrateMbps = ((stats.bytesReceived * 8) / (elapsedSec * 1000 * 1000)).toFixed(2);
          resolve(stats);
        }, DURATION_SECONDS * 1000);
      });

      clientReq.on('error', (err) => {
        stats.error = err.message;
        resolve(stats);
      });

      clientReq.end();
    }

    const req = http.request(gatewayUrl, {
      method: 'GET',
      headers: {
        'User-Agent': session.userAgent,
        'X-Forwarded-For': session.clientIp
      },
      timeout: 10000
    }, (res) => {
      stats.gatewayStatus = res.statusCode;

      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const proxyLocation = res.headers.location;
        const proxyUrl = proxyLocation.startsWith('http') ? proxyLocation : `http://localhost:5000${proxyLocation}`;
        consumeStream(proxyUrl, 0);
      } else {
        stats.error = `Gateway returned HTTP ${res.statusCode}`;
        resolve(stats);
      }
    });

    req.on('error', (err) => {
      stats.error = err.message;
      resolve(stats);
    });

    req.end();
  });
}

async function startStressTest() {
  console.log('========================================================================================================');
  console.log('TESTE DE ESTRESSE: 10 USUÁRIOS DIFERENTES ASSISTINDO 10 FILMES SIMULTANEAMENTE');
  console.log(`Plataforma: VSAIPTV Universal Smart TV Engine | Duração: ${DURATION_SECONDS} segundos`);
  console.log('========================================================================================================\n');

  console.log('Sessões concorrentes configuradas:');
  concurrentSessions.forEach((s, i) => {
    console.log(`  [${i + 1}] Usuário: ${s.userId.padEnd(14)} | Dispositivo: ${s.device.padEnd(30)} | Filme: ${s.movieTitle}`);
  });

  console.log('\nDisparando 10 reproduções concorrentes...');
  const initialMemory = process.memoryUsage();
  const testStart = Date.now();

  // Disparo simultâneo (com 100ms de jitter de chegada natural de requisição de usuário)
  const promises = concurrentSessions.map(async (session, index) => {
    await new Promise(r => setTimeout(r, index * 100));
    return runSinglePlayback(session, index);
  });

  // Consultar conexões ativas registradas no banco no meio do teste
  let activeConnectionsSnapshot = [];
  setTimeout(() => {
    try {
      activeConnectionsSnapshot = db.prepare(`
        SELECT ac.id, u.username, s.name as stream_name, ac.device_type, ac.ip_address 
        FROM active_connections ac
        JOIN users u ON ac.user_id = u.id
        LEFT JOIN streams s ON ac.stream_id = s.id
        ORDER BY ac.id DESC LIMIT 15
      `).all();
    } catch (e) {}
  }, 3000);

  const results = await Promise.all(promises);
  const totalElapsed = (Date.now() - testStart) / 1000;
  const finalMemory = process.memoryUsage();

  console.log('\n========================================================================================================');
  console.log('RELATÓRIO CONSOLIDADO DE PERFORMANCE CONCORRENTE (10 USUÁRIOS x 10 FILMES)');
  console.log('========================================================================================================');
  console.log(
    '#'.padEnd(4) +
    'Usuário'.padEnd(15) +
    'Dispositivo'.padEnd(30) +
    'Filme'.padEnd(30) +
    'Gateway'.padEnd(10) +
    'Stream'.padEnd(10) +
    'TTFB'.padEnd(10) +
    'Dados'.padEnd(12) +
    'Taxa Média'
  );
  console.log('-'.repeat(128));

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
      r.user.padEnd(15) +
      r.device.padEnd(30) +
      r.movie.slice(0, 28).padEnd(30) +
      String(r.gatewayStatus || '-').padEnd(10) +
      String(r.streamStatus || '-').padEnd(10) +
      ttfb.padEnd(10) +
      mb.padEnd(12) +
      mbps
    );
  });

  console.log('-'.repeat(128));
  console.log(`\nMETRICAS GERAIS DE CARGA CONCORRENTE:`);
  console.log(` - Usuários ativos simultâneos:   ${results.length}`);
  console.log(` - Reproduções bem-sucedidas:     ${successCount} / ${results.length} (${Math.round((successCount / results.length) * 100)}%)`);
  console.log(` - Volume total transferido:       ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(` - Throughput agregado da rede:    ${((totalBytes * 8) / (totalElapsed * 1000 * 1000)).toFixed(2)} Mbps`);
  console.log(` - Variação de Heap Memory:        ${((finalMemory.heapUsed - initialMemory.heapUsed) / (1024 * 1024)).toFixed(2)} MB`);
  console.log(` - Tempo total de execução:        ${totalElapsed.toFixed(2)}s`);
  console.log(` - Conexões ativas no banco:       ${activeConnectionsSnapshot.length} sessões rastreadas`);
  console.log('========================================================================================================\n');
}

startStressTest().catch(console.error);
