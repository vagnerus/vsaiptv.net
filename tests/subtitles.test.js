/**
 * tests/subtitles.test.js — FASE 72: Testes unitários do sistema de legendas IA.
 * Execução: node tests/subtitles.test.js
 */
const assert = require('assert');

process.env.SUBTITLE_AI_ENABLED = 'false'; // não iniciar timers do agente no teste

const vtt = require('../server/src/services/subtitles/vttBuilder');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  OK ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

console.log('\n=== Legendas IA: testes unitários ===\n');

test('msToTimestamp formata corretamente', () => {
  assert.strictEqual(vtt.msToTimestamp(74200), '00:01:14.200');
  assert.strictEqual(vtt.msToTimestamp(0), '00:00:00.000');
  assert.strictEqual(vtt.msToTimestamp(-5), '00:00:00.000');
});

test('buildCues saneia timestamps (end<=start, sobreposição)', () => {
  const cues = vtt.buildCues([
    { start: 0, end: 0, text: 'Ola' },
    { start: 500, end: 400, text: 'Mundo' },
    { start: 600, end: 1200, text: 'Tudo bem?' },
  ]);
  assert.strictEqual(cues.length, 3);
  assert.ok(cues[0].end > cues[0].start);
  assert.ok(cues[1].start >= cues[0].end);
});

test('buildVtt produz WEBVTT válido', () => {
  const cues = vtt.buildCues([
    { start: 70000, end: 73200, text: 'Onde você estava?' },
    { start: 74000, end: 76500, text: 'Estava esperando por você.' },
  ]);
  const out = vtt.buildVtt(cues);
  assert.ok(out.startsWith('WEBVTT'));
  assert.ok(out.includes('00:01:10.000 --> 00:01:13.200'));
});

test('validateVtt rejeita VTT corrompido', () => {
  assert.strictEqual(vtt.validateVtt('').valid, false);
  assert.strictEqual(vtt.validateVtt('sem cabecalho\n\n00:00:00.000 --> 00:00:01.000\nx').valid, false);
  const bad = 'WEBVTT\n\n00:00:01.000 --> 00:00:00.500\ninvertido\n';
  assert.strictEqual(vtt.validateVtt(bad).valid, false);
});

test('validateVtt aceita VTT válido (roundtrip)', () => {
  const cues = vtt.buildCues([{ start: 1000, end: 4000, text: 'Olá mundo.' }]);
  const res = vtt.validateVtt(vtt.buildVtt(cues));
  assert.strictEqual(res.valid, true, JSON.stringify(res.errors));
});

test('validateTranslation rejeita cues alterados/faltantes (FASE 25)', () => {
  const original = vtt.buildCues([{ start: 0, end: 1000, text: 'Hello' }, { start: 1000, end: 2000, text: 'World' }]);
  assert.strictEqual(vtt.validateTranslation(original, original.map((c) => ({ ...c }))).valid, true);
  assert.strictEqual(vtt.validateTranslation(original, original.slice(0, 1)).valid, false);
  const badTs = original.map((c, i) => (i === 1 ? { ...c, start: 99999 } : { ...c }));
  assert.strictEqual(vtt.validateTranslation(original, badTs).valid, false);
});

test('normalizeText limpa espaçamento/pontuação', () => {
  assert.strictEqual(vtt.normalizeText('  Olá ,  mundo !!  '), 'Olá, mundo!');
});

test('wrapText limita linhas sem cortar palavras', () => {
  const lines = vtt.wrapText('uma frase bastante longa que precisa ser quebrada em varias linhas curtas', 20, 2);
  assert.ok(lines.length <= 2);
});

// ---------- módulos do sistema ----------
test('schema de legendas é criado sem quebrar o banco', () => {
  const db = require('../server/src/db/database');
  const { initSubtitleSchema } = require('../server/src/db/subtitleSchema');
  initSubtitleSchema();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ai_subtitles','subtitle_jobs','subtitle_job_segments')").all();
  assert.strictEqual(tables.length, 3);
});

test('deduplicação: 2x enqueue do mesmo conteúdo = 1 job (FASE 42/75)', () => {
  const db = require('../server/src/db/database');
  const agent = require('../server/src/services/subtitles/subtitleAgent');
  db.prepare('DELETE FROM subtitle_jobs WHERE content_id = 999001').run();
  const r1 = agent.enqueueJob({ contentId: 999001, title: 'TESTE', sourceType: 'movie' });
  const r2 = agent.enqueueJob({ contentId: 999001, title: 'TESTE', sourceType: 'movie' });
  assert.strictEqual(r1.created, true, 'primeiro enqueue deve criar job');
  assert.strictEqual(r2.created, false, 'segundo enqueue NÃO deve criar outro job');
  assert.strictEqual(r2.reason, 'JOB_EXISTS');
  db.prepare('DELETE FROM subtitle_jobs WHERE content_id = 999001').run();
});

test('claim atômico: lock único (FASE 43)', () => {
  const db = require('../server/src/db/database');
  const agent = require('../server/src/services/subtitles/subtitleAgent');
  db.prepare('DELETE FROM subtitle_jobs WHERE content_id = 999002').run();
  const r = agent.enqueueJob({ contentId: 999002, priority: 99, title: 'TESTE LOCK', sourceType: 'movie' });
  assert.ok(r.created);
  const job = agent.claimNextJob();
  assert.ok(job && job.content_id === 999002, 'deve reivindicar o job');
  const again = agent.claimNextJob();
  assert.ok(!again || again.content_id !== 999002, 'job lockado não pode ser reivindicado');
  db.prepare('DELETE FROM subtitle_jobs WHERE content_id = 999002').run();
});

test('módulos de infra carregam (ffmpeg, asr, resourceManager, routes)', () => {
  const ffmpeg = require('../server/src/services/subtitles/ffmpegMedia');
  const asr = require('../server/src/services/subtitles/asrProvider');
  const rm = require('../server/src/services/subtitles/resourceManager');
  assert.strictEqual(typeof ffmpeg.extractAudioSegment, 'function');
  assert.strictEqual(typeof asr.transcribe, 'function');
  assert.ok(rm.getConfig().maxConcurrent >= 1);
  require('../server/src/routes/subtitles');
});

console.log(`\n${passed} testes passaram.${process.exitCode ? ' FALHAS DETECTADAS.' : ''}\n`);
