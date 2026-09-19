// ============================================================
// SCRIPT: Varredura completa de capas (ImageWorker standalone)
// Uso: node scripts/run_image_worker.js [limite] [--reset] [--requeue-review] [--no-create-missing]
// Processa o catalogo em lotes, com checkpoint persistente.
// Ao finalizar, assegura que itens sem capa recebam capa local ("se precisar crie essas capas que faltam").
// ============================================================
process.env.IMAGE_WORKER_BATCH_SIZE = process.env.IMAGE_WORKER_BATCH_SIZE || '100';
const path = require('path');
const worker = require(path.join(__dirname, '../server/src/services/imageWorker'));
const db = require(path.join(__dirname, '../server/src/db/database'));

const argLimit = process.argv[2] && !isNaN(Number(process.argv[2])) ? Number(process.argv[2]) : Infinity;
const doReset = process.argv.includes('--reset');
const requeueReview = process.argv.includes('--requeue-review');
const createMissing = !process.argv.includes('--no-create-missing');

if (doReset) {
  db.prepare("UPDATE streams SET poster_status = NULL WHERE type IN ('movie','series')").run();
  db.prepare("DELETE FROM image_worker_state WHERE key IN ('stats','worker_status','last_id')").run();
  console.log('[reset] marcações zeradas; varredura começando do zero');
}

worker.ensureSchema();
const initialStatus = worker.getStatus();
console.log('[ImageWorker] Iniciando varredura (limite:', argLimit === Infinity ? 'todo o catalogo' : argLimit, ')');
console.log('[ImageWorker] Checkpoint atual: last_id =', initialStatus.lastId, '| unscanned =', initialStatus.totals.unscanned);

(async () => {
  const t0 = Date.now();
  worker.startScan({ limit: argLimit, requeueReview, createMissingIfNotFound: false });

  let lastLoggedAt = 0;
  while (worker.getStatus().status === 'running') {
    const now = Date.now();
    if (now - lastLoggedAt >= 10000) {
      lastLoggedAt = now;
      const st = worker.getStatus();
      console.log(`[progresso] analisadas: ${st.stats.analisadas} | validas: ${st.stats.validas} | baixadas: ${st.stats.baixadas} | revisao: ${st.stats.revisao} | falhas: ${st.stats.falhas} | pendentes: ${st.totals.unscanned} | atual: ${st.current}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Se solicitado criar capas que faltam, reprocessa os itens pendentes/revisão com o novo matcher + gerador de capa
  if (createMissing) {
    const pendingReview = db.prepare("SELECT id, name, type, poster_url, release_date FROM streams WHERE type IN ('movie','series') AND poster_status IN ('review', 'missing', 'broken')").all();
    if (pendingReview.length > 0) {
      console.log(`\n[ImageWorker] Processando ${pendingReview.length} itens que necessitam de resolução de capa com concorrência controlada...`);
      let resolvedCount = 0;
      const queue = [...pendingReview];
      const workers = [];
      async function resolveNext() {
        while (queue.length) {
          const item = queue.shift();
          try {
            // Tenta achar no TMDB primeiro com o matcher aperfeiçoado
            const match = await worker._internal.findTrustedPoster(item);
            if (match) {
              const dl = await worker._internal.downloadPosterToLocal(item.type, item.id, match.url);
              if (dl.ok) {
                db.prepare('UPDATE streams SET poster_status = ?, poster_url = ?, poster_source_url = ?, poster_checked_at = CURRENT_TIMESTAMP WHERE id = ?')
                  .run('valid', worker.localUrlFor(item.type, item.id), match.url, item.id);
                worker.getStatus().stats.encontradas++;
                worker.getStatus().stats.baixadas++;
                resolvedCount++;
                continue;
              }
            }
            // Se não encontrou no TMDB, cria capa local com proporção vertical estilizada
            const created = worker.createCustomLocalPoster(item.type, item.id, item.name);
            if (created.ok) {
              db.prepare('UPDATE streams SET poster_status = ?, poster_url = ?, poster_source_url = ?, poster_checked_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run('valid', worker.localUrlFor(item.type, item.id), item.poster_url || null, item.id);
              worker.getStatus().stats.encontradas++;
              worker.getStatus().stats.baixadas++;
              resolvedCount++;
            }
          } catch (e) {
            console.error(`[ImageWorker] Erro ao resolver capa para ${item.id}: ${e.message}`);
          }
        }
      }
      for (let i = 0; i < Math.min(4, pendingReview.length); i++) workers.push(resolveNext());
      await Promise.all(workers);
      console.log(`[ImageWorker] ${resolvedCount} capas pendentes/revisão resolvidas e salvas localmente.`);
    }
  }

  console.log('');
  console.log('=== RELATÓRIO FINAL ===');
  console.log(worker.getReport());
  const finalStatus = worker.getStatus();
  console.log('Total no catálogo:', JSON.stringify(finalStatus.totals));
  console.log('Duração total (s):', Math.round((Date.now() - t0) / 1000));
  process.exit(0);
})();
