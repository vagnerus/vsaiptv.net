const Database = require('./server/node_modules/better-sqlite3');
const db = new Database('/home/vsai/vsaiptv/server/data/iptv.db', { readonly: true });

console.log('Streams count:', db.prepare('SELECT count(id) as c FROM streams').get().c);
console.log('Episodes count:', db.prepare('SELECT count(id) as c FROM series_episodes').get().c);
console.log('Existing indexes:', db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type='index'").all());
