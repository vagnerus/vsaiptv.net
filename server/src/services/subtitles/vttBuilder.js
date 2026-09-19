/**
 * vttBuilder.js — FASE 26-31: Geração, normalização e validação de WebVTT/SRT.
 * Funções PURAS (sem I/O) para permitir testes unitários diretos.
 */

const MAX_LINE_CHARS = Number(process.env.SUBTITLE_MAX_LINE_CHARS || 42);
const MAX_CUE_LINES = 2;

function msToTimestamp(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '00:00:00.000';
  const total = Math.floor(ms);
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const mmm = total % 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}.${p(mmm, 3)}`;
}

/**
 * Converte a saída de ASR ({ start, end, text } em ms) em cues normalizados.
 * FASE 28/29/30: pontuação, espaçamento, quebras e saneamento temporal.
 */
function normalizeText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:…])/g, '$1')
    .replace(/([,.!?;:…])(?=[^\s\d])/g, '$1 ')
    .replace(/([,.!?;:…])[ \t]*\1+/g, '$1') // colapsa pontuação repetida
    .trim();
}

/** Quebra texto em até MAX_CUE_LINES linhas, sem cortar palavras no meio. */
function wrapText(text, maxChars = MAX_LINE_CHARS, maxLines = MAX_CUE_LINES) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  // Compacta: agrupa excesso de linhas preservando ordem
  const compact = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    compact.push(lines.slice(i, i + maxLines).join(' '));
  }
  return compact.slice(0, maxLines);
}

/** FASE 15/16: cues com timestamps absolutos em ms, sem sobreposição. */
function buildCues(asrSegments) {
  if (!Array.isArray(asrSegments)) return [];
  const cues = [];
  let lastEnd = 0;
  for (const seg of asrSegments) {
    const text = normalizeText(seg?.text || '');
    if (!text) continue;
    let start = Math.max(0, Math.round(Number(seg.start) || 0));
    let end = Math.round(Number(seg.end) || 0);
    if (end <= start) end = start + 1200;
    if (start < lastEnd) {
      start = lastEnd; // evita sobreposição acidental
      if (end <= start) end = start + 1200; // nunca descartar cue por overlap
    }
    lastEnd = end;
    cues.push({ start, end, text, lines: wrapText(text) });
  }
  return cues;
}

/** FASE 26: gera conteúdo WebVTT a partir dos cues. */
function buildVtt(cues) {
  const parts = ['WEBVTT', ''];
  cues.forEach((cue, i) => {
    parts.push(`${i + 1}`);
    parts.push(`${msToTimestamp(cue.start)} --> ${msToTimestamp(cue.end)}`);
    parts.push(...cue.lines);
    parts.push('');
  });
  return parts.join('\n');
}

/** FASE 27: gera SRT equivalente (para exportação/compatibilidade). */
function buildSrt(cues) {
  const ts = (t) => msToTimestamp(t).replace('.', ',');
  const parts = [];
  cues.forEach((cue, i) => {
    parts.push(String(i + 1));
    parts.push(`${ts(cue.start)} --> ${ts(cue.end)}`);
    parts.push(...cue.lines);
    parts.push('');
  });
  return parts.join('\n');
}

/** Parse de um VTT existente (validação / editor de revisão). */
function parseVtt(content) {
  if (!content || typeof content !== 'string') return [];
  const clean = content.replace(/\r/g, '').replace(/^\uFEFF/, '');
  if (!clean.startsWith('WEBVTT')) return [];
  const cues = [];
  const blocks = clean.split('\n\n').slice(1);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const [rawStart, rawEnd] = timeLine.split('-->').map((s) => s.trim());
    const toMs = (ts) => {
      const m = ts.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
      if (!m) return NaN;
      const h = Number(m[1] || 0), min = Number(m[2]), sec = Number(m[3]);
      const ms = Number(m[4].padEnd(3, '0'));
      return ((h * 60 + min) * 60 + sec) * 1000 + ms;
    };
    const start = toMs(rawStart);
    const end = toMs(rawEnd);
    const textIdx = lines.indexOf(timeLine) + 1;
    const text = normalizeText(lines.slice(textIdx).join(' '));
    if (Number.isFinite(start) && Number.isFinite(end) && text) cues.push({ start, end, text });
  }
  return cues;
}

/** FASE 31: Validação final antes de marcar READY. */
function validateVtt(content, { minCues = 1, maxDurationMs = null } = {}) {
  const errors = [];
  if (!content || !content.trim()) errors.push('Arquivo VTT vazio');
  else if (!content.startsWith('WEBVTT')) errors.push('Cabeçalho WEBVTT ausente');
  const cues = parseVtt(content || '');
  if (cues.length < minCues) errors.push(`Cues insuficientes (${cues.length} < ${minCues})`);
  let prevEnd = -1;
  cues.forEach((cue, i) => {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end)) {
      errors.push(`Cue ${i + 1}: timestamp inválido (NaN)`);
      return;
    }
    if (cue.start < 0) errors.push(`Cue ${i + 1}: timestamp negativo`);
    if (cue.end <= cue.start) errors.push(`Cue ${i + 1}: end <= start`);
    if (maxDurationMs && cue.start > maxDurationMs + 60000) errors.push(`Cue ${i + 1}: fora da duração da mídia`);
    if (cue.start < prevEnd) errors.push(`Cue ${i + 1}: sobreposição com cue anterior`);
    prevEnd = Math.max(prevEnd, cue.end);
  });
  return { valid: errors.length === 0, errors, cueCount: cues.length };
}

/** FASE 25: valida tradução contra o original (anti-alucinação estrutural). */
function validateTranslation(originalCues, translatedCues) {
  if (!Array.isArray(translatedCues)) return { valid: false, errors: ['Tradução não é uma lista'] };
  const errors = [];
  if (translatedCues.length !== originalCues.length) {
    errors.push(`Número de cues mudou (${originalCues.length} -> ${translatedCues.length})`);
    return { valid: false, errors };
  }
  translatedCues.forEach((t, i) => {
    const o = originalCues[i];
    if (Math.abs((t.start || 0) - o.start) > 1 || Math.abs((t.end || 0) - o.end) > 1) {
      errors.push(`Cue ${i + 1}: timestamps alterados pela tradução`);
    }
    if (!normalizeText(t.text || '')) errors.push(`Cue ${i + 1}: texto vazio`);
  });
  return { valid: errors.length === 0, errors };
}

module.exports = {
  msToTimestamp,
  normalizeText,
  wrapText,
  buildCues,
  buildVtt,
  buildSrt,
  parseVtt,
  validateVtt,
  validateTranslation,
};
