const Database = require('./server/node_modules/better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'server/data/iptv.db'), { readonly: true });

console.log('=== CENSO DE STREAMS DE SÉRIES/NOVELAS ===');

// Padrões de detecção de episódios
const patterns = [
  /^(.*?)\s+S(\d{1,2})\s*E(\d{1,4})(.*)$/i,
  /^(.*?)\s+T(\d{1,2})\s*E(\d{1,4})(.*)$/i,
  /^(.*?)(?:[\s\-–—]+)(?:EP|CAP|CAPITULO|CAPÍTULO)\.?\s*(\d{1,4})(.*)$/i,
  /^(.*?)\s+(?:Temporada|Temp)\.?\s*(\d{1,2})\s*(?:Episodio|Episódio|Ep)\.?\s*(\d{1,4})(.*)$/i,
  /^(.*?)\s+E(\d{2,4})(.*)$/i, // Ex: "Nome da Novela E125"
];

function parseEpisode(name) {
  const trimmed = name.trim();
  for (const regex of patterns) {
    const m = trimmed.match(regex);
    if (m) {
      let seriesTitle = m[1].trim();
      // Remove trailing hyphens or brackets if any
      seriesTitle = seriesTitle.replace(/[\-–—\s]+$/, '').trim();
      
      let seasonNum = 1;
      let episodeNum = 1;
      let extra = '';

      if (m.length === 5) {
        seasonNum = parseInt(m[2], 10);
        episodeNum = parseInt(m[3], 10);
        extra = m[4].trim();
      } else if (m.length === 4) {
        // pattern 3 or pattern 5
        episodeNum = parseInt(m[2], 10);
        extra = m[3].trim();
      }

      if (seriesTitle.length > 0 && !isNaN(episodeNum)) {
        return {
          seriesTitle,
          seasonNum: isNaN(seasonNum) ? 1 : seasonNum,
          episodeNum,
          extra
        };
      }
    }
  }
  return null;
}

const allSeriesStreams = db.prepare(`
  SELECT s.id, s.name, s.category_id, s.stream_url, s.poster_url, s.icon_url, s.description, s.rating, s.release_date, c.name as category_name
  FROM streams s
  LEFT JOIN categories c ON s.category_id = c.id
  WHERE s.type = 'series'
`).all();

console.log('Total streams with type = series:', allSeriesStreams.length);

let episodeLikeCount = 0;
let seriesRootCount = 0;
const seriesGroups = new Map(); // seriesTitle -> array of episodes

allSeriesStreams.forEach(s => {
  const parsed = parseEpisode(s.name);
  if (parsed && s.stream_url && s.stream_url.length > 5) {
    episodeLikeCount++;
    const key = `${parsed.seriesTitle}:::${s.category_id}`;
    if (!seriesGroups.has(key)) {
      seriesGroups.set(key, {
        title: parsed.seriesTitle,
        categoryId: s.category_id,
        categoryName: s.category_name,
        posterUrl: s.poster_url || s.icon_url,
        episodes: []
      });
    }
    seriesGroups.get(key).episodes.push({
      originalStreamId: s.id,
      seasonNum: parsed.seasonNum,
      episodeNum: parsed.episodeNum,
      title: `${parsed.seriesTitle} S${String(parsed.seasonNum).padStart(2, '0')}E${String(parsed.episodeNum).padStart(2, '0')}`,
      streamUrl: s.stream_url,
      posterUrl: s.poster_url
    });
  } else {
    seriesRootCount++;
  }
});

console.log('Episódios avulsos detectados na tabela streams:', episodeLikeCount);
console.log('Séries raiz / não episódios na tabela streams:', seriesRootCount);
console.log('Total de séries/novelas únicas que seriam formadas pelo agrupamento:', seriesGroups.size);

// Exibir exemplos de séries agrupadas
console.log('\n=== TOP 10 SÉRIES/NOVELAS COM MAIS EPISÓDIOS AGRUPADOS ===');
const sortedGroups = Array.from(seriesGroups.values()).sort((a, b) => b.episodes.length - a.episodes.length);
sortedGroups.slice(0, 10).forEach((g, idx) => {
  console.log(`${idx + 1}. [${g.categoryName}] "${g.title}": ${g.episodes.length} episódios/capítulos`);
});

db.close();
