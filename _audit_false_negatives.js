// Mede falsos negativos da auditoria: re-testado com timeout generoso,
// quantos dos canais recém-desativados na verdade respondem?
const http = require('http');
const https = require('https');
const Database = require('./server/node_modules/better-sqlite3');
const db = new Database('./server/data/iptv.db', { readonly: true });

const SINCE = new Date(Date.now() - 30 * 60 * 1000).toISOString();
const rows = db.prepare(`
  SELECT id, name, stream_url FROM streams
  WHERE type='live' AND status='offline' AND last_check >= ?
  ORDER BY RANDOM() LIMIT 20
`).all(SINCE);
db.close();

console.log(`Re-testando ${rows.length} canais desativados recentemente (timeout 25s)...\n`);

function probe(url) {
  return new Promise((resolve) => {
    let redirects = 0;
    const attempt = (current) => {
      let target;
      try { target = new URL(current); } catch (e) { return resolve({ ok: false, reason: 'url-invalida' }); }
      const mod = target.protocol === 'https:' ? https : http;
      const req = mod.get(target, {
        family: 4,
        timeout: 25000,
        headers: { 'User-Agent': 'VSAIPTV/1.0', Accept: '*/*', 'Accept-Encoding': 'identity' },
      }, (res) => {
        const status = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirects < 5) {
          redirects += 1;
          res.resume();
          try { return attempt(new URL(res.headers.location, target).href); } catch (e) { return resolve({ ok: false, reason: 'redirect' }); }
        }
        const ct = String(res.headers['content-type'] || '').toLowerCase();
        res.resume();
        resolve({ ok: status >= 200 && status < 300 && !/text\/html|json/.test(ct), reason: `http-${status} ${ct || 'sem-tipo'}` });
      });
      req.setTimeout(25000, () => { req.destroy(); resolve({ ok: false, reason: 'timeout-25s' }); });
      req.on('error', (e) => resolve({ ok: false, reason: e.code }));
    };
    attempt(url);
  });
}

(async () => {
  let alive = 0;
  for (const row of rows) {
    const result = await probe(row.stream_url);
    if (result.ok) alive += 1;
    console.log(`${result.ok ? '✅ RESPONDE' : '   ❌ morto  '} | ${String(row.name).slice(0, 34).padEnd(34)} | ${result.reason.padEnd(26)} | ${String(row.stream_url).slice(0, 55)}`);
  }
  console.log(`\nAinda respondem (falso negativo da auditoria): ${alive}/${rows.length}`);
})();