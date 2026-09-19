/**
 * ffmpegMedia.js — FASE 11/60: Extração de áudio e probe via FFmpeg.
 * FASE 60 (segurança): spawn com args separados, SEM shell, timeout obrigatório,
 * nunca recebe entrada do usuário — a URL vem do banco (streams/series_episodes).
 */
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE_BIN = process.env.FFPROBE_PATH || 'ffprobe';
const DEFAULT_TIMEOUT_MS = Number(process.env.SUBTITLE_FFMPEG_TIMEOUT_MS || 10 * 60 * 1000);

let cachedAvailable = null;

/** Detecção de disponibilidade (com cache por processo). */
function isAvailable() {
  return new Promise((resolve) => {
    if (cachedAvailable !== null) return resolve(cachedAvailable);
    execFile(FFMPEG_BIN, ['-version'], { timeout: 5000, windowsHide: true }, (err) => {
      cachedAvailable = !err;
      resolve(cachedAvailable);
    });
  });
}

function resetAvailabilityCache() { cachedAvailable = null; }

/** Executa ffmpeg com args seguros e timeout. */
function runFfmpeg(args, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG_BIN, args, {
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      killSignal: 'SIGKILL',
    }, (err, stdout, stderr) => {
      if (err) {
        const e = new Error(`FFMPEG_FAILED: ${err.message}${stderr ? ' | ' + String(stderr).slice(-400) : ''}`);
        e.code = 'FFMPEG_FAILED';
        return reject(e);
      }
      resolve({ stdout, stderr });
    });
  });
}

/** Executa ffprobe (JSON) — usado p/ duração da mídia. */
function probeMedia(mediaUrl, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    execFile(FFPROBE_BIN, [
      '-v', 'error', '-print_format', 'json',
      '-show_entries', 'format=duration',
      '-user_agent', 'VSAIPTV/1.0',
      mediaUrl,
    ], { timeout: timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true }, (err, stdout) => {
      if (err) {
        const e = new Error(`FFPROBE_FAILED: ${err.message}`);
        e.code = 'FFPROBE_FAILED';
        return reject(e);
      }
      try {
        const json = JSON.parse(stdout);
        const durationMs = Math.round(parseFloat(json?.format?.duration || 0) * 1000);
        resolve({ durationMs: Number.isFinite(durationMs) ? durationMs : null });
      } catch (parseErr) {
        resolve({ durationMs: null });
      }
    });
  });
}

/**
 * FASE 11/16: extrai um segmento de áudio (mono 16kHz WAV) para o ASR.
 * startSec/endSec delimitam o segmento absoluto (chunking preserva timestamps).
 */
async function extractAudioSegment(mediaUrl, outDir, fileName, { startSec = 0, durationSec = null } = {}) {
  const ok = await isAvailable();
  if (!ok) {
    const e = new Error('FFmpeg não está disponível no servidor');
    e.code = 'FFMPEG_MISSING';
    throw e;
  }
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, fileName);
  const args = [
    '-hide_banner', '-nostdin', '-loglevel', 'error',
    '-ss', String(startSec),
  ];
  if (durationSec && durationSec > 0) args.push('-t', String(durationSec));
  args.push(
    '-i', mediaUrl,
    '-vn', '-ac', '1', '-ar', '16000',
    '-acodec', 'pcm_s16le',
    '-y', outPath
  );
  await runFfmpeg(args);
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
    const e = new Error('Extração de áudio produziu arquivo vazio');
    e.code = 'FFMPEG_EMPTY_OUTPUT';
    throw e;
  }
  return outPath;
}

/** FASE 12: diretório temporário isolado por job. */
function tempDirForJob(jobId) {
  const base = process.env.SUBTITLE_TEMP_DIR || path.join(os.tmpdir(), 'vsaiptv-subtitles');
  const dir = path.join(base, String(jobId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** FASE 12: limpeza de temporários (best-effort). */
function cleanupTempDir(dir, maxRetries = 2) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return true;
    } catch (e) { /* retry */ }
  }
  return false;
}

module.exports = {
  isAvailable,
  resetAvailabilityCache,
  runFfmpeg,
  probeMedia,
  extractAudioSegment,
  tempDirForJob,
  cleanupTempDir,
};
