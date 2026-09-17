// ============================================================
// verify_links.js - Verificador de links de conteúdo IPTV
// Marca status='offline' nos links mortos e registra last_check.
// Uso: node verify_links.js [--type=all|live|movie|series] [--limit=N]
// Resultados persistentes (re-executável; ignora já verificados).
// ============================================================
const http = require('http');
const https = require('https');
const path = require('path');
const Database = require('./server/node_modules/better-sqlite3');

const db = new Database(path.join(__dirname, 'server/data/iptv.db'));
db.pragma('journal_mode = WAL');

// Coluna de marcação (idempotente)
const cols = db.prepare('PRAGMA table_info(streams)').all().map(c => c.name);
if (!cols.includes('last_check')) {
  db.exec('ALTER TABLE streams ADD COLUMN last_check DATETIME');
  console.log('🆕 Coluna last_check criada.');
}
const ecols = db.prepare('PRAGMA table_info(series_episodes)').all().map(c => c.name);
if (!ecols.includes('last_check')) {
  db.exec('ALTER TABLE series_episodes ADD COLUMN last_check DATETIME');
  console.log('🆕 Coluna last_check criada (episódios).');
}

const args = {};
process.argv.slice(2).forEach(a => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  if (m) args[m[1]] = m[2];
});
const TYPE = args.type || 'all';
const LIMIT = parseInt(args.limit || '1000000', 10);

const TIMEOUT = 7000;
const CONCURRENCY = 60;
const REDIRECTS = 5;

function buildTasks(type) {
  const tasks = [];
  if (type === 'all' || type === 'live' || type === 'movie') {
    const rows = db.prepare(
      "SELECT id, type, name, stream_url FROM streams WHERE stream_url != '' AND last_check IS NULL AND type IN ('live','movie') ORDER BY id LIMIT ?"
    ).all(LIMIT);
    rows.forEach(r => tasks.push({ id: r.id, series_id: null, type: r.type, name: r.name, url: r.stream_url }));
  }
  if (type === 'all' || type === 'series') {
    const rows = db.prepare(
      "SELECT se.id AS eid, se.series_id, se.title, se.stream_url FROM series_episodes se WHERE se.stream_url != '' AND se.last_check IS NULL ORDER BY se.series_id LIMIT ?"
    ).all(LIMIT);
    rows.forEach(r => tasks.push({ id: r.eid, series_id: r.series_id, type: 'episode', name: r.title, url: r.stream_url }));
  }
  return tasks;
}

// HTTP GET/HEAD seguindo redirecionamentos; retorna true se alcançável
function checkUrl(url) {
  return new Promise((resolve) => {
    let redirects = 0;
    const attempt = (u, useHead) => {
      const mod = /^https:/.test(u) ? https : http;
      const done = (status) => resolve(status >= 200 && status < 400);
      let req;
      try {
        req = mod.request(u, {
          method: useHead ? 'HEAD' : 'GET',
          headers: { 'User-Agent': 'VSAIPTV/1.0', 'Accept': '*/*' },
          timeout: TIMEOUT,
        }, (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < REDIRECTS) {
            redirects++;
            let loc = res.headers.location;
            if (!/^https?:/.test(loc)) {
              const i = u.indexOf('/', u.indexOf('://') + 3);
              const base = i === -1 ? u : u.slice(0, i);
              loc = base + (loc.startsWith('/') ? loc : '/' + loc);
            }
            res.destroy();
            return attempt(loc, useHead);
          }
          if ((res.statusCode === 405 || res.statusCode === 501) && useHead) {
            res.resume();
            return attempt(u, false);
          }
          done(res.statusCode);
          res.resume();
        });
        req.on('timeout', () => { try { req.destroy(); } catch (e) {} done(0); });
        req.on('error', () => done(0));
        req.end();
      } catch (e) {
        done(0);
      }
    };
    attempt(url, true);
  });
}

const updStream = db.prepare('UPDATE streams SET status = ?, last_check = ? WHERE id = ?');
const updEp = db.prepare('UPDATE series_episodes SET last_check = ? WHERE id = ?');

async function run() {
  const tasks = buildTasks(TYPE);
  console.log('🔎 Verificando ' + tasks.length + ' itens (type=' + TYPE + ', conc=' + CONCURRENCY + ', timeout=' + TIMEOUT + 'ms)...');
  if (tasks.length === 0) { console.log('Nada a verificar.'); return; }

  let idx = 0, online = 0, offline = 0;
  const now = new Date().toISOString();
  const seriesOnline = new Map();
  const seriesTotal = new Map();

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= tasks.length) break;
      const t = tasks[i];
      const ok = await checkUrl(t.url);
      if (ok) online++; else offline++;
      if (t.type === 'episode') {
        updEp.run(now, t.id);
        seriesOnline.set(t.series_id, (seriesOnline.get(t.series_id) || 0) + (ok ? 1 : 0));
        seriesTotal.set(t.series_id, (seriesTotal.get(t.series_id) || 0) + 1);
      } else {
        updStream.run(ok ? 'online' : 'offline', now, t.id);
      }
      if ((i + 1) % 500 === 0 || i === tasks.length - 1) {
        console.log('   ' + (i + 1) + '/' + tasks.length + ' | online=' + online + ' offline=' + offline);
      }
    }
  }

  const workers = [];
  const n = Math.min(CONCURRENCY, tasks.length);
  for (let w = 0; w < n; w++) workers.push(worker());
  await Promise.all(workers);

  const updSeriesStream = db.prepare('UPDATE streams SET status = ?, last_check = ? WHERE id = ?');
  let sOn = 0, sOff = 0;
  for (const [sid, on] of seriesOnline) {
    const tot = seriesTotal.get(sid) || 0;
    const status = on > 0 ? 'online' : 'offline';
    updSeriesStream.run(status, now, sid);
    if (status === 'online') sOn++; else sOff++;
  }
  console.log('✅ Concluído: ' + online + ' online | ' + offline + ' offline de ' + tasks.length);
  if (sOn || sOff) console.log('🍿 Séries atualizadas: ' + sOn + ' online | ' + sOff + ' offline');
}

run().catch(e => console.error('ERRO:', e.message));