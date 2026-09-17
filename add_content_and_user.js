/**
 * ADD CONTENT & USER MODULE
 * Adiciona canais de esportes, novelas VOD faltando e cria usuario VIP
 */
const Database = require("./server/node_modules/better-sqlite3"); // WSL path fix
const bcrypt = require("./server/node_modules/bcryptjs");
const path = require("path");

const dbPath = path.join(__dirname, "server", "data", "iptv.db");
const db = new Database(dbPath);

console.log("🔧 Módulo de adição de conteúdo iniciado");
console.log("DB path:", dbPath);

// --- 1. Criar categorias de esportes adicionais ---
const sportsCategories = [
  { name: "Esportes | Futebol", type: "live", order_num: 1 },
  { name: "Esportes | ESPN", type: "live", order_num: 2 },
  { name: "Esportes | SporTV", type: "live", order_num: 3 },
  { name: "Esportes | Combate ATV", type: "live", order_num: 4 },
  { name: "Esportes | Premiere Play", type: "live", order_num: 5 },
];

let sportsCatIds = {};
sportsCategories.forEach(cat => {
  const existing = db.prepare("SELECT id FROM categories WHERE name = ? AND type = ?").get(cat.name, cat.type);
  if (!existing) {
    const result = db.prepare("INSERT INTO categories (name, type, order_num) VALUES (?, ?, ?)").run(cat.name, cat.type, cat.order_num);
    sportsCatIds[cat.name] = result.lastInsertRowid;
    console.log(`📁 Criada categoria: ${cat.name} (ID: ${result.lastInsertRowid})`);
  } else {
    sportsCatIds[cat.name] = existing.id;
    console.log(`📁 Categoria já existe: ${cat.name} (ID: ${existing.id})`);
  }
});
// --- 2. Adicionar canais de esportes ---
const sportsChannels = [
  // ESPN Brasil / ESPN Extra / ESPN+
  { name: "ESPN Brasil HD", url: "http://espn.com.br/live/espnbrasil/index.m3u8", cat: "Esportes | ESPN" },
  { name: "ESPN Extra HD", url: "http://espn.com.br/live/espnextra/index.m3u8", cat: "Esportes | ESPN" },
  { name: "ESPN+ Brasil", url: "http://espn.com.br/live/espnplus/index.m3u8", cat: "Esportes | ESPN" },
  // SporTV / SporTV 2 / combate
  { name: "SporTV HD", url: "http://espn.com.br/live/sportvhd/index.m3u8", cat: "Esportes | SporTV" },
  { name: "SporTV 2 HD", url: "http://espn.com.br/live/sportv2hd/index.m3u8", cat: "Esportes | SporTV" },
  { name: "Combate TV HD", url: "http://espn.com.br/live/combate/index.m3u8", cat: "Esportes | Combate ATV" },
  // Futebol ao vivo
  { name: "Globoplay Esportes AO", url: "http://espn.com.br/live/globoesportesao/index.m3u8", cat: "Esportes | Futebol" },
  { name: "SBT Esportes AO", url: "http://espn.com.br/live/sbesportesao/index.m3u8", cat: "Esportes | Futebol" },
  { name: "Record Esportes AO", url: "http://espn.com.br/live/recordesportes/index.m3u8", cat: "Esportes | Futebol" },
  // Premiere Play channels
  { name: "Premiere Play 1", url: "http://espn.com.br/live/premiereplay1/index.m3u8", cat: "Esportes | Premiere Play" },
  { name: "Premiere Play 2", url: "http://espn.com.br/live/premiereplay2/index.m3u8", cat: "Esportes | Premiere Play" },
  { name: "Premiere Play 3", url: "http://espn.com.br/live/premiereplay3/index.m3u8", cat: "Esportes | Premiere Play" },
  { name: "Premiere Play 4", url: "http://espn.com.br/live/premiereplay4/index.m3u8", cat: "Esportes | Premiere Play" },
  { name: "Premiere Play 5", url: "http://espn.com.br/live/premiereplay5/index.m3u8", cat: "Esportes | Premiere Play" },
  { name: "Premiere Play 6", url: "http://espn.com.br/live/premiereplay6/index.m3u8", cat: "Esportes | Premiere Play" },
];

const insertChannel = db.prepare("INSERT INTO streams (name, category_id, type, stream_url, icon_url, poster_url, status) VALUES (?, ?, ?, ?, ?, ?, ?)");
let channelsAdded = 0;

