const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { verifyToken } = require('../middleware/auth');

// Métrica interna agregada para a Central de Saúde
const metrics = {
  totalWrites: 0,
  recentWrites: [], // timestamps dos últimos 60s
  totalErrors: 0,
  latencies: [], // últimas 100 latências em ms
};

function recordMetric(durationMs, isError = false) {
  const now = Date.now();
  if (isError) {
    metrics.totalErrors++;
  } else {
    metrics.totalWrites++;
    metrics.recentWrites.push(now);
  }
  metrics.latencies.push(durationMs);
  if (metrics.latencies.length > 100) metrics.latencies.shift();

  // Limpa escritas com mais de 60 segundos
  const oneMinAgo = now - 60000;
  while (metrics.recentWrites.length > 0 && metrics.recentWrites[0] < oneMinAgo) {
    metrics.recentWrites.shift();
  }
}

function getMetrics() {
  const now = Date.now();
  const oneMinAgo = now - 60000;
  while (metrics.recentWrites.length > 0 && metrics.recentWrites[0] < oneMinAgo) {
    metrics.recentWrites.shift();
  }

  const avgLatency = metrics.latencies.length > 0
    ? (metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length).toFixed(2)
    : 0;

  return {
    status: 'ONLINE',
    writesPerMin: metrics.recentWrites.length,
    totalWrites: metrics.totalWrites,
    errors: metrics.totalErrors,
    averageLatencyMs: parseFloat(avgLatency),
  };
}

// Middleware de autenticação flexível (Authorization header ou query token para keepalive / sendBeacon)
function authenticateProgress(req, res, next) {
  if (!req.headers['authorization'] && (req.query.token || req.query.auth)) {
    req.headers['authorization'] = `Bearer ${req.query.token || req.query.auth}`;
  }
  verifyToken(req, res, next);
}

