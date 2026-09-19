const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const db = require('../server/src/db/database');
const worker = require('../server/src/services/imageWorker');

// Map of all 24 items with their official poster URLs
const POSTER_URLS = {
  30344: 'https://image.tmdb.org/t/p/w780/vYENLK3LUDGyqz9t2G4wivDMR3W.jpg', // Dragon Ball Z: Bio-Broly
  30362: 'https://image.tmdb.org/t/p/w780/hT5TIl0YjjJQNGhPM84k2jzL7Jv.jpg', // 684: Unidade de Combate (Silmido)
  30408: 'https://image.tmdb.org/t/p/w780/vnVQx7MJMwTvqcn5pkYDImxzlMg.jpg', // Zona de Combate (Outside the Wire)
  30413: 'https://image.tmdb.org/t/p/w780/rbCANmS1ogweUkIBghP03EHtdHB.jpg', // Wolf Pack
  30421: 'https://image.tmdb.org/t/p/w780/rO1YoR49hs9QPla0vwCxrMLln33.jpg', // Kung Fu Futebol Clube (Shaolin Soccer)
  38913: 'https://image.tmdb.org/t/p/w780/jnIbrjHtbTQbzXCav27zqhZj0B9.jpg', // 3 Histórias de Amor
  41241: 'https://image.tmdb.org/t/p/w780/kwPQHGHTTgJ8x5KTQDB8F2T4dzC.jpg', // Golden Globe Awards
  52820: 'https://image.tmdb.org/t/p/w780/xUSCQEbbAy3Lv6r00RfXtdxhRDX.jpg', // Hell House LLC
  52821: 'https://image.tmdb.org/t/p/w780/8yFAXGVNvCXVpAFDr5TbpzyKmkZ.jpg', // Hell House: A Origem
  63846: 'https://image.tmdb.org/t/p/w780/9EEL1rmspaWxh6xBqgWjAsiNRYC.jpg', // Pokemon The Arceus Chronicles
  63878: 'https://image.tmdb.org/t/p/w780/8qy3jRmaHR7f8VZh3iXCqCWfFsH.jpg', // Marvel Vs Capcom Infinite
  69051: 'https://image.tmdb.org/t/p/w780/dSsWZmNEWlybb5ngfDMDjSlKcn1.jpg', // Lenda Assassina (Urban Legend)
  30024: 'https://image.tmdb.org/t/p/w780/pV5iALbjaQQKkLXWUcqlODNFlcE.jpg', // 3% - A Renda (3%)
  31847: 'https://image.tmdb.org/t/p/w780/b82sgDLN1NaO6da67v1TdkAMkV.jpg', // O Melhor Do Chespirito
  19647: 'https://image.tmdb.org/t/p/w780/ptGYQgdYCR8GVMVjpJ8QNJSxlkf.jpg', // Paixao de Cristo
  30367: 'https://image.tmdb.org/t/p/w780/aCyZo2KEucfNvQA4yhgt5jbMFmC.jpg', // UFC Fight Night 262
  30396: 'https://image.tmdb.org/t/p/w780/aCyZo2KEucfNvQA4yhgt5jbMFmC.jpg', // UFC Fight Night 254
  30403: 'https://image.tmdb.org/t/p/w780/aCyZo2KEucfNvQA4yhgt5jbMFmC.jpg', // UFC Fight Night 249
  30405: 'https://image.tmdb.org/t/p/w780/y2z4tLCbLwFSu9KU44tIZGdpuOs.jpg', // UFC 312: Du Plessis vs. Strickland 2
  43786: 'https://image.tmdb.org/t/p/w780/6ZBz7HDMAmc5i9O77dicA6DAvHw.jpg', // Cœur de Pirate
  56389: 'https://image.tmdb.org/t/p/w780/ju64HjEjC5TZNMNsXfLdyaZI5k.jpg', // Paralamas do Sucesso - Som Brasil
  56390: 'https://image.tmdb.org/t/p/w780/u98kqLB7ZWnXaCHoEH9IYe4G6gO.jpg', // Fábio Jr. | Som Brasil
  63795: 'https://image.tmdb.org/t/p/w780/qWqYKUMT1AvRcsuv64LCvFGuyr4.jpg', // Ludmilla Live @ Rock In Rio
  63916: 'https://image.tmdb.org/t/p/w780/lGl7fljhf7AyFN3N9Dy7vNbQZIK.jpg', // Zhui Long Fan Wai Pian Zhi Long Zheng Hu Dou (Chasing the Dragon)
};

async function downloadUrl(url, destPath) {
  return new Promise((resolve) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadUrl(res.headers.location, destPath));
      }
      if (res.statusCode !== 200) {
        return resolve({ ok: false, error: 'HTTP ' + res.statusCode });
      }
      const dir = path.dirname(destPath);
      fs.mkdirSync(dir, { recursive: true });
      const stream = fs.createWriteStream(destPath);
      res.pipe(stream);
      stream.on('finish', () => resolve({ ok: true }));
      stream.on('error', (e) => resolve({ ok: false, error: e.message }));
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

(async () => {
  console.log('=== BAIXANDO TODAS AS 24 CAPAS RESTANTES ===');
  let success = 0;
  for (const [idStr, url] of Object.entries(POSTER_URLS)) {
    const id = Number(idStr);
    const row = db.prepare('SELECT id, name, type FROM streams WHERE id = ?').get(id);
    if (!row) {
      console.log(`Item ${id} não encontrado no banco`);
      continue;
    }
    const kind = row.type === 'series' ? 'series' : 'movies';
    
    // Caminhos nos dois diretórios locais
    const dest1 = path.join(worker.IMAGES_DIR, kind, String(id), 'poster.jpg');
    const dest2 = path.join(worker.STORAGE_IMAGES_DIR, kind, String(id), 'poster.jpg');
    
    const res = await downloadUrl(url, dest1);
    if (res.ok) {
      // Copiar também para storage/images
      fs.mkdirSync(path.dirname(dest2), { recursive: true });
      fs.copyFileSync(dest1, dest2);

      // Remover poster.svg antigo se existir
      const oldSvg1 = path.join(worker.IMAGES_DIR, kind, String(id), 'poster.svg');
      const oldSvg2 = path.join(worker.STORAGE_IMAGES_DIR, kind, String(id), 'poster.svg');
      try { if (fs.existsSync(oldSvg1)) fs.unlinkSync(oldSvg1); } catch (e) {}
      try { if (fs.existsSync(oldSvg2)) fs.unlinkSync(oldSvg2); } catch (e) {}

      // Atualizar banco
      db.prepare("UPDATE streams SET poster_status = 'valid', poster_url = ?, poster_source_url = ?, poster_checked_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(`/img-local/${kind}/${id}`, url, id);

      console.log(`[OK] ID ${id} (${row.name}) -> Baixado e atualizado`);
      success++;
    } else {
      console.error(`[ERRO] ID ${id} (${row.name}):`, res.error);
    }
  }
  console.log(`\nConcluído! ${success}/${Object.keys(POSTER_URLS).length} capas baixadas com sucesso.`);
})();
