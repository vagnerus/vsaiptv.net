const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const express = require('./server/node_modules/express');
const createProxy = require('./server/src/services/mediaProxy');
const listen = app => new Promise(resolve => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

async function main() {
  let origin, proxy;
  let lastRange;
  let streamClosed = false;
  try {
    origin = await listen(http.createServer((req, res) => {
      lastRange = req.headers.range;
      const file = req.url.split('?')[0];
      if (file === '/slow') return;
      if (file === '/redirect') { res.writeHead(302, { location: '/ok.m3u8' }); return res.end(); }
      if (file === '/blocked') { res.writeHead(302, { location: 'http://blocked.invalid/' }); return res.end(); }
      if (file === '/loop') { res.writeHead(302, { location: '/loop' }); return res.end(); }
      if (file === '/stream') {
        res.writeHead(200, { 'content-type': 'video/mp2t' });
        res.write(Buffer.alloc(188, 0x47));
        res.on('close', () => { streamClosed = true; });
        return;
      }
      const status = Number(file.match(/^\/(401|403|404|410|500)/)?.[1] || 200);
      if (status !== 200 || file === '/html.m3u8') {
        res.writeHead(status, { 'content-type': 'text/html' });
        return res.end('<html>secret-token</html>');
      }
      if (file === '/media') {
        res.writeHead(req.headers.range ? 206 : 200, { 'content-type': 'video/mp4' });
        return res.end(Buffer.from([0, 1, 2, 3]));
      }
      res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
      res.end(file === '/invalid.m3u8' ? 'not a playlist' : file === '/large.m3u8'
        ? '#EXTM3U\n' + 'x'.repeat(2048) : '#EXTM3U\n#EXTINF:2,\nsegment.ts\n');
    }));
    const base = `http://127.0.0.1:${origin.address().port}`;
    // Apenas esta origem controlada é autorizada no teste. Produção mantém SSRF/DNS.
    const serverCode = fs.readFileSync(path.join(__dirname, 'server/src/server.js'), 'utf8');
    const helpers = serverCode.slice(serverCode.indexOf('function proxiedMediaUrl('), serverCode.indexOf("const streamProxy = require('./services/mediaProxy')"));
    const isBlockedTarget = url => new URL(url).origin !== base;
    const { isHlsPlaylistResponse, rewriteHlsPlaylist } = new Function('isBlockedTarget', helpers + '\nreturn { isHlsPlaylistResponse, rewriteHlsPlaylist };')(isBlockedTarget);
    const streamProxy = createProxy({ isBlockedTarget, safeDnsLookup: require('node:dns').lookup,
      isHlsPlaylistResponse, rewriteHlsPlaylist, timeoutMs: 300, maxPlaylistBytes: 1024 });
    const app = express();
    app.get('/media/proxy', (req, res) => streamProxy(new URL(req.query.src), req.headers.range ? { range: req.headers.range } : {}, res));
    proxy = await listen(app);
    const endpoint = file => `http://127.0.0.1:${proxy.address().port}/media/proxy?src=${encodeURIComponent(base + file)}`;
    for (const [file, status] of [['/ok.m3u8', 200], ['/redirect', 200], ['/401.m3u8', 401], ['/403', 403], ['/404', 404], ['/410', 410], ['/500', 500], ['/html.m3u8', 502], ['/invalid.m3u8', 502], ['/large.m3u8', 502], ['/slow', 504], ['/blocked', 403], ['/loop', 502]]) {
      const response = await fetch(endpoint(file), { signal: AbortSignal.timeout(3000) });
      const body = await response.text();
      assert.equal(response.status, status, file);
      assert.ok(!body.includes('secret-token'), 'Não expor corpo de erro da origem');
      if (status === 200) {
        assert.ok(body.startsWith('#EXTM3U'));
        assert.ok(body.includes(encodeURIComponent(base + '/segment.ts')), 'Reescrever segmento relativo');
      } else assert.ok(JSON.parse(body).error);
      console.log('OK:', file, status);
    }
    for (const range of [undefined, 'bytes=0-3']) {
      const response = await fetch(endpoint('/media'), { headers: range ? { Range: range } : {} });
      assert.equal(response.status, range ? 206 : 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from([0, 1, 2, 3]));
      assert.equal(lastRange, range);
    }
    const controller = new AbortController();
    const response = await fetch(endpoint('/stream'), { signal: controller.signal });
    await response.body.getReader().read();
    controller.abort();
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(streamClosed, true, 'Saída do player deve fechar a origem');
    const { getSourceHttpError } = await import(pathToFileURL(path.join(__dirname, 'client/src/utils/playbackErrors.js')).href);
    for (const code of [401, 403, 404, 410]) assert.ok(getSourceHttpError(code));
    for (const code of [0, 200, 502, undefined]) assert.equal(getSourceHttpError(code), '');
    console.log('SUCESSO: HLS, erros, timeout, Range, cancelamento e mensagens. Sem alteração no banco.');
  } finally {
    for (const server of [proxy, origin]) if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
