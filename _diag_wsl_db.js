const Database = require('/home/vsai/vsaiptv/server/node_modules/better-sqlite3');
const path = require('path');
const db = new Database('/home/vsai/vsaiptv/server/data/iptv.db', { readonly: true });
const byStatus = db.prepare("SELECT status, COUNT(*) AS c FROM streams WHERE type='live' GROUP BY status").all();
console.log('WSL-DB LIVE STATUS:', JSON.stringify(byStatus));
const total = db.prepare("SELECT COUNT(*) AS c FROM streams WHERE type='live'").get();
console.log('WSL-DB LIVE TOTAL:', total.c);
db.close();
