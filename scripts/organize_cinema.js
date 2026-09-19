/**
 * organize_cinema.js
 *
 * Organiza uma playlist M3U em sessões, criando a aba "CINEMA" para
 * filmes lançamentos (ano >= anoAtual - 1, ex.: 2025/2026 = lançamento de cinema).
 *
 * Uso:
 *   node scripts/organize_cinema.js <entrada.m3u> [saida.m3u]
 *   node scripts/organize_cinema.js scratch/gist_raw.m3u list/gist_organizada.m3u
 *
 * Sessões de saída (group-title):
 *   - Cinema            -> filmes lançamento (ano recente) [aba nova]
 *   - Filmes            -> demais filmes, com pltv-subgroup = gênero
 *   - Seriados          -> episódios, com pltv-subgroup = nome da série
 *   - Documentários     -> documentários, com pltv-subgroup = origem
 *   - Canais            -> canais ao vivo
 *   - Sem Categoria     -> tudo que não se encaixar
 */
const fs = require('fs');
const path = require('path');

const input = process.argv[2];
const output = process.argv[3] || path.join('list', 'organizada.m3u');

if (!input || !fs.existsSync(input)) {
  console.error('Uso: node scripts/organize_cinema.js <entrada.m3u> [saida.m3u]');
  process.exit(1);
}

const CINEMA_MIN_YEAR = new Date().getFullYear() - 1; // 2026-1 => 2025 em diante é lançamento
const YEAR_RE = /\b((19|20)\d{2})\b/;

function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  const items = [];
  let header = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (l.startsWith('#PLAYLISTV') || l.startsWith('#EXTM3U') && i === 0) {
      header = l.startsWith('#PLAYLISTV') ? l : '#EXTM3U';
      continue;
    }
    if (!l.startsWith('#EXTINF')) continue;
    const group = (l.match(/group-title="([^"]*)"/i) || [])[1] || '';
    const sub = (l.match(/pltv-subgroup="([^"]*)"/i) || [])[1] || '';
    const logo = (l.match(/tvg-logo="([^"]*)"/i) || [])[1] || '';
    const name = l.slice(l.lastIndexOf(',') + 1).trim();
    let url = '';
    for (let j = i + 1; j < lines.length && j <= i + 3; j++) {
      const u = lines[j].trim();
      if (!u || u.startsWith('#')) continue;
      url = u; break;
    }
    items.push({ name, group, sub, logo, url });
  }
  return { header, items };
}

/** Classifica o item em uma sessão; retorna { session, subgroup } */
function classify(it) {
  const name = it.name;
  const yearMatch = name.match(YEAR_RE);
  const year = yearMatch && parseInt(yearMatch[1], 10) <= new Date().getFullYear()
    ? parseInt(yearMatch[1], 10) : 0;
  const g = it.group.toLowerCase();

  const isSerie = g.includes('seriad') || g.includes('série') || g.includes('serie') ||
    /\bT\d{1,2}\b/i.test(name) || /\bEP\d{1,3}\b/i.test(name);
  if (isSerie) return { session: 'Seriados', subgroup: it.sub || 'Geral' };

  const isDoc = g.includes('document');
  if (isDoc) return { session: 'Documentários', subgroup: it.sub || 'Geral' };

  const isCanal = g.includes('canal') || g.includes('esporte') ||
    /\.(m3u8|ts)(\?|$)/i.test(it.url);
  if (isCanal) return { session: 'Canais', subgroup: it.sub || 'Geral' };

  // Filmes (inclui "Filmes", "Movie", VOD etc.)
  if (g.includes('film') || g.includes('movie') || g.includes('vod') || !isCanal) {
    const genero = it.sub || 'Diversos';
    // Lançamento de cinema = ano recente (>= CINEMA_MIN_YEAR) ou sem ano mas marcado como lançamento
    if (year >= CINEMA_MIN_YEAR || /lan[çc]ament|estreia|cinema/i.test(name + ' ' + genero)) {
      return { session: 'Cinema', subgroup: genero };
    }
    return { session: 'Filmes', subgroup: genero };
  }
  return { session: 'Sem Categoria', subgroup: it.sub || 'Geral' };
}

function main() {
  const text = fs.readFileSync(input, 'utf8');
  const { header, items } = parseM3U(text);
  console.log(`Parse: ${items.length} itens de ${input}`);

  const sessions = new Map(); // session -> Map(subgroup -> items[])
  for (const it of items) {
    const { session, subgroup } = classify(it);
    if (!sessions.has(session)) sessions.set(session, new Map());
    const subs = sessions.get(session);
    if (!subs.has(subgroup)) subs.set(subgroup, []);
    subs.get(subgroup).push(it);
  }

  // Gera M3U organizada
  const out = [header || '#EXTM3U'];
  const sessionOrder = ['Cinema', 'Filmes', 'Seriados', 'Documentários', 'Canais', 'Sem Categoria'];
  for (const session of sessionOrder) {
    if (!sessions.has(session)) continue;
    for (const [subgroup, list] of [...sessions.get(session).entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      out.push(`#SESSION: ${session} / ${subgroup} (${list.length} itens)`);
      for (const it of list) {
        out.push(
          `#EXTINF:-1 tvg-logo="${it.logo}" group-title="${session}" pltv-subgroup="${subgroup}",${it.name}`
        );
        out.push(it.url);
      }
    }
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, out.join('\n') + '\n', 'utf8');

  // Relatório
  console.log('\n=== RELATÓRIO DE ORGANIZAÇÃO ===');
  for (const [session, subs] of sessions) {
    const total = [...subs.values()].reduce((a, b) => a + b.length, 0);
    console.log(`\n[${session}] ${total} itens, ${subs.size} subgrupos`);
    if (session === 'Cinema') {
      for (const [sg, list] of subs) console.log(`   - ${sg}: ${list.length}`);
    }
  }
  console.log(`\nPlaylist organizada salva em: ${output}`);
}

main();
