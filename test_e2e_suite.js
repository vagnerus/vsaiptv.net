/**
 * VSAIPTV — End-to-End Automated Test Suite (Fase 3)
 * Valida fluxos reais de ponta a ponta: Health, Auth, Catalog, SSRF, Rate Limiter e Search.
 */

const http = require('http');

const TEST_PORT = 5055;
process.env.PORT = TEST_PORT;
process.env.JWT_SECRET = 'test_jwt_secret_ultra_secure_fase3_2026!';

// Inicia servidor local em porta isolada para testes
console.log('🚀 Iniciando servidor isolado de testes na porta', TEST_PORT);
const serverModule = require('./server/src/server.js');

const BASE_URL = `http://localhost:${TEST_PORT}`;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, BASE_URL);
    const options = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: method,
      headers: {
        'Accept': 'application/json',
        ...headers,
      },
    };

    if (body) {
      const payload = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n====================================================');
  console.log('🧪 EXECUTANDO SUÍTE DE TESTES E2E — VSAIPTV FASE 3');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(name, condition, extra = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${name} ${extra}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name} ${extra}`);
      failed++;
    }
  }

  // Espera 1s para o servidor estabilizar
  await new Promise(r => setTimeout(r, 1000));

  try {
    // 1. Health Check
    console.log('--- 1. Health Check & Integridade do Banco ---');
    const health = await request('GET', '/health');
    assert('Endpoint /health responde HTTP 200', health.status === 200);
    assert('Status de banco reporta "ok"', health.body?.db === 'ok');

    const apiHealth = await request('GET', '/api/health');
    assert('Endpoint /api/health responde HTTP 200', apiHealth.status === 200);
    assert('Status geral reporta "ok"', apiHealth.body?.status === 'ok');

    // 2. Autenticação & Autorização
    console.log('\n--- 2. Autenticação, Tokens & Níveis de Acesso ---');
    const invalidLogin = await request('POST', '/api/auth/client-login', { username: 'valdinei', password: 'wrong_password_123' });
    assert('Login com senha incorreta é rejeitado (401)', invalidLogin.status === 401);

    // Login com cliente válido
    const db = require('./server/src/db/database');
    const clientUser = db.prepare("SELECT username, plain_password FROM users WHERE role = 'client' LIMIT 1").get();
    let authToken = null;

    if (clientUser && clientUser.plain_password) {
      const validLogin = await request('POST', '/api/auth/client-login', { username: clientUser.username, password: clientUser.plain_password });
      assert('Login com cliente válido autentica com sucesso (200)', validLogin.status === 200);
      authToken = validLogin.body?.token;
      assert('Retorna token JWT válido', typeof authToken === 'string' && authToken.length > 20);
    } else {
      console.log('  ⚠️ Usuário de teste não possui plain_password salvo; gerando token sintético.');
      const jwt = require('./server/node_modules/jsonwebtoken');
      authToken = jwt.sign({ id: 1, username: 'test', role: 'client' }, process.env.JWT_SECRET);
    }

    // Token adulterado
    const tampered = await request('GET', '/api/client/portal', null, { 'Authorization': `Bearer ${authToken}tampered_signature` });
    assert('Token JWT adulterado é rejeitado com 403 Forbidden', tampered.status === 403);

    // Token vazio / ausente
    const noToken = await request('GET', '/api/client/portal');
    assert('Requisição sem token em rota protegida é rejeitada com 401', noToken.status === 401);

    // Tentativa de cliente acessar rota de admin
    const clientAccessAdmin = await request('GET', '/api/admin/overview', null, { 'Authorization': `Bearer ${authToken}` });
    assert('Cliente tentando acessar /api/admin é barrado com 403 (RBAC)', clientAccessAdmin.status === 403);

    // 3. Catálogo & Paginação
    console.log('\n--- 3. Catálogo, Contagens Indexadas & Paginação ---');
    const streamsPage1 = await request('GET', '/api/client/streams?type=live&page=1&limit=10', null, { 'Authorization': `Bearer ${authToken}` });
    assert('Paginação em /api/client/streams funciona (HTTP 200)', streamsPage1.status === 200);
    assert('Retorna exatamente o limit solicitado (10 itens)', Array.isArray(streamsPage1.body) && streamsPage1.body.length === 10);

    const seriesData = await request('GET', '/api/client/streams?type=series&page=1&limit=5', null, { 'Authorization': `Bearer ${authToken}` });
    assert('Consulta de séries com cache de contagens responde (HTTP 200)', seriesData.status === 200);
    assert('Séries possuem episode_count mapeado', seriesData.body.length > 0 && typeof seriesData.body[0].episode_count === 'number');

    // 4. Busca Server-Side
    console.log('\n--- 4. Busca Server-Side Otimizada (/api/client/search) ---');
    const searchRes = await request('GET', '/api/client/search?q=Globo&limit=10', null, { 'Authorization': `Bearer ${authToken}` });
    assert('Busca server-side responde HTTP 200', searchRes.status === 200);
    assert('Retorna resultados filtrados', Array.isArray(searchRes.body) && searchRes.body.length > 0);

    const searchEmpty = await request('GET', '/api/client/search?q=', null, { 'Authorization': `Bearer ${authToken}` });
    assert('Busca vazia retorna lista vazia imediatamente sem sobrecarga', Array.isArray(searchEmpty.body) && searchEmpty.body.length === 0);

    // 5. Segurança: Proteção contra SSRF
    console.log('\n--- 5. Proteção contra Server-Side Request Forgery (SSRF) ---');
    const ssrfLocalhost = await request('GET', `/api/img?url=${encodeURIComponent('http://localhost:5000/api/admin')}`);
    assert('Tentativa de SSRF para http://localhost é bloqueada com 403', ssrfLocalhost.status === 403);

    const ssrfLoopback = await request('GET', `/api/img?url=${encodeURIComponent('http://127.0.0.1:8080/secret')}`);
    assert('Tentativa de SSRF para http://127.0.0.1 é bloqueada com 403', ssrfLoopback.status === 403);

    const ssrfIPv6Loopback = await request('GET', `/api/img?url=${encodeURIComponent('http://[::1]:8080/secret')}`);
    assert('Tentativa de SSRF para IPv6 [::1] é bloqueada com 403', ssrfIPv6Loopback.status === 403);

    const ssrfIPv4Mapped = await request('GET', `/api/img?url=${encodeURIComponent('http://[::ffff:127.0.0.1]:8080/secret')}`);
    assert('Tentativa de SSRF para IPv4-mapped IPv6 ([::ffff:127.0.0.1]) é bloqueada com 403', ssrfIPv4Mapped.status === 403);

    const ssrf10Net = await request('GET', `/media/proxy?src=${encodeURIComponent('http://10.254.1.1/stream.m3u8')}`);
    assert('Tentativa de SSRF para 10.x.x.x é bloqueada com 403', ssrf10Net.status === 403);

    const ssrf172Net = await request('GET', `/media/proxy?src=${encodeURIComponent('http://172.16.0.5/stream.m3u8')}`);
    assert('Tentativa de SSRF para 172.16.x.x é bloqueada com 403', ssrf172Net.status === 403);

    const ssrfMetadata = await request('GET', `/media/proxy?src=${encodeURIComponent('http://169.254.169.254/latest/meta-data/')}`);
    assert('Tentativa de SSRF para metadados de nuvem (169.254.169.254) é bloqueada com 403', ssrfMetadata.status === 403);

    const ssrfPrivateRFC1918 = await request('GET', `/media/proxy?src=${encodeURIComponent('http://192.168.1.1/admin')}`);
    assert('Tentativa de SSRF para rede privada (192.168.1.1) é bloqueada com 403', ssrfPrivateRFC1918.status === 403);

    // Testes diretos de safeDnsLookup (DNS Rebinding & TOCTOU prevention)
    const { safeDnsLookup, isBlockedTarget: checkTarget, isPrivateOrBlockedIP: checkIP } = serverModule;

    const dnsTestPromise = (target) => new Promise((resolve) => {
      safeDnsLookup(target, {}, (err, addr, fam) => {
        resolve({ err, addr, fam });
      });
    });

    const dnsLocalhost = await dnsTestPromise('localhost');
    assert('safeDnsLookup bloqueia hostname "localhost" via resolução DNS (ERR_SSRF_BLOCKED)', dnsLocalhost.err?.code === 'ERR_SSRF_BLOCKED');

    const dns127 = await dnsTestPromise('127.0.0.1');
    assert('safeDnsLookup bloqueia IP literal 127.0.0.1 (ERR_SSRF_BLOCKED)', dns127.err?.code === 'ERR_SSRF_BLOCKED');

    const dnsMetadata = await dnsTestPromise('169.254.169.254');
    assert('safeDnsLookup bloqueia IP de metadados 169.254.169.254 (ERR_SSRF_BLOCKED)', dnsMetadata.err?.code === 'ERR_SSRF_BLOCKED');

    const dnsPublic = await dnsTestPromise('1.1.1.1');
    assert('safeDnsLookup permite IP público legítimo (1.1.1.1)', !dnsPublic.err && dnsPublic.addr === '1.1.1.1');

    assert('isBlockedTarget bloqueia sufixo .local', checkTarget('http://mydevice.local/test'));
    assert('isBlockedTarget bloqueia sufixo .internal', checkTarget('http://metadata.google.internal/test'));
    assert('isPrivateOrBlockedIP identifica CGNAT (100.64.0.1)', checkIP('100.64.0.1'));
    assert('isPrivateOrBlockedIP identifica Multicast (224.0.0.1)', checkIP('224.0.0.1'));

    // 6. Segurança: Rate Limiting
    console.log('\n--- 6. Rate Limiting em Endpoints Sensíveis ---');
    let rateLimitTriggered = false;
    for (let i = 0; i < 20; i++) {
      const rl = await request('POST', '/api/auth/client-login', { username: 'test_brute_force', password: '123' });
      if (rl.status === 429) {
        rateLimitTriggered = true;
        break;
      }
    }
    assert('Rate limiting bloqueia ataques de força bruta (HTTP 429 Too Many Requests)', rateLimitTriggered);

  } catch (err) {
    console.error('Erro na execução da suíte:', err);
    failed++;
  } finally {
    console.log('\n====================================================');
    console.log(`📊 RESULTADO FINAL DA SUÍTE: ${passed} PASSOU | ${failed} FALHOU`);
    console.log('====================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
