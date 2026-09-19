/**
 * sync_from_list.js
 * Sincroniza os canais ao vivo do catálogo com as listas M3U salvas em ./list.
 *
 * O que faz:
 *  1. Lê todos os arquivos .txt da pasta ./list e reconstrói as entradas
 *     #EXTINF + URL. As listas exportadas de PDF/Scribd quebram a URL em
 *     várias linhas e trazem entidades HTML como &amp;.
 *  2. Testa cada URL na origem (seguindo redirecionamentos) e só considera
 *     utilizável o que responde com mídia/playlist real (nunca HTML de erro).
 *  3. Insere canais que ainda não existem, atualiza a URL dos canais
 *     existentes que estão mortos e marca como offline o que não responde.
 *
 * Uso:
 *   node sync_from_list.js                          (simulação; não grava nada)
 *   node sync_from_list.js --apply                  (grava; backup automático)
 *   node sync_from_list.js --apply --timeout=12000 --concurrency=10
 *   node sync_from_list.js --validate-live --limit=800   (audita canais online)
 *   node sync_from_list.js --apply --reaudit-offline --limit=400
 *     (re-audita canais offline com verificação suave e reativa os vivos)
 *
 * Motivo dos ajustes suaves: os provedores mais sensíveis (Cloudflare / CDNs)
 * aplicam limitação de taxa por IP. Com concorrência alta (40+) o verificador
 * recebe HTTP 403 temporário e classifica um canal vivo como morto. Por isso
 * o padrão aqui é baixo (10) com timeout maior, e a re-auditoria usa 6.
 */
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const Database = require('./server/node_modules/better-sqlite3');

const args = {};
process.argv.slice(2).forEach((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args[m[1]] = m[2] === undefined ? true : m[2];
});

const APPLY = Boolean(args.apply);
const USE_WEB = Boolean(args.web);
const LIST_DIR = path.join(__dirname, 'list');
const DB_PATH = path.join(__dirname, 'server', 'data', 'iptv.db');
const TIMEOUT = parseInt(args.timeout || '8000', 10);
const CONCURRENCY = parseInt(args.concurrency || '10', 10);
const REAUDIT_TIMEOUT = parseInt(args['reaudit-timeout'] || '25000', 10);
const REAUDIT_CONCURRENCY = parseInt(args['reaudit-concurrency'] || '6', 10);
const MAX_REDIRECTS = 5;
const VALIDATE_LIVE = Boolean(args['validate-live']);
const REAUDIT = Boolean(args['reaudit-offline']);
const LIMIT = parseInt(args.limit || '0', 10);

const { syncAllChannels } = require('./server/src/services/channelListSyncService');

const MEDIA_MIME = /mpegurl|mp2t|mp4|matroska|webm|octet-stream|video\/|audio\/|x-mpegurl/i;
const BLOCKED_MIME = /text\/html|application\/json|xhtml/i;

// ---------- Parser M3U tolerante a listas exportadas de PDF/Scribd ----------

function fixUrl(raw) {
  let url = String(raw || '')
    .replace(/[\u0000-\u001f\s]+/g, '')   // remove quebras, tabulações e form feed
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/g, '&')
    .replace(/&quot;/gi, '"')
    .replace(/[),.;]+$/, '');
  if (!/^https?:\/\//i.test(url)) return '';
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return '';
    return parsed.href;
  } catch (e) {
    return '';
  }
}

/** Reconstrói as entradas `#EXTINF + URL` de um texto M3U torto. */
function parsePlaylist(text) {
  const lines = String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u000c/g, '\n')
    .split('\n');

  const entries = [];
  let pending = null;

  const flush = () => {
    if (!pending) return;
    const url = fixUrl(pending.url);
    if (pending.name && url) entries.push({ name: pending.name, url });
    pending = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^#EXTINF/i.test(line)) {
      flush();
      pending = { name: '', url: '' };
      const nameMatch = line.match(/,(.*)$/);
      pending.name = nameMatch ? nameMatch[1].trim() : '';
      continue;
    }
    if (line.startsWith('#')) continue; // #EXTM3U, #EXTVLCOPT, #EXTGRP...

    // Sem um #EXTINF pendente trata-se de link solto (texto de artigo): descarta.
    if (!pending) continue;

    // Linha de continuação da URL quebrada pelo export (ex.: "3u8", "1.m3u8").
    pending.url += line;
  }
  flush();

  return entries;
}

