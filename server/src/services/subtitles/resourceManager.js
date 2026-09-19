/**
 * resourceManager.js — FASE 10/39/66: Controle de recursos, janela horária e limites diários.
 * O player/site têm prioridade: se a máquina estiver sobrecarregada, pausa novos jobs.
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const db = require('../../db/database');

const cfg = {
  maxConcurrent: Number(process.env.SUBTITLE_MAX_CONCURRENT_JOBS || 1),
  scanBatch: Number(process.env.SUBTITLE_SCAN_BATCH_SIZE || 25),
  maxQueue: Number(process.env.SUBTITLE_MAX_QUEUE_SIZE || 500),
  maxCpuLoad: Number(process.env.SUBTITLE_MAX_CPU_LOAD || 0.85), // fração de cores em uso
  minFreeDiskMb: Number(process.env.SUBTITLE_MIN_FREE_DISK_MB || 1024),
  backgroundStartHour: process.env.SUBTITLE_BACKGROUND_START_HOUR || '',
  backgroundEndHour: process.env.SUBTITLE_BACKGROUND_END_HOUR || '',
  dailyAudioMinutes: Number(process.env.SUBTITLE_DAILY_AUDIO_MINUTES || 0), // 0 = ilimitado
  dailyAiBudget: Number(process.env.SUBTITLE_DAILY_AI_BUDGET || 0),
};

function getSetting(key, fallback) {
  try {
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
    return row?.value ?? fallback;
  } catch (e) {
    return fallback;
  }
}

/** Verifica se estamos dentro da janela de background (se configurada). */
function withinBackgroundWindow() {
  const s = cfg.backgroundStartHour;
  const e = cfg.backgroundEndHour;
  if (s === '' && e === '') return true; // 24h
  const h = new Date().getHours();
  const sh = parseInt(getSetting('subtitle_bg_start_hour', s)) || 0;
  const eh = parseInt(getSetting('subtitle_bg_end_hour', e)) || 24;
  if (sh === 0 && eh >= 24) return true;
  if (sh <= eh) return h >= sh && h < eh;
  return h >= sh || h < eh; // janela cruzando meia-noite
}

/** FASE 10: sob carga, pausa. Retorna { ok, reason } */
function canAcceptNewJob() {
  const load = os.loadavg()[0] || 0;
  const cores = os.cores ? os.cores().length : os.cpus().length || 1;
  if (load / cores > cfg.maxCpuLoad) {
    return { ok: false, reason: 'CPU_HIGH', detail: `load ${load.toFixed(2)}/${cores}` };
  }
  try {
    const stat = fs.statfsSync(path.dirname(db.name || process.cwd()));
    const freeMb = (stat.bavail * stat.bsize) / (1024 * 1024);
    if (freeMb < cfg.minFreeDiskMb) {
      return { ok: false, reason: 'DISK_LOW', detail: `${Math.round(freeMb)}MB livres` };
    }
  } catch (e) {
    /* statfs indisponível nesta plataforma — ignora */
  }
  return { ok: true, reason: null };
}

/** Uso diário (FASE 66) — minutos de áudio processados hoje. */
function getDailyAudioMinutes() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const row = db.prepare(
      `SELECT COALESCE(SUM(end_ms - start_ms), 0) AS ms FROM subtitle_job_segments
       WHERE status = 'READY' AND updated_at LIKE ?`
    ).get(`${today}%`);
    return (row?.ms || 0) / 60000;
  } catch (e) {
    return 0;
  }
}

function dailyBudgetExceeded() {
  if (cfg.dailyAudioMinutes > 0 && getDailyAudioMinutes() >= cfg.dailyAudioMinutes) {
    return { exceeded: true, reason: 'DAILY_AUDIO_LIMIT' };
  }
  return { exceeded: false };
}

function getConfig() { return cfg; }

module.exports = { getConfig, canAcceptNewJob, withinBackgroundWindow, dailyBudgetExceeded, getDailyAudioMinutes };
