const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../db/database');
const { verifyToken, requireRole } = require('../middleware/auth');
const ConnectionManager = require('../services/connectionManager');
const epgManager = require('../services/epgManager');
const { canAccessXxx, isXxxCategoryName } = require('../services/xxxImporter');
const eventBus = require('../services/agentEventBus');
const subtitleAgent = require('../services/subtitles/subtitleAgent');

// Bloqueia listagem/reprodução de conteúdo adulto para quem não tem o pacote XXX.
// (admin/revenda e clientes com o pacote XXX continuam vendo normalmente)
function shouldHideAdult(user) {
  return !canAccessXxx(user);
}

// Cláusula SQL (sempre encadeada com AND) que remove categorias adultas da listagem
const ADULT_SQL_FILTER = " AND NOT (c.name LIKE '%XXX%' OR c.name LIKE '%Adulto%' OR c.name LIKE '%+18%')";

function toHlsLiveUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (/\.m3u8(\?|$)/i.test(trimmed)) return trimmed;

  if (/\/live\/([^\/]+)\/([^\/]+)\/(\d+)\.ts(\?|$)/i.test(trimmed)) {
    return trimmed.replace(/\.ts(\?|$)/i, '.m3u8$1');
  }
  const m1 = trimmed.match(/^(https?:\/\/[^\/]+)\/([^\/]+)\/([^\/]+)\/(\d+)$/i);
  if (m1) {
    return `${m1[1]}/live/${m1[2]}/${m1[3]}/${m1[4]}.m3u8`;
  }
  const m2 = trimmed.match(/^(https?:\/\/[^\/]+)\/live\/([^\/]+)\/([^\/]+)\/(\d+)$/i);
  if (m2) {
    return `${m2[1]}/live/${m2[2]}/${m2[3]}/${m2[4]}.m3u8`;
  }
  const m3 = trimmed.match(/^(https?:\/\/[^\/]+)\/([^\/]+)\/([^\/]+)\/(\d+)\.ts(\?|$)/i);
  if (m3) {
    return `${m3[1]}/live/${m3[2]}/${m3[3]}/${m3[4]}.m3u8${m3[5] || ''}`;
  }
  return trimmed;
}

// Require client, master or reseller role
router.use(verifyToken, requireRole('client', 'master', 'reseller'));

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

