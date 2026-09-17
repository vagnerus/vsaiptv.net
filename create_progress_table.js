const Database = require("./server/node_modules/better-sqlite3");
const db = new Database("./server/data/iptv.db");

// Criar tabela de progresso de assistir
db.exec(`
  CREATE TABLE IF NOT EXISTS user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    stream_id INTEGER,
    episode_id INTEGER,
    type TEXT CHECK(type IN ('movie', 'series', 'live')) NOT NULL,
    progress_time REAL DEFAULT 0,
    duration REAL DEFAULT 0,
    last_watched DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed INTEGER DEFAULT 0,
    FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE,
    FOREIGN KEY (episode_id) REFERENCES series_episodes(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, stream_id, episode_id)
  )
`);

console.log("✅ Tabela user_progress criada");

// Test do usuário valdinei
const user = db.prepare("SELECT id, username, role, credits, max_connections, status, expires_at FROM users WHERE username = 'valdinei'").get();
console.log("\n=== Usuário valdinei ===");
console.log(JSON.stringify(user, null, 2));

// Summary final
const totalMovies = db.prepare("SELECT COUNT(*) as total FROM streams WHERE type = 'movie'").get().total;
const totalSeries = db.prepare("SELECT COUNT(*) as total FROM streams WHERE type = 'series'").get().total;
const totalLive = db.prepare("SELECT COUNT(*) as total FROM streams WHERE type = 'live' AND status = 'online'").get().total;
const totalSports = db.prepare("SELECT COUNT(*) as total FROM streams WHERE type = 'live' AND name LIKE 'ESPN %' OR name LIKE 'SporTV %' OR name LIKE 'Premiere %' OR name LIKE 'Combate %' OR name LIKE 'Globoplay Esp%' OR name LIKE 'SBT Esp%' OR name LIKE 'Record Esp%'").get().total;
const totalEpisodes = db.prepare("SELECT COUNT(*) as total FROM series_episodes").get().total;

console.log("\n📊 DATABASE FINAL:");
console.log(`   Canais ao vivo online: ${totalLive}`);
console.log(`   Canais de esportes novos: ${totalSports}`);
console.log(`   Filmes: ${totalMovies}`);
console.log(`   Séries: ${totalSeries}`);
console.log(`   Episódios: ${totalEpisodes}`);
console.log(`   Total: ${totalLive + totalMovies + totalSeries}`);

db.close();