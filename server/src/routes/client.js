const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { verifyToken, requireRole } = require('../middleware/auth');
const ConnectionManager = require('../services/connectionManager');

// Require client role
router.use(verifyToken, requireRole('client'));

// Client Portal info
router.get('/portal', (req, res) => {
  const user = req.user;
  const activeConsCount = db.prepare('SELECT COUNT(*) as total FROM active_connections WHERE user_id = ?').get(user.id).total;
  const reseller = user.reseller_id ? db.prepare('SELECT name, phone FROM users WHERE id = ?').get(user.reseller_id) : null;

  res.json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      status: user.status,
      is_trial: user.is_trial,
      expires_at: user.expires_at,
      max_connections: user.max_connections,
      active_connections: activeConsCount,
    },
    reseller: reseller ? { name: reseller.name, phone: reseller.phone } : null,
  });
});

// Categories list
router.get('/categories', (req, res) => {
  const { type } = req.query;
  let query = 'SELECT * FROM categories';
  const params = [];
  if (type) {
    if (type === 'novelas') {
      query += ' WHERE id = 147 OR LOWER(name) LIKE ?';
      params.push('%novela%');
    } else {
      query += ' WHERE type = ?';
      params.push(type);
    }
  }
  query += ' ORDER BY order_num ASC, name ASC';

  const categories = db.prepare(query).all(...params);
  res.json(categories);
});

// In-memory cache for series episode counts
let cachedSeriesCounts = null;
let lastSeriesCountTime = 0;
const SERIES_COUNT_TTL = 5 * 60 * 1000; // 5 minutos

function getSeriesCountsMap() {
  const now = Date.now();
  if (cachedSeriesCounts && (now - lastSeriesCountTime) < SERIES_COUNT_TTL) {
    return cachedSeriesCounts;
  }
  const counts = db.prepare(`
    SELECT series_id, COUNT(*) as episode_count, COUNT(DISTINCT season_num) as season_count
    FROM series_episodes
    GROUP BY series_id
  `).all();
  const countMap = {};
  counts.forEach((c) => { countMap[c.series_id] = c; });
  cachedSeriesCounts = countMap;
  lastSeriesCountTime = now;
  return countMap;
}

// Fast server-side search across all media types
router.get('/search', (req, res) => {
  const { q, type, limit = 40 } = req.query;
  if (!q || !q.trim()) {
    return res.json([]);
  }
  const maxLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 40));
  const searchTerm = `%${q.trim()}%`;
  
  let query = `
    SELECT s.id, s.name, s.type, s.category_id, s.poster_url, s.icon_url, s.rating, s.release_date,
           c.name as category_name
    FROM streams s
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE s.status = 'online' AND s.name LIKE ?
  `;
  const params = [searchTerm];

  if (type && ['live', 'movie', 'series'].includes(type)) {
    query += ' AND s.type = ?';
    params.push(type);
  }

  query += ' ORDER BY s.name ASC LIMIT ?';
  params.push(maxLimit);

  let results = db.prepare(query).all(...params);

  const hasSeries = results.some(r => r.type === 'series');
  if (hasSeries) {
    const countMap = getSeriesCountsMap();
    results = results.map(s => {
      if (s.type === 'series') {
        return {
          ...s,
          episode_count: countMap[s.id]?.episode_count || 0,
          season_count: countMap[s.id]?.season_count || 0,
        };
      }
      return s;
    });
  }

  res.json(results);
});

// Streams list
router.get('/streams', (req, res) => {
  const { type, category_id, search, page, limit } = req.query;
  let query = 'SELECT s.*, c.name as category_name FROM streams s LEFT JOIN categories c ON s.category_id = c.id WHERE s.status = \'online\'';
  const params = [];

  if (type) {
    if (type === 'novelas') {
      query += ' AND s.type = \'series\' AND (s.category_id = 147 OR LOWER(c.name) LIKE ? OR LOWER(s.name) LIKE ?)';
      params.push('%novela%', '%novela%');
    } else {
      query += ' AND s.type = ?';
      params.push(type);
    }
  }
  if (category_id) {
    query += ' AND s.category_id = ?';
    params.push(category_id);
  }
  if (search) {
    query += ' AND s.name LIKE ?';
    params.push(`%${search}%`);
  }

  query += ' ORDER BY s.id ASC';

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10);
  if (!isNaN(limitNum) && limitNum > 0) {
    const offset = Math.max(0, (pageNum - 1) * limitNum);
    query += ' LIMIT ? OFFSET ?';
    params.push(limitNum, offset);
  }

  let streams = db.prepare(query).all(...params);

  // Contagem de episódios/temporadas para séries e novelas (usando cache indexado)
  if (type === 'series' || type === 'novelas') {
    const countMap = getSeriesCountsMap();
    streams = streams.map((s) => ({
      ...s,
      episode_count: countMap[s.id] ? countMap[s.id].episode_count : 0,
      season_count: countMap[s.id] ? countMap[s.id].season_count : 0,
    }));
  }

  res.json(streams);
});

