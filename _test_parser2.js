const Database = require('./server/node_modules/better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'server/data/iptv.db'), { readonly: true });

// Pegar streams em categorias de novelas
const sample = db.prepare(`
  SELECT s.id, s.name, s.category_id, s.type, s.stream_url, s.poster_url, c.name as cat_name
  FROM streams s
  JOIN categories c ON s.category_id = c.id
  WHERE c.name LIKE '%Novela%' AND s.type = 'series' AND s.stream_url != ''
  LIMIT 30
`).all();

function parseEpisodeName(rawName) {
  const name = rawName.trim();
  
  // Padrão 1: "Nome da Série S01E05" ou "Nome da Série S01 E05" ou "Nome da Série S1E5"
  const m1 = name.match(/^(.*?)\s+S(\d{1,2})\s*E(\d{1,4})(.*)$/i);
  if (m1) {
    return {
      seriesTitle: m1[1].trim(),
      seasonNum: parseInt(m1[2], 10),
      episodeNum: parseInt(m1[3], 10),
      extra: m1[4].trim()
    };
  }

  // Padrão 2: "Nome da Série T01E05" ou "Nome da Série T1 E05"
  const m2 = name.match(/^(.*?)\s+T(\d{1,2})\s*E(\d{1,4})(.*)$/i);
  if (m2) {
    return {
      seriesTitle: m2[1].trim(),
      seasonNum: parseInt(m2[2], 10),
      episodeNum: parseInt(m2[3], 10),
      extra: m2[4].trim()
    };
  }

  // Padrão 3: "Nome - Cap. 05" ou "Nome Cap 05" ou "Nome Capítulo 05"
  const m3 = name.match(/^(.*?)(?:[\s\-–—]+)(?:EP|CAP|CAPITULO|CAPÍTULO)\.?\s*(\d{1,4})(.*)$/i);
  if (m3) {
    return {
      seriesTitle: m3[1].trim(),
      seasonNum: 1,
      episodeNum: parseInt(m3[2], 10),
      extra: m3[3].trim()
    };
  }

  return null;
}

let matched = 0;
sample.forEach((s) => {
  const p = parseEpisodeName(s.name);
  if (p) {
    matched++;
    console.log(`[OK] "${s.name}" -> Series: "${p.seriesTitle}" | S${p.seasonNum} E${p.episodeNum}`);
  } else {
    console.log(`[NO] "${s.name}"`);
  }
});

console.log(`\nMatched ${matched}/${sample.length} in novelas sample.`);
db.close();