// Categories list with active items count
router.get('/categories', (req, res) => {
  const { type } = req.query;
  try {
    let query = `
      SELECT c.id, c.name, c.type, c.order_num, COUNT(s.id) as item_count
      FROM categories c
      JOIN streams s ON s.category_id = c.id AND s.status = 'online'
    `;
    const params = [];
    if (type) {
      if (type === 'novelas') {
        query += " WHERE (c.id = 147 OR LOWER(c.name) LIKE ?)";
        params.push('%novela%');
      } else {
        query += " WHERE c.type = ?";
        params.push(type);
      }
    }
    query += " GROUP BY c.id HAVING item_count > 0 ORDER BY c.order_num ASC, c.name ASC";

    const categories = db.prepare(query).all(...params);
    // Esconde categorias adultas de quem não tem o pacote XXX liberado
    const visible = shouldHideAdult(req.user)
      ? categories.filter((c) => !isXxxCategoryName(c.name))
      : categories;
    res.json(visible);
  } catch (err) {
    // Fallback gracioso
    let query = 'SELECT *, 0 as item_count FROM categories';
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
  }
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

// Smart normalized multi-token search across all media types (Phase H)
router.get('/search', (req, res) => {
  const { q, type, limit = 40, page = 1 } = req.query;
  if (!q || !q.trim()) {
    return res.json([]);
  }

  const maxLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 40));
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const offset = (pageNum - 1) * maxLimit;

  // Clean and split query into tokens (e.g. "vingadores: ultimato" -> ["vingadores", "ultimato"])
  const cleanQ = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const tokens = cleanQ.replace(/[^a-z0-9]/gi, ' ').split(/\s+/).filter(t => t.length > 0);

  let query = `
    SELECT s.id, s.name, s.type, s.category_id, s.poster_url, s.icon_url, s.rating, s.release_date,
           c.name as category_name
    FROM streams s
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE s.status = 'online'
  `;
  const params = [];

  if (tokens.length > 0) {
    const tokenClauses = tokens.map(() => '(s.name LIKE ? OR c.name LIKE ?)').join(' AND ');
    query += ` AND (${tokenClauses})`;
    for (const t of tokens) {
      params.push(`%${t}%`, `%${t}%`);
    }
  } else {
    query += ' AND s.name LIKE ?';
    params.push(`%${q.trim()}%`);
  }

  if (type === 'novelas') {
    query += " AND s.type = 'series' AND (c.name LIKE '%novela%' OR s.name LIKE '%novela%')";
  } else if (type && ['live', 'movie', 'series'].includes(type)) {
    query += ' AND s.type = ?';
    params.push(type);
  }

  // Remove conteúdo adulto da busca para quem não tem o pacote XXX
  if (shouldHideAdult(req.user)) {
    query += ADULT_SQL_FILTER;
  }

  query += ' ORDER BY s.name ASC LIMIT ? OFFSET ?';
  params.push(maxLimit, offset);

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
  let baseWhere = "WHERE s.status = 'online'";
  const params = [];

  if (type) {
    if (type === 'novelas') {
      baseWhere += " AND s.type = 'series' AND (s.category_id = 147 OR LOWER(c.name) LIKE ? OR LOWER(s.name) LIKE ?)";
      params.push('%novela%', '%novela%');
    } else {
      baseWhere += " AND s.type = ?";
      params.push(type);
    }
  }
  if (category_id) {
    baseWhere += ' AND s.category_id = ?';
    params.push(category_id);
  }
  if (search) {
    baseWhere += ' AND s.name LIKE ?';
    params.push(`%${search}%`);
  }

  // Remove conteúdo adulto do catálogo para quem não tem o pacote XXX
  if (shouldHideAdult(req.user)) {
    baseWhere += ADULT_SQL_FILTER;
  }

  // Count total matching streams
  let totalMatching = 0;
  try {
    const countRow = db.prepare(`SELECT COUNT(*) as total FROM streams s LEFT JOIN categories c ON s.category_id = c.id ${baseWhere}`).get(...params);
    totalMatching = countRow ? countRow.total : 0;
  } catch (e) {
    totalMatching = 0;
  }

  let query = `SELECT s.*, c.name as category_name FROM streams s LEFT JOIN categories c ON s.category_id = c.id ${baseWhere}`;

  // Smart ordering: prioritize active sources, items with posters, and recent additions
  query += " ORDER BY (CASE WHEN s.stream_url LIKE '%hubby.cx%' THEN 1 ELSE 0 END) ASC, (CASE WHEN s.poster_url IS NOT NULL AND s.poster_url != '' THEN 0 ELSE 1 END) ASC, s.id DESC";

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10);
  if (!isNaN(limitNum) && limitNum > 0) {
    const offset = Math.max(0, (pageNum - 1) * limitNum);
    query += ' LIMIT ? OFFSET ?';
    params.push(limitNum, offset);
  } else {
    const safeLimit = category_id ? 500 : 300;
    query += ' LIMIT ?';
    params.push(safeLimit);
  }

  res.setHeader('X-Total-Count', String(totalMatching));
  res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count');

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

  // Normalizar URLs de canais ao vivo para formato HLS .m3u8
  if (type === 'live' || !type) {
    streams = streams.map((s) => (s.type === 'live' ? { ...s, stream_url: toHlsLiveUrl(s.stream_url) } : s));
  }

  res.json(streams);
});

