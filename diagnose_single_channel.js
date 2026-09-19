// Reproduz um único canal: banco -> rota real de listagem -> origem sem alterar URL.
const Database = require('./server/node_modules/better-sqlite3');
const express = require('./server/node_modules/express');
const jwt = require('./server/node_modules/jsonwebtoken');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const id = Number(process.argv[2] || 44253);
let db, server, dir;
async function main() {
  const source = new Database(path.join(__dirname, 'server/data/iptv.db'), { readonly: true });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'channel-diagnosis-'));
  try { await source.backup(path.join(dir, 'copy.db')); } finally { source.close(); }
  db = new Database(path.join(dir, 'copy.db'));
  const channel = db.prepare('SELECT * FROM streams WHERE id=?').get(id);
  assert.ok(channel, 'Canal não encontrado');
  const url = new URL(channel.stream_url);
  console.log('REGISTRO:', JSON.stringify({ id: channel.id, name: channel.name, type: channel.type,
    status: channel.status, category_id: channel.category_id, protocol: url.protocol,
    host: url.host, urlPresent: Boolean(channel.stream_url), last_check: channel.last_check }));
  const modulePath = require.resolve('./server/src/db/database');
  require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports: db };
  process.env.JWT_SECRET = require('node:crypto').randomBytes(32).toString('hex');
  const uid = db.prepare("INSERT INTO users (username,password_hash,role,status) VALUES (?,?,'client','active')")
    .run(`diagnostic_${Date.now()}`, 'not-a-login-password').lastInsertRowid;
  const token = jwt.sign({ id: uid }, process.env.JWT_SECRET, { expiresIn: '1m' });
  const app = express();
  app.use('/api/client', require('./server/src/routes/client'));
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/client/streams?type=live&search=${encodeURIComponent(channel.name)}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000)
  });
  const body = await response.json();
  const listed = Array.isArray(body) && body.find(c => c.id === id);
  console.log('API REAL:', JSON.stringify({ status: response.status, channelFound: Boolean(listed),
    sameUrlAsDatabase: Boolean(listed && listed.stream_url === channel.stream_url) }));
  // GET simples na URL existente. Não tenta credenciais, headers alternativos ou contornar bloqueios.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const upstream = await fetch(channel.stream_url, { redirect: 'manual', signal: controller.signal,
      headers: { Accept: '*/*', 'User-Agent': 'VSAIPTV/1.0', 'Accept-Encoding': 'identity',
        ...(/\.m3u8(\?|$)/i.test(channel.stream_url) ? {} : { Range: 'bytes=0-1023' }) } });
    const chunk = upstream.body ? await upstream.body.getReader().read() : {};
    console.log('ORIGEM:', JSON.stringify({ status: upstream.status, statusText: upstream.statusText,
      contentType: upstream.headers.get('content-type'), bytesReceived: chunk.value?.length || 0,
      redirect: Boolean(upstream.headers.get('location')), authenticationChallenge: Boolean(upstream.headers.get('www-authenticate')) }));
  } catch (err) { console.log('ORIGEM:', JSON.stringify({ error: err.name, code: err.cause?.code })); }
  finally { controller.abort(); clearTimeout(timer); }
}
main().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (db) db.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});
