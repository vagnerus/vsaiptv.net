/**
 * organize_series_catalog.js
 * 
 * Agrupa episódios avulsos da tabela `streams` em registros únicos de Séries e Novelas,
 * vinculando todos os capítulos/episódios na tabela `series_episodes` com temporadas
 * e numerações corretas, e limpando as duplicatas de cards da tabela `streams`.
 */
const fs = require('fs');
const path = require('path');
const Database = require('./server/node_modules/better-sqlite3');

const DB_PATH = path.join(__dirname, 'server/data/iptv.db');
const BACKUP_PATH = path.join(__dirname, 'server/data/iptv.db.before_organize_series');

console.log('===========================================================');
console.log('🚀 ORGANIZADOR DO CATÁLOGO DE SÉRIES E NOVELAS');
console.log('===========================================================\n');

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ Banco de dados não encontrado em:', DB_PATH);
  process.exit(1);
}

// 1. BACKUP DE SEGURANÇA
if (!fs.existsSync(BACKUP_PATH)) {
  console.log('📦 Criando backup de segurança do banco...');
  console.log(`   Origem:  ${DB_PATH}`);
  console.log(`   Destino: ${BACKUP_PATH}`);
  fs.copyFileSync(DB_PATH, BACKUP_PATH);
  console.log(`✅ Backup criado com sucesso! (${(fs.statSync(BACKUP_PATH).size / 1024 / 1024).toFixed(2)} MB)\n`);
} else {
  console.log(`ℹ️ Backup existente encontrado em: ${BACKUP_PATH}\n`);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF'); // Desativa foreign_keys durante a reestruturação em lote para performance

// Padrões para parsing de episódios
const patterns = [
  /^(.*?)\s+S(\d{1,2})\s*E(\d{1,4})(.*)$/i,
  /^(.*?)\s+T(\d{1,2})\s*E(\d{1,4})(.*)$/i,
  /^(.*?)(?:[\s\-–—]+)(?:EP|CAP|CAPITULO|CAPÍTULO)\.?\s*(\d{1,4})(.*)$/i,
  /^(.*?)\s+(?:Temporada|Temp)\.?\s*(\d{1,2})\s*(?:Episodio|Episódio|Ep)\.?\s*(\d{1,4})(.*)$/i,
  /^(.*?)\s+E(\d{2,4})(.*)$/i,
];

function parseEpisode(rawName) {
  const trimmed = (rawName || '').trim();
  for (const regex of patterns) {
    const m = trimmed.match(regex);
    if (m) {
      let seriesTitle = m[1].trim();
      seriesTitle = seriesTitle.replace(/[\-–—\s]+$/, '').trim();

      let seasonNum = 1;
      let episodeNum = 1;
      let extra = '';

      if (m.length === 5) {
        seasonNum = parseInt(m[2], 10);
        episodeNum = parseInt(m[3], 10);
        extra = m[4].trim();
      } else if (m.length === 4) {
        episodeNum = parseInt(m[2], 10);
        extra = m[3].trim();
      }

      if (seriesTitle.length > 0 && !isNaN(episodeNum)) {
        return {
          seriesTitle,
          seasonNum: isNaN(seasonNum) ? 1 : seasonNum,
          episodeNum,
          extra,
        };
      }
    }
  }
  return null;
}

try {
  console.log('🔍 Identificando streams de episódios avulsos...');
  
  // Pegar todos os streams do tipo 'series' que possuem stream_url preenchido
  const episodeCandidates = db.prepare(`
    SELECT s.id, s.name, s.category_id, s.stream_url, s.poster_url, s.icon_url, s.rating, s.release_date, c.name as category_name
    FROM streams s
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE s.type = 'series' AND s.stream_url != '' AND s.stream_url IS NOT NULL
  `).all();

  console.log(`📋 Total de streams com URL direta de série encontrados: ${episodeCandidates.length}`);

  // Pegar séries raiz existentes (sem stream_url)
  const existingRoots = db.prepare(`
    SELECT id, name, category_id, poster_url, icon_url
    FROM streams
    WHERE type = 'series' AND (stream_url = '' OR stream_url IS NULL)
  `).all();

  const rootMap = new Map(); // key: `${cleanTitle.toLowerCase()}:::${category_id}` -> rootStream
  const rootByNameMap = new Map(); // key: cleanTitle.toLowerCase() -> rootStream (fallback)
  existingRoots.forEach(r => {
    const norm = r.name.trim().toLowerCase();
    rootMap.set(`${norm}:::${r.category_id}`, r);
    if (!rootByNameMap.has(norm)) {
      rootByNameMap.set(norm, r);
    }
  });

  console.log(`📋 Séries pai já existentes no banco: ${existingRoots.length}`);

  // Agrupar os episódios por obra e categoria
  const groups = new Map(); // key: `${title.toLowerCase()}:::${category_id}`
  const unparsedStreams = [];

  for (const item of episodeCandidates) {
    const parsed = parseEpisode(item.name);
    if (parsed) {
      const key = `${parsed.seriesTitle.toLowerCase()}:::${item.category_id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          title: parsed.seriesTitle,
          categoryId: item.category_id,
          categoryName: item.category_name,
          posterUrl: item.poster_url || item.icon_url,
          iconUrl: item.icon_url || item.poster_url,
          rating: item.rating || '8.5',
          episodes: [],
        });
      }
      const g = groups.get(key);
      if (!g.posterUrl && (item.poster_url || item.icon_url)) {
        g.posterUrl = item.poster_url || item.icon_url;
        g.iconUrl = item.icon_url || item.poster_url;
      }
      g.episodes.push({
        originalStreamId: item.id,
        seasonNum: parsed.seasonNum,
        episodeNum: parsed.episodeNum,
        title: `${parsed.seriesTitle} S${String(parsed.seasonNum).padStart(2, '0')}E${String(parsed.episodeNum).padStart(2, '0')}`,
        streamUrl: item.stream_url,
      });
    } else {
      unparsedStreams.push(item);
    }
  }

  console.log(`\n🎯 Agrupamento concluído:`);
  console.log(`   - Obras únicas identificadas para estruturar: ${groups.size}`);
  console.log(`   - Episódios a serem movidos para series_episodes: ${episodeCandidates.length - unparsedStreams.length}`);
  console.log(`   - Streams que não casaram com padrão de episódio: ${unparsedStreams.length}`);

  // Preparar statements de banco
  const insertParentStmt = db.prepare(`
    INSERT INTO streams (name, category_id, type, stream_url, icon_url, poster_url, description, rating, status)
    VALUES (?, ?, 'series', '', ?, ?, ?, ?, 'online')
  `);

  const updateParentPosterStmt = db.prepare(`
    UPDATE streams 
    SET poster_url = COALESCE(NULLIF(poster_url, ''), ?),
        icon_url = COALESCE(NULLIF(icon_url, ''), ?)
    WHERE id = ?
  `);

  const insertEpisodeStmt = db.prepare(`
    INSERT INTO series_episodes (series_id, season_num, episode_num, title, stream_url, duration_minutes)
    VALUES (?, ?, ?, ?, ?, 45)
  `);

  // Pegar episódios já existentes para não duplicar se rodar novamente
  const checkEpStmt = db.prepare(`
    SELECT id FROM series_episodes WHERE series_id = ? AND season_num = ? AND episode_num = ? LIMIT 1
  `);

  const deleteStreamStmt = db.prepare('DELETE FROM streams WHERE id = ?');

  console.log('\n⚙️ Iniciando migração em transação única de alta performance...');
  const startTime = Date.now();

  let createdParents = 0;
  let reusedParents = 0;
  let insertedEpisodes = 0;
  let deletedStreams = 0;

  const streamIdsToDelete = [];

  const runMigration = db.transaction(() => {
    for (const [key, group] of groups.entries()) {
      const normTitle = group.title.toLowerCase();
      let parentId = null;

      // 1. Verificar se já existe série pai para esta categoria
      if (rootMap.has(key)) {
        parentId = rootMap.get(key).id;
        reusedParents++;
        if (group.posterUrl) {
          updateParentPosterStmt.run(group.posterUrl, group.iconUrl, parentId);
        }
      } else if (rootByNameMap.has(normTitle)) {
        // Se existe com mesmo nome mas categoria ligeiramente diferente
        parentId = rootByNameMap.get(normTitle).id;
        reusedParents++;
        if (group.posterUrl) {
          updateParentPosterStmt.run(group.posterUrl, group.iconUrl, parentId);
        }
      } else {
        // Criar novo registro pai na tabela streams
        const desc = `Catálogo completo disponível com ${group.episodes.length} episódios organizados por temporada.`;
        const res = insertParentStmt.run(
          group.title,
          group.categoryId,
          group.iconUrl,
          group.posterUrl,
          desc,
          group.rating
        );
        parentId = res.lastInsertRowid;
        createdParents++;

        // Registrar nos maps para não duplicar pai
        const newParentObj = { id: parentId, name: group.title, category_id: group.categoryId };
        rootMap.set(key, newParentObj);
        rootByNameMap.set(normTitle, newParentObj);
      }

      // 2. Inserir os episódios na tabela series_episodes
      // Ordenar episódios por temporada e número
      group.episodes.sort((a, b) => {
        if (a.seasonNum !== b.seasonNum) return a.seasonNum - b.seasonNum;
        return a.episodeNum - b.episodeNum;
      });

      for (const ep of group.episodes) {
        const existingEp = checkEpStmt.get(parentId, ep.seasonNum, ep.episodeNum);
        if (!existingEp) {
          insertEpisodeStmt.run(
            parentId,
            ep.seasonNum,
            ep.episodeNum,
            ep.title,
            ep.streamUrl
          );
          insertedEpisodes++;
        }

        // Marcar o stream original do episódio para exclusão da tabela streams
        streamIdsToDelete.push(ep.originalStreamId);
      }
    }

    // 3. Excluir os streams individuais de episódios da tabela streams em lotes
    console.log(`\n🗑️ Removendo ${streamIdsToDelete.length} registros individuais de episódios da tabela streams...`);
    const chunkSize = 1000;
    for (let i = 0; i < streamIdsToDelete.length; i += chunkSize) {
      const chunk = streamIdsToDelete.slice(i, i + chunkSize);
      const inClause = chunk.join(',');
      db.prepare(`DELETE FROM streams WHERE id IN (${inClause})`).run();
      deletedStreams += chunk.length;
      if ((i / chunkSize) % 25 === 0) {
        process.stdout.write(`   Excluídos ${deletedStreams} / ${streamIdsToDelete.length}...\r`);
      }
    }
  });

  runMigration();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n\n✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO em ${elapsed}s!`);
  console.log(`   - Novas obras pai criadas: ${createdParents}`);
  console.log(`   - Obras pai reaproveitadas: ${reusedParents}`);
  console.log(`   - Episódios inseridos em series_episodes: ${insertedEpisodes}`);
  console.log(`   - Streams redundantes deletados de streams: ${deletedStreams}`);

  // Criar índices recomendados para velocidade instantânea de carregamento
  console.log('\n⚡ Otimizando índices do banco de dados...');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_episodes_series_order 
    ON series_episodes(series_id, season_num, episode_num);
    
    CREATE INDEX IF NOT EXISTS idx_streams_type_cat 
    ON streams(type, category_id, status);
  `);
  console.log('✅ Índices criados/validados com sucesso.');

  // Validação final de contagens
  const finalSeriesCount = db.prepare("SELECT count(id) as c FROM streams WHERE type = 'series'").get().c;
  const finalEpisodesCount = db.prepare("SELECT count(id) as c FROM series_episodes").get().c;
  console.log(`\n📊 ESTADO FINAL DO BANCO DE DADOS:`);
  console.log(`   - Total de Séries/Novelas cadastradas (Cards únicos): ${finalSeriesCount}`);
  console.log(`   - Total de Episódios na tabela series_episodes: ${finalEpisodesCount}`);

} catch (err) {
  console.error('\n❌ ERRO DURANTE A MIGRAÇÃO:', err);
  process.exit(1);
} finally {
  db.close();
}