// Fetch series & novelas episodes & seasons metadata (No screen limit deduction)
router.get('/series/:id/episodes', (req, res) => {
  const { id } = req.params;
  const stream = db.prepare('SELECT s.*, c.name as category_name FROM streams s LEFT JOIN categories c ON s.category_id = c.id WHERE s.id = ?').get(id);
  
  if (!stream) {
    return res.status(404).json({ error: 'Título não encontrado.' });
  }

  const episodes = db.prepare('SELECT * FROM series_episodes WHERE series_id = ? ORDER BY season_num ASC, episode_num ASC').all(id);

  // Anexar legendas disponíveis para cada episódio da série
  try {
    const readySubs = db.prepare(`
      SELECT id, episode_id, target_language, format FROM ai_subtitles
      WHERE content_id = ? AND episode_id IS NOT NULL AND status = 'READY'
    `).all(id);
    const subMap = {};
    readySubs.forEach((s) => {
      if (!subMap[s.episode_id]) subMap[s.episode_id] = [];
      subMap[s.episode_id].push({
        label: s.target_language === 'pt-BR' ? 'Português (IA)' : s.target_language,
        url: `/api/client/subtitles/${s.id}`
      });
    });
    episodes.forEach((ep) => {
      if (subMap[ep.id]) {
        ep.subtitles = subMap[ep.id];
      }
    });
  } catch (e) {}

  res.json({
    stream,
    episodes,
    total_episodes: episodes.length,
  });
});

