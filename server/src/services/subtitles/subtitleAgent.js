/**
 * subtitleAgent.js — Agente Autônomo de Legendas IA (VSAIPTV)
 *
 * FASE 6/7/8: SubtitleScanner + fila persistente + worker background.
 * FASE 7: sem loop agressivo — tick de fila em intervalo configurável (default 15s).
 * Lock de job: transação atômica SQLite (equivalente a FOR UPDATE SKIP LOCKED p/ 1 conexão).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../../db/database');
const { initSubtitleSchema } = require('../../db/subtitleSchema');
const vtt = require('./vttBuilder');
const ffmpegMedia = require('./ffmpegMedia');
const asr = require('./asrProvider');
const resourceManager = require('./resourceManager');
const vsaiRouterClient = require('../vsaiRouterClient');
const eventBus = require('../agentEventBus');

initSubtitleSchema();

const WORKER_ID = `worker-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
const TICK_MS = Number(process.env.SUBTITLE_QUEUE_TICK_MS || 15000);
const SCAN_INTERVAL_MS = Number(process.env.SUBTITLE_SCAN_INTERVAL_MS || 10 * 60 * 1000);
const LOCK_TTL_MS = Number(process.env.SUBTITLE_LOCK_TTL_MS || 30 * 60 * 1000);
const SEGMENT_MINUTES = Number(process.env.SUBTITLE_SEGMENT_MINUTES || 10);
const TARGET_LANG = process.env.SUBTITLE_TARGET_LANGUAGE || 'pt-BR';
const STORAGE_ROOT = path.resolve(process.env.SUBTITLE_STORAGE_PATH || path.join(__dirname, '../../../data/subtitles'));
const TRANSLATE_BLOCK = 40; // cues por bloco de tradução (FASE 21)
const CONTEXT_CUES = 4;     // FASE 23: janela contextual entre blocos

const TRANSLATION_SYSTEM_PROMPT =
  'Você é um tradutor profissional de legendas.\n' +
  'Traduza somente o texto fornecido para português brasileiro.\n' +
  'Preserve integralmente: IDs, timestamps, ordem, estrutura.\n' +
  'Não adicione explicações. Não invente falas. Não resuma. Não censure conteúdo.\n' +
  'Não altere timestamps. Use português brasileiro natural considerando o contexto fornecido.';

// ============================================================
// Helpers
// ============================================================
function fingerprintFor(contentId, episodeId) {
  try {
    const row = episodeId
      ? db.prepare('SELECT stream_url FROM series_episodes WHERE id = ?').get(episodeId)
      : db.prepare('SELECT stream_url FROM streams WHERE id = ?').get(contentId);
    if (!row?.stream_url) return null;
    return crypto.createHash('sha256').update(row.stream_url).digest('hex').slice(0, 32);
  } catch (e) {
    return null;
  }
}

function log(tag, msg) {
  console.log(`[subtitle:${tag}] ${msg}`);
}

function publishEvent(type, context = {}) {
  try {
    eventBus.publish({ type, source: 'subtitle-agent', context });
  } catch (e) { /* nunca derruba o worker por falha de evento */ }
}

