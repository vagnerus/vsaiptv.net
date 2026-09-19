const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, 'client/public/sw.js'), 'utf8');
async function check(url, options = {}) {
  const handlers = {};
  let result;
  let writes = 0;
  const context = {
    URL, Response, console,
    self: { location: { origin: 'https://iptv.test' }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    fetch: async () => { if (options.offline) throw new Error('offline'); return new Response('network'); },
    caches: {
      open: async () => ({ put: async () => { writes++; if (options.quota) throw new Error('quota'); } }),
      match: async key => options.cached && key === '/index.html' ? new Response('shell') : undefined,
    }
  };
  vm.runInNewContext(code, context);
  handlers.fetch({ request: { url, method: options.method || 'GET', mode: options.mode || 'cors', headers: new Headers(options.range ? { Range: 'bytes=0-10' } : {}) }, respondWith: p => { result = p; } });
  if (options.skipped) { assert.equal(result, undefined, url); return; }
  const response = await result;
  assert.ok(response instanceof Response);
  assert.equal(response.status, options.status || 200);
  if (options.body) assert.equal(await response.text(), options.body);
  if (options.noWrite) assert.equal(writes, 0);
}
(async () => {
  for (const url of ['chrome-extension://abc/test.js', 'https://external.test/a.jpg', 'http://external.test/a.jpg', 'https://iptv.test/api/client/streams', 'https://iptv.test/media/proxy?src=a', 'https://iptv.test/live/a', 'https://iptv.test/get.php', 'https://iptv.test/health']) {
    await check(url, { skipped: true, mode: 'navigate' });
  }
  await check('https://iptv.test/assets/app.js', { method: 'POST', skipped: true });
  await check('https://iptv.test/assets/app.js', { range: true, skipped: true });
  await check('https://iptv.test/assets/app.js', { offline: true, status: 503 });
  await check('https://iptv.test/', { mode: 'navigate', offline: true, status: 503 });
  await check('https://iptv.test/', { mode: 'navigate', offline: true, cached: true, body: 'shell' });
  await check('https://iptv.test/assets/app.js', { quota: true, body: 'network' });
  await check('https://iptv.test/?private=1', { mode: 'navigate', noWrite: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'client/public/manifest.json'), 'utf8'));
  assert.equal(manifest.share_target.enctype, 'application/x-www-form-urlencoded');
  assert.ok(fs.readFileSync(path.join(__dirname, 'client/index.html'), 'utf8').includes('name="mobile-web-app-capable"'));
  console.log('OK: SW ignora extensões, terceiros, mídia, API e POST; offline sempre retorna Response; falha de cache não quebra rede; manifesto e meta válidos.');
})().catch(err => { console.error(err); process.exitCode = 1; });
