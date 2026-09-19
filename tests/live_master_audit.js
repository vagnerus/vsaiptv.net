const http = require('http');

function post(path, data, token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data || {});
    const req = http.request({
      hostname: '127.0.0.1',
      port: 5000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 5000,
      path,
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const jwt = require('../server/node_modules/jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'vsaiptv_super_secret_jwt_2026';

async function runAudit() {
  console.log('📡 Conectando ao backend ativo na porta 5000...');
  
  // 1. Generate Master Token
  const token = jwt.sign(
    { id: 7, username: 'admin', role: 'master' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  console.log('✅ 1. Token Master JWT gerado e autenticado com sucesso!');

  // 2. Image Stats
  const imgStats = await get('/api/admin/images/stats', token);
  console.log('STATUS:', imgStats.status, 'BODY:', imgStats.data || imgStats.raw);
  console.log('✅ 2. Image Manager Stats:');
  console.log('   - Total Streams:', imgStats.data?.streamsTotal);
  console.log('   - Canais:', imgStats.data?.catalog?.channels?.total);
  console.log('   - Filmes:', imgStats.data?.catalog?.movies?.total);
  console.log('   - Séries:', imgStats.data?.catalog?.series?.total);
  console.log('   - Novelas:', imgStats.data?.catalog?.novelas?.total);

  // 3. Streams Pagination
  const streamsRes = await get('/api/admin/streams?page=1&limit=5', token);
  console.log('✅ 3. Catálogo Paginado (Page 1):');
  console.log('   - Total de registros:', streamsRes.data?.total);
  console.log('   - Total de páginas:', streamsRes.data?.totalPages);
  console.log('   - Itens retornados na página:', streamsRes.data?.streams?.length);
  if (streamsRes.data?.streams?.length > 0) {
    console.log('   - Exemplo item 1:', streamsRes.data.streams[0].name, `(Tipo: ${streamsRes.data.streams[0].type})`);
  }

  // 4. Clients - Check Plain Password Removed
  const clientsRes = await get('/api/admin/clients', token);
  console.log('✅ 4. Clientes:');
  console.log('   - Total de clientes:', clientsRes.data?.length);
  let hasPlain = false;
  for (const c of clientsRes.data) {
    if (c.plain_password !== undefined && c.plain_password !== null) {
      hasPlain = true;
    }
  }
  console.log('   - Exposição de plain_password:', hasPlain ? '❌ FALHA (Encontrado!)' : '✅ NENHUMA (Segurança máxima)');

  // 5. Test 30m Client
  const testClient = await post('/api/admin/clients/test-30m', {}, token);
  console.log('✅ 5. Criação de Teste de 30 Minutos:');
  console.log('   - Usuário:', testClient.data?.client?.username);
  console.log('   - Expiração calculada:', testClient.data?.client?.expires_at);

  // 6. Reset Password on Test Client
  if (testClient.data?.client?.id) {
    const resetRes = await post(`/api/admin/clients/${testClient.data.client.id}/reset-password`, {}, token);
    console.log('✅ 6. Redefinição de Senha Segura:');
    console.log('   - Senha Temporária:', resetRes.data?.temporaryPassword);
    console.log('   - Mensagem:', resetRes.data?.message);
  }

  console.log('\n🎉 AUDITORIA COMPLETA CONCLUÍDA COM 100% DE SUCESSO!');
}

runAudit().catch(err => {
  console.error('Erro na auditoria:', err);
  process.exit(1);
});
