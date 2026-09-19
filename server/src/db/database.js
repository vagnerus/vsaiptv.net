const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '../../data/iptv.db');

// Ensure directory exists
const fs = require('fs');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for high concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize database schema
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      plain_password TEXT,
      role TEXT CHECK(role IN ('master', 'reseller', 'client')) NOT NULL,
      name TEXT,
      email TEXT,
      phone TEXT,
      reseller_id INTEGER,
      credits REAL DEFAULT 0,
      max_connections INTEGER DEFAULT 1,
      status TEXT CHECK(status IN ('active', 'suspended', 'expired')) DEFAULT 'active',
      is_trial INTEGER DEFAULT 0,
      trial_hours INTEGER DEFAULT 0,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      FOREIGN KEY (reseller_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS credit_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reseller_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      balance_after REAL NOT NULL,
      reason TEXT NOT NULL,
      target_user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reseller_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT CHECK(type IN ('live', 'movie', 'series')) NOT NULL,
      order_num INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS streams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER,
      type TEXT CHECK(type IN ('live', 'movie', 'series')) NOT NULL,
      stream_url TEXT NOT NULL,
      icon_url TEXT,
      epg_channel_id TEXT,
      poster_url TEXT,
      description TEXT,
      rating TEXT DEFAULT '8.5',
      release_date TEXT,
      status TEXT CHECK(status IN ('online', 'offline')) DEFAULT 'online',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS series_episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL,
      season_num INTEGER NOT NULL,
      episode_num INTEGER NOT NULL,
      title TEXT NOT NULL,
      stream_url TEXT NOT NULL,
      duration_minutes INTEGER DEFAULT 45,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (series_id) REFERENCES streams(id) ON DELETE CASCADE
    );

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
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS epg_programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stream_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS active_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      stream_id INTEGER,
      session_token TEXT UNIQUE,
      ip_address TEXT,
      user_agent TEXT,
      device_type TEXT,
      connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_ping_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      bytes_transferred INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS firewall_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_address TEXT NOT NULL UNIQUE,
      rule_type TEXT CHECK(rule_type IN ('block', 'allow')) DEFAULT 'block',
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- Performance Indexes for 15k+ streams and 155k+ episodes
    CREATE INDEX IF NOT EXISTS idx_streams_type_status ON streams(type, status);
    CREATE INDEX IF NOT EXISTS idx_streams_category ON streams(category_id);
    CREATE INDEX IF NOT EXISTS idx_streams_name ON streams(name);
    CREATE INDEX IF NOT EXISTS idx_episodes_series ON series_episodes(series_id, season_num);
    CREATE INDEX IF NOT EXISTS idx_user_progress_user ON user_progress(user_id, stream_id);
    CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);

    CREATE TABLE IF NOT EXISTS image_cache (
      url_hash TEXT PRIMARY KEY,
      source_url TEXT NOT NULL,
      local_path TEXT,
      content_type TEXT,
      size_bytes INTEGER DEFAULT 0,
      media_type TEXT DEFAULT 'channel',
      status TEXT CHECK(status IN ('cached', 'valid', 'broken', 'missing', 'fallback')) DEFAULT 'cached',
      http_status INTEGER,
      last_checked DATETIME DEFAULT CURRENT_TIMESTAMP,
      access_count INTEGER DEFAULT 1,
      last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_image_cache_status ON image_cache(status);
    CREATE INDEX IF NOT EXISTS idx_image_cache_media_type ON image_cache(media_type);
    CREATE INDEX IF NOT EXISTS idx_image_cache_last_accessed ON image_cache(last_accessed);
  `);

  // Migration: must_change_password for force password change on first login
  try {
    db.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0");
  } catch (e) {
    // Column already exists
  }

  // Security Migration: Zero plain-text password storage (Phase 2)
  try {
    // Ensure any user missing a hash gets one generated from plain_password before wipe
    const unhashed = db.prepare("SELECT id, plain_password FROM users WHERE password_hash IS NULL OR password_hash = ''").all();
    for (const u of unhashed) {
      if (u.plain_password) {
        const hash = bcrypt.hashSync(u.plain_password, 10);
        db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, u.id);
      }
    }
    // Wipe plain text passwords to protect user security
    db.exec("UPDATE users SET plain_password = NULL WHERE plain_password IS NOT NULL");
  } catch (e) {
    // Ignore migration catch
  }

  // Migration: packages for client content bundle activation
  try {
    db.exec("ALTER TABLE users ADD COLUMN packages TEXT DEFAULT 'live,movie,series,novelas'");
  } catch (e) {
    // Column already exists
  }

  // Migration: XXX area password (separate from account password)
  try {
    db.exec("ALTER TABLE users ADD COLUMN xxx_password_hash TEXT DEFAULT NULL");
  } catch (e) {
    // Column already exists
  }

  // Migration: Parental Control & PIN
  try {
    db.exec("ALTER TABLE users ADD COLUMN parental_pin TEXT DEFAULT NULL");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE users ADD COLUMN parental_locked_categories TEXT DEFAULT 'Adultos,XXX,Adult'");
  } catch (e) {}

  // Migration: Stream Health Monitoring (Phase D)
  try {
    db.exec("ALTER TABLE streams ADD COLUMN health_status TEXT DEFAULT 'unknown'");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE streams ADD COLUMN health_latency_ms INTEGER DEFAULT NULL");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE streams ADD COLUMN health_last_checked DATETIME DEFAULT NULL");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE streams ADD COLUMN health_error_type TEXT DEFAULT NULL");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE streams ADD COLUMN health_attempts INTEGER DEFAULT 0");
  } catch (e) {}

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_streams_health_status ON streams(health_status);
    CREATE INDEX IF NOT EXISTS idx_streams_health_checked ON streams(health_last_checked);
    CREATE INDEX IF NOT EXISTS idx_epg_programs_stream_time ON epg_programs(stream_id, start_time, end_time);
    CREATE INDEX IF NOT EXISTS idx_epg_programs_stream ON epg_programs(stream_id);
    CREATE INDEX IF NOT EXISTS idx_epg_programs_end_time ON epg_programs(end_time);

    -- Phase I: User Profiles & Server-Side Favorites
    CREATE TABLE IF NOT EXISTS user_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT,
      is_kids INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      profile_id INTEGER,
      stream_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, profile_id, stream_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_user_favs_user ON user_favorites(user_id, profile_id);

    -- Phase P: Watch Progress / Resume Playback Enhancements
  `);

  // Migrations para user_progress
  const progressCols = [
    { col: 'profile_id', type: 'INTEGER DEFAULT NULL' },
    { col: 'playback_session_id', type: 'TEXT DEFAULT NULL' },
    { col: 'media_version', type: 'TEXT DEFAULT NULL' },
    { col: 'progress_percent', type: 'REAL DEFAULT 0' },
    { col: 'last_watched_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
    { col: 'is_removed', type: 'INTEGER DEFAULT 0' },
    { col: 'created_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
    { col: 'updated_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' }
  ];

  for (const c of progressCols) {
    try {
      db.exec(`ALTER TABLE user_progress ADD COLUMN ${c.col} ${c.type}`);
    } catch (e) {
      // Coluna já existe
    }
  }

  // Índices otimizados de alta concorrência para consultas instantâneas e upsert único
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_progress_active ON user_progress(user_id, is_removed, completed, last_watched DESC);
    CREATE INDEX IF NOT EXISTS idx_user_progress_profile ON user_progress(user_id, profile_id, is_removed, completed, last_watched DESC);
    CREATE INDEX IF NOT EXISTS idx_user_progress_stream ON user_progress(user_id, stream_id, episode_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_progress_unique_movie ON user_progress(user_id, COALESCE(profile_id, 0), stream_id) WHERE episode_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_progress_unique_ep ON user_progress(user_id, COALESCE(profile_id, 0), stream_id, episode_id) WHERE episode_id IS NOT NULL;
  `);

  db.exec(`

    -- Phase K: Active Devices & Session Tokens
    CREATE TABLE IF NOT EXISTS user_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      device_name TEXT NOT NULL,
      device_type TEXT DEFAULT 'browser',
      ip_address TEXT,
      user_agent TEXT,
      token_hash TEXT UNIQUE,
      last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_revoked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id, is_revoked);

    -- Phase N: Sanitized Error Logs & Observability
    CREATE TABLE IF NOT EXISTS system_error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      error_type TEXT NOT NULL,
      content_id INTEGER,
      content_name TEXT,
      error_message TEXT NOT NULL,
      http_status INTEGER,
      ip_address TEXT,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_error_logs_type ON system_error_logs(error_type);
    CREATE INDEX IF NOT EXISTS idx_error_logs_created ON system_error_logs(created_at);

    -- Phase O: Consistent Database Backups Catalog
    CREATE TABLE IF NOT EXISTS database_backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      file_hash TEXT,
      status TEXT DEFAULT 'valid',
      created_by TEXT DEFAULT 'system',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ==========================================
    -- Multi-Agent Autonomous Operations & Support
    -- ==========================================
    CREATE TABLE IF NOT EXISTS support_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      status TEXT CHECK(status IN ('OPEN', 'AI_HANDLING', 'WAITING_USER', 'WAITING_ADMIN', 'ADMIN_HANDLING', 'RESOLVED', 'CLOSED')) DEFAULT 'AI_HANDLING',
      priority TEXT CHECK(priority IN ('P1', 'P2', 'P3', 'P4')) DEFAULT 'P3',
      mode TEXT CHECK(mode IN ('AI', 'HUMAN')) DEFAULT 'AI',
      subject TEXT,
      assigned_admin_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_admin_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_support_conv_user ON support_conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_support_conv_status ON support_conversations(status);
    CREATE INDEX IF NOT EXISTS idx_support_conv_mode ON support_conversations(mode);
    CREATE INDEX IF NOT EXISTS idx_support_conv_last_msg ON support_conversations(last_message_at);

    CREATE TABLE IF NOT EXISTS support_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      sender_type TEXT CHECK(sender_type IN ('USER', 'AI', 'ADMIN', 'SYSTEM')) NOT NULL,
      sender_user_id INTEGER,
      message TEXT NOT NULL,
      metadata TEXT, -- JSON com cards de catálogo, diagnósticos, etc.
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      read_at DATETIME,
      FOREIGN KEY (conversation_id) REFERENCES support_conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_support_msg_conv ON support_messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_support_msg_unread ON support_messages(conversation_id, read_at);

    CREATE TABLE IF NOT EXISTS support_diagnostics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES support_conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_support_diag_conv ON support_diagnostics(conversation_id);

    CREATE TABLE IF NOT EXISTS agent_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent TEXT NOT NULL, -- 'SentinelAgent', 'SecurityAgent', 'SupportAgent'
      trigger TEXT NOT NULL,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME,
      status TEXT CHECK(status IN ('running', 'success', 'recovered', 'escalated', 'failed', 'blocked')) DEFAULT 'running',
      actions_count INTEGER DEFAULT 0,
      result TEXT,
      correlation_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent, created_at);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_corr ON agent_runs(correlation_id);

    CREATE TABLE IF NOT EXISTS agent_global_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      affected_count INTEGER DEFAULT 1,
      status TEXT CHECK(status IN ('ACTIVE', 'INVESTIGATING', 'MITIGATED', 'RESOLVED')) DEFAULT 'ACTIVE',
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_global_incidents_status ON agent_global_incidents(status);
  `);

  // Ensure default agent system settings exist
  const insertDefaultSetting = db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)");
  insertDefaultSetting.run('sentinel_auto_heal', 'true');
  insertDefaultSetting.run('security_auto_action', 'true');
  insertDefaultSetting.run('ai_support_enabled', 'true');
  insertDefaultSetting.run('vsairouter_url', process.env.VSAIROUTER_URL || 'http://localhost:8000/v1');
  insertDefaultSetting.run('vsairouter_model', process.env.VSAIROUTER_MODEL || 'default');

  seedData();
}

function seedData() {
  // Check if master already exists
  const master = db.prepare("SELECT * FROM users WHERE role = 'master'").get();
  if (!master) {
    console.log('🌱 Seeding initial system data...');

    const adminPass = process.env.ADMIN_PASSWORD || require('crypto').randomBytes(8).toString('hex');
    const resellerPass = process.env.RESELLER_PASSWORD || require('crypto').randomBytes(8).toString('hex');
    const clientPass = process.env.CLIENT_PASSWORD || require('crypto').randomBytes(8).toString('hex');

    const salt = bcrypt.genSaltSync(10);
    const masterHash = bcrypt.hashSync(adminPass, salt);
    const resellerHash = bcrypt.hashSync(resellerPass, salt);
    const clientHash = bcrypt.hashSync(clientPass, salt);

    // 1. Master Admin
    db.prepare(`
      INSERT INTO users (username, password_hash, plain_password, role, name, email, phone, credits, max_connections, status)
      VALUES (?, ?, ?, 'master', 'Vagner', 'vagner@vsai.com.br', '+5511999999999', 99999, 100, 'active')
    `).run('vagner', masterHash, adminPass);

    // 2. Demo Reseller
    const resellerResult = db.prepare(`
      INSERT INTO users (username, password_hash, plain_password, role, name, email, phone, credits, max_connections, status)
      VALUES (?, ?, ?, 'reseller', 'Revenda Prime Oficial', 'revenda1@iptv-system.local', '+5511988888888', 50.0, 5, 'active')
    `).run('revenda1', resellerHash, resellerPass);

    const resellerId = resellerResult.lastInsertRowid;

    // Log initial credits transaction
    db.prepare(`
      INSERT INTO credit_transactions (reseller_id, amount, balance_after, reason)
      VALUES (?, ?, ?, ?)
    `).run(resellerId, 50.0, 50.0, 'Recarga inicial de ativação pelo Administrador Master');

    // 3. Demo Client
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    db.prepare(`
      INSERT INTO users (username, password_hash, plain_password, role, name, email, phone, reseller_id, max_connections, status, expires_at)
      VALUES (?, ?, ?, 'client', 'João Silva (Cliente)', 'joao@gmail.com', '+5511977777777', ?, 2, 'active', ?)
    `).run('joaosilva', clientHash, clientPass, resellerId, nextMonth.toISOString());

    // 4. Default Categories
    const insertCat = db.prepare("INSERT INTO categories (name, type, order_num) VALUES (?, ?, ?)");
    const catLiveNews = insertCat.run('Notícias & Jornalismo', 'live', 1).lastInsertRowid;
    const catLiveSports = insertCat.run('Esportes & Aventura', 'live', 2).lastInsertRowid;
    const catLiveDoc = insertCat.run('Documentários & Ciência', 'live', 3).lastInsertRowid;
    const catLiveKids = insertCat.run('Infantil & Animação', 'live', 4).lastInsertRowid;
    const catMoviesAction = insertCat.run('Ação & Ficção', 'movie', 5).lastInsertRowid;
    const catMoviesSciFi = insertCat.run('Sci-Fi & Futurismo', 'movie', 6).lastInsertRowid;
    const catSeries = insertCat.run('Séries Originais', 'series', 7).lastInsertRowid;

    // 5. Default Public/Open-Source & Legal HLS / VOD Streams
    const insertStream = db.prepare(`
      INSERT INTO streams (name, category_id, type, stream_url, icon_url, epg_channel_id, poster_url, description, rating, release_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Live Channels (Reliable legal & free-to-air public HLS streams)
    const stream1 = insertStream.run(
      'Red Bull TV Live',
      catLiveSports,
      'live',
      'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
      'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=128&h=128&fit=crop',
      'REDBULL.TV',
      'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=600&h=350&fit=crop',
      'Transmissão ao vivo de esportes radicais, competições mundiais e eventos radicais.',
      '9.2',
      '2024'
    ).lastInsertRowid;

    const stream2 = insertStream.run(
      'NASA TV HD',
      catLiveDoc,
      'live',
      'https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8',
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=128&h=128&fit=crop',
      'NASA.TV',
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&h=350&fit=crop',
      'Cobertura 24 horas de missões espaciais, lançamentos da NASA e a vida na Estação Espacial Internacional.',
      '9.5',
      '2024'
    ).lastInsertRowid;

    const stream3 = insertStream.run(
      'Euronews Notícias Ao Vivo',
      catLiveNews,
      'live',
      'https://euronews-euronews-portuguese-1-pt.samsung.wurl.tv/manifest/playlist.m3u8',
      'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=128&h=128&fit=crop',
      'EURONEWS.PT',
      'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=600&h=350&fit=crop',
      'Notícias internacionais de última hora, negócios, cultura e tecnologia em português.',
      '8.7',
      '2024'
    ).lastInsertRowid;

    const stream4 = insertStream.run(
      'Blender Cartoon 24h',
      catLiveKids,
      'live',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=128&h=128&fit=crop',
      'CARTOON.24H',
      'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&h=350&fit=crop',
      'Canal de animações abertas e clássicas para toda a família.',
      '9.0',
      '2024'
    ).lastInsertRowid;

    // VOD Movies (Legal Creative Commons high-def movies)
    insertStream.run(
      'Big Buck Bunny (4K Ultra HD)',
      catMoviesAction,
      'movie',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      'https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg',
      null,
      'https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg',
      'Um grande e adorável coelho é provocado por três animais indisciplinados da floresta e decide se vingar com engenhosidade.',
      '8.9',
      '2008'
    );

    insertStream.run(
      'Sintel - The Quest',
      catMoviesAction,
      'movie',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
      'https://upload.wikimedia.org/wikipedia/commons/8/8f/Sintel_poster.jpg',
      null,
      'https://upload.wikimedia.org/wikipedia/commons/8/8f/Sintel_poster.jpg',
      'Uma garota guerreira solitária parte em uma jornada perigosa pelas terras devastadas para resgatar seu pequeno dragão de estimação.',
      '9.1',
      '2010'
    );

    insertStream.run(
      'Tears of Steel (Sci-Fi 4K)',
      catMoviesSciFi,
      'movie',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
      'https://upload.wikimedia.org/wikipedia/commons/8/8c/Tears_of_steel_poster.jpg',
      null,
      'https://upload.wikimedia.org/wikipedia/commons/8/8c/Tears_of_steel_poster.jpg',
      'Em um futuro distópico, um grupo de cientistas e combatentes tenta reverter a invasão cibernética que destruiu o planeta.',
      '8.6',
      '2012'
    );

    // VOD Series
    const seriesId = insertStream.run(
      'Cosmos & Beyond: Temporada 1',
      catSeries,
      'series',
      '',
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=128&h=128&fit=crop',
      null,
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&h=350&fit=crop',
      'Uma jornada épica pelos mistérios do universo, buracos negros e a exploração de galáxias distantes.',
      '9.4',
      '2023'
    ).lastInsertRowid;

    // Series episodes
    const insertEp = db.prepare(`
      INSERT INTO series_episodes (series_id, season_num, episode_num, title, stream_url, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertEp.run(seriesId, 1, 1, 'Episódio 1: O Surgimento das Galáxias', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', 35);
    insertEp.run(seriesId, 1, 2, 'Episódio 2: Tempestades no Espaço Profundo', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', 40);
    insertEp.run(seriesId, 1, 3, 'Episódio 3: O Futuro da Humanidade', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', 42);

    // 6. EPG Schedule data for streams
    const now = new Date();
    const insertEpg = db.prepare(`
      INSERT INTO epg_programs (stream_id, title, description, start_time, end_time)
      VALUES (?, ?, ?, ?, ?)
    `);

    // EPG Red Bull TV
    const p1Start = new Date(now.getTime() - 1000 * 60 * 30);
    const p1End = new Date(now.getTime() + 1000 * 60 * 60);
    const p2End = new Date(now.getTime() + 1000 * 60 * 180);
    insertEpg.run(stream1, 'Campeonato Mundial de Downhill MTB', 'Etapa classificatória transmitida diretamente dos alpes suíços.', p1Start.toISOString(), p1End.toISOString());
    insertEpg.run(stream1, 'Red Bull Cliff Diving: Final', 'Os maiores atletas de saltos ornamentais em penhascos competem pelo título.', p1End.toISOString(), p2End.toISOString());

    // EPG NASA TV
    insertEpg.run(stream2, 'Estação Espacial Internacional: Ao Vivo', 'Imagens ao vivo das câmeras de alta definição instaladas no exterior da ISS.', p1Start.toISOString(), p1End.toISOString());
    insertEpg.run(stream2, 'Explorando Marte: Rover Perseverance', 'Documentário detalhando os últimos achados geológicos e busca por bioassinaturas em Marte.', p1End.toISOString(), p2End.toISOString());

    // EPG Euronews
    insertEpg.run(stream3, 'Jornal Mundial 24 Horas', 'As principais manchetes econômicas, políticas e diplomáticas do mundo todo.', p1Start.toISOString(), p1End.toISOString());
    insertEpg.run(stream3, 'Conexão Europa', 'Análise aprofundada dos eventos políticos e sociais no continente europeu.', p1End.toISOString(), p2End.toISOString());

    // 7. System Settings
    const insertSetting = db.prepare("INSERT INTO system_settings (key, value) VALUES (?, ?)");
    insertSetting.run('server_name', 'IPTV Nexus Ultra P2P');
    insertSetting.run('server_domain', 'http://localhost:5000');
    insertSetting.run('trial_default_hours', '4');
    insertSetting.run('credit_cost_per_month', '1.0');
    insertSetting.run('reseller_min_credits_alert', '5.0');
    insertSetting.run('p2p_mesh_enabled', 'true');
    insertSetting.run('telegram_bot_token', '');
    insertSetting.run('telegram_chat_id', '');
    insertSetting.run('whatsapp_support_phone', '+5511999999999');

    console.log('✅ Base seed data initialized successfully!');
  }
}

initSchema();

module.exports = db;
