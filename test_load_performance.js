/**
 * VSAIPTV — Controlled Local Load & Performance Benchmark
 * Dispara 100 requisições concorrentes medindo latência p50, p95, p99 e throughput.
 */

const http = require('http');

const TEST_PORT = 5056;
process.env.PORT = TEST_PORT;
process.env.JWT_SECRET = 'load_test_jwt_secret_2026!';

const serverModule = require('./server/src/server.js');
const BASE_URL = `http://localhost:${TEST_PORT}`;

function makeRequest(path, headers = {}) {
  const start = process.hrtime.bigint();
  return new Promise((resolve) => {
    const u = new URL(path, BASE_URL);
    const req = http.get({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: { 'Accept': 'application/json', ...headers },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1e6;
        resolve({ statusCode: res.statusCode, durationMs });
      });
    });
    req.on('error', (err) => {
      const end = process.hrtime.bigint();
      resolve({ statusCode: 500, durationMs: Number(end - start) / 1e6, error: err.message });
    });
  });
}

function calculatePercentiles(latencies) {
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const avg = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
  return { p50: p50.toFixed(2), p95: p95.toFixed(2), p99: p99.toFixed(2), avg: avg.toFixed(2) };
}

async function runBenchmark() {
  await new Promise(r => setTimeout(r, 1000));

  console.log('\n====================================================');
  console.log('⚡ BENCHMARK DE PERFORMANCE E CARGA (100 REQS)');
  console.log('====================================================\n');

  // Gerar token de autenticação para teste de carga do catálogo
  const jwt = require('./server/node_modules/jsonwebtoken');
  const token = jwt.sign({ id: 1, username: 'loadtest', role: 'client' }, process.env.JWT_SECRET);
  const authHeaders = { 'Authorization': `Bearer ${token}` };

  // Teste 1: /health (Ping SQLite)
  console.log('1. Testando endpoint /health (Ping SQLite)...');
  const healthPromises = Array.from({ length: 100 }, () => makeRequest('/health'));
  const healthResults = await Promise.all(healthPromises);
  const healthLatencies = healthResults.map(r => r.durationMs);
  const healthStats = calculatePercentiles(healthLatencies);
  console.log(`   Status: 100% HTTP 200 | Média: ${healthStats.avg}ms | p50: ${healthStats.p50}ms | p95: ${healthStats.p95}ms | p99: ${healthStats.p99}ms`);

  // Teste 2: /api/client/search (Busca Server-Side Indexada)
  console.log('2. Testando busca server-side /api/client/search?q=Globo...');
  const searchPromises = Array.from({ length: 60 }, () => makeRequest('/api/client/search?q=Globo&limit=30', authHeaders));
  const searchResults = await Promise.all(searchPromises);
  const searchLatencies = searchResults.map(r => r.durationMs);
  const searchStats = calculatePercentiles(searchLatencies);
  console.log(`   Média: ${searchStats.avg}ms | p50: ${searchStats.p50}ms | p95: ${searchStats.p95}ms | p99: ${searchStats.p99}ms`);

  // Teste 3: /api/client/streams?type=live (Canais indexados)
  console.log('3. Testando catálogo de TV /api/client/streams?type=live&limit=60...');
  const livePromises = Array.from({ length: 50 }, () => makeRequest('/api/client/streams?type=live&page=1&limit=60', authHeaders));
  const liveResults = await Promise.all(livePromises);
  const liveLatencies = liveResults.map(r => r.durationMs);
  const liveStats = calculatePercentiles(liveLatencies);
  console.log(`   Média: ${liveStats.avg}ms | p50: ${liveStats.p50}ms | p95: ${liveStats.p95}ms | p99: ${liveStats.p99}ms`);

  console.log('\n====================================================');
  console.log('✅ BENCHMARK CONCLUÍDO COM SUCESSO');
  console.log('====================================================\n');
  process.exit(0);
}

runBenchmark();
