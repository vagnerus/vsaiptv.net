const Database = require('better-sqlite3');
const db = new Database('/home/vsai/vsaiptv/server/data/iptv.db');
console.log('Integrity check:');
console.log(db.prepare('PRAGMA integrity_check;').all());
console.log('Quick check:');
console.log(db.prepare('PRAGMA quick_check;').all());
try {
  const counts = db.prepare(`
    SELECT series_id, COUNT(*) as episode_count, COUNT(DISTINCT season_num) as season_count
    FROM series_episodes
    GROUP BY series_id
    LIMIT 5
  `).all();
  console.log('Query series_episodes test: OK, sample:', counts);
} catch (e) {
  console.error('Query series_episodes error:', e);
}