// Play stream (Session token generation & connection limit verification)
router.get('/stream/:id', (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'WebTV Player';

  // Check simultaneous screens limit (revendedores e masters são isentos de limite)
  if (user.role !== 'master' && user.role !== 'reseller' && user.username?.toLowerCase() !== 'vagner') {
    if (!ConnectionManager.canUserConnect(user.id, user.max_connections)) {
      return res.status(429).json({
        error: `Limite de conexões simultâneas atingido (${user.max_connections} tela(s)). Feche outra aba ou dispositivo.`
      });
    }
  }

  const stream = db.prepare('SELECT s.*, c.name as category_name FROM streams s LEFT JOIN categories c ON s.category_id = c.id WHERE s.id = ?').get(id);
  if (!stream) {
    return res.status(404).json({ error: 'Conteúdo não encontrado ou indisponível.' });
  }

  // Conteúdo adulto exige o pacote XXX (a área XXX ainda pede a senha em /api/client/xxx/stream/:id)
  if (isXxxCategoryName(stream.category_name) && !canAccessXxx(user)) {
    return res.status(403).json({ error: 'Este conteúdo requer o pacote XXX liberado na sua conta.' });
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

  // Fetch current & next EPG program if live
  let epgData = null;
  if (stream.type === 'live') {
    epgData = epgManager.getCurrentAndNext(id);
  }

  if (stream.type === 'live') {
    stream.stream_url = toHlsLiveUrl(stream.stream_url);
  }

  // Buscar legendas disponíveis (IA / Original) para filmes
  try {
    const readySubs = db.prepare(`
      SELECT id, target_language, format FROM ai_subtitles
      WHERE content_id = ? AND episode_id IS NULL AND status = 'READY'
    `).all(id);
    if (readySubs.length > 0) {
      stream.subtitles = readySubs.map((s) => ({
        label: s.target_language === 'pt-BR' ? 'Português (IA)' : s.target_language,
        url: `/api/client/subtitles/${s.id}`
      }));
    }
  } catch (e) {}

  res.json({
    stream,
    episodes,
    currentProgram: epgData?.current || null,
    nextProgram: epgData?.next || null,
    epg: epgData,
    sessionToken,
  });
});

// EPG Guide & Timeline
router.get('/epg/guide', (req, res) => {
  try {
    const { categoryId, limit = 50, offset = 0 } = req.query;
    const guide = epgManager.getGuideTimeline({
      categoryId: categoryId ? parseInt(categoryId) : null,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    res.json(guide);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/epg/:streamId', (req, res) => {
  try {
    const data = epgManager.getCurrentAndNext(req.params.streamId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
  const { type, limit = 20, minSeconds = 30 } = req.query;
  
  const sql = `
    SELECT 
      up.*,
      s.name as stream_name,
      s.poster_url,
      s.icon_url,
      s.type as stream_type,
      ep.title as episode_title,
      ep.season_num,
      ep.episode_num
    FROM user_progress up
    LEFT JOIN streams s ON up.stream_id = s.id
    LEFT JOIN series_episodes ep ON up.episode_id = ep.id
    WHERE up.user_id = ?
      AND up.is_removed = 0
      AND up.completed = 0
      AND up.progress_time >= ?
      ${type ? "AND up.type = ?" : ""}
    ORDER BY up.last_watched DESC
    LIMIT ?
  `;
  
  const params = type ? [userId, parseInt(minSeconds) || 30, type, parseInt(limit)] : [userId, parseInt(minSeconds) || 30, parseInt(limit)];
  const progress = db.prepare(sql).all(...params);
  
  res.json(progress);
});

// Get progress of a single stream (retomar de onde parou)
router.get('/progress/:streamId', (req, res) => {
  const userId = req.user.id;
  const episodeId = req.query.episodeId || req.query.episode_id;
  
  let sql = 'SELECT * FROM user_progress WHERE user_id = ? AND stream_id = ?';
  const params = [userId, req.params.streamId];
  if (episodeId) {
    sql += ' AND episode_id = ?';
    params.push(episodeId);
  }
  sql += ' ORDER BY last_watched DESC LIMIT 1';

  const rec = db.prepare(sql).get(...params);
  if (!rec) return res.json(null);
  res.json(rec);
});

// Save/update progress (upsert seguro com episode_id NULL e novas colunas)
router.post('/progress', (req, res) => {
  const userId = req.user.id;
  const { 
    stream_id, 
    contentId, 
    episode_id, 
    episodeId, 
    type, 
    progress_time, 
    position, 
    duration, 
    completed,
    sessionId,
    mediaVersion
  } = req.body;
  
  const sId = stream_id || contentId;
  const epId = episode_id || episodeId || null;
  const pos = position !== undefined ? position : (progress_time || 0);
  const dur = duration || 0;
  
  if (!sId) {
    return res.status(400).json({ error: 'stream_id é obrigatório' });
  }

  const isCompleted = completed === 1 || completed === true || (dur > 60 && pos >= dur * 0.95) ? 1 : 0;
  const percent = dur > 0 ? Math.min(100, Math.round((pos / dur) * 100)) : (isCompleted ? 100 : 0);
  
  const existing = epId
    ? db.prepare('SELECT id FROM user_progress WHERE user_id = ? AND stream_id = ? AND episode_id = ?').get(userId, sId, epId)
    : db.prepare('SELECT id FROM user_progress WHERE user_id = ? AND stream_id = ? AND episode_id IS NULL').get(userId, sId);
  
  if (existing) {
    db.prepare(`
      UPDATE user_progress
      SET 
        progress_time = ?, 
        duration = ?, 
        progress_percent = ?, 
        completed = ?, 
        is_removed = 0,
        playback_session_id = COALESCE(?, playback_session_id),
        media_version = COALESCE(?, media_version),
        last_watched = CURRENT_TIMESTAMP,
        last_watched_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(pos, dur, percent, isCompleted, sessionId || null, mediaVersion || null, existing.id);
  } else {
    db.prepare(`
      INSERT INTO user_progress (
        user_id, stream_id, episode_id, type, progress_time, duration, progress_percent, completed, is_removed, playback_session_id, media_version, last_watched, last_watched_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(userId, sId, epId, type || 'movie', pos, dur, percent, isCompleted, sessionId || null, mediaVersion || null);
  }
  
  res.json({ success: true, position: pos, duration: dur, completed: Boolean(isCompleted) });
});

// Remover de Continuar Assistindo (ocultar)
router.delete('/progress/:streamId', (req, res) => {
  const userId = req.user.id;
  const streamId = req.params.streamId;
  const episodeId = req.query.episodeId || req.body?.episodeId || null;

  if (episodeId) {
    db.prepare('UPDATE user_progress SET is_removed = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND stream_id = ? AND episode_id = ?')
      .run(userId, streamId, episodeId);
  } else {
    db.prepare('UPDATE user_progress SET is_removed = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND stream_id = ?')
      .run(userId, streamId);
  }

  res.json({ success: true, message: 'Removido com sucesso' });
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

// ==========================================
// 4. USER PROFILES & SERVER FAVORITES (PHASE I)
// ==========================================
router.get('/profiles', (req, res) => {
  try {
    const userId = req.user.id;
    let profiles = db.prepare('SELECT * FROM user_profiles WHERE user_id = ? ORDER BY id ASC').all(userId);

    // If user has no profile yet, create primary default profile
    if (profiles.length === 0) {
      const info = db.prepare(`
        INSERT INTO user_profiles (user_id, name, avatar, is_kids) 
        VALUES (?, 'Principal', 'avatar-1', 0)
      `).run(userId);
      profiles = [{ id: info.lastInsertRowid, user_id: userId, name: 'Principal', avatar: 'avatar-1', is_kids: 0 }];
    }

    res.json(profiles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/profiles', (req, res) => {
  try {
    const userId = req.user.id;
    const { name, avatar = 'avatar-1', is_kids = 0 } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nome do perfil é obrigatório.' });
    }

    const count = db.prepare('SELECT COUNT(*) as count FROM user_profiles WHERE user_id = ?').get(userId).count;
    if (count >= 5) {
      return res.status(400).json({ error: 'Limite máximo de 5 perfis por conta atingido.' });
    }

    const info = db.prepare(`
      INSERT INTO user_profiles (user_id, name, avatar, is_kids)
      VALUES (?, ?, ?, ?)
    `).run(userId, name.trim(), avatar, is_kids ? 1 : 0);

    res.json({ success: true, profileId: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/profiles/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const profileId = req.params.id;

    const count = db.prepare('SELECT COUNT(*) as count FROM user_profiles WHERE user_id = ?').get(userId).count;
    if (count <= 1) {
      return res.status(400).json({ error: 'Você não pode excluir o único perfil da conta.' });
    }

    db.prepare('DELETE FROM user_profiles WHERE id = ? AND user_id = ?').run(profileId, userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/favorites', (req, res) => {
  try {
    const userId = req.user.id;
    const profileId = req.query.profileId ? parseInt(req.query.profileId) : null;

    let query = `
      SELECT s.*, uf.created_at as favorited_at
      FROM user_favorites uf
      JOIN streams s ON uf.stream_id = s.id
      WHERE uf.user_id = ?
    `;
    const params = [userId];

    if (profileId) {
      query += ' AND uf.profile_id = ?';
      params.push(profileId);
    }

    query += ' ORDER BY uf.created_at DESC';
    const favorites = db.prepare(query).all(...params);
    res.json(favorites);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/favorites/toggle', (req, res) => {
  try {
    const userId = req.user.id;
    const { streamId, profileId } = req.body;

    if (!streamId) return res.status(400).json({ error: 'streamId obrigatório' });

    const existing = db.prepare(`
      SELECT id FROM user_favorites 
      WHERE user_id = ? AND stream_id = ? AND (profile_id = ? OR (profile_id IS NULL AND ? IS NULL))
    `).get(userId, streamId, profileId || null, profileId || null);

    if (existing) {
      db.prepare('DELETE FROM user_favorites WHERE id = ?').run(existing.id);
      res.json({ isFavorite: false });
    } else {
      db.prepare(`
        INSERT INTO user_favorites (user_id, profile_id, stream_id)
        VALUES (?, ?, ?)
      `).run(userId, profileId || null, streamId);
      res.json({ isFavorite: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/favorites/sync', (req, res) => {
  try {
    const userId = req.user.id;
    const { streamIds = [], profileId = null } = req.body;

    if (!Array.isArray(streamIds) || streamIds.length === 0) {
      return res.json({ synced: 0 });
    }

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO user_favorites (user_id, profile_id, stream_id)
      VALUES (?, ?, ?)
    `);

    let count = 0;
    db.transaction(() => {
      for (const id of streamIds) {
        const numId = parseInt(id);
        if (!isNaN(numId)) {
          insertStmt.run(userId, profileId, numId);
          count++;
        }
      }
    })();

    res.json({ success: true, synced: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. PARENTAL CONTROL (PHASE J)
// ==========================================
const bcrypt = require('bcryptjs');

router.get('/parental/status', (req, res) => {
  try {
    const userId = req.user.id;
    const user = db.prepare('SELECT parental_pin, parental_locked_categories FROM users WHERE id = ?').get(userId);
    res.json({
      isEnabled: !!(user && user.parental_pin),
      lockedCategories: user?.parental_locked_categories ? user.parental_locked_categories.split(',').map(s => s.trim()) : ['Adultos', 'XXX', 'Adult']
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/parental/pin', (req, res) => {
  try {
    const userId = req.user.id;
    const { pin, currentPin, lockedCategories } = req.body;

    const user = db.prepare('SELECT parental_pin FROM users WHERE id = ?').get(userId);

    // If PIN already set, verify currentPin first
    if (user && user.parental_pin && currentPin) {
      const match = bcrypt.compareSync(String(currentPin), user.parental_pin);
      if (!match) {
        return res.status(403).json({ error: 'PIN atual incorreto.' });
      }
    }

    if (!pin || pin.length < 4) {
      return res.status(400).json({ error: 'O PIN parental deve ter pelo menos 4 dígitos.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const pinHash = bcrypt.hashSync(String(pin), salt);
    const cats = Array.isArray(lockedCategories) ? lockedCategories.join(',') : 'Adultos,XXX,Adult';

    db.prepare('UPDATE users SET parental_pin = ?, parental_locked_categories = ? WHERE id = ?').run(pinHash, cats, userId);

    res.json({ success: true, message: 'Controle parental configurado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/parental/verify', (req, res) => {
  try {
    const userId = req.user.id;
    const { pin } = req.body;

    const user = db.prepare('SELECT parental_pin FROM users WHERE id = ?').get(userId);
    if (!user || !user.parental_pin) {
      return res.json({ valid: true }); // No PIN configured, unlocked
    }

    const isValid = bcrypt.compareSync(String(pin || ''), user.parental_pin);
    res.json({ valid: isValid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. DEVICES & SESSIONS (PHASE K)
// ==========================================
router.get('/devices', (req, res) => {
  try {
    const userId = req.user.id;
    const devices = db.prepare(`
      SELECT id, device_name, device_type, ip_address, last_active, is_revoked, created_at
      FROM user_devices
      WHERE user_id = ? AND is_revoked = 0
      ORDER BY last_active DESC
    `).all(userId);

    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/devices/:id/revoke', (req, res) => {
  try {
    const userId = req.user.id;
    const deviceId = req.params.id;

    db.prepare('UPDATE user_devices SET is_revoked = 1 WHERE id = ? AND user_id = ?').run(deviceId, userId);
    res.json({ success: true, message: 'Dispositivo desconectado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. PLAYER ERROR LOGGING (PHASE N)
// ==========================================
router.post('/player/error', (req, res) => {
  try {
    const { errorType, contentId, contentName, errorMessage, httpStatus } = req.body;

    // Security: sanitize error message so no JWTs, tokens, or URL query passwords get logged
    let cleanMessage = String(errorMessage || '')
      .replace(/(token=)[^&]+/gi, '$1[REDACTED]')
      .replace(/(password=)[^&]+/gi, '$1[REDACTED]')
      .replace(/(auth=)[^&]+/gi, '$1[REDACTED]')
      .slice(0, 300);

    const safeType = String(errorType || 'PLAYER_ERROR').toUpperCase().slice(0, 50);
    const userId = req.user?.id || null;
    const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    db.prepare(`
      INSERT INTO system_error_logs (error_type, content_id, content_name, error_message, http_status, ip_address, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(safeType, contentId || null, String(contentName || '').slice(0, 100), cleanMessage, httpStatus || null, String(ip).slice(0, 45), userId);

    // Notifica Agente Sentinela via EventBus
    eventBus.publish({
      type: safeType,
      severity: (httpStatus >= 500 || safeType.includes('FATAL')) ? 'critical' : 'error',
      source: 'client_player',
      userId,
      streamId: contentId,
      context: {
        contentName: String(contentName || ''),
        errorMessage: cleanMessage,
        httpStatus,
        ip
      }
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao registrar log' });
  }
});

// ==========================================
// Legendas IA (Rotas de Reprodução e Demanda)
// ==========================================

// Servir arquivo VTT da legenda
router.get('/subtitles/:id', (req, res) => {
  try {
    const sub = db.prepare('SELECT * FROM ai_subtitles WHERE id = ?').get(req.params.id);
    if (!sub || sub.status !== 'READY' || !sub.storage_path) {
      return res.status(404).json({ error: 'Legenda não encontrada ou não processada.' });
    }
    if (!fs.existsSync(sub.storage_path)) {
      return res.status(404).json({ error: 'Arquivo de legenda não encontrado no disco.' });
    }
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(path.resolve(sub.storage_path));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Solicitar geração de legenda sob demanda (alta prioridade para quem está assistindo)
router.post('/subtitles/request', (req, res) => {
  try {
    const { contentId, episodeId, language } = req.body;
    if (!contentId) {
      return res.status(400).json({ error: 'contentId é obrigatório' });
    }
    const result = subtitleAgent.enqueueJob({
      contentId: Number(contentId),
      episodeId: episodeId ? Number(episodeId) : null,
      targetLanguage: language || 'pt-BR',
      priority: 20 // Alta prioridade para requisição direta do player
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Consultar status da legenda e progresso de jobs
router.get('/subtitles/status', (req, res) => {
  try {
    const { contentId, episodeId, language = 'pt-BR' } = req.query;
    if (!contentId) {
      return res.status(400).json({ error: 'contentId é obrigatório' });
    }

    const cId = Number(contentId);
    const epId = episodeId ? Number(episodeId) : null;

    const readySub = db.prepare(`
      SELECT id, status, cue_count, format, updated_at FROM ai_subtitles
      WHERE content_id = ? AND IFNULL(episode_id,0) = IFNULL(?,0) AND target_language = ? AND status = 'READY'
      ORDER BY version DESC LIMIT 1
    `).get(cId, epId, language);

    if (readySub) {
      return res.json({
        ready: true,
        subtitleUrl: `/api/client/subtitles/${readySub.id}`,
        cueCount: readySub.cue_count
      });
    }

    const activeJob = db.prepare(`
      SELECT id, status, current_stage, progress, attempts FROM subtitle_jobs
      WHERE content_id = ? AND IFNULL(episode_id,0) = IFNULL(?,0) AND target_language = ?
        AND status NOT IN ('READY','FAILED','CANCELLED')
      ORDER BY id DESC LIMIT 1
    `).get(cId, epId, language);

    if (activeJob) {
      return res.json({
        ready: false,
        inProgress: true,
        jobId: activeJob.id,
        stage: activeJob.current_stage,
        progress: activeJob.progress
      });
    }

    return res.json({
      ready: false,
      inProgress: false
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

