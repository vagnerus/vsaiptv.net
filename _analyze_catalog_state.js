const Database = require('./server/node_modules/better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'server/data/iptv.db'), { readonly: true });

console.log('Total series in streams:', db.prepare("SELECT count(id) as c FROM streams WHERE type='series'").get().c);
console.log('Total in series_episodes:', db.prepare("SELECT count(id) as c FROM series_episodes").get().c);
console.log('Total categories of series:', db.prepare("SELECT count(id) as c FROM categories WHERE type='series'").get().c);

// Contar quantos streams de series tem stream_url preenchido vs stream_url vazio
const withUrl = db.prepare("SELECT count(id) as c FROM streams WHERE type='series' AND stream_url != ''").get().c;
const withoutUrl = db.prepare("SELECT count(id) as c FROM streams WHERE type='series' AND (stream_url = '' OR stream_url IS NULL)").get().c;
console.log('Series with stream_url (likely individual episodes):', withUrl);
console.log('Series without stream_url (real series containers):', withoutUrl);

db.close();