function normalizeName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\b(fhd|uhd|4k|hd|sd|fullhd|full|h265|hevc|h264|multi|backup|opc|opcao|\d+p)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// As listas exportadas do Scribd perderam os nomes: as entradas viraram
// "iptvtools_37", "iptvtools_118"... Exibir isso ao assinante é inaceitável,
// então o nome é reconstruído a partir da própria URL de origem.
const GENERIC_NAME = /^iptvtools[_\-\s]?\d+$/i;
// Extensões de arquivo de vídeo: são filmes avulsos (VOD), não canal ao vivo.
const VOD_EXTENSION = /\.(mkv|mp4|avi|m4v|mov|wmv|flv|mpg|mpeg|webm|ogv|3gp)(\?|$)/i;
const URL_NOISE = /^(www|com|br|net|org|tv|live|lives|hls|dash|stream|streams|streaming|playlist|index|chunks|chunklist|master|media|video|audio|smil|dai|items|liveevent|manifest|mono|cdn|cdn\d+|m3u8?|ts|mp4|avi|event|events|account|accounts|[a-z]?\d+|[a-z]{1,2})$/i;

function deriveNameFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return '';
  }

  const tokens = `${parsed.hostname} ${parsed.pathname}`
    .split(/[\/._\-+]+/)
    .map((token) => {
      let t = token.replace(/\.(m3u8?|ts|mp4|avi)$/i, '');
      let previous;
      // Remove prefixos/sufixos genéricos repetidamente: liveovacion1tv -> ovacion1
      do {
        previous = t;
        t = t.replace(/^(?:iptv|live|hls|video|web|tv)/i, '').replace(/(?:tv|hd|hls|live)$/i, '');
      } while (t !== previous);
      return t.trim().toLowerCase();
    })
    .filter((p) => p.length >= 3 && !URL_NOISE.test(p) && !/^\d+$/.test(p) && !/^[0-9a-f]{16,}$/i.test(p));

  if (tokens.length === 0) return '';

  // O token mais longo costuma ser o nome do canal (canal25, ovacion1...).
  const best = tokens.reduce((a, b) => (b.length > a.length ? b : a), tokens[0]);
  return best
    .replace(/([a-z])(\d+)/gi, '$1 $2')
    .split(' ')
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

// ---------- Categorização dos canais novos ----------

const CATEGORY_RULES = [
  { re: /esporte|sport|espn|premiere|combate|dazn|nba|nfl|futebol|football|sportv|eurosport/i, name: 'Esportes & PPV' },
  { re: /noticia|news|jornal|cnn|bbc|band news|euronews|globonews|bloomberg|dw |france 24/i, name: 'Notícias & Jornalismo' },
  { re: /infantil|kids|cartoon|disney|nick|gloob|desenho|anime|baby/i, name: 'Infantis & Desenhos' },
  { re: /document|discovery|history|natgeo|nat geo|ciencia|animal planet|smithsonian|travel/i, name: 'Documentários & Ciência' },
  { re: /religio|gospel|crist|igreja|deus|evangel|catolic|santa|padre|israel|canção nova|aparecida/i, name: 'Religiosos' },
  { re: /filme|movie|cinema|telecine|hbo|max|paramount|megapix|warner|sony|space|tnt/i, name: 'Cinema & Séries Ao Vivo' },
  { re: /band|globo|sbt|record|cultura|aberta|tv brasil|canal gov|senado|camara|educativa|futura/i, name: 'Canais Abertos HD' },
  { re: /m[uú]sica|music|mtv|bis|multishow|viva|arte|comedy/i, name: 'Variedades & Entretenimento' },
];

function guessCategory(name) {
  const clean = String(name || '');
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(clean)) return rule.name;
  }
  return 'Variedades & Entretenimento';
}

// ---------- Verificação real da origem ----------

/**
 * Faz um GET simples na origem seguindo redirecionamentos.
 * Aceita apenas resposta de mídia/playlist - nunca HTML de erro ou login.
 */
