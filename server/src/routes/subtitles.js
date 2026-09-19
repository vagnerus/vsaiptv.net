/**
 * routes/subtitles.js — FASE 33/34/36/49-53/57/62/63
 * Endpoints de legendas IA: consulta, arquivo VTT (cache HTTP), request sob demanda
 * e administração (fila, retry, pause, cancel, gerar, revisão, health).
 * Segurança (FASE 59/61/62): nada de paths/URLs informados pelo usuário — só IDs internos.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db/database');
const { verifyToken, requireRole } = require('../middleware/auth');
const agent = require('../services/subtitles/subtitleAgent');
const vtt = require('../services/subtitles/vttBuilder');
const asr = require('../services/subtitles/asrProvider');
const ffmpegMedia = require('../services/subtitles/ffmpegMedia');
const vsaiRouterClient = require('../services/vsaiRouterClient');

const router = express.Router();
router.use(verifyToken);

// FASE 63: rate limit simples em memória por usuário
const requestCounts = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = Number(process.env.SUBTITLE_REQUEST_RATE_MAX || 6);

function rateLimited(userId) {
  const now = Date.now();
  const rec = requestCounts.get(userId);
  if (!rec || now - rec.start > RATE_WINDOW_MS) {
    requestCounts.set(userId, { start: now, count: 1 });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_MAX;
}

function activeJobFor(contentId, episodeId, language) {
  return db.prepare(
    `SELECT id, status, progress, current_stage, priority FROM subtitle_jobs
     WHERE content_id = ? AND IFNULL(episode_id,0) = IFNULL(?,0) AND target_language = ?
       AND status NOT IN ('READY','FAILED','CANCELLED') LIMIT 1`
  ).get(contentId, episodeId, language || agent.TARGET_LANG);
}

// ============================================================
// CLIENTE
// ============================================================

// FASE 33/34: legendas READY do conteúdo + progresso de job ativo (FASE 36)
router.get('/content/:contentId', (req, res) => {
  const contentId = parseInt(req.params.contentId, 10);
  if (!Number.isInteger(contentId) || contentId <= 0) {
    return res.status(400).json({ error: 'contentId inválido' });
  }
  const episodeId = req.query.episodeId ? parseInt(req.query.episodeId, 10) : null;
  const lang = (req.query.language || agent.TARGET_LANG);

  const ready = db.prepare(
    `SELECT id, target_language, source_language, format, version, generated_by_ai, reviewed, cue_count
     FROM ai_subtitles WHERE content_id = ? AND IFNULL(episode_id,0) = IFNULL(?,0) AND status = 'READY'
     ORDER BY version DESC`
  ).all(contentId, episodeId);

  const job = activeJobFor(contentId, episodeId, lang);
  res.json({
    subtitles: ready.map((s) => ({
      id: s.id,
      label: s.target_language.toLowerCase().startsWith('pt')
        ? (s.generated_by_ai ? 'Português (IA)' : 'Português')
        : s.target_language,
      url: `/api/subtitles/file/${s.id}`,
      generatedByAi: !!s.generated_by_ai,
      reviewed: !!s.reviewed,
      version: s.version,
    })),
    job: job ? { id: job.id, status: job.status, progress: job.progress, stage: job.current_stage } : null,
  });
});

// FASE 57: uma legenda pronta é estática → cache HTTP agressivo
router.get('/file/:subtitleId', (req, res) => {
  const id = parseInt(req.params.subtitleId, 10);
  const sub = db.prepare("SELECT storage_path, status, format FROM ai_subtitles WHERE id = ? AND status = 'READY'").get(id);
  if (!sub || !sub.storage_path || !fs.existsSync(sub.storage_path)) {
    return res.status(404).json({ error: 'Legenda não encontrada' });
  }
  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.sendFile(path.resolve(sub.storage_path));
});

// FASE 36/37/63: usuário solicita/elevar prioridade — nunca bloqueia o player
router.post('/request', (req, res) => {
  const { contentId, episodeId = null, language = agent.TARGET_LANG } = req.body || {};
  const cid = parseInt(contentId, 10);
  if (!Number.isInteger(cid) || cid <= 0) {
    return res.status(400).json({ error: 'contentId inválido' });
  }
  if (rateLimited(req.user.id)) {
    return res.status(429).json({ error: 'Muitas solicitações. Aguarde alguns instantes.' });
  }
  // Só conteúdo do catálogo (FASE 61: nenhuma URL do usuário é aceita)
  const exists = db.prepare('SELECT name, type FROM streams WHERE id = ?').get(cid);
  if (!exists || ['live'].includes(exists.type)) {
    return res.status(404).json({ error: 'Conteúdo VOD não encontrado' });
  }
  const result = agent.enqueueJob({
    contentId: cid,
    episodeId: episodeId ? parseInt(episodeId, 10) : null,
    targetLanguage: language,
    priority: 10, // HIGH sob demanda
    title: exists.name,
    sourceType: episodeId ? 'series_episode' : 'movie',
  });
  const job = result.jobId ? activeJobFor(cid, episodeId ? parseInt(episodeId, 10) : null, language) : null;
  res.json({
    ...result,
    job: job ? { id: job.id, status: job.status, progress: job.progress, stage: job.current_stage } : null,
    message: result.reason === 'ALREADY_READY' ? 'Legenda já disponível.'
      : result.reason === 'JOB_EXISTS' ? 'Legenda em português está sendo preparada.'
      : 'Solicitação registrada. A legenda será gerada em segundo plano.',
  });
});

// ============================================================
// ADMIN / MASTER (FASE 49-53)
// ============================================================

// FASE 49/50/51: painel — stats + fila + job atual
router.get('/admin/dashboard', requireRole('reseller'), (req, res) => {
  const stats = agent.getStats();
  const current = db.prepare(
    `SELECT id, title, source_type, content_id, episode_id, status, progress, current_stage, worker_id, started_at
     FROM subtitle_jobs WHERE status IN ('EXTRACTING','TRANSCRIBING','TRANSLATING','GENERATING','VALIDATING','WAITING_TRANSLATION')
     ORDER BY started_at DESC LIMIT 1`
  ).get() || null;
  const readyToday = db.prepare(
    "SELECT COUNT(*) AS n FROM subtitle_jobs WHERE status = 'READY' AND finished_at >= date('now')"
  ).get().n;
  res.json({
    agent: { workerId: stats.workerId, busy: stats.isProcessing, dailyMinutes: Math.round(stats.dailyMinutes || 0) },
    queue: stats.queued, processing: stats.active, readyToday, failed: stats.failedJobs,
    current, asr: { provider: asr.PROVIDER, model: asr.ASR_MODEL },
  });
});

// FASE 51: listagem da fila
router.get('/admin/jobs', requireRole('reseller'), (req, res) => {
  const rows = db.prepare(
    `SELECT id, title, source_type, target_language, priority, status, progress, current_stage, attempts, max_attempts, error_code, created_at, updated_at
     FROM subtitle_jobs ORDER BY
       CASE status WHEN 'TRANSCRIBING' THEN 0 WHEN 'EXTRACTING' THEN 1 WHEN 'TRANSLATING' THEN 2 ELSE 3 END,
       priority DESC, created_at DESC LIMIT 200`
  ).all();
  res.json({ jobs: rows });
});

// FASE 51: ações administrativas (pausar/retomar/retry/cancelar)
router.post('/admin/jobs/:id/action', requireRole('reseller'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { action } = req.body || {};
  const job = db.prepare('SELECT * FROM subtitle_jobs WHERE id = ?').get(id);
  if (!job) return res.status(404).json({ error: 'Job não encontrado' });
  switch (action) {
    case 'PAUSE':
      db.prepare("UPDATE subtitle_jobs SET status = 'PAUSED', locked_at = NULL, worker_id = NULL WHERE id = ? AND status NOT IN ('READY','FAILED','CANCELLED')").run(id);
      break;
    case 'RESUME':
      db.prepare("UPDATE subtitle_jobs SET status = 'QUEUED', next_attempt_at = NULL WHERE id = ? AND status = 'PAUSED'").run(id);
      break;
    case 'RETRY':
      db.prepare("UPDATE subtitle_jobs SET status = 'QUEUED', attempts = 0, error_code = NULL, next_attempt_at = NULL WHERE id = ? AND status IN ('FAILED','CANCELLED')").run(id);
      break;
    case 'CANCEL':
      db.prepare("UPDATE subtitle_jobs SET status = 'CANCELLED', locked_at = NULL, finished_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'READY'").run(id);
      break;
    default:
      return res.status(400).json({ error: 'Ação inválida' });
  }
  res.json({ ok: true });
});

// FASE 52: gerar manualmente (master) — PT-BR prioritário
router.post('/admin/generate', requireRole('reseller'), (req, res) => {
  const { contentId, episodeId = null, language = agent.TARGET_LANG } = req.body || {};
  const cid = parseInt(contentId, 10);
  if (!Number.isInteger(cid) || cid <= 0) return res.status(400).json({ error: 'contentId inválido' });
  const exists = db.prepare('SELECT name FROM streams WHERE id = ?').get(cid);
  if (!exists) return res.status(404).json({ error: 'Conteúdo não encontrado' });
  const result = agent.enqueueJob({
    contentId: cid,
    episodeId: episodeId ? parseInt(episodeId, 10) : null,
    targetLanguage: language, priority: 20, title: exists.name,
    sourceType: episodeId ? 'series_episode' : 'movie',
  });
  res.json(result);
});

// FASE 53/55: revisão humana — nova versão, protegida contra sobrescrita pela IA
router.post('/admin/subtitles/:id/review', requireRole('reseller'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { cues } = req.body || {};
  const sub = db.prepare('SELECT * FROM ai_subtitles WHERE id = ?').get(id);
  if (!sub) return res.status(404).json({ error: 'Legenda não encontrada' });
  if (!Array.isArray(cues) || !cues.length) return res.status(400).json({ error: 'cues inválido' });

  const sanitized = cues.map((c) => ({
    start: Math.max(0, Math.round(Number(c.start) || 0)),
    end: Math.round(Number(c.end) || 0),
    text: String(c.text || ''),
  })).filter((c) => c.end > c.start && c.text.trim());
  if (!sanitized.length) return res.status(400).json({ error: 'Nenhum cue válido' });

  const content = vtt.buildVtt(sanitized);
  const check = vtt.validateVtt(content, { minCues: 1 });
  if (!check.valid) return res.status(400).json({ error: 'VTT inválido', errors: check.errors });

  const newPath = sub.storage_path
    ? sub.storage_path.replace(/\.vtt$/, `.v${sub.version + 1}.vtt`)
    : path.join(agent.STORAGE_ROOT, String(sub.content_id), `review_v${sub.version + 1}.vtt`);
  fs.mkdirSync(path.dirname(newPath), { recursive: true });
  fs.writeFileSync(newPath, content, 'utf8');

  db.prepare(
    `UPDATE ai_subtitles SET storage_path = ?, version = version + 1, reviewed = 1, status = 'READY',
     cue_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(newPath, check.cueCount, id);
  res.json({ ok: true, version: sub.version + 1 });
});

// FASE 67: health do ecossistema de legendas
router.get('/admin/health', requireRole('reseller'), async (req, res) => {
  const asrH = await asr.checkHealth();
  const routerH = await vsaiRouterClient.checkHealth();
  const ffmpegOk = await ffmpegMedia.isAvailable();
  res.json({
    subtitleAgent: agent.getStats(),
    asr: asrH,
    vsairouter: routerH,
    ffmpeg: ffmpegOk ? 'ONLINE' : 'MISSING',
    storage: { root: agent.STORAGE_ROOT, exists: fs.existsSync(agent.STORAGE_ROOT) },
  });
});

module.exports = router;
