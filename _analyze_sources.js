// Script temporário de análise: quanto conteúdo existe nas fontes do projeto.
const fs = require('fs');
const path = require('path');
const Database = require('./server/node_modules/better-sqlite3');

const db = new Database(path.join(__dirname, 'server/data/iptv.db'), { readonly: true });
console.log('=== BANCO ATUAL ===');
console.log(db.prepare('SELECT type, status, COUNT(*) AS c FROM streams GROUP BY type, status').all());
console.log('Sem poster:', db.prepare("SELECT type, COUNT(*) c FROM streams WHERE COALESCE(poster_url,'')='' GROUP BY type").all());
console.log('Sem icone:', db.prepare("SELECT type, COUNT(*) c FROM streams WHERE COALESCE(icon_url,'')='' GROUP BY type").all());
console.log('Sem categoria:', db.prepare('SELECT COUNT(*) c FROM streams WHERE category_id IS NULL').get().c);
console.log('Filmes com ano no nome:', db.prepare("SELECT COUNT(*) c FROM streams WHERE type='movie' AND (name LIKE '%(19%' OR name LIKE '%(20%')").get().c);
db.close();

function liveBase(name) {
  return String(name || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(4k|uhd|fhd|hd|sd|h265|hevc|h264|10bits|60fps|30fps|25fps)\b/g, '')
    .replace(/[²³^~°ªº]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ').trim();
}
function vodBase(name) {
  return String(name || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\bs\d{1,3}\s*e\d{1,3}\b/g, ' ')
    .replace(/\bs\d{1,3}\b/g, ' ')
    .replace(/\btemporada\s*\d{1,2}\b/g, ' ')
    .replace(/\b(?:cap[ií]tulo|epis[óo]dio|ep|episode|parte)\s*\d{1,3}\b/g, ' ')
    .replace(/\b(4k|uhd|fhd|hd|sd|h265|hevc|h264)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const vod = path.join(__dirname, 'repo_content/Filmes-Series.m3u8');
if (fs.existsSync(vod)) {
  const lines = fs.readFileSync(vod, 'utf8').split(/\r?\n/);
  let rawName = null, rawLogo = '';
  const movies = new Set(); const series = new Set(); const eps = new Map();
  let movieUrls = 0, seriesUrls = 0, movieWithLogo = 0, seriesWithLogo = 0, movieWithYear = 0, liveUrls = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('#EXTINF')) {
      const m = t.match(/,(.*)$/); rawName = m ? m[1].trim() : '';
      const lm = t.match(/tvg-logo="([^"]*)"/i); rawLogo = lm ? lm[1].trim() : '';
    } else if (t.startsWith('http') && rawName) {
      const b = vodBase(rawName);
      if (/\/series\//.test(t)) {
        seriesUrls++;
        if (rawLogo) seriesWithLogo++;
        if (b) { series.add(b); if (!eps.has(b)) eps.set(b, new Set()); eps.get(b).add(t); }
      } else if (/\/movie\//.test(t)) {
        movieUrls++;
        if (rawLogo) movieWithLogo++;
        if (/(19|20)\d{2}/.test(rawName)) movieWithYear++;
        if (b) movies.add(b);
      } else { liveUrls++; }
      rawName = null; rawLogo = '';
    }
  }
  const sizes = [...eps.values()].map((s) => s.size).sort((a, b) => a - b);
  const sum = sizes.reduce((a, b) => a + b, 0);
  const buckets = [1, 5, 10, 20, 30, 40, 60, 100];
  console.log('\n=== repo_content/Filmes-Series.m3u8 ===');
  console.log({
    movieUrls, filmesUnicos: movies.size, movieWithLogo, movieWithYear,
    seriesUrls, seriesUnicas: series.size, seriesWithLogo, liveUrls,
    avgEpsPorSerie: (sum / (sizes.length || 1)).toFixed(1),
    epsCapped30: sizes.reduce((a, v) => a + Math.min(v, 30), 0),
    epsCapped40: sizes.reduce((a, v) => a + Math.min(v, 40), 0),
    epsCapped60: sizes.reduce((a, v) => a + Math.min(v, 60), 0),
    buckets: buckets.map((b, i) => `${b}:${sizes.filter((s) => s <= b && (i === 0 || s > buckets[i - 1])).length}`).join(' '),
  });
}

const liveFiles = ['CanaisBR01.m3u8', 'CanaisBR02.m3u8', 'CanaisBR03.m3u8', 'CanaisEuropa.m3u8', 'CanaisItalia.m3u8'];
const globalLive = new Set();
console.log('\n=== CANAIS AO VIVO (repo_content) ===');
for (const f of liveFiles) {
  const p = path.join(__dirname, 'repo_content', f);
  if (!fs.existsSync(p)) { console.log(f, 'AUSENTE'); continue; }
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  let rawName = null, rawLogo = ''; let urls = 0, withLogo = 0; const names = new Set();
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('#EXTINF')) {
      const m = t.match(/,(.*)$/); rawName = m ? m[1].trim() : '';
      const lm = t.match(/tvg-logo="([^"]*)"/i); rawLogo = lm ? lm[1].trim() : '';
    } else if (t.startsWith('http') && rawName) {
      if (!/\/series\/|\/movie\//.test(t)) {
        urls++;
        if (rawLogo) withLogo++;
        const b = liveBase(rawName);
        if (b && !/adult|xxx|porn|erotic|18\+/i.test(rawName)) { names.add(b); globalLive.add(b); }
      }
      rawName = null;
    }
  }
  console.log(`${f}: urls=${urls} nomesUnicos=${names.size} (logoSample=${withLogo})`);
}
console.log('Canais ao vivo únicos GLOBAIS (locais):', globalLive.size);