function probeStream(url, optTimeout) {
  const perCallTimeout = optTimeout || TIMEOUT;
  return new Promise((resolve) => {
    const started = Date.now();
    let redirects = 0;

    const attempt = (current) => {
      let target;
      try {
        target = new URL(current);
      } catch (e) {
        return resolve({ ok: false, status: 0, reason: 'url-invalida' });
      }

      const mod = target.protocol === 'https:' ? https : http;
      const isPlaylist = /\.m3u8?(\?|$)/i.test(target.href) || /playlist/i.test(target.pathname);
      const headers = {
        'User-Agent': 'VSAIPTV/1.0',
        Accept: '*/*',
        'Accept-Encoding': 'identity',
      };
      if (!isPlaylist) headers.Range = 'bytes=0-2047';

      const req = mod.get(target, { headers, family: 4, timeout: perCallTimeout }, (res) => {
        const status = res.statusCode || 0;

        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirects < MAX_REDIRECTS) {
          redirects += 1;
          res.resume();
          let next;
          try {
            next = new URL(res.headers.location, target).href;
          } catch (e) {
            return resolve({ ok: false, status, reason: 'redirect-invalido' });
          }
          return attempt(next);
        }

        const contentType = String(res.headers['content-type'] || '').toLowerCase();

        if (status < 200 || status >= 300) {
          res.resume();
          return resolve({ ok: false, status, reason: `http-${status}`, contentType, ms: Date.now() - started });
        }
        if (BLOCKED_MIME.test(contentType)) {
          res.resume();
          return resolve({ ok: false, status, reason: 'html-ou-json', contentType, ms: Date.now() - started });
        }

        // Confirma assinatura da playlist antes de aceitar o conteúdo.
        const chunks = [];
        let bytes = 0;
        res.on('data', (chunk) => {
          if (bytes < 2048) {
            chunks.push(chunk);
            bytes += chunk.length;
          } else {
            res.destroy();
          }
        });
        const finish = () => {
          const head = Buffer.concat(chunks).toString('utf8', 0, Math.min(64, bytes));
          const isPlaylistBody = /^#EXTM3U/.test(head.replace(/^\uFEFF/, '').trim());
          // Alguns servidores entregam .ts/.mp4 sem Content-Type algum; nesse caso
          // o próprio caminho do arquivo é o indício de que é mídia.
          const mediaPath = /\.(ts|mp4|mkv|m4v|m4a|aac|mp3|webm|mpd)(\?|$)/i.test(target.pathname);
          const ok = isPlaylistBody || MEDIA_MIME.test(contentType) || (mediaPath && !contentType);
          resolve({
            ok,
            status,
            reason: ok ? 'ok' : `conteudo-${contentType || 'desconhecido'}`,
            contentType,
            finalUrl: target.href,
            ms: Date.now() - started,
          });
        };
        res.on('end', finish);
        res.on('close', finish);
      });

      req.setTimeout(perCallTimeout, () => { req.destroy(); resolve({ ok: false, status: 0, reason: 'timeout', ms: Date.now() - started }); });
      req.on('error', (err) => resolve({ ok: false, status: 0, reason: err.code || 'erro-rede', ms: Date.now() - started }));
    };

    attempt(url);
  });
}