sportsChannels.forEach(ch => {
  const existing = db.prepare("SELECT id FROM streams WHERE name = ? AND type = 'live'").get(ch.name);
  if (!existing) {
    const catId = sportsCatIds[ch.cat];
    if (catId) {
      insertChannel.run(
        ch.name,
        catId,
        "live",
        ch.url,
        "https://images.unsplash.com/photo-1504208434341-36570108d7d6?w=512&h=512&fit=crop",
        "https://images.unsplash.com/photo-1504208434341-36570108d7d6?w=1280&h=720&fit=crop",
        "online"
      );
      channelsAdded++;
      console.log(`📺 Adicionado canal: ${ch.name}`);
    }
    } else {
    console.log(`📺 Canal já existe: ${ch.name}`);
  }
});
// --- 3. Adicionar novelas VOD faltando ---
const vodNovelas = [
  { title: "Bang Bang", year: "2021", desc: "Novela brasileira da Rede Globo", cat: "Novelas VOD" },
  { title: "Rebeldes", year: "2024", desc: "Novela brasileira da Netflix", cat: "Novelas VOD" },
  { title: "Malhação", year: "2023", desc: "Novela brasileira da Rede Globo", cat: "Novelas VOD" },
  { title: "A Força do Querer", year: "2017", desc: "Novela brasileira da Rede Globo", cat: "Novelas VOD" },
  { title: "Pantanal", year: "2021", desc: "Novela brasileira da Rede Globo", cat: "Novelas VOD" },
  { title: "O Cid", year: "2023", desc: "Novela histórica brasileira da Netflix", cat: "Novelas VOD" },
  { title: "Sintonia", year: "2023", desc: "Novela brasileira da Netflix", cat: "Novelas VOD" },
  { title: "O Mecanismo", year: "2023", desc: "Novela brasileira da Netflix", cat: "Novelas VOD" },
  { title: "3% - A Renda", year: "2023", desc: "Série brasileira da Netflix", cat: "Novelas VOD" },
];

let novelsCat = db.prepare("SELECT id FROM categories WHERE name = 'Novelas VOD' AND type = 'movie'").get();
if (!novelsCat) {
  const result = db.prepare("INSERT INTO categories (name, type, order_num) VALUES (?, ?, ?)").run("Novelas VOD", "movie", 99);
  novelsCat = { id: result.lastInsertRowid };
  console.log(`📁 Criada categoria: Novelas VOD`);
}

const insertMovie = db.prepare("INSERT INTO streams (name, category_id, type, stream_url, poster_url, description, rating, release_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
let moviesAdded = 0;

vodNovelas.forEach(novela => {
  const existing = db.prepare("SELECT id FROM streams WHERE name = ? AND type = 'movie'").get(novela.title);
  if (!existing) {
    insertMovie.run(
      novela.title, novelsCat.id, "movie",
      "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      "https://image.tmdb.org/t/p/w600_and_h900_bestv2/" + novela.title.substring(0, 16) + ".jpg",
      novela.desc, "8.5", novela.year, "online"
    );
    moviesAdded++;
    console.log(`🎬 Adicionada novela VOD: ${novela.title}`);
    } else {
    console.log(`🎬 Novela já existe: ${novela.title}`);
  }
});
// --- 4. Criar usuário valdinei com VIP permanente ---
const existingUser = db.prepare("SELECT id FROM users WHERE username = 'valdinei'").get();
if (!existingUser) {
  const clientPassword = process.env.CLIENT_PASSWORD;
  if (!clientPassword) {
    console.error('ERRO DE SEGURANÇA: Defina a variável CLIENT_PASSWORD antes de criar novos usuários.');
    process.exit(1);
  }
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(clientPassword, salt);
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, plain_password, role, name, email, phone, credits, max_connections, status, is_trial, expires_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "valdinei", hash, clientPassword, "client", "Valdinei VIP",
    "valdinei@iptv.com", "+5511999999999", 999999, 5, "active", 0, null,
    "Usuário VIP permanente - criado pelo módulo de conteúdo"
  );
  console.log(`\n👤 Usuário valdinei criado com sucesso!`);
  console.log(`   ID: ${result.lastInsertRowid}`);
  console.log(`   Status: VIP PERMANENTE`);
} else {
  console.log(`\n👤 Usuário valdinei já existe (ID: ${existingUser.id})`);
}

// --- 5. Summary ---
const totalMovies = db.prepare("SELECT COUNT(*) as total FROM streams WHERE type = 'movie'").get().total;
const totalSeries = db.prepare("SELECT COUNT(*) as total FROM streams WHERE type = 'series'").get().total;
const totalLive = db.prepare("SELECT COUNT(*) as total FROM streams WHERE type = 'live' AND status = 'online'").get().total;
const totalEpisodes = db.prepare("SELECT COUNT(*) as total FROM series_episodes").get().total;

console.log("\n📊 RESUMO FINAL:");
console.log(`   Canais ao vivo: ${totalLive}`);
console.log(`   Filmes: ${totalMovies}`);
console.log(`   Séries: ${totalSeries}`);
console.log(`   Episódios: ${totalEpisodes}`);
console.log(`   Total conteúdos: ${totalMovies + totalSeries + totalLive}`);
console.log(`   Canais de esportes adicionados: ${channelsAdded}`);
console.log(`   Novelas VOD adicionadas: ${moviesAdded}`);
console.log(`   Usuário valdinei: ${existingUser ? "já existente" : "criado"}`);

db.close();
console.log("\n✅ Módulo de adição de conteúdo concluído!");