/**
 * build_cinema_list.js
 * Monta a lista final "Cinema / Lançamentos" a partir de fontes verificadas OK:
 *  - scratch/cand/c13.m3u  -> Canais: Filmes e Séries (716 itens, amostra 8/8 OK)
 *  - scratch/cand/c14.m3u  -> canais de filmes [PT] (292k itens, amostra 8/8 OK)
 * Saída: list/cinema_lancamentos.m3u com:
 *   group-title="Cinema"  -> canais de filmes ao vivo (novidades 24h)
 *   group-title="Canais"  -> demais canais funcionando (esportes, abertos etc.)
 * Também testa cada canal de filme antes de incluir.
 */
const fs = require('fs');
const path = require('path');

const MOVIE_CHANNEL_RE = /(filme|film|movie|cinema|telecine|paramount|studio universal|hbo|megapix|cine|axn|universal tv|warner|tcm|isabelle)/i;
const PT_RE = /^\[?(PT|BR)\]?/i;

function parse(file) {
  const L = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const items = [];
  for (let i = 0; i < L.length; i++) {
    const l = L[i].trim();
    if (!l.startsWith('#EXTINF')) continue;
    const logo = (l.match(/tvg-logo="([^"]*)"/i) || [])[1] || '';
    const name = l.slice(l.lastIndexOf(',') + 1).trim();
    let url = '';
    for (let j = i + 1; j < L.length && j <= i + 3; j++) {
      const u = L[j].trim(); if (u && u[0] !== '#') { url = u; break; }
    }
    if (url) items.push({ name, logo, url });
  }
  return items;
}

async function check(url) {
  try {
    let r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000), redirect: 'follow' });
    if (r.status === 405 || r.status === 403 || r.status === 400) {
      r = await fetch(url, { headers: { Range: 'bytes=0-1' }, signal: AbortSignal.timeout(8000), redirect: 'follow' });
    }
    return r.status >= 200 && r.status < 400;
  } catch { return false; }
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(it => {
    const k = it.name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

(async () => {
  // 1. Coletar canais de filmes
  const c13 = parse(path.join(__dirname, '..', 'scratch', 'cand', 'c13.m3u'))
    .filter(it => it.name.toLowerCase().includes('filmes e séries') === false); // grupo vem no name? não; c13 é canais ao vivo
  // c13: pegar TUDO (são canais ao vivo organizados); rotularemos abaixo
  const c13All = parse(path.join(__dirname, '..', 'scratch', 'cand', 'c13.m3u'));
  const c14 = parse(path.join(__dirname, '..', 'scratch', 'cand', 'c14.m3u'));

  const cinema = [];
  // De c14: canais de filmes [PT]/[BR]
  for (const it of c14) {
    if (PT_RE.test(it.name) && MOVIE_CHANNEL_RE.test(it.name)) cinema.push(it);
  }
  // De c13: canais que casam com padrões de filmes (sessão "Canais: Filmes e Séries" já vem como conteúdo de filmes)
  for (const it of c13All) {
    if (MOVIE_CHANNEL_RE.test(it.name)) cinema.push(it);
  }

  const uniq = dedupe(cinema);
  console.log(`Canais de cinema candidatos: ${uniq.length}. Testando cada um...`);

  const okItems = [];
  const tested = uniq.slice(0, 400); // limite para não travar
  let done = 0;
  await Promise.all(tested.map(async it => {
    const ok = await check(it.url);
    done++;
    if (done % 50 === 0) console.log(`  ...${done}/${tested.length} testados`);
    if (ok) okItems.push(it);
  }));

  console.log(`Funcionando: ${okItems.length}/${tested.length}`);

  // 2. Montar M3U final
  const out = [
    '#EXTM3U',
    '#PLAYLISTV: pltv-name="CINEMA - Lançamentos" pltv-description="Canais de cinema 24h - novidades" pltv-author="VSAIPTV"',
    '#SESSION: Cinema (filmes e lançamentos 24h)'
  ];
  for (const it of okItems.sort((a, b) => a.name.localeCompare(b.name))) {
    out.push(`#EXTINF:-1 tvg-logo="${it.logo}" group-title="Cinema" pltv-subgroup="Canais de Filmes",${it.name}`);
    out.push(it.url);
  }
  fs.mkdirSync(path.join(__dirname, '..', 'list'), { recursive: true });
  const outFile = path.join(__dirname, '..', 'list', 'cinema_lancamentos.m3u');
  fs.writeFileSync(outFile, out.join('\n') + '\n', 'utf8');
  console.log(`Salvo: ${outFile} com ${okItems.length} canais na aba Cinema`);
})();
