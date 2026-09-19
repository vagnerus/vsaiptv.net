/**
 * asrProvider.js — FASE 13/14/19: Abstração Speech-to-Text.
 * Provedores suportados:
 *   - "whisper-local": servidor OpenAI-compatible /v1/audio/transcriptions
 *     (ex.: faster-whisper-server, whisper.cpp server, Groq/OpenAI remoto).
 *   - "external-api": mesmo protocolo, mas URL separada (ASR_API_URL).
 * Nunca retorna texto corrido: exige segments com start/end (ms).
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PROVIDER = process.env.ASR_PROVIDER || 'whisper-local';
const ASR_BASE_URL = process.env.ASR_API_URL || 'http://localhost:9000/v1';
const ASR_API_KEY = process.env.ASR_API_KEY || '';
const ASR_MODEL = process.env.ASR_MODEL || 'whisper-1';
const ASR_TIMEOUT_MS = Number(process.env.ASR_TIMEOUT_MS || 15 * 60 * 1000);

/**
 * Interface conceitual (FASE 13):
 *   transcribe({ audioPath, languageHint }) ->
 *     { segments: [{ start, end, text }], language }
 */
async function transcribe({ audioPath, languageHint = null }) {
  if (PROVIDER === 'none' || !ASR_BASE_URL) {
    const e = new Error('ASR_UNAVAILABLE: nenhum provedor configurado');
    e.code = 'ASR_UNAVAILABLE';
    throw e;
  }
  const url = new URL(`${ASR_BASE_URL.replace(/\/+$/, '')}/audio/transcriptions`);
  const boundary = `vsaiptv-${Date.now()}`;
  const fileBase = path.basename(audioPath);
  const fileBuf = fs.readFileSync(audioPath);

  const fields = {
    model: ASR_MODEL,
    response_format: 'verbose_json',
    timestamp_granularities: 'segment',
  };
  if (languageHint) fields.language = languageHint;

  const pre = [];
  for (const [k, v] of Object.entries(fields)) {
    pre.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
      )
    );
  }
  const fileHead = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileBase}"\r\nContent-Type: audio/wav\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([...pre, fileHead, fileBuf, tail]);

  return await new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(url.href, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        ...(ASR_API_KEY ? { Authorization: `Bearer ${ASR_API_KEY}` } : {}),
      },
      timeout: ASR_TIMEOUT_MS,
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const e = new Error(`ASR_UNAVAILABLE: HTTP ${res.statusCode}`);
          e.code = 'ASR_UNAVAILABLE';
          return reject(e);
        }
        try {
          const json = JSON.parse(data);
          const segments = (json.segments || []).map((s) => ({
            start: Math.round((s.start || 0) * 1000),
            end: Math.round((s.end || 0) * 1000),
            text: s.text || '',
          }));
          if (!segments.length) {
            const e = new Error('ASR não retornou segmentos com timestamps');
            e.code = 'ASR_NO_SEGMENTS';
            return reject(e);
          }
          resolve({ segments, language: json.language || languageHint || 'unknown' });
        } catch (parseErr) {
          const e = new Error('Resposta ASR inválida');
          e.code = 'ASR_INVALID_RESPONSE';
          reject(e);
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      const e = new Error('ASR timeout');
      e.code = 'ASR_UNAVAILABLE';
      reject(e);
    });
    req.on('error', (err) => {
      const e = new Error(`ASR_UNAVAILABLE: ${err.message}`);
      e.code = 'ASR_UNAVAILABLE';
      reject(e);
    });
    req.write(body);
    req.end();
  });
}

/** Health check simples do provedor (FASE 67). */
async function checkHealth() {
  if (PROVIDER === 'none') return { status: 'OFFLINE', error: 'ASR_PROVIDER=none' };
  try {
    const url = new URL(ASR_BASE_URL.replace(/\/+$/, '') + '/models');
    return await new Promise((resolve) => {
      const client = url.protocol === 'https:' ? https : http;
      const req = client.get(url.href, { timeout: 3000 }, (res) => {
        resolve({ status: res.statusCode < 400 ? 'ONLINE' : 'DEGRADADO', provider: PROVIDER, model: ASR_MODEL });
      });
      req.on('timeout', () => { req.destroy(); resolve({ status: 'OFFLINE', provider: PROVIDER }); });
      req.on('error', (err) => resolve({ status: 'OFFLINE', provider: PROVIDER, error: err.message }));
    });
  } catch (e) {
    return { status: 'OFFLINE', provider: PROVIDER, error: e.message };
  }
}

module.exports = { transcribe, checkHealth, PROVIDER, ASR_MODEL };
