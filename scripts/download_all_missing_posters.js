const path = require('path');
const fs = require('fs');
const db = require('../server/src/db/database');
const worker = require('../server/src/services/imageWorker');

function extraCleanTitle(raw) {
  let t = String(raw || '');
  t = t.replace(/\((L|D|4K|HDR|UHD|FHD|HD|CAM|Dublado|Legendado|Sci-Fi 4K|Animação 4K HDR|Romance|Ação|Full HD|Esportes HD)\)/gi, ' ');
  t = t.replace(/\[(L|D|4K|HDR|UHD|FHD|HD|CAM|Cinema|Card Principal|Card Preliminar|Card Completo)\]/gi, ' ');
  t = t.replace(/\b(coletânea completa|coletanea completa|colecao completa|saga completa|especial de natal)\b/gi, ' ');
  
  // Tratamento para UFC fights individuais: vincular ao card do evento UFC correspondente
  const ufcMatch = t.match(/\b(UFC\s+(?:Fight\s+Night\s+)?\d+)\b/i);
  if (ufcMatch) {
    return ufcMatch[1];
  }

  t = worker.cleanTitleForSearch(t);
  return t.trim();
}

const CUSTOM_FALLBACK_POSTERS = {
  90007: 'https://image.tmdb.org/t/p/w780/gCI2AeMV4IHSewhJkzsur5MEp6R.jpg', // Cinema Paradiso para Mux Cinema
  90009: 'https://image.tmdb.org/t/p/w780/vfrQk5IPloGg1v9Rzbh2Eg3VGyM.jpg', // Master and Commander para Akamai Master
  90010: 'https://image.tmdb.org/t/p/w780/8qy3jRmaHR7f8VZh3iXCqCWfFsH.jpg', // Poster de esportes para Surfing
};

(async () => {
  console.log('=== BAIXANDO E CORRIGINDO TODAS AS CAPAS FALTANTES OU SVG ===');
  
  // 1. Identificar todos os itens com poster local que ainda estão em SVG ou sem poster real
  const rows = db.prepare("SELECT id, name, type, poster_url, release_date FROM streams WHERE poster_url LIKE '/img-local/%'").all();
  const targetItems = [];
  
  for (const r of rows) {
    const file = worker.findLocalPosterFile(r.type, r.id);
    // Se não tem arquivo ou é SVG
    if (!file || file.endsWith('.svg')) {
      targetItems.push(r);
    }
  }

  console.log(`Encontrados ${targetItems.length} conteúdos que possuem capa SVG ou sem capa real.`);

  let downloadedCount = 0;
  for (const item of targetItems) {
    let posterUrlToDownload = null;

    if (CUSTOM_FALLBACK_POSTERS[item.id]) {
      posterUrlToDownload = CUSTOM_FALLBACK_POSTERS[item.id];
    } else {
      const cleaned = extraCleanTitle(item.name);
      const fakeItem = { ...item, name: cleaned };
      const match = await worker._internal.findTrustedPoster(fakeItem);
      if (match && match.url) {
        posterUrlToDownload = match.url;
      }
    }

    if (posterUrlToDownload) {
      const dl = await worker._internal.downloadPosterToLocal(item.type, item.id, posterUrlToDownload);
      if (dl.ok) {
        downloadedCount++;
        // Remove SVG antigo se existir
        const dir = path.join(worker.IMAGES_DIR, item.type === 'series' ? 'series' : 'movies', String(item.id));
        const oldSvg = path.join(dir, 'poster.svg');
        if (fs.existsSync(oldSvg)) {
          try { fs.unlinkSync(oldSvg); } catch (e) {}
        }
        db.prepare('UPDATE streams SET poster_status = ?, poster_url = ?, poster_source_url = ?, poster_checked_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run('valid', worker.localUrlFor(item.type, item.id), posterUrlToDownload, item.id);
        console.log(`[DOWNLOAD OK] ${item.id} - ${item.name} -> poster.${dl.ext}`);
      } else {
        console.log(`[FALHA DOWNLOAD] ${item.id} - ${item.name}: ${dl.reason}`);
      }
    } else {
      console.log(`[SEM CORRESPONDÊNCIA EXTERNA] ${item.id} - ${item.name} (mantido capa estilizada)`);
    }
  }

  console.log(`\nConcluído! ${downloadedCount} capas reais baixadas e substituídas.`);
})();
