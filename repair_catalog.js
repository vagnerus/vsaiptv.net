/**
 * Reparos seguros/idempotentes do catálogo local.
 *
 * O objetivo é melhorar funcionamento sem importar conteúdo de sites terceiros
 * não licenciados: remove URLs sabidamente falsas/offline, adiciona canais
 * públicos/legais e garante thumbs/fallbacks para itens sem imagem.
 */
const path = require('path');
const Database = require('./server/node_modules/better-sqlite3');

const db = new Database(path.join(__dirname, 'server', 'data', 'iptv.db'));
db.pragma('journal_mode = WAL');

const FALLBACKS = {
  liveIcon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/OOjs_UI_icon_play.svg/512px-OOjs_UI_icon_play.svg.png',
  livePoster: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=1280&h=720&fit=crop',
  moviePoster: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&h=900&fit=crop',
  seriesPoster: 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=600&h=900&fit=crop',
};

function getOrCreateCategory(name, type, orderNum = 0) {
  const existing = db.prepare('SELECT id FROM categories WHERE name = ? AND type = ?').get(name, type);
  if (existing) return existing.id;
  return db.prepare('INSERT INTO categories (name, type, order_num) VALUES (?, ?, ?)').run(name, type, orderNum).lastInsertRowid;
}

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
    category: 'Canais Abertos',
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
    category: 'Canais Abertos',
    icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/TV_Cultura_logo_2013.svg/512px-TV_Cultura_logo_2013.svg.png',
    epg: 'TVCULTURA.BR',
  },
];

const insertStream = db.prepare(`
  INSERT INTO streams (name, category_id, type, stream_url, icon_url, epg_channel_id, poster_url, description, rating, release_date, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'online')
`);

const updateExisting = db.prepare(`
  UPDATE streams
  SET category_id = ?, stream_url = ?, icon_url = ?, epg_channel_id = ?, poster_url = ?, status = 'online'
  WHERE id = ?
`);

const findByNameType = db.prepare('SELECT id FROM streams WHERE lower(name) = lower(?) AND type = ? LIMIT 1');

let upserted = 0;
const tx = db.transaction(() => {
  // URLs adicionadas por scripts antigos que não são endpoints reais.
  const disabledFake = db.prepare(`
    UPDATE streams
    SET status = 'offline'
    WHERE stream_url LIKE '%espn.com.br/live/%'
       OR stream_url LIKE '%/globoesportesao/%'
       OR stream_url LIKE '%/sbesportesao/%'
       OR stream_url LIKE '%/recordesportes/%'
  `).run().changes;

  for (const ch of publicChannels) {
    const cid = getOrCreateCategory(ch.category, 'live', 10);
    const existing = findByNameType.get(ch.name, 'live');
    if (existing) {
      updateExisting.run(cid, ch.url, ch.icon, ch.epg, FALLBACKS.livePoster, existing.id);
    } else {
      insertStream.run(ch.name, cid, 'live', ch.url, ch.icon, ch.epg, FALLBACKS.livePoster, `Canal público: ${ch.category}.`, '8.5', '2024');
    }
    upserted++;
  }

  const fixedLiveThumbs = db.prepare(`
    UPDATE streams
    SET icon_url = COALESCE(NULLIF(icon_url, ''), ?),
        poster_url = COALESCE(NULLIF(poster_url, ''), ?)
    WHERE type = 'live' AND (COALESCE(icon_url, '') = '' OR COALESCE(poster_url, '') = '')
  `).run(FALLBACKS.liveIcon, FALLBACKS.livePoster).changes;

  const fixedMovieThumbs = db.prepare(`
    UPDATE streams
    SET icon_url = COALESCE(NULLIF(icon_url, ''), ?),
        poster_url = COALESCE(NULLIF(poster_url, ''), ?)
    WHERE type = 'movie' AND (COALESCE(icon_url, '') = '' OR COALESCE(poster_url, '') = '')
  `).run(FALLBACKS.moviePoster, FALLBACKS.moviePoster).changes;

  const fixedSeriesThumbs = db.prepare(`
    UPDATE streams
    SET icon_url = COALESCE(NULLIF(icon_url, ''), ?),
        poster_url = COALESCE(NULLIF(poster_url, ''), ?)
    WHERE type = 'series' AND (COALESCE(icon_url, '') = '' OR COALESCE(poster_url, '') = '')
  `).run(FALLBACKS.seriesPoster, FALLBACKS.seriesPoster).changes;

  console.log(`URLs falsas/offline desativadas: ${disabledFake}`);
  console.log(`Canais públicos inseridos/atualizados: ${upserted}`);
  console.log(`Thumbs corrigidas: live=${fixedLiveThumbs}, movie=${fixedMovieThumbs}, series=${fixedSeriesThumbs}`);
});

tx();

console.log('Resumo:', db.prepare('SELECT type, status, COUNT(*) AS total FROM streams GROUP BY type, status ORDER BY type, status').all());
console.log('Sem thumb:', db.prepare(`
  SELECT type, COUNT(*) AS total
  FROM streams
  WHERE COALESCE(icon_url, '') = '' AND COALESCE(poster_url, '') = ''
  GROUP BY type
`).all());
