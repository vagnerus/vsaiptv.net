// Diagnóstico limitado de disponibilidade: não comprova decodificação ou reprodução completa.
const Database = require('./server/node_modules/better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
// Amostra aleatória de 21 itens (7 por tipo); resultado não representa taxas do catálogo.
const db = new Database(path.join(__dirname, 'server/data/iptv.db'), { readonly: true });
const samples = [];
for (const type of ['live', 'movie']) {
  samples.push(...db.prepare(`SELECT id, type, stream_url FROM streams WHERE type=? AND status='online' ORDER BY RANDOM() LIMIT 7`).all(type));
}
samples.push(...db.prepare("SELECT id, 'episode' type, stream_url FROM series_episodes ORDER BY RANDOM() LIMIT 7").all());
db.close();
async function probe(item) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await fetch(item.stream_url, { signal: controller.signal, headers: { Range: 'bytes=0-1023' } });
    const mime = response.headers.get('content-type') || '';
    const chunk = response.body ? await response.body.getReader().read() : { done: true };
    const text = chunk.value ? Buffer.from(chunk.value).toString('utf8') : '';
    const media = /video|audio|mpegurl|octet-stream/i.test(mime) || text.startsWith('#EXTM3U');
    return { id: item.id, type: item.type, http: response.status, mime, bytes: chunk.value?.length || 0,
      mediaResponse: response.ok && !chunk.done && media, playbackVerified: false };
  } catch (err) {
    return { id: item.id, type: item.type, error: err.name, mediaResponse: false, playbackVerified: false };
  } finally {
    controller.abort();
    clearTimeout(timer);
  }
}
(async () => {
  const results = [];
  for (let i = 0; i < samples.length; i += 3) results.push(...await Promise.all(samples.slice(i, i + 3).map(probe)));
  const report = { checkedAt: new Date().toISOString(), scope: '7 canais, 7 filmes e 7 episódios aleatórios; amostra não representativa', results };
  fs.writeFileSync(path.join(__dirname, 'catalog_media_sample.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Respostas compatíveis com mídia: ${results.filter(r => r.mediaResponse).length}/${results.length}. Reprodução completa não testada.`);
})().catch(err => { console.error(err.name); process.exitCode = 1; });
