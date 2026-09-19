const Database = require('./server/node_modules/better-sqlite3');
const db = new Database('./server/data/iptv.db', { readonly: true });
const byStatus = db.prepare("SELECT status, COUNT(*) AS c FROM streams WHERE type='live' GROUP BY status").all();
console.log('LIVE POR STATUS:', JSON.stringify(byStatus));
const total = db.prepare("SELECT COUNT(*) AS c FROM streams WHERE type='live'").get();
console.log('TOTAL LIVE:', total.c);
const sample = db.prepare('SELECT id, name, status, substr(stream_url, 1, 90) AS u FROM streams WHERE type=? ORDER BY RANDOM() LIMIT 10').all('live');
sample.forEach((r) => console.log(r.id, r.status, r.name, '->', r.u));
db.close();
