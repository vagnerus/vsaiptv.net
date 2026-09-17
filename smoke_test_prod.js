/**
 * VSAIPTV — Smoke Test em Produção (Fase 4)
 * Valida os endpoints públicos em https://iptv.vsai.com.br
 * 
 * Regra: NUNCA imprimir credenciais nem tokens nos logs/stdout.
 */

const https = require('https');
const fs = require('fs');

const PROD_DOMAIN = 'https://iptv.vsai.com.br';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, PROD_DOMAIN);
    const options = {
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: method,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'VSAIPTV-Production-SmokeTest/1.0',
        ...headers,
      },
      family: 4,
      timeout: 10000,
    };

    if (body) {
      const payload = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  console.log('====================================================');
  console.log('🌐 SMOKE TEST EM PRODUÇÃO: https://iptv.vsai.com.br');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(name, condition, detail = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${name} ${detail}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name} ${detail}`);
      failed++;
    }
  }

  try {
    // 1. Health Checks
    console.log('--- 1. Health Checks & Conectividade do Banco ---');
    const t0Health = Date.now();
    const health = await request('GET', '/health');
    const dtHealth = Date.now() - t0Health;
    assert('Endpoint /health responde 200', health.status === 200, `(${dtHealth}ms)`);
    assert('Integridade do banco de dados reporta "ok"', health.body?.db === 'ok');

    const apiHealth = await request('GET', '/api/health');
    assert('Endpoint /api/health responde 200', apiHealth.status === 200);
    assert('Status de API reporta "ok"', apiHealth.body?.status === 'ok');

    // 2. Validação da Rotação de Credenciais
    console.log('\n--- 2. Rotação de Credenciais & Autenticação ---');
    // Leitura segura do cofre isolado local em WSL
    const credPath = '/home/vsai/.smoke_credentials_fase4.json';
    let creds = null;
    if (fs.existsSync(credPath)) {
      creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    }

    if (!creds) {
      throw new Error(`Arquivo de credenciais de teste não encontrado em: ${credPath}`);
    }

    // Teste 2a: Senha antiga DEVE FALHAR (401)
    const oldLogin = await request('POST', '/api/auth/client-login', {
      username: creds.username_client,
      password: 'senha_antiga_revogada_123'
    });
    assert('Tentativa de login com senha antiga/revogada é rejeitada (401 Unauthorized)', oldLogin.status === 401);

    // Teste 2b: Nova senha rotacionada DEVE FUNCIONAR (200)
    const validLogin = await request('POST', '/api/auth/client-login', {
      username: creds.username_client,
      password: creds.password_client
    });
    assert('Login com nova credencial rotacionada autentica com sucesso (200 OK)', validLogin.status === 200);
    assert('Token JWT gerado e retornado com sucesso', Boolean(validLogin.body?.token));

    const authToken = validLogin.body?.token;

    // 3. Catálogo & Performance de Índices
    console.log('\n--- 3. Catálogo, Paginação & Índices de Performance ---');
    const t0Streams = Date.now();
    const streamsRes = await request('GET', '/api/client/streams?limit=10', null, {
      'Authorization': `Bearer ${authToken}`
    });
    const dtStreams = Date.now() - t0Streams;
    assert('Consulta paginada de streams responde 200', streamsRes.status === 200, `(${dtStreams}ms)`);
    assert('Retorna exatamente 10 streams', Array.isArray(streamsRes.body) && streamsRes.body.length === 10);

    // 4. Busca Server-Side
    console.log('\n--- 4. Busca Server-Side (/api/client/search) ---');
    const t0Search = Date.now();
    const searchRes = await request('GET', '/api/client/search?q=Globo&limit=10', null, {
      'Authorization': `Bearer ${authToken}`
    });
    const dtSearch = Date.now() - t0Search;
    assert('Busca por termo no catálogo responde 200', searchRes.status === 200, `(${dtSearch}ms)`);
    assert('Busca retorna resultados válidos', Array.isArray(searchRes.body) && searchRes.body.length > 0);

    // 5. SSRF no Domínio Público
    console.log('\n--- 5. Teste de Proteção contra SSRF em Produção ---');
    const ssrfLocal = await request('GET', `/api/img?url=${encodeURIComponent('http://localhost:5000/api/admin')}`);
    assert('Tentativa de SSRF para http://localhost:5000 é bloqueada (403 Forbidden)', ssrfLocal.status === 403);

    const ssrfMetadata = await request('GET', `/media/proxy?src=${encodeURIComponent('http://169.254.169.254/latest/meta-data/')}`);
    assert('Tentativa de SSRF para metadados de nuvem é bloqueada (403 Forbidden)', ssrfMetadata.status === 403);

    const ssrfIPv4Mapped = await request('GET', `/api/img?url=${encodeURIComponent('http://[::ffff:127.0.0.1]:5000/secret')}`);
    assert('Tentativa de SSRF para IPv4-mapped IPv6 é bloqueada (403 Forbidden)', ssrfIPv4Mapped.status === 403);

    // 6. Frontend Bundle & Cache
    console.log('\n--- 6. Verificação do Bundle Frontend de Produção ---');
    const htmlRes = await request('GET', '/');
    assert('HTML principal do frontend responde 200', htmlRes.status === 200);
    const htmlBody = typeof htmlRes.body === 'string' ? htmlRes.body : '';
    assert('HTML carrega o novo bundle otimizado com chunking', htmlBody.includes('index-Cyc88vKD.js'));

  } catch (err) {
    console.error('Erro na execução do smoke test:', err.stack || err);
    failed++;
  } finally {
    console.log('\n====================================================');
    console.log(`📊 RESULTADO DO SMOKE TEST: ${passed} PASSOU | ${failed} FALHOU`);
    console.log('====================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
}

run();
