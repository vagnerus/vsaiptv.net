// Testes de integração em cópia temporária do catálogo real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('./server/node_modules/better-sqlite3');
const express = require('./server/node_modules/express');
const jwt = require('./server/node_modules/jsonwebtoken');
const bcrypt = require('./server/node_modules/bcryptjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iptv-catalog-'));
const copy = path.join(dir, 'catalog.db');
let db, server;
const target = Number(process.env.TARGET_TOTAL || 30000);
function runImport(extra = {}) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'expand_catalog_30000.js')], {
    cwd: __dirname, encoding: 'utf8', timeout: 240000,
    env: { ...process.env, DB_PATH: copy, TARGET_TOTAL: String(target), SKIP_REMOTE: '1', DRY_RUN: '0', ...extra },
  });
  if (result.status !== 0) console.error(result.stdout, result.stderr);
  assert.equal(result.status, 0, 'Importador deve concluir com sucesso');
  return result.stdout;
}
function counts() {
  return ['streams', 'series_episodes', 'categories'].map(t => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n);
}
async function main() {
  const sourcePath = process.env.TEST_SOURCE_DB || path.join(__dirname, 'server/data/iptv.db');
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try { await source.backup(copy); } finally { source.close(); }
  db = new Database(copy);
  const initial = counts();
  const original = db.prepare('SELECT MAX(id) n FROM streams').get().n || 0;
  runImport({ DRY_RUN: '1' });
  assert.deepEqual(counts(), initial, 'Simulação não pode alterar tabelas');
  assert.equal(fs.existsSync(`${copy}.before_catalog_30000`), false);
  console.log('OK: DRY_RUN sem escrita nem backup');
  console.log(runImport());
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  assert.equal(db.pragma('foreign_key_check').length, 0);
  const total = db.prepare("SELECT COUNT(*) n FROM streams WHERE status='online'").get().n;
  assert.ok(total >= target, `Meta: ${total}/${target}`);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM streams WHERE id <= ?').get(original).n, initial[0]);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM streams s WHERE s.id > ? AND
    (TRIM(s.name) = '' OR NOT EXISTS (SELECT 1 FROM categories c WHERE c.id=s.category_id AND c.type=s.type)
     OR (s.type='series' AND NOT EXISTS (SELECT 1 FROM series_episodes e WHERE e.series_id=s.id))
     OR (s.type!='series' AND s.stream_url NOT LIKE 'http%'))`).get(original).n, 0);
  const expanded = counts();
  runImport();
  assert.deepEqual(counts(), expanded, 'Reexecução não deve duplicar registros');
  console.log('OK: meta, integridade, referências, preservação e idempotência', expanded);
  await testApi(total);
}

async function testApi(total) {
  const dbModule = require.resolve('./server/src/db/database');
  require.cache[dbModule] = { id: dbModule, filename: dbModule, loaded: true, exports: db };
  process.env.JWT_SECRET = 'catalog-test-only-not-production';
  const username = `catalog_test_${Date.now()}`;
  const password = require('node:crypto').randomBytes(16).toString('hex');
  const userId = db.prepare(`INSERT INTO users (username,password_hash,role,status,max_connections)
    VALUES (?,?,'client','active',10)`).run(username, bcrypt.hashSync(password, 4)).lastInsertRowid;
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const app = express();
  app.use(express.json());
  app.use('/api/client', require('./server/src/routes/client'));
  app.use('/', require('./server/src/routes/xtream'));
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, auth = true, json = true) {
    const start = Date.now();
    const res = await fetch(base + route, { headers: auth ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(30000) });
    assert.equal(res.status, 200, route.split('?')[0]);
    const body = json ? await res.json() : await res.text();
    console.log(`OK: ${route.split('?')[0]} (${Date.now() - start}ms)`);
    return body;
  }
  assert.equal((await fetch(base + '/api/client/streams')).status, 401);
  const all = await request('/api/client/streams');
  assert.equal(all.length, total);
  assert.equal(new Set(all.map(s => s.id)).size, total);
  const auth = new URLSearchParams({ username, password }).toString();
  for (const [type, action] of [['live','get_live_streams'], ['movie','get_vod_streams'], ['series','get_series']]) {
    const expected = all.filter(s => s.type === type).length;
    assert.equal((await request(`/api/client/streams?type=${type}`)).length, expected);
    assert.equal((await request(`/player_api.php?${auth}&action=${action}`, false)).length, expected);
  }
  const page = await request('/api/client/streams?page=2&limit=25');
  assert.deepEqual(page.map(s => s.id), all.slice(25,50).map(s => s.id));
  const found = await request(`/api/client/search?q=${encodeURIComponent(all[0].name)}&limit=10`);
  assert.ok(found.some(s => s.id === all[0].id));
  const series = all.find(s => s.type === 'series');
  const detail = await request(`/api/client/stream/${series.id}`);
  assert.ok(detail.episodes.length > 0);
  const m3u = await request(`/get.php?${auth}&type=m3u_plus&output=ts`, false, false);
  assert.ok(m3u.startsWith('#EXTM3U'));
  assert.ok((m3u.match(/#EXTINF/g) || []).length >= all.filter(s => s.type !== 'series').length);
  console.log('SUCESSO: catálogo e APIs testados. Reprodução externa não é comprovada por estes testes.');
}
main().catch(err => { console.error(err); process.exitCode = 1; }).finally(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (db) db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
