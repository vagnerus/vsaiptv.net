const fs = require('fs');
const Database = require('./server/node_modules/better-sqlite3');

const db = new Database('./server/data/iptv.db');
db.pragma('journal_mode = WAL');

const M3U = './list/cdnf1_sbs_playlist.m3u';

console.log('========================================');
console.log('IMPORTACAO URGENTE cdnf1.sbs');
console.log('========================================\n');

const content = fs.readFileSync(M3U, 'utf8');
const lines = content.split('\n');
console.log('Linhas:', lines.length);

function catName(g) {
  g = (g||'').trim();
  if (/Área do Cliente/i.test(g)) return 'Área do Cliente';
  if (/24H Comédia/i.test(g)) return '24H Comédia';
  if (/24H Reality/i.test(g)) return '24H Reality e TV';
  if (/24H Esporte/i.test(g)) return '24H Esporte';
  if (/24H Notícias/i.test(g)) return '24H Notícias';
  if (/24H Cinema/i.test(g)) return '24H Cinema';
  if (/24H Infantil/i.test(g)) return '24H Infantil';
  if (/24H Séries|24H Series/i.test(g)) return '24H Séries';
  if (/24H Documentário/i.test(g)) return '24H Documentários';
  if (/24H Variedade/i.test(g)) return '24H Variedades';
  if (/24H Terror/i.test(g)) return '24H Terror';
  if (/24H Animes/i.test(g)) return '24H Animes';
  if (/24H Geral/i.test(g)) return '24H Geral';
  if (/24H Lives/i.test(g)) return '24H Lives e Shows';
  if (/24H Cine/i.test(g)) return '24H Cine Sky';
  if (/24H Novela/i.test(g)) return '24H Novelas';
  if (/24H Dorama/i.test(g)) return '24H Doramas';
  if (/24H Anime/i.test(g)) return '24H Anime';
  if (/24H Filmes/i.test(g)) return '24H Filmes';
  return g || 'Sem Categoria';
}

const catCache = new Map();
function getCatId(n) {
  if (catCache.has(n)) return catCache.get(n);
  let r = db.prepare('SELECT id FROM categories WHERE name=? AND type=?').get(n, 'live');
  if (!r) {
    r = db.prepare('INSERT INTO categories (name,type,order_num) VALUES (?,?,?)').run(n, 'live', catCache.size+1);
    catCache.set(n, r.lastInsertRowid);
    return r.lastInsertRowid;
  }
  return r.id;
}

let imp = 0, dup = 0, cur = null, i = 0;

const insertStmt = db.prepare(`INSERT INTO streams (name,category_id,type,stream_url,icon_url,poster_url,description,rating,status) VALUES (?,?,,'live',?,?,?,?,'8.5','online')`);
const checkStmt = db.prepare('SELECT 1 FROM streams WHERE name=? AND stream_url=?');

db.transaction(() => {
  while (i < lines.length) {
    const l = lines[i].trim();
    if (l.startsWith('#EXTINF:')) {
      const gm = l.match(/group-title="([^"]*)"/i);
      const nm = l.match(/^#EXTINF:[^-]*-[^,]*,(.*)$/i);
      const lm = l.match(/tvg-logo="([^"]*)"/i);
      cur = { name: nm?nm[1].trim():'', group: gm?gm[1]:'Sem Categoria', logo: lm?lm[1]:'' };
    } else if (l.length > 0 && !l.startsWith('#') && cur) {
      const cn = catName(cur.group);
      const cid = getCatId(cn);
      if (!checkStmt.get(cur.name, l)) {
        insertStmt.run(cur.name, cid, l, cur.logo||null, cur.logo||null, 'cdnf1.sbs - '+cn);
        imp++;
      } else dup++;
      cur = null;
    }
    i++;
    if (i % 50000 === 0) process.stdout.write('\rProcessado: '+i+'...');
  }
})();

console.log('\n========================================');
console.log('RESULTADO:');
console.log('========================================');
console.log('Importados:', imp);
console.log('Duplicatas:', dup);
console.log('Categorias:', catCache.size);

const total = db.prepare("SELECT COUNT(*) as c FROM streams WHERE type='live'").get().c;
console.log('\nTOTAL CANais LIVE:', total);

db.close();
console.log('\n========================================');
console.log('FIM - Servidor pode servir tudo localmente!');
console.log('========================================');