// Diagnóstico de canais: de onde vêm, para que domínios apontam e como se comportam.
const Database = require('./server/node_modules/better-sqlite3');
const path = require('node:path');
const db = new Database(path.join(__dirname, 'server/data/iptv.db'), { readonly: true });

function hostOf(url) {
  try { return new URL(url).host.toLowerCase(); } catch { return '(invalida)'; }
}

const live = db.prepare("SELECT id, name, stream_url, last_check, created_at FROM streams WHERE type='live' AND status='online'").all();
console.log('Canais online:', live.length);

const byHost = new Map();
for (const c of live) {
  const h = hostOf(c.stream_url);
  byHost.set(h, (byHost.get(h) || 0) + 1);
}
const topHosts = [...byHost.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log('\nTop 15 domínios dos canais online:');
for (const [host, count] of topHosts) console.log(`  ${String(count).padStart(5)}  ${host}`);

const schemes = { http: 0, https: 0, outro: 0 };
const formats = { m3u8: 0, ts: 0, outros: 0 };
for (const c of live) {
  const url = String(c.stream_url || '');
  if (/^http:\/\//i.test(url)) schemes.http++; else if (/^https:\/\//i.test(url)) schemes.https++; else schemes.outro++;
  if (/\.m3u8(\?|$)/i.test(url)) formats.m3u8++;
  else if (/\.ts(\?|$)|\/ts\b/i.test(url)) formats.ts++;
  else formats.outros++;
}
console.log('\nEsquema:', schemes, '\nFormato:', formats);

const checked = live.filter(c => c.last_check).length;
console.log(`\nCom last_check preenchido: ${checked}/${live.length}`);
const checkedByHost = new Map();
for (const c of live.filter(c => c.last_check)) {
  const h = hostOf(c.stream_url);
  checkedByHost.set(h, (checkedByHost.get(h) || 0) + 1);
}
const topChecked = [...checkedByHost.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log('Top 10 domínios JÁ verificados anteriormente:');
for (const [host, count] of topHosts.slice(0, 10)) {
  console.log(`  ${String(topHosts.find(([h]) => h === host)?.[1] ?? 0).padStart(5)} total | ${(checkedByHost.get(host) || 0).toString().padStart(5)} verificados | ${host}`);
}

// Amostra estratificada: 2 canais de cada um dos 8 maiores domínios
const stratified = [];
for (const [host, count] of topHosts.slice(0, 8)) {
  const items = live.filter(c => hostOf(c.stream_url) === host).slice(0, 2);
  stratified.push(...items.map(c => ({ id: c.id, host, url: c.stream_url })));
}
db.close();
const fs = require('node:fs');
fs.writeFileSync(path.join(__dirname, '_channel_diag_targets.json'), JSON.stringify(stratified, null, 2));
console.log(`\nAlvos estratificados salvos: ${stratified.length} (arquivo _channel_diag_targets.json)`);