/** Executa `probeStream` respeitando um limite de paralelismo. */
async function probeAll(items, onProgress, optConcurrency, optTimeout) {
  const perCallConcurrency = optConcurrency || CONCURRENCY;
  const results = new Array(items.length);
  let index = 0;
  let done = 0;

  const worker = async () => {
    while (true) {
      const i = index++;
      if (i >= items.length) break;
      results[i] = await probeStream(items[i].url, optTimeout);
      done += 1;
      if (onProgress && (done % 25 === 0 || done === items.length)) onProgress(done, items.length);
    }
  };

  const workers = [];
  const total = Math.min(perCallConcurrency, items.length || 1);
  for (let w = 0; w < total; w++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

// ---------- Sincronização com o catálogo ----------

const FALLBACK_LIVE_ICON = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/OOjs_UI_icon_play.svg/512px-OOjs_UI_icon_play.svg.png';
const FALLBACK_LIVE_POSTER = 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=1280&h=720&fit=crop';

function loadListEntries() {
  if (!fs.existsSync(LIST_DIR)) {
    console.error(`Pasta não encontrada: ${LIST_DIR}`);
    process.exit(1);
  }
  const files = fs.readdirSync(LIST_DIR).filter((f) => /\.(txt|m3u|m3u8)$/i.test(f));
  const all = [];
  let descartadosSemNome = 0;
  let descartadosVod = 0;
  for (const file of files) {
    const text = fs.readFileSync(path.join(LIST_DIR, file), 'utf8');
    const entries = parsePlaylist(text);
    console.log(`  ${file}: ${entries.length} entradas válidas`);
    for (const entry of entries) {
      // Arquivos de vídeo pontuais são VOD (filmes), não canais de TV ao vivo.
      if (VOD_EXTENSION.test(entry.url)) { descartadosVod += 1; continue; }

      // Recupera nomes que o export do Scribd transformou em "iptvtools_37".
      let name = entry.name;
      if (GENERIC_NAME.test(name)) {
        name = deriveNameFromUrl(entry.url);
        if (!name) { descartadosSemNome += 1; continue; }
      }
      all.push({ name, url: entry.url, file });
    }
  }
  if (descartadosVod > 0) {
    console.log(`  (${descartadosVod} arquivos de filme/VOD ignorados: não são canais ao vivo)`);
  }
  if (descartadosSemNome > 0) {
    console.log(`  (${descartadosSemNome} entradas descartadas: nome ausente e impossível de deduzir)`);
  }

  // Remove repetições exatas (mesmo nome normalizado + mesma URL).
  const seen = new Set();
  const unique = [];
  for (const entry of all) {
    const key = `${normalizeName(entry.name)}|${entry.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  return unique;
}

function backupDatabase() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(__dirname, 'server', 'data', `iptv.db.before_sync_list.${stamp}`);
  fs.copyFileSync(DB_PATH, target);
  console.log(`💾 Backup criado: ${path.basename(target)}`);
}

async function main() {
  if (USE_WEB) {
    console.log('🌐 Modo WEB ativado: integrando fontes públicas atualizadas com listas locais...');
    const result = await syncAllChannels({ apply: APPLY, concurrency: CONCURRENCY, timeoutMs: TIMEOUT });
    if (result.ok) {
      console.log('✅ Sincronização Web concluída com sucesso!');
    } else {
      console.error('❌ Falha na sincronização:', result.error || result.message);
    }
    return;
  }

  console.log('📄 Lendo listas da pasta ./list ...');
  const entries = loadListEntries();
  console.log(`🔎 ${entries.length} canais únicos para verificar (timeout=${TIMEOUT}ms, concorrência=${CONCURRENCY}).\n`);

  if (args['parse-only']) {
    console.log('Amostra das entradas reconhecidas (final da lista, onde ficam as do Scribd):');
    entries.slice(-25).forEach((e) => console.log(`  [${e.file}] ${e.name} -> ${e.url}`));
    console.log(`\nTotal reconhecido: ${entries.length}`);
    return;
  }

  const results = await probeAll(entries, (done, total) => {
    process.stdout.write(`\r   verificando... ${done}/${total}`);
  });
  process.stdout.write('\r');

  const working = [];
  const reasons = new Map();
  entries.forEach((entry, i) => {
    const result = results[i] || { ok: false, reason: 'sem-resposta' };
    if (result.ok) {
      working.push({ ...entry, finalUrl: result.finalUrl || entry.url, status: result.status });
    } else {
      reasons.set(result.reason, (reasons.get(result.reason) || 0) + 1);
    }
  });

  console.log(`✅ Origens funcionando: ${working.length}/${entries.length}`);
  console.log('   Motivos das falhas:');
  [...reasons.entries()].sort((a, b) => b[1] - a[1]).forEach(([reason, count]) => {
    console.log(`     ${String(count).padStart(4)}  ${reason}`);
  });

  const report = {
    gerado_em: new Date().toISOString(),
    total_listados: entries.length,
    funcionando: working.length,
    falhas_por_motivo: Object.fromEntries([...reasons.entries()].sort((a, b) => b[1] - a[1])),
    canais: working.map((w) => ({ nome: w.name, url: w.finalUrl, arquivo: w.file, status: w.status })),
  };
  fs.writeFileSync(path.join(__dirname, 'list_sync_report.json'), JSON.stringify(report, null, 2));
  console.log('📝 Relatório salvo em list_sync_report.json');

  if (!APPLY) {
    console.log('\nℹ️  Simulação concluída. Nada foi gravado. Rode com --apply para aplicar no banco.');
    return;
  }

  backupDatabase();
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const existingLive = db.prepare("SELECT id, name, stream_url, status FROM streams WHERE type = 'live'").all();

  // Limpa rótulos genéricos gravados por execuções anteriores ("iptvtools_37"),
  // que eram apenas a numeração do export do Scribd e não o nome do canal.
  const removedGeneric = db.prepare("DELETE FROM streams WHERE type = 'live' AND name GLOB 'iptvtools_*'").run().changes;
  if (removedGeneric > 0) console.log(`🧹 ${removedGeneric} canais com nome genérico ("iptvtools_N") removidos para recadastro.`);

  // Duplicatas exatas de URL já no catálogo: mantém o registro mais antigo.
  const removedExistingDup = db.prepare(`
    DELETE FROM streams
    WHERE type = 'live'
      AND id NOT IN (SELECT MIN(id) FROM streams WHERE type = 'live' GROUP BY stream_url)
  `).run().changes;
  if (removedExistingDup > 0) console.log(`🧹 ${removedExistingDup} duplicatas que já estavam no catálogo removidas.`);

  const liveRows = db.prepare("SELECT id, name, stream_url, status FROM streams WHERE type='live'").all();
  const byName = new Map();
  const usedUrls = new Set();
  for (const row of liveRows) {
    const key = normalizeName(row.name);
    if (key && !byName.has(key)) byName.set(key, row);
    if (row.stream_url) usedUrls.add(row.stream_url);
  }

  const findCategory = db.prepare('SELECT id FROM categories WHERE name = ? AND type = ?');
  const insertCategory = db.prepare("INSERT INTO categories (name, type, order_num) VALUES (?, 'live', ?)");
  const insertStream = db.prepare(`
    INSERT INTO streams (name, category_id, type, stream_url, icon_url, poster_url, description, rating, release_date, status, last_check)
    VALUES (?, ?, 'live', ?, ?, ?, ?, '8.5', '2024', 'online', ?)
  `);
  const updateStream = db.prepare(`
    UPDATE streams
    SET stream_url = ?, status = 'online', last_check = ?, category_id = COALESCE(category_id, ?)
    WHERE id = ?
  `);
  const touchOnline = db.prepare("UPDATE streams SET status = 'online', last_check = ? WHERE id = ?");

  const categoryCache = new Map();
  const getCategoryId = (name) => {
    if (categoryCache.has(name)) return categoryCache.get(name);
    const found = findCategory.get(name, 'live');
    const id = found ? found.id : insertCategory.run(name, 90).lastInsertRowid;
    categoryCache.set(name, id);
    return id;
  };

  const now = new Date().toISOString();
  const stats = { inseridos: 0, atualizados: 0, ja_ok: 0, ignorados_duplicados: 0 };

  db.transaction(() => {
    for (const ch of working) {
      const key = normalizeName(ch.name);
      const current = key ? byName.get(key) : null;

      if (current) {
        if (current.stream_url === ch.finalUrl) {
          touchOnline.run(now, current.id);
          stats.ja_ok += 1;
        } else if (usedUrls.has(ch.finalUrl)) {
          // A URL nova já pertence a outro canal: não cria duplicata.
          touchOnline.run(now, current.id);
          stats.ignorados_duplicados += 1;
        } else {
          updateStream.run(ch.finalUrl, now, getCategoryId(guessCategory(ch.name)), current.id);
          usedUrls.add(ch.finalUrl);
          stats.atualizados += 1;
        }
        continue;
      }

      if (usedUrls.has(ch.finalUrl)) {
        stats.ignorados_duplicados += 1;
        continue;
      }

      const categoryId = getCategoryId(guessCategory(ch.name));
      insertStream.run(
        ch.name,
        categoryId,
        ch.finalUrl,
        FALLBACK_LIVE_ICON,
        FALLBACK_LIVE_POSTER,
        `Verificado na origem em ${now.slice(0, 10)}.`,
        now,
      );
      usedUrls.add(ch.finalUrl);
      // Registra o nome recém-criado para que a mesma entrada não seja inserida
      // novamente quando aparecer em outra lista.
      if (key) byName.set(key, { id: -1, name: ch.name, stream_url: ch.finalUrl, status: 'online' });
      stats.inseridos += 1;
    }
  })();

  // Duplicatas exatas de URL (a mesma origem cadastrada em listas diferentes).
  const removedDuplicates = db.prepare(`
    DELETE FROM streams
    WHERE type = 'live'
      AND id NOT IN (SELECT MIN(id) FROM streams WHERE type = 'live' GROUP BY stream_url)
      AND stream_url IN (
        SELECT stream_url FROM streams WHERE type = 'live' GROUP BY stream_url HAVING COUNT(*) > 1
      )
  `).run().changes;
  if (removedDuplicates > 0) console.log(`🧹 ${removedDuplicates} canais duplicados (mesma URL) removidos.`);

  console.log('\n📊 Resultado da sincronização:');
  console.log(`   canais novos inseridos .......... ${stats.inseridos}`);
  console.log(`   URLs atualizadas ................ ${stats.atualizados}`);
  console.log(`   já estavam corretos ............. ${stats.ja_ok}`);
  console.log(`   ignorados (URL duplicada) ....... ${stats.ignorados_duplicados}`);

  if (VALIDATE_LIVE) {
    await validateLiveChannels(db, now);
  } else if (REAUDIT) {
    await reauditOfflineChannels(db, now);
  }

  const summary = db.prepare("SELECT status, COUNT(*) AS total FROM streams WHERE type='live' GROUP BY status ORDER BY status").all();
  console.log('\nCanais ao vivo por status:', summary.map((s) => `${s.status}=${s.total}`).join(' | '));
  db.close();
}

/**
 * Audita os canais ao vivo marcados como online e desativa o que não responde,
 * evitando que o app exiba canais mortos que travam ou não abrem.
 */
async function validateLiveChannels(db, now) {
  const rows = db.prepare(`
    SELECT id, name, stream_url FROM streams
    WHERE type = 'live' AND status = 'online' AND stream_url LIKE 'http%'
    ORDER BY id
    ${LIMIT > 0 ? `LIMIT ${LIMIT}` : ''}
  `).all();

  if (rows.length === 0) return;
  console.log(`\n Auditando ${rows.length} canais ao vivo online...`);

  const results = await probeAll(
    rows.map((row) => ({ ...row, url: row.stream_url })),
    (done, total) => process.stdout.write(`\r   auditando... ${done}/${total}`),
  );
  process.stdout.write('\r');

  const setOffline = db.prepare("UPDATE streams SET status = 'offline', last_check = ? WHERE id = ?");
  const alive = rows.filter((_, i) => results[i] && results[i].ok).length;
  const failures = rows.length - alive;

  // Trava de segurança: se quase tudo falhar, o problema é de rede/verificação e
  // não do catálogo. Nesse caso nada é alterado para não esvaziar a lista.
  if (rows.length >= 50 && failures / rows.length > 0.95) {
    console.log(`⚠️  ${failures}/${rows.length} falharam — acima do limite de segurança. Nenhuma alteração aplicada.`);
    console.log('   Verifique a conectividade do servidor e rode novamente.');
    return;
  }

  let dead = 0;
  db.transaction(() => {
    rows.forEach((row, i) => {
      const result = results[i];
      // Sem resultado de verificação não há como afirmar que o canal morreu.
      if (!result) return;
      if (result.ok) return;
      setOffline.run(now, row.id);
      dead += 1;
    });
  })();
  console.log(`Canais desativados por não responderem: ${dead} de ${rows.length}`);
}

/**
 * Re-audita canais desativados recentemente com verificação suave
 * (pouca concorrência, timeout generoso) e reativa os que respondem.
 * Usado quando uma rodada anterior de auditoria teve falso negativo.
 */
async function reauditOfflineChannels(db, now) {
  const rows = db.prepare(`
    SELECT id, name, stream_url FROM streams
    WHERE type = 'live' AND status = 'offline' AND last_check IS NOT NULL
    ORDER BY id DESC
    ${LIMIT > 0 ? `LIMIT ${LIMIT}` : ''}
  `).all();

  if (rows.length === 0) return;
  console.log(`\n♻️  Re-auditando ${rows.length} canais offline (timeout=${REAUDIT_TIMEOUT}ms, concorrência=${REAUDIT_CONCURRENCY})...`);

  const results = await probeAll(
    rows.map((row) => ({ ...row, url: row.stream_url })),
    (done, total) => process.stdout.write(`\r   re-auditando... ${done}/${total}`),
    REAUDIT_CONCURRENCY,
    REAUDIT_TIMEOUT,
  );
  process.stdout.write('\r');

  const setOnline = db.prepare("UPDATE streams SET status = 'online', last_check = ? WHERE id = ?");
  let rescued = 0;
  db.transaction(() => {
    rows.forEach((row, i) => {
      const result = results[i];
      if (!result || !result.ok) return;
      setOnline.run(now, row.id);
      rescued += 1;
    });
  })();
  console.log(`Canais reativados por responderem: ${rescued} de ${rows.length}`);
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exitCode = 1;
});