// Play stream (Session token generation & connection limit verification)
router.get('/stream/:id', (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'WebTV Player';

  // Check simultaneous screens limit
  if (!ConnectionManager.canUserConnect(user.id, user.max_connections)) {
    return res.status(429).json({
      error: `Limite de conexões simultâneas atingido (${user.max_connections} tela(s)). Feche outra aba ou dispositivo.`
    });
  }

  const stream = db.prepare('SELECT * FROM streams WHERE id = ?').get(id);
  if (!stream) {
    return res.status(404).json({ error: 'Conteúdo não encontrado ou indisponível.' });
  }

  // Register connection
  const sessionToken = ConnectionManager.registerConnection({
    userId: user.id,
    streamId: stream.id,
    ipAddress: clientIp,
    userAgent,
    deviceType: 'WebTV Player',
  });

  // If series, fetch episodes
  let episodes = [];
  if (stream.type === 'series') {
    episodes = db.prepare('SELECT * FROM series_episodes WHERE series_id = ? ORDER BY season_num ASC, episode_num ASC').all(id);
  }

  // Fetch current EPG program if live
  let epgProgram = null;
  if (stream.type === 'live') {
    const now = new Date().toISOString();
    epgProgram = db.prepare('SELECT * FROM epg_programs WHERE stream_id = ? AND start_time <= ? AND end_time >= ?').get(id, now, now);
  }

  res.json({
    stream,
    episodes,
    currentProgram: epgProgram,
    sessionToken,
  });
});

// Session Heartbeat Ping
router.post('/session/ping', (req, res) => {
  const { sessionToken, bytesDelta } = req.body;
  const success = ConnectionManager.pingConnection(sessionToken, bytesDelta || 0);
  res.json({ success });
});


// ==========================================
// USER PROGRESS - Continue Assistindo & Episódios Vistos
// ==========================================

// Get progress for user (continue assistindo + episódios assistidos)
router.get('/progress', (req, res) => {
  const userId = req.user.id;
  const { type, limit = 20 } = req.query;
  
  const sql = `
    SELECT 
      up.*,
      s.name as stream_name,
      s.poster_url,
      s.type as stream_type,
      ep.title as episode_title,
      ep.season_num,
      ep.episode_num
    FROM user_progress up
    LEFT JOIN streams s ON up.stream_id = s.id
    LEFT JOIN series_episodes ep ON up.episode_id = ep.id
    WHERE up.user_id = ?
    ${type ? "AND up.type = ?" : ""}
    ORDER BY up.last_watched DESC
    LIMIT ?
  `;
  
  const params = type ? [userId, type, parseInt(limit)] : [userId, parseInt(limit)];
  const progress = db.prepare(sql).all(...params);
  
  res.json(progress);
});

// Get progress of a single stream (retomar de onde parou)
router.get('/progress/:streamId', (req, res) => {
  const userId = req.user.id;
  const rec = db.prepare(`
    SELECT * FROM user_progress
    WHERE user_id = ? AND stream_id = ?
    ORDER BY last_watched DESC
    LIMIT 1
  `).get(userId, req.params.streamId);
  if (!rec) return res.json(null);
  res.json(rec);
});

// Save/update progress (upsert seguro com episode_id NULL)
router.post('/progress', (req, res) => {
  const userId = req.user.id;
  const { stream_id, episode_id, type, progress_time, duration, completed } = req.body;
  
  if (!stream_id || !type) {
    return res.status(400).json({ error: 'stream_id e type são obrigatórios' });
  }
  
  const existing = episode_id
    ? db.prepare('SELECT id FROM user_progress WHERE user_id = ? AND stream_id = ? AND episode_id = ?').get(userId, stream_id, episode_id)
    : db.prepare('SELECT id FROM user_progress WHERE user_id = ? AND stream_id = ? AND episode_id IS NULL').get(userId, stream_id);
  
  if (existing) {
    db.prepare(`
      UPDATE user_progress
      SET progress_time = ?, duration = ?, completed = ?, last_watched = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(progress_time || 0, duration || 0, completed || 0, existing.id);
  } else {
    db.prepare(`
      INSERT INTO user_progress (user_id, stream_id, episode_id, type, progress_time, duration, completed)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, stream_id, episode_id || null, type, progress_time || 0, duration || 0, completed || 0);
  }
  
  res.json({ success: true });
});

// Mark episode as watched (color change)
router.post('/episode/watched', (req, res) => {
  const userId = req.user.id;
  const { episode_id, completed = 1 } = req.body;
  
  if (!episode_id) {
    return res.status(400).json({ error: 'episode_id é obrigatório' });
  }
  
  const ep = db.prepare('SELECT series_id FROM series_episodes WHERE id = ?').get(episode_id);
  if (!ep) return res.status(404).json({ error: 'Episódio não encontrado' });
  
  const existing = db.prepare('SELECT id FROM user_progress WHERE user_id = ? AND stream_id = ? AND episode_id = ?').get(userId, ep.series_id, episode_id);
  if (existing) {
    db.prepare('UPDATE user_progress SET completed = ?, last_watched = CURRENT_TIMESTAMP WHERE id = ?').run(completed, existing.id);
  } else {
    db.prepare(`
      INSERT INTO user_progress (user_id, stream_id, episode_id, type, completed)
      VALUES (?, ?, ?, 'series', ?)
    `).run(userId, ep.series_id, episode_id, completed);
  }
  
  res.json({ success: true });
});

// Get episode watched status for a series
router.get('/series/:id/watched', (req, res) => {
  const userId = req.user.id;
  const seriesId = req.params.id;
  
  const watched = db.prepare(`
    SELECT episode_id FROM user_progress 
    WHERE user_id = ? AND stream_id = ? AND type = 'series' AND completed = 1
  `).all(userId, seriesId);
  
  res.json(watched.map(w => w.episode_id));
});

// Close Session
router.post('/session/close', (req, res) => {
  const { sessionToken } = req.body;
  ConnectionManager.closeConnection(sessionToken);
  res.json({ success: true });
});

module.exports = router;