// ==========================================
// 1. SALVAR / ATUALIZAR PROGRESSO (PUT /:contentId)
// ==========================================
router.put('/:contentId', authenticateProgress, (req, res) => {
  const startHr = process.hrtime.bigint();
  const userId = req.user.id;
  const contentId = parseInt(req.params.contentId, 10);

  if (!contentId || isNaN(contentId) || contentId <= 0) {
    recordMetric(0, true);
    return res.status(400).json({ error: 'contentId inválido' });
  }

  // Extrair parâmetros do body
  const rawPos = req.body.position ?? req.body.progress_time ?? req.body.currentTime ?? 0;
  const rawDur = req.body.duration ?? 0;
  const episodeId = req.body.episodeId ? parseInt(req.body.episodeId, 10) : (req.body.episode_id ? parseInt(req.body.episode_id, 10) : null);
  const mediaVersion = req.body.mediaVersion || req.body.media_version || null;
  const sessionId = req.body.sessionId || req.body.playback_session_id || null;
  const profileId = req.body.profileId ? parseInt(req.body.profileId, 10) : (req.query.profile_id ? parseInt(req.query.profile_id, 10) : null);
  let explicitCompleted = req.body.completed === true || req.body.completed === 1 || req.body.completed === '1';

  // Validação estrita de limites numéricos
  const position = parseFloat(rawPos);
  const duration = parseFloat(rawDur);

  if (isNaN(position) || !isFinite(position) || position < 0) {
    recordMetric(0, true);
    return res.status(400).json({ error: 'Posição inválida' });
  }
  if (isNaN(duration) || !isFinite(duration) || duration < 0) {
    recordMetric(0, true);
    return res.status(400).json({ error: 'Duração inválida' });
  }

  // Prevenir posições absurdas além do final da mídia
  const safePosition = duration > 0 ? Math.min(position, duration) : position;

  // Determinar se completou (>= 95% da duração ou explicitamente finalizado)
  const isFinished = explicitCompleted || (duration > 60 && safePosition >= duration * 0.95);
  const completedInt = isFinished ? 1 : 0;
  const progressPercent = duration > 0 ? Math.min(100, Math.round((safePosition / duration) * 100 * 100) / 100) : (completedInt ? 100 : 0);

  try {
    // Detectar tipo se não enviado
    let type = req.body.type;
    if (!type) {
      const streamInfo = db.prepare('SELECT type FROM streams WHERE id = ?').get(contentId);
      type = streamInfo?.type || (episodeId ? 'series' : 'movie');
    }

    // Resolução de Concorrência & Conflito Multi-dispositivo:
    // Se outro dispositivo estiver reproduzindo ativamente em outra sessão com timestamp muito recente (< 15s)
    // e posição à frente, ignorar pacote antigo desatualizado de sessão morta
    const existing = episodeId
      ? db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND stream_id = ? AND episode_id = ?').get(userId, contentId, episodeId)
      : db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND stream_id = ? AND episode_id IS NULL').get(userId, contentId);

    if (existing && existing.playback_session_id && sessionId && existing.playback_session_id !== sessionId) {
      const lastWatchedTime = new Date(existing.last_watched_at || existing.last_watched).getTime();
      const elapsedMs = Date.now() - lastWatchedTime;
      // Se a outra sessão foi atualizada há menos de 15 segundos e estava mais à frente
      if (elapsedMs < 15000 && existing.progress_time > safePosition + 30) {
        // Ignora pacote concorrente atrasado
        const endHr = process.hrtime.bigint();
        recordMetric(Number(endHr - startHr) / 1000000);
        return res.json({
          success: true,
          conflictIgnored: true,
          currentPosition: existing.progress_time,
          message: 'Sessão ativa mais recente preservada.',
        });
      }
    }

    // UPSERT no SQLite
    if (existing) {
      db.prepare(`
        UPDATE user_progress
        SET 
          progress_time = ?,
          duration = ?,
          progress_percent = ?,
          completed = ?,
          playback_session_id = COALESCE(?, playback_session_id),
          media_version = COALESCE(?, media_version),
          profile_id = COALESCE(?, profile_id),
          type = ?,
          is_removed = 0,
          last_watched = CURRENT_TIMESTAMP,
          last_watched_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        safePosition,
        duration,
        progressPercent,
        completedInt,
        sessionId,
        mediaVersion,
        profileId,
        type,
        existing.id
      );
    } else {
      db.prepare(`
        INSERT INTO user_progress (
          user_id, stream_id, episode_id, profile_id, type,
          progress_time, duration, progress_percent, completed,
          playback_session_id, media_version, is_removed,
          last_watched, last_watched_at, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, 0,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `).run(
        userId,
        contentId,
        episodeId,
        profileId,
        type,
        safePosition,
        duration,
        progressPercent,
        completedInt,
        sessionId,
        mediaVersion
      );
    }

    const endHr = process.hrtime.bigint();
    const durationMs = Number(endHr - startHr) / 1000000;
    recordMetric(durationMs);

    res.json({
      success: true,
      position: safePosition,
      duration,
      progressPercent,
      completed: Boolean(completedInt),
    });
  } catch (err) {
    const endHr = process.hrtime.bigint();
    recordMetric(Number(endHr - startHr) / 1000000, true);
    res.status(500).json({ error: 'Erro ao registrar progresso: ' + err.message });
  }
});

// Alias POST para clientes legados
router.post('/:contentId', authenticateProgress, (req, res, next) => {
  req.method = 'PUT';
  router.handle(req, res, next);
});

// ==========================================
// 2. BUSCAR PROGRESSO ESPECÍFICO (GET /:contentId)
// ==========================================
router.get('/:contentId', authenticateProgress, (req, res) => {
  const userId = req.user.id;
  const contentId = parseInt(req.params.contentId, 10);
  const episodeId = req.query.episodeId ? parseInt(req.query.episodeId, 10) : null;
  const profileId = req.query.profileId ? parseInt(req.query.profileId, 10) : null;

  if (!contentId || isNaN(contentId)) {
    return res.status(400).json({ error: 'contentId inválido' });
  }

  let sql = `
    SELECT 
      up.id,
      up.user_id,
      up.stream_id,
      up.episode_id,
      up.type,
      up.progress_time as position,
      up.duration,
      up.progress_percent,
      up.completed,
      up.last_watched_at,
      up.last_watched,
      up.media_version,
      up.playback_session_id
    FROM user_progress up
    WHERE up.user_id = ? AND up.stream_id = ?
  `;
  const params = [userId, contentId];

  if (episodeId) {
    sql += ' AND up.episode_id = ?';
    params.push(episodeId);
  } else {
    sql += ' AND up.episode_id IS NULL';
  }

  if (profileId) {
    sql += ' AND (up.profile_id = ? OR up.profile_id IS NULL)';
    params.push(profileId);
  }

  sql += ' ORDER BY up.last_watched DESC LIMIT 1';

  try {
    const rec = db.prepare(sql).get(...params);
    if (!rec) {
      return res.json(null);
    }

    res.json({
      id: rec.id,
      contentId: rec.stream_id,
      episodeId: rec.episode_id,
      type: rec.type,
      position: rec.position,
      duration: rec.duration,
      progressPercent: rec.progress_percent,
      completed: Boolean(rec.completed),
      lastWatchedAt: rec.last_watched_at || rec.last_watched,
      mediaVersion: rec.media_version,
      sessionId: rec.playback_session_id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. LISTAR ITENS "CONTINUAR ASSISTINDO" (GET /)
// ==========================================
router.get('/', authenticateProgress, (req, res) => {
  const userId = req.user.id;
  const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 20), 50);
  const type = req.query.type;
  const profileId = req.query.profileId ? parseInt(req.query.profileId, 10) : null;
  const minSeconds = parseInt(req.query.minSeconds, 10) || 30; // RESUME_MIN_SECONDS padrão 30s

  let sql = `
    SELECT 
      up.id as progress_id,
      up.stream_id,
      up.episode_id,
      up.type,
      up.progress_time,
      up.duration,
      up.progress_percent,
      up.completed,
      up.last_watched,
      up.last_watched_at,
      up.media_version,
      s.name as stream_name,
      s.poster_url,
      s.icon_url,
      s.type as stream_type,
      ep.title as episode_title,
      ep.season_num,
      ep.episode_num,
      ep.duration_minutes
    FROM user_progress up
    LEFT JOIN streams s ON up.stream_id = s.id
    LEFT JOIN series_episodes ep ON up.episode_id = ep.id
    WHERE up.user_id = ?
      AND up.is_removed = 0
      AND up.completed = 0
      AND up.progress_time >= ?
  `;
  const params = [userId, minSeconds];

  if (profileId) {
    sql += ' AND (up.profile_id = ? OR up.profile_id IS NULL)';
    params.push(profileId);
  }

  if (type && ['movie', 'series', 'live'].includes(type)) {
    sql += ' AND up.type = ?';
    params.push(type);
  }

  sql += `
    ORDER BY up.last_watched DESC
    LIMIT ?
  `;
  params.push(limit);

  try {
    const rows = db.prepare(sql).all(...params);

    const formatted = rows.map((r) => {
      const remainingSeconds = r.duration > r.progress_time ? Math.round(r.duration - r.progress_time) : 0;
      const remainingMinutes = Math.max(1, Math.round(remainingSeconds / 60));
      const percent = r.progress_percent || (r.duration > 0 ? Math.round((r.progress_time / r.duration) * 100) : 0);

      return {
        id: r.progress_id,
        stream_id: r.stream_id,
        episode_id: r.episode_id,
        type: r.type,
        progress_time: r.progress_time,
        duration: r.duration,
        progress_percent: percent,
        completed: r.completed,
        last_watched: r.last_watched_at || r.last_watched,
        stream_name: r.stream_name,
        poster_url: r.poster_url || r.icon_url,
        episode_title: r.episode_title,
        season_num: r.season_num,
        episode_num: r.episode_num,
        remaining_seconds: remainingSeconds,
        remaining_minutes: remainingMinutes,
      };
    });

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. REMOVER DE CONTINUAR ASSISTINDO (DELETE /:contentId)
// ==========================================
router.delete('/:contentId', authenticateProgress, (req, res) => {
  const userId = req.user.id;
  const contentId = parseInt(req.params.contentId, 10);
  const episodeId = req.query.episodeId ? parseInt(req.query.episodeId, 10) : (req.body?.episodeId ? parseInt(req.body.episodeId, 10) : null);

  if (!contentId || isNaN(contentId)) {
    return res.status(400).json({ error: 'contentId inválido' });
  }

  try {
    let result;
    if (episodeId) {
      result = db.prepare(`
        UPDATE user_progress 
        SET is_removed = 1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND stream_id = ? AND episode_id = ?
      `).run(userId, contentId, episodeId);
    } else {
      result = db.prepare(`
        UPDATE user_progress 
        SET is_removed = 1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND stream_id = ?
      `).run(userId, contentId);
    }

    res.json({
      success: true,
      affectedRows: result.changes,
      message: 'Item removido de Continuar Assistindo com sucesso',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Exportar router e método de telemetria para HealthCenter
router.getMetrics = getMetrics;
module.exports = router;
