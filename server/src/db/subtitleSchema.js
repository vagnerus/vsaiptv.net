/**
 * subtitleSchema.js — Tabelas do sistema de Legendas IA (VSAIPTV)
 * Criado de forma aditiva (CREATE TABLE IF NOT EXISTS) — não altera tabelas existentes.
 * Banco: SQLite (better-sqlite3), padrão do projeto.
 */
const db = require('./database');

function initSubtitleSchema() {
  db.exec(`
    -- =============================================
    -- FASE 4: Legendas (fonte de verdade)
    -- =============================================
    CREATE TABLE IF NOT EXISTS ai_subtitles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL,          -- streams.id (filme ou série)
      episode_id INTEGER,                   -- series_episodes.id (nullable p/ filmes)
      media_fingerprint TEXT,               -- hash estável da fonte (URL/versão)
      source_language TEXT,
      target_language TEXT NOT NULL DEFAULT 'pt-BR',
      format TEXT NOT NULL DEFAULT 'vtt',
      storage_path TEXT,
      status TEXT CHECK(status IN ('DISCOVERED','QUEUED','EXTRACTING','TRANSCRIBING','TRANSLATING','GENERATING','VALIDATING','READY','FAILED','RETRYING','DISABLED')) NOT NULL DEFAULT 'DISCOVERED',
      source TEXT CHECK(source IN ('ORIGINAL','AI_GENERATED','IMPORTED','MANUAL')) NOT NULL DEFAULT 'AI_GENERATED',
      generated_by_ai INTEGER NOT NULL DEFAULT 1,
      reviewed INTEGER NOT NULL DEFAULT 0,  -- FASE 54: revisão humana não pode ser sobrescrita
      version INTEGER NOT NULL DEFAULT 1,
      duration_ms INTEGER,
      cue_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_subtitles_identity
      ON ai_subtitles(content_id, IFNULL(episode_id, 0), target_language);

    CREATE INDEX IF NOT EXISTS idx_ai_subtitles_status ON ai_subtitles(status);
    CREATE INDEX IF NOT EXISTS idx_ai_subtitles_content ON ai_subtitles(content_id, episode_id);

    -- =============================================
    -- FASE 5: Jobs (fila persistente)
    -- =============================================
    CREATE TABLE IF NOT EXISTS subtitle_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL,
      episode_id INTEGER,
      target_language TEXT NOT NULL DEFAULT 'pt-BR',
      priority INTEGER NOT NULL DEFAULT 0,  -- 0=background, 10=demand, 20=high
      status TEXT CHECK(status IN ('QUEUED','EXTRACTING','TRANSCRIBING','TRANSLATING','GENERATING','VALIDATING','READY','FAILED','RETRYING','WAITING_TRANSLATION','CANCELLED','PAUSED')) NOT NULL DEFAULT 'QUEUED',
      progress INTEGER NOT NULL DEFAULT 0,  -- 0..100
      current_stage TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      error_code TEXT,
      worker_id TEXT,
      locked_at INTEGER,
      next_attempt_at INTEGER,
      started_at DATETIME,
      finished_at DATETIME,
      subtitle_id INTEGER,
      title TEXT,                            -- snapshot apenas p/ exibição no painel
      source_type TEXT,                      -- 'movie' | 'series_episode'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subtitle_id) REFERENCES ai_subtitles(id) ON DELETE SET NULL
    );

    -- FASE 42/63: deduplicação — 1 job ativo por (conteúdo, episódio, idioma)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_subtitle_jobs_active_identity
      ON subtitle_jobs(content_id, IFNULL(episode_id, 0), target_language)
      WHERE status NOT IN ('READY','FAILED','CANCELLED');

    CREATE INDEX IF NOT EXISTS idx_subtitle_jobs_queue
      ON subtitle_jobs(status, priority DESC, created_at);

    -- =============================================
    -- FASE 17/18: Checkpoints por segmento
    -- =============================================
    CREATE TABLE IF NOT EXISTS subtitle_job_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      segment_index INTEGER NOT NULL,
      start_ms INTEGER NOT NULL,
      end_ms INTEGER NOT NULL,
      status TEXT CHECK(status IN ('PENDING','READY','FAILED')) NOT NULL DEFAULT 'PENDING',
      attempts INTEGER NOT NULL DEFAULT 0,
      transcript TEXT,
      detected_language TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES subtitle_jobs(id) ON DELETE CASCADE,
      UNIQUE(job_id, segment_index)
    );

    CREATE INDEX IF NOT EXISTS idx_subtitle_segments_job ON subtitle_job_segments(job_id, segment_index);
  `);
}

module.exports = { initSubtitleSchema };
