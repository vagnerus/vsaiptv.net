const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'data', 'iptv.db');
const db = new Database(dbPath);
console.log('Integrity check:');
console.log(db.prepare('PRAGMA integrity_check;').all());
console.log('Quick check:');
console.log(db.prepare('PRAGMA quick_check;').all());
console.log('Database:', dbPath);
const users = db.prepare("SELECT username, role, max_connections FROM users WHERE username IN ('valdinei', 'vagner')").all();
console.log('Users max_connections:', users);

console.log('Streams by type:', db.prepare('SELECT type, COUNT(*) AS total FROM streams GROUP BY type').all());
console.log('Missing thumbs by type:', db.prepare(`
  SELECT type, COUNT(*) AS total
  FROM streams
  WHERE COALESCE(icon_url, '') = '' AND COALESCE(poster_url, '') = ''
  GROUP BY type
`).all());
