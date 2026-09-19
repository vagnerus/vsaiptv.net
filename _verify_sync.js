// Verificação do estado do catálogo ao vivo após a sincronização das listas.
const Database = require('./server/node_modules/better-sqlite3');
const db = new Database('./server/data/iptv.db', { readonly: true });

console.log('Canais ao vivo por status:');
db.prepare("SELECT status, COUNT(*) AS c FROM streams WHERE type='live' GROUP BY status").all()
  .forEach((r) => console.log(`  ${r.status}: ${r.c}`));

console.log('\nCanais inseridos/atualizados agora (last_check mais recente):');
db.prepare("SELECT id, name, stream_url, status FROM streams WHERE type='live' AND last_check IS NOT NULL ORDER BY last_check DESC, id DESC LIMIT 25").all()
  .forEach((r) => console.log(`  ${r.id} | ${r.status} | ${r.name} -> ${String(r.stream_url).slice(0, 72)}`));

console.log('\nCategorias com canais online:');
db.prepare("SELECT c.name, COUNT(s.id) AS total FROM categories c JOIN streams s ON s.category_id = c.id WHERE s.type='live' AND s.status='online' GROUP BY c.id ORDER BY total DESC LIMIT 15").all()
  .forEach((r) => console.log(`  ${String(r.total).padStart(4)}  ${r.name}`));

console.log('\nAmostra aleatória dos canais ONLINE:');
db.prepare("SELECT id, name, stream_url FROM streams WHERE type='live' AND status='online' ORDER BY RANDOM() LIMIT 12").all()
  .forEach((r) => console.log(`  ${r.id} | ${String(r.name).slice(0, 30).padEnd(30)} | ${String(r.stream_url).slice(0, 62)}`));

console.log('\nCanais inseridos pela sincronização das listas (id alto):');
db.prepare("SELECT id, name, stream_url, status FROM streams WHERE type='live' AND id >= 45020 ORDER BY id").all()
  .forEach((r) => console.log(`  ${r.id} | ${r.status.padEnd(7)} | ${String(r.name).slice(0, 28).padEnd(28)} | ${r.stream_url}`));

db.close();