// ============================================================
// FASE 2/3/42/63: enqueue com deduplicação atômica
// ============================================================
function enqueueJob({ contentId, episodeId = null, targetLanguage = TARGET_LANG, priority = 0, title = null, sourceType = 'movie' }) {
  // FASE 2: legenda READY já existe → nunca regenerar
  const existing = db.prepare(
    `SELECT id, media_fingerprint, reviewed, status FROM ai_subtitles
     WHERE content_id = ? AND IFNULL(episode_id,0) = IFNULL(?,0) AND target_language = ?
     ORDER BY version DESC LIMIT 1`
  ).get(contentId, episodeId, targetLanguage);

  const currentFp = fingerprintFor(contentId, episodeId);

  if (existing && existing.status === 'READY') {
    // FASE 54: revisão humana é intocável
    if (existing.reviewed === 1) return { created: false, reason: 'REVIEWED_PROTECTED', subtitleId: existing.id };
    // FASE 56: fonte mudou? revalidar
    if (existing.media_fingerprint && currentFp && existing.media_fingerprint !== currentFp) {
      log('discovered', `Fonte mudou p/ "${title || 'conteúdo ' + contentId}" — revalidando`);
      db.prepare("UPDATE ai_subtitles SET status = 'DISCOVERED', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(existing.id);
    } else {
      return { created: false, reason: 'ALREADY_READY', subtitleId: existing.id };
    }
  }

  // FASE 42: job ativo já existe? ambos os usuários acompanham o MESMO job
  const activeJob = db.prepare(
    `SELECT id, status, progress FROM subtitle_jobs
     WHERE content_id = ? AND IFNULL(episode_id,0) = IFNULL(?,0) AND target_language = ?
       AND status NOT IN ('READY','FAILED','CANCELLED') LIMIT 1`
  ).get(contentId, episodeId, targetLanguage);
  if (activeJob) {
    // FASE 36: pedido sob demanda eleva prioridade
    if (priority > activeJob.priority) {
      db.prepare('UPDATE subtitle_jobs SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(priority, activeJob.id);
    }
    return { created: false, reason: 'JOB_EXISTS', jobId: activeJob.id, status: activeJob.status, progress: activeJob.progress };
  }

  // FASE 9: backpressure — background respeita limite da fila
  if (priority < 10) {
    const queued = db.prepare(
      "SELECT COUNT(*) AS n FROM subtitle_jobs WHERE status IN ('QUEUED','RETRYING','PAUSED')"
    ).get().n;
    if (queued >= resourceManager.getConfig().maxQueue) {
      return { created: false, reason: 'QUEUE_FULL' };
    }
  }

  const now = Date.now();
  const res = db.prepare(
    `INSERT INTO subtitle_jobs
       (content_id, episode_id, target_language, priority, status, current_stage, title, source_type, locked_at, next_attempt_at)
     VALUES (?, ?, ?, ?, 'QUEUED', 'QUEUED', ?, ?, NULL, ?)`
  ).run(contentId, episodeId, targetLanguage, priority, title, sourceType, now);

  log('queued', `Job #${res.lastInsertRowid} criado (${sourceType} ${contentId}/${episodeId || '-'} → ${targetLanguage}, prio ${priority})`);
  publishEvent('SUBTITLE_JOB_QUEUED', { contentId, episodeId, jobId: Number(res.lastInsertRowid) });
  return { created: true, jobId: Number(res.lastInsertRowid) };
}

// ============================================================
// FASE 8: SubtitleScanner — procura VOD sem legenda PT-BR
// Prioridade: 1) demanda do usuário (via enqueueJob) 2) filmes 3) episódios
// ============================================================
function scanCatalog() {
  if ((process.env.SUBTITLE_AI_ENABLED ?? 'true') === 'false') return 0;
  if ((process.env.SUBTITLE_BACKGROUND_ENABLED ?? 'true') === 'false') return 0;
  if (!resourceManager.withinBackgroundWindow()) return 0;
  if (resourceManager.dailyBudgetExceeded().exceeded) {
    log('discovered', 'Limite diário atingido — background pausado (player não afetado)');
    return 0;
  }

  const cfg = resourceManager.getConfig();
  const queued = db.prepare(
    "SELECT COUNT(*) AS n FROM subtitle_jobs WHERE status IN ('QUEUED','RETRYING')"
  ).get().n;
  if (queued >= cfg.maxQueue) return 0;

  const batch = Math.min(cfg.scanBatch, cfg.maxQueue - queued);
  if (batch <= 0) return 0;

  let created = 0;

  const movies = db.prepare(
    `SELECT s.id, s.name FROM streams s
     WHERE s.type = 'movie' AND s.status = 'online'
       AND NOT EXISTS (
         SELECT 1 FROM ai_subtitles a
         WHERE a.content_id = s.id AND a.episode_id IS NULL
           AND a.target_language = ? AND a.status = 'READY' AND a.reviewed = 0
       )
       AND NOT EXISTS (
         SELECT 1 FROM subtitle_jobs j
         WHERE j.content_id = s.id AND j.episode_id IS NULL
           AND j.target_language = ? AND j.status NOT IN ('READY','FAILED','CANCELLED')
       )
     ORDER BY s.id DESC LIMIT ?`
  ).all(TARGET_LANG, TARGET_LANG, batch);

  for (const m of movies) {
    const r = enqueueJob({ contentId: m.id, episodeId: null, priority: 0, title: m.name, sourceType: 'movie' });
    if (r.created) created++;
  }

  if (created < batch) {
    const eps = db.prepare(
      `SELECT e.id AS episode_id, e.series_id, e.title, s.name AS series_name
       FROM series_episodes e JOIN streams s ON s.id = e.series_id
       WHERE s.status = 'online'
         AND NOT EXISTS (
           SELECT 1 FROM ai_subtitles a
           WHERE a.content_id = e.series_id AND a.episode_id = e.id
             AND a.target_language = ? AND a.status = 'READY' AND a.reviewed = 0
         )
         AND NOT EXISTS (
           SELECT 1 FROM subtitle_jobs j
           WHERE j.content_id = e.series_id AND j.episode_id = e.id
             AND j.target_language = ? AND j.status NOT IN ('READY','FAILED','CANCELLED')
         )
       ORDER BY e.id DESC LIMIT ?`
    ).all(TARGET_LANG, TARGET_LANG, batch - created);

    for (const ep of eps) {
      const r = enqueueJob({
        contentId: ep.series_id, episodeId: ep.episode_id, priority: 0,
        title: `${ep.series_name} — ${ep.title}`, sourceType: 'series_episode',
      });
      if (r.created) created++;
    }
  }

  if (created > 0) log('discovered', `${created} novo(s) job(s) de background criados`);
  return created;
}

// ============================================================
// FASE 43: claim atômico (lock) + recuperação de jobs órfãos
// ============================================================
function claimNextJob() {
  const now = Date.now();
  return db.transaction(() => {
    // FASE 69: recuperar jobs abandonados por worker morto
    const stale = db.prepare(
      `SELECT id FROM subtitle_jobs WHERE locked_at IS NOT NULL
        AND locked_at < ? AND status NOT IN ('QUEUED','RETRYING','READY','FAILED','CANCELLED','PAUSED')`
    ).all(now - LOCK_TTL_MS);
    for (const s of stale) {
      db.prepare(
        `UPDATE subtitle_jobs SET status = CASE WHEN attempts >= max_attempts THEN 'FAILED' ELSE 'RETRYING' END,
         locked_at = NULL, worker_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(s.id);
    }
    // FASE 44: liberar retries cujo backoff expirou
    db.prepare(
      `UPDATE subtitle_jobs SET status = 'QUEUED'
       WHERE status = 'RETRYING' AND next_attempt_at IS NOT NULL AND next_attempt_at <= ?`
    ).run(now);

    const job = db.prepare(
      `SELECT * FROM subtitle_jobs
       WHERE status IN ('QUEUED','WAITING_TRANSLATION')
       ORDER BY priority DESC, created_at ASC LIMIT 1`
    ).get();
    if (!job) return null;
    const r = db.prepare(
      `UPDATE subtitle_jobs SET worker_id = ?, locked_at = ?, attempts = attempts + 1,
       started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND (locked_at IS NULL OR locked_at <= ?)`
    ).run(WORKER_ID, now, job.id, now - LOCK_TTL_MS);
    if (r.changes === 0) return null;
    return { ...job, worker_id: WORKER_ID, attempts: job.attempts + 1 };
  })();
}

function updateJob(jobId, fields) {
  const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  const vals = Object.values(fields);
  db.prepare(`UPDATE subtitle_jobs SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(...vals, jobId);
}

function failJob(job, errorCode, message, permanent = false) {
  const attempts = (job.attempts || 0);
  const maxAttempts = job.max_attempts || 3;
  if (permanent || attempts >= maxAttempts) {
    updateJob(job.id, { status: 'FAILED', error_code: errorCode, current_stage: 'FAILED', locked_at: null, finished_at: new Date().toISOString() });
    log('failed', `Job #${job.id} FALHOU (${errorCode}): ${message}`);
    publishEvent('SUBTITLE_JOB_FAILED', { jobId: job.id, errorCode, message, contentId: job.content_id });
    // FASE 46: Sentinela observa falhas (ações seguras apenas)
    try {
      db.prepare(`INSERT INTO system_error_logs (error_type, content_id, error_message) VALUES ('SUBTITLE_JOB_FAILED', ?, ?)`)
        .run(job.content_id, `${errorCode}: ${message}`);
    } catch (e) {}
  } else {
    // FASE 44: backoff exponencial 30s → 2m → 10m
    const backoffs = [30000, 120000, 600000];
    const delay = backoffs[Math.min(attempts - 1, backoffs.length - 1)];
    updateJob(job.id, { status: 'RETRYING', error_code: errorCode, current_stage: 'RETRYING', locked_at: null, next_attempt_at: Date.now() + delay });
    log('failed', `Job #${job.id} erro transitório (${errorCode}) — retry em ${delay / 1000}s (tentativa ${attempts}/${maxAttempts})`);
  }
}


// ============================================================
// FASE 21/22/23: Tradução Contextual em Blocos via VSAIROUTER
// ============================================================
async function translateCues(cues, sourceLang = 'auto') {
  if (!cues || cues.length === 0) return [];
  // Se o áudio original já for detectado em português, não precisa traduzir
  if (/^pt/i.test(sourceLang)) {
    return cues;
  }

  const translatedCues = [];

  for (let i = 0; i < cues.length; i += TRANSLATE_BLOCK) {
    const block = cues.slice(i, i + TRANSLATE_BLOCK);
    const contextStart = Math.max(0, i - CONTEXT_CUES);
    const contextBlock = cues.slice(contextStart, i);

    const promptItems = block.map((c, idx) => `[${i + idx + 1}] ${c.text}`).join('\n');
    const contextPrompt = contextBlock.length > 0
      ? `Contexto anterior (apenas leitura, NÃO traduzir nem incluir na resposta):\n${contextBlock.map((c, idx) => `(ref) ${c.text}`).join('\n')}\n\n`
      : '';

    const userPrompt = `${contextPrompt}Traduza as seguintes falas para português brasileiro natural, mantendo o formato numérico [n] correspondente:\n${promptItems}`;

    try {
      const resp = await vsaiRouterClient.chatCompletion({
        messages: [
          { role: 'system', content: TRANSLATION_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2
      });

      if (resp && resp.success && resp.data?.choices?.[0]?.message?.content) {
        const textContent = resp.data.choices[0].message.content;
        const lines = textContent.split('\n');
        const translatedMap = new Map();

        for (const line of lines) {
          const match = line.match(/^\[(\d+)\]\s*(.+)$/);
          if (match) {
            translatedMap.set(parseInt(match[1], 10), match[2].trim());
          }
        }

        for (let j = 0; j < block.length; j++) {
          const cueIndex = i + j + 1;
          const origCue = block[j];
          const transText = translatedMap.get(cueIndex) || origCue.text;
          translatedCues.push({
            start: origCue.start,
            end: origCue.end,
            text: transText,
            lines: vtt.wrapText(transText)
          });
        }
      } else {
        // FASE 47: VSAIROUTER indisponível → falhar com retry (checkpoints preservados)
        const e = new Error('VSAIROUTER sem resposta para bloco de tradução');
        e.code = 'VSAIROUTER_UNAVAILABLE';
        throw e;
      }
    } catch (err) {
      if (err.code === 'VSAIROUTER_UNAVAILABLE') throw err;
      log('translate', `Falha ao traduzir bloco ${i}: ${err.message}.`);
      const e = new Error(`VSAIROUTER_UNAVAILABLE: ${err.message}`);
      e.code = 'VSAIROUTER_UNAVAILABLE';
      throw e;
    }
  }

  return translatedCues;
}

// ============================================================
// FASE 11–32: Pipeline Principal de Processamento de um Job
// ============================================================
async function processJob(job) {
  log('processing', `Iniciando processamento do Job #${job.id} (${job.source_type} ${job.content_id}/${job.episode_id || '-'})`);

  // 1. Obter URL do stream a partir do banco
  let streamUrl = null;
  if (job.episode_id) {
    const ep = db.prepare('SELECT stream_url FROM series_episodes WHERE id = ?').get(job.episode_id);
    streamUrl = ep?.stream_url;
  } else {
    const st = db.prepare('SELECT stream_url FROM streams WHERE id = ?').get(job.content_id);
    streamUrl = st?.stream_url;
  }

  if (!streamUrl) {
    failJob(job, 'NO_STREAM_URL', 'URL do stream não encontrada no banco de dados', true);
    return;
  }

  const tmpDir = ffmpegMedia.tempDirForJob(job.id);

  try {
    // 2. Sondagem de duração da mídia
    updateJob(job.id, { current_stage: 'EXTRACTING', progress: 5 });
    let durationMs = null;
    try {
      const probeRes = await ffmpegMedia.probeMedia(streamUrl, 30000);
      durationMs = probeRes?.durationMs || null;
    } catch (probeErr) {
      log('probe', `Aviso: ffprobe não obteve duração exata: ${probeErr.message}`);
    }

    // 3. FASE 17/18: Planejamento / Verificação de Checkpoints de Segmentos
    const segmentChunkMs = SEGMENT_MINUTES * 60 * 1000;
    let existingSegments = db.prepare(
      'SELECT * FROM subtitle_job_segments WHERE job_id = ? ORDER BY segment_index ASC'
    ).all(job.id);

    if (existingSegments.length === 0) {
      const totalMs = durationMs || (60 * 60 * 1000); // 1h default se desconhecido
      const count = Math.max(1, Math.ceil(totalMs / segmentChunkMs));
      const insertSeg = db.prepare(`
        INSERT INTO subtitle_job_segments (job_id, segment_index, start_ms, end_ms, status)
        VALUES (?, ?, ?, ?, 'PENDING')
      `);

      for (let idx = 0; idx < count; idx++) {
        const segStart = idx * segmentChunkMs;
        const segEnd = durationMs ? Math.min(segStart + segmentChunkMs, durationMs) : segStart + segmentChunkMs;
        insertSeg.run(job.id, idx, segStart, segEnd);
      }

      existingSegments = db.prepare(
        'SELECT * FROM subtitle_job_segments WHERE job_id = ? ORDER BY segment_index ASC'
      ).all(job.id);
    }

    // 4. Executar extração e transcrição por segmento com checkpoint
    let detectedLanguage = 'unknown';
    const totalSegs = existingSegments.length;

    for (let i = 0; i < totalSegs; i++) {
      const seg = existingSegments[i];
      if (seg.status === 'READY' && seg.transcript) {
        if (seg.detected_language && seg.detected_language !== 'unknown') {
          detectedLanguage = seg.detected_language;
        }
        continue; // Já processado em tentativa anterior
      }

      const segProgress = Math.round(10 + (i / totalSegs) * 45);
      updateJob(job.id, { current_stage: 'EXTRACTING', progress: segProgress });

      const startSec = Math.floor(seg.start_ms / 1000);
      const durationSec = Math.ceil((seg.end_ms - seg.start_ms) / 1000);
      const segWavName = `seg_${seg.segment_index}.wav`;

      log('extract', `Job #${job.id} extraindo áudio segmento ${i + 1}/${totalSegs} (${startSec}s + ${durationSec}s)`);
      const audioPath = await ffmpegMedia.extractAudioSegment(streamUrl, tmpDir, segWavName, {
        startSec,
        durationSec
      });

      updateJob(job.id, { current_stage: 'TRANSCRIBING', progress: segProgress + 5 });
      log('asr', `Job #${job.id} transcrevendo áudio segmento ${i + 1}/${totalSegs}`);
      const asrResult = await asr.transcribe({ audioPath, languageHint: null });

      if (asrResult.language && asrResult.language !== 'unknown') {
        detectedLanguage = asrResult.language;
      }

      // Salva segmento pronto no checkpoint
      db.prepare(`
        UPDATE subtitle_job_segments
        SET status = 'READY', transcript = ?, detected_language = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(JSON.stringify(asrResult.segments || []), asrResult.language || detectedLanguage, seg.id);

      // Remove wav temporário para economizar disco imediatamente
      try { fs.unlinkSync(audioPath); } catch (e) {}
    }

    // 5. Agregar todos os segmentos de ASR ajustando os offsets de tempo
    const allDbSegments = db.prepare(
      'SELECT * FROM subtitle_job_segments WHERE job_id = ? ORDER BY segment_index ASC'
    ).all(job.id);

    const mergedAsrSegments = [];
    for (const seg of allDbSegments) {
      if (!seg.transcript) continue;
      try {
        const segCues = JSON.parse(seg.transcript);
        for (const c of segCues) {
          mergedAsrSegments.push({
            start: (c.start || 0) + seg.start_ms,
            end: (c.end || 0) + seg.start_ms,
            text: c.text || ''
          });
        }
      } catch (parseErr) {}
    }

    if (mergedAsrSegments.length === 0) {
      failJob(job, 'EMPTY_TRANSCRIPT', 'Transcrição de áudio não gerou diálogos reconhecíveis', true);
      return;
    }

    // 6. Construção dos Cues Iniciais
    let cues = vtt.buildCues(mergedAsrSegments);

    // 7. Tradução (se necessário)
    updateJob(job.id, { current_stage: 'TRANSLATING', progress: 70 });
    if (job.target_language === 'pt-BR' && !/^pt/i.test(detectedLanguage)) {
      log('translate', `Job #${job.id} traduzindo ${cues.length} falas (${detectedLanguage} -> pt-BR)...`);
      cues = await translateCues(cues, detectedLanguage);
    }

    // 8. Geração e Validação de WebVTT
    updateJob(job.id, { current_stage: 'GENERATING', progress: 85 });
    const vttContent = vtt.buildVtt(cues);

    updateJob(job.id, { current_stage: 'VALIDATING', progress: 92 });
    const validation = vtt.validateVtt(vttContent, { minCues: 1, maxDurationMs: durationMs });
    if (!validation.valid) {
      // FASE 31: NUNCA marcar READY antes da validação passar
      failJob(job, 'VALIDATION_FAILED', validation.errors.join(', '));
      return;
    }

    // 9. Armazenar VTT no sistema de arquivos
    const contentDir = path.join(STORAGE_ROOT, String(job.content_id));
    if (!fs.existsSync(contentDir)) {
      fs.mkdirSync(contentDir, { recursive: true });
    }

    const subFileName = `sub_${job.content_id}_${job.episode_id || 0}_${job.target_language || 'pt-BR'}.vtt`;
    const finalStoragePath = path.join(contentDir, subFileName);
    fs.writeFileSync(finalStoragePath, vttContent, 'utf8');

    // 10. Persistência na tabela ai_subtitles
    const mediaFp = fingerprintFor(job.content_id, job.episode_id);
    const existingSub = db.prepare(`
      SELECT id, reviewed FROM ai_subtitles
      WHERE content_id = ? AND IFNULL(episode_id, 0) = IFNULL(?, 0) AND target_language = ?
    `).get(job.content_id, job.episode_id, job.target_language);

    let subtitleId = existingSub?.id;
    if (subtitleId && existingSub.reviewed === 1) {
      // FASE 54: revisão humana NUNCA é substituída automaticamente
      log('ready', `Job #${job.id}: legenda revisada por humano existente — nova versão descartada`);
      updateJob(job.id, { status: 'READY', current_stage: 'READY', progress: 100, subtitle_id: subtitleId, locked_at: null, finished_at: new Date().toISOString() });
      return;
    }
    if (subtitleId) {
      db.prepare(`
        UPDATE ai_subtitles
        SET storage_path = ?, status = 'READY', source_language = ?, media_fingerprint = ?,
            cue_count = ?, duration_ms = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(finalStoragePath, detectedLanguage, mediaFp, cues.length, durationMs, subtitleId);
    } else {
      const insertSub = db.prepare(`
        INSERT INTO ai_subtitles
          (content_id, episode_id, media_fingerprint, source_language, target_language, format, storage_path, status, source, duration_ms, cue_count)
        VALUES (?, ?, ?, ?, ?, 'vtt', ?, 'READY', 'AI_GENERATED', ?, ?)
      `).run(job.content_id, job.episode_id, mediaFp, detectedLanguage, job.target_language, finalStoragePath, durationMs, cues.length);
      subtitleId = Number(insertSub.lastInsertRowid);
    }

    // 11. Finalizar Job com Sucesso
    updateJob(job.id, {
      status: 'READY',
      current_stage: 'READY',
      progress: 100,
      subtitle_id: subtitleId,
      locked_at: null,
      finished_at: new Date().toISOString()
    });

    log('ready', `Job #${job.id} CONCLUÍDO com sucesso! Legenda #${subtitleId} salva em ${subFileName} (${cues.length} cues)`);
    publishEvent('SUBTITLE_READY', {
      jobId: job.id,
      contentId: job.content_id,
      episodeId: job.episode_id,
      subtitleId,
      cueCount: cues.length
    });

  } catch (err) {
    log('error', `Erro na execução do Job #${job.id}: ${err.message}`);
    failJob(job, err.code || 'PROCESS_ERROR', err.message, false);
  } finally {
    ffmpegMedia.cleanupTempDir(tmpDir);
  }
}

// ============================================================
// FASE 7/8: Loop de Execução, Agendamento e Ciclo de Vida
// ============================================================
let tickTimer = null;
let scanTimer = null;
let isProcessing = false;

async function tick() {
  if (isProcessing) return;

  const enabled = (process.env.SUBTITLE_AI_ENABLED ?? 'true') !== 'false';
  if (!enabled) return;

  const resCheck = resourceManager.canAcceptNewJob();
  if (!resCheck.ok) {
    return;
  }

  const job = claimNextJob();
  if (!job) return;

  isProcessing = true;
  try {
    await processJob(job);
  } catch (err) {
    log('tick', `Exceção não tratada no job #${job.id}: ${err.message}`);
  } finally {
    isProcessing = false;
  }
}

function start() {
  if (tickTimer) return;
  log('worker', `Iniciando SubtitleAgent (Worker ID: ${WORKER_ID}, tick: ${TICK_MS}ms)`);
  tickTimer = setInterval(tick, TICK_MS);
  if (typeof tickTimer.unref === 'function') tickTimer.unref();

  scanTimer = setInterval(scanCatalog, SCAN_INTERVAL_MS);
  if (typeof scanTimer.unref === 'function') scanTimer.unref();

  setTimeout(scanCatalog, 5000);
}

function stop() {
  if (tickTimer) clearInterval(tickTimer);
  if (scanTimer) clearInterval(scanTimer);
  tickTimer = null;
  scanTimer = null;
  log('worker', 'SubtitleAgent pausado');
}

function getStats() {
  const queued = db.prepare("SELECT COUNT(*) AS count FROM subtitle_jobs WHERE status IN ('QUEUED','RETRYING')").get().count;
  const active = db.prepare("SELECT COUNT(*) AS count FROM subtitle_jobs WHERE status IN ('EXTRACTING','TRANSCRIBING','TRANSLATING','GENERATING','VALIDATING')").get().count;
  const ready = db.prepare("SELECT COUNT(*) AS count FROM ai_subtitles WHERE status = 'READY'").get().count;
  const failed = db.prepare("SELECT COUNT(*) AS count FROM subtitle_jobs WHERE status = 'FAILED'").get().count;

  return {
    workerId: WORKER_ID,
    isProcessing,
    queued,
    active,
    readySubtitles: ready,
    failedJobs: failed,
    dailyMinutes: resourceManager.getDailyAudioMinutes()
  };
}

// Inicia automaticamente o worker se habilitado
if ((process.env.SUBTITLE_AI_ENABLED ?? 'true') !== 'false') {
  start();
}

module.exports = {
  enqueueJob,
  scanCatalog,
  claimNextJob,
  processJob,
  translateCues,
  tick,
  start,
  stop,
  getStats,
  STORAGE_ROOT,
  TARGET_LANG
};
