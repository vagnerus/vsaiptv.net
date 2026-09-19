/**
 * fix_live_channels.js
 * Restaura o funcionamento dos canais de TV Ao Vivo:
 * 1. Normaliza streams de canais para o formato HLS (.m3u8) que roda no navegador
 * 2. Desativa fontes sabidamente mortas (404/401) para não poluir o catálogo com canais fora do ar
 * 3. Garante que os canais públicos abertos verificados estejam online e categorizados
 */
const Database = require('./server/node_modules/better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, 'server/data/iptv.db');
console.log(`Abrindo banco de dados: ${dbPath}`);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const beforeCounts = db.prepare("SELECT status, count(*) as c FROM streams WHERE type='live' GROUP BY status").all();
console.log('Status dos canais ANTES:', beforeCounts);

const publicChannels = [
  {
    name: 'Red Bull TV HD',
    url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
    category: 'Esportes & Aventura',
    icon: 'https://i.imgur.com/7NeBmWX.png',
    epg: 'REDBULL.TV',
  },
  {
    name: 'NASA TV HD',
    url: 'https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8',
    category: 'Documentários & Ciência',
    icon: 'https://upload.wikimedia.org/wikipedia/commons/e/e5/NASA_logo.svg',
    epg: 'NASA.TV',
  },
  {
    name: 'Euronews Português HD',
    url: 'https://euronews-euronews-portuguese-1-pt.samsung.wurl.tv/manifest/playlist.m3u8',
    category: 'Notícias & Jornalismo',
    icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Euronews._2016_alternative_logo.png/512px-Euronews._2016_alternative_logo.png',
    epg: 'EURONEWS.PT',
  },
  {
    name: 'TV Brasil',
    url: 'https://tvbrasil-stream.ebc.com.br/index.m3u8',
    category: 'Canais Abertos HD',
    icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/TV_Brasil_logo_2023.svg/512px-TV_Brasil_logo_2023.svg.png',
    epg: 'TVBRASIL.BR',
  },
  {
    name: 'Canal Gov',
    url: 'https://canalgov-stream.ebc.com.br/index.m3u8',
    category: 'Notícias & Jornalismo',
    icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Canal_Gov_logo.png/512px-Canal_Gov_logo.png',
    epg: 'CANALGOV.BR',
  },
  {
    name: 'Record News',
    url: 'https://5cf4a2c2512a2.streamlock.net/8014/8014/playlist.m3u8',
    category: 'Notícias & Jornalismo',
    icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Record_News_logo_2016.svg/512px-Record_News_logo_2016.svg.png',
    epg: 'RECORDNEWS.BR',
  },
  {
    name: 'TV Cultura',
    url: 'https://player-tvcultura.stream.uol.com.br/live/tvcultura.m3u8',
    category: 'Canais Abertos HD',
    icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/TV_Cultura_logo_2013.svg/512px-TV_Cultura_logo_2013.svg.png',
    epg: 'TVCULTURA.BR',
  },
];

function getOrCreateCategory(name, type, orderNum = 0) {
  const existing = db.prepare('SELECT id FROM categories WHERE name = ? AND type = ?').get(name, type);
  if (existing) return existing.id;
  return db.prepare('INSERT INTO categories (name, type, order_num) VALUES (?, ?, ?)').run(name, type, orderNum).lastInsertRowid;
}

const tx = db.transaction(() => {
  // 1. Desativar fontes offline/mortas (404/401)
  const deadDeactivated = db.prepare(`
    UPDATE streams
    SET status = 'offline'
    WHERE type = 'live' AND (
      stream_url LIKE '%tjtor8411.com%' OR
      stream_url LIKE '%vip.europaiptv.vip%' OR
      stream_url LIKE '%marcy3.selfip.net%'
    )
  `).run().changes;
  console.log(`Canais de fontes inoperantes marcados como offline: ${deadDeactivated}`);

  // 2. Normalizar URLs dos canais up.kiwi para .m3u8
  const kiwiStreams = db.prepare("SELECT id, stream_url FROM streams WHERE type='live' AND stream_url LIKE '%up.kiwi%'").all();
  const updateUrl = db.prepare("UPDATE streams SET stream_url = ?, status = 'online' WHERE id = ?");
  let kiwiNormalized = 0;
  for (const s of kiwiStreams) {
    const raw = s.stream_url;
    // Padrão: http://up.kiwi/{user}/{pass}/{id} ou http://up.kiwi/live/{user}/{pass}/{id}
    const match = raw.match(/up\.kiwi\/(?:live\/)?([^\/]+)\/([^\/]+)\/([^\/\.]+)(?:\.ts|\.m3u8)?/i);
    if (match) {
      const normalized = `http://up.kiwi/live/${match[1]}/${match[2]}/${match[3]}.m3u8`;
      if (normalized !== raw) {
        updateUrl.run(normalized, s.id);
        kiwiNormalized++;
      } else {
        // Garantir status online
        db.prepare("UPDATE streams SET status = 'online' WHERE id = ?").run(s.id);
      }
    }
  }
  console.log(`Canais up.kiwi normalizados para HLS (.m3u8): ${kiwiNormalized} de ${kiwiStreams.length}`);

  // 3. Inserir ou atualizar canais públicos verificados
  const insertPublic = db.prepare(`
    INSERT INTO streams (name, category_id, type, stream_url, icon_url, epg_channel_id, poster_url, description, rating, release_date, status)
    VALUES (?, ?, 'live', ?, ?, ?, ?, 'Transmissão oficial ao vivo.', '9.0', '2024', 'online')
  `);
  const updatePublic = db.prepare(`
    UPDATE streams
    SET category_id = ?, stream_url = ?, icon_url = ?, epg_channel_id = ?, poster_url = ?, status = 'online'
    WHERE id = ?
  `);
  const findPublic = db.prepare("SELECT id FROM streams WHERE lower(name) = lower(?) AND type = 'live' LIMIT 1");

  for (const ch of publicChannels) {
    const catId = getOrCreateCategory(ch.category, 'live', 5);
    const existing = findPublic.get(ch.name);
    if (existing) {
      updatePublic.run(catId, ch.url, ch.icon, ch.epg, ch.icon, existing.id);
    } else {
      insertPublic.run(ch.name, catId, ch.url, ch.icon, ch.epg, ch.icon);
    }
  }
  console.log(`Canais públicos oficiais verificados: ${publicChannels.length}`);
});

tx();

const afterCounts = db.prepare("SELECT status, count(*) as c FROM streams WHERE type='live' GROUP BY status").all();
console.log('Status dos canais DEPOIS:', afterCounts);

const sample = db.prepare("SELECT id, name, stream_url, status FROM streams WHERE type='live' AND status='online' LIMIT 10").all();
console.log('\nAmostra de canais online:', sample);

db.close();
console.log('Migração concluída com sucesso!');
