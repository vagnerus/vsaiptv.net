const Database = require('./server/node_modules/better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'server/data/iptv.db'));

const updates = [
  { name: 'ESPN Brasil HD', icon: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/ESPN_Brasil_logo.png' },
  { name: 'ESPN Extra HD', icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/ESPN_Extra_logo.svg/512px-ESPN_Extra_logo.svg.png' },
  { name: 'ESPN+ Brasil', icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/ESPN_logo.svg/512px-ESPN_logo.svg.png' },
  { name: 'SporTV HD', icon: 'https://upload.wikimedia.org/wikipedia/pt/thumb/2/25/SporTV_logo_2021.png/512px-SporTV_logo_2021.png' },
  { name: 'SporTV 2 HD', icon: 'https://upload.wikimedia.org/wikipedia/pt/thumb/d/d4/SporTV_2_logo_2021.png/512px-SporTV_2_logo_2021.png' },
  { name: 'Combate TV HD', icon: 'https://upload.wikimedia.org/wikipedia/pt/thumb/2/2b/Canal_Combate_logo_2021.png/512px-Canal_Combate_logo_2021.png' },
  { name: 'Globoplay Esportes AO', icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/TV_Globo_logo_2021.svg/512px-TV_Globo_logo_2021.svg.png' },
  { name: 'SBT Esportes AO', icon: 'https://upload.wikimedia.org/wikipedia/pt/thumb/2/22/SBT_logo_2014.png/512px-SBT_logo_2014.png' },
  { name: 'Record Esportes AO', icon: 'https://upload.wikimedia.org/wikipedia/pt/thumb/c/c9/RecordTV_logo_2023.png/512px-RecordTV_logo_2023.png' }
];

const stmt = db.prepare('UPDATE streams SET icon_url = ?, poster_url = ? WHERE name = ?');
updates.forEach(u => {
  const res = stmt.run(u.icon, u.icon, u.name);
  if (res.changes > 0) console.log('Updated logo for:', u.name);
});

// Also clear any other unsplash dead URLs in streams
const cleared = db.prepare("UPDATE streams SET icon_url = NULL, poster_url = NULL WHERE icon_url LIKE '%unsplash%'").run();
console.log('Cleared dead unsplash placeholders:', cleared.changes);

db.close();
console.log('Finished updating channel logos in database.');
