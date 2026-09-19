const Database = require('./server/node_modules/better-sqlite3');
const path = require('path');
const { getKnownChannelLogo } = require('./client/src/utils/channelLogos');

const dbPath = path.join(__dirname, 'server', 'data', 'iptv.db');
const db = new Database(dbPath);

console.log('--- Iniciando enriquecimento de logotipos no banco de dados ---');

const updateStmt = db.prepare(`
  UPDATE streams
  SET icon_url = ?, poster_url = ?
  WHERE id = ?
`);

const streams = db.prepare(`
  SELECT id, name, icon_url, poster_url
  FROM streams
  WHERE type = 'live'
`).all();

console.log(`Total de canais ao vivo no banco: ${streams.length}`);

let updatedCount = 0;
let deadCleanedCount = 0;

const tx = db.transaction(() => {
  for (const s of streams) {
    const known = getKnownChannelLogo(s.name);
    const hasDead = s.icon_url && (
      s.icon_url.includes('tjtor8411.com') ||
      s.icon_url.includes('acstatic.co') ||
      s.icon_url.includes('OOjs_UI_icon_play') ||
      s.icon_url.includes('unsplash.com')
    );

    if (known) {
      if (s.icon_url !== known) {
        updateStmt.run(known, known, s.id);
        updatedCount++;
      }
    } else if (hasDead) {
      updateStmt.run(null, null, s.id);
      deadCleanedCount++;
    }
  }
});

tx();

console.log(`✅ Concluído!`);
console.log(`- Canais atualizados com logotipos oficiais: ${updatedCount}`);
console.log(`- Canais com URLs mortas/genéricas limpas: ${deadCleanedCount}`);
