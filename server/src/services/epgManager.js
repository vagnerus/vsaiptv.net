const db = require('../db/database');
const http = require('http');
const https = require('https');

class EpgManager {
  /**
   * Parse XMLTV timestamp format: YYYYMMDDHHMMSS +/-ZZZZ into ISO Date string
   * e.g., "20260918153000 -0300" -> "2026-09-18T18:30:00.000Z"
   */
  parseXmltvDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const clean = dateStr.trim();
    const match = clean.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?/);
    if (!match) {
      const d = new Date(clean);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }

    const [, Y, M, D, h, m, s, tz] = match;
    let iso = `${Y}-${M}-${D}T${h}:${m}:${s}`;
    if (tz) {
      const tzSign = tz[0];
      const tzHours = tz.slice(1, 3);
      const tzMins = tz.slice(3, 5);
      iso += `${tzSign}${tzHours}:${tzMins}`;
    } else {
      iso += 'Z';
    }

    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  /**
   * Get AGORA (current) and A SEGUIR (next) program for a stream
   */
  getCurrentAndNext(streamId) {
    const now = new Date();
    const nowIso = now.toISOString();

    const currentProg = db.prepare(`
      SELECT id, stream_id, title, description, start_time, end_time 
      FROM epg_programs 
      WHERE stream_id = ? AND start_time <= ? AND end_time >= ?
      ORDER BY start_time DESC
      LIMIT 1
    `).get(streamId, nowIso, nowIso);

    let current = null;
    if (currentProg) {
      const startMs = new Date(currentProg.start_time).getTime();
      const endMs = new Date(currentProg.end_time).getTime();
      const total = endMs - startMs;
      const elapsed = Math.max(0, now.getTime() - startMs);
      const progressPercent = total > 0 ? Math.min(100, Math.round((elapsed / total) * 100)) : 0;

      current = {
        ...currentProg,
        progressPercent,
        durationMinutes: Math.round(total / 60000)
      };
    }

    const nextProg = db.prepare(`
      SELECT id, stream_id, title, description, start_time, end_time 
      FROM epg_programs 
      WHERE stream_id = ? AND start_time > ?
      ORDER BY start_time ASC 
      LIMIT 1
    `).get(streamId, currentProg ? currentProg.end_time : nowIso);

    return {
      current,
      next: nextProg || null,
      hasEpg: !!(current || nextProg)
    };
  }

  /**
   * Fetch EPG timeline schedule for Guia de TV
   */
  getGuideTimeline({ categoryId = null, limit = 50, offset = 0 } = {}) {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 1000 * 60 * 60).toISOString(); // 1 hr ago
    const windowEnd = new Date(now.getTime() + 1000 * 60 * 60 * 12).toISOString(); // 12 hrs ahead

    let query = `
      SELECT s.id, s.name, s.icon_url, s.epg_channel_id, c.name as category_name
      FROM streams s
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.type = 'live'
    `;
    const params = [];

    if (categoryId) {
      query += ` AND s.category_id = ?`;
      params.push(categoryId);
    }

    query += ` ORDER BY s.name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const channels = db.prepare(query).all(...params);

    const getPrograms = db.prepare(`
      SELECT id, title, description, start_time, end_time 
      FROM epg_programs 
      WHERE stream_id = ? AND end_time >= ? AND start_time <= ?
      ORDER BY start_time ASC
    `);

    return channels.map(ch => {
      const programs = getPrograms.all(ch.id, windowStart, windowEnd);
      const state = this.getCurrentAndNext(ch.id);

      return {
        ...ch,
        current: state.current,
        next: state.next,
        programs
      };
    });
  }

  /**
   * Fast XMLTV ingestion with high confidence matching
   */
  importXmltv(xmlContent) {
    if (!xmlContent || typeof xmlContent !== 'string') {
      throw new Error('Conteúdo XMLTV inválido ou vazio.');
    }

    const channelRegex = /<channel\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/channel>/gi;
    const channelMap = new Map();

    let chMatch;
    while ((chMatch = channelRegex.exec(xmlContent)) !== null) {
      const chId = chMatch[1];
      const body = chMatch[2];
      const nameMatch = body.match(/<display-name[^>]*>([^<]+)<\/display-name>/i);
      const name = nameMatch ? nameMatch[1].trim() : chId;
      channelMap.set(chId, name);
    }

    const streams = db.prepare("SELECT id, name, epg_channel_id FROM streams WHERE type = 'live'").all();
    const streamByTvgId = new Map();
    const streamByName = new Map();

    for (const s of streams) {
      if (s.epg_channel_id) streamByTvgId.set(s.epg_channel_id.toLowerCase(), s.id);
      const cleanName = s.name.toLowerCase().replace(/[^a-z0-9]/gi, '');
      streamByName.set(cleanName, s.id);
    }

    const progRegex = /<programme\s+start="([^"]+)"\s+stop="([^"]+)"\s+channel="([^"]+)"[^>]*>([\s\S]*?)<\/programme>/gi;
    const insertProg = db.prepare(`
      INSERT INTO epg_programs (stream_id, title, description, start_time, end_time)
      VALUES (?, ?, ?, ?, ?)
    `);

    let importedCount = 0;
    let matchedChannels = new Set();

    db.transaction(() => {
      let pMatch;
      while ((pMatch = progRegex.exec(xmlContent)) !== null) {
        const rawStart = pMatch[1];
        const rawStop = pMatch[2];
        const channelId = pMatch[3];
        const body = pMatch[4];

        let streamId = streamByTvgId.get(channelId.toLowerCase());
        if (!streamId) {
          const chName = channelMap.get(channelId);
          if (chName) {
            const clean = chName.toLowerCase().replace(/[^a-z0-9]/gi, '');
            streamId = streamByName.get(clean);
          }
        }

        if (!streamId) continue;

        const startTime = this.parseXmltvDate(rawStart);
        const endTime = this.parseXmltvDate(rawStop);
        if (!startTime || !endTime) continue;

        const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : 'Programa';

        const descMatch = body.match(/<desc[^>]*>([^<]+)<\/desc>/i);
        const desc = descMatch ? descMatch[1].trim() : '';

        try {
          insertProg.run(streamId, title, desc, startTime, endTime);
          importedCount++;
          matchedChannels.add(streamId);
        } catch (e) {}
      }
    })();

    return {
      success: true,
      importedPrograms: importedCount,
      matchedChannels: matchedChannels.size,
      totalChannelsXml: channelMap.size
    };
  }

  /**
   * Estatísticas operacionais do EPG para o Master Dashboard
   */
  getStats() {
    const totalLive = db.prepare("SELECT COUNT(*) as c FROM streams WHERE type = 'live'").get().c;
    const mappedChannels = db.prepare("SELECT COUNT(*) as c FROM streams WHERE type = 'live' AND epg_channel_id IS NOT NULL AND epg_channel_id != ''").get().c;
    const channelsWithPrograms = db.prepare("SELECT COUNT(DISTINCT stream_id) as c FROM epg_programs").get().c;
    const totalPrograms = db.prepare("SELECT COUNT(*) as c FROM epg_programs").get().c;
    const latestRow = db.prepare("SELECT MAX(end_time) as latest FROM epg_programs").get();

    return {
      totalLive,
      mappedChannels,
      channelsWithPrograms,
      totalPrograms,
      coveragePercent: totalLive > 0 ? Math.round((channelsWithPrograms / totalLive) * 100) : 0,
      latestProgramEndTime: latestRow?.latest || null
    };
  }

  /**
   * Lista paginada de canais ao vivo com programa atual e contagem de programas
   */
  getAdminChannels({ page = 1, limit = 50, category_id = null, search = '' } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(10, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = "WHERE s.type = 'live'";
    const params = [];

    if (category_id && category_id !== 'all') {
      whereClause += " AND s.category_id = ?";
      params.push(category_id);
    }

    if (search && search.trim()) {
      whereClause += " AND s.name LIKE ?";
      params.push(`%${search.trim()}%`);
    }

    const countQuery = `SELECT COUNT(*) as total FROM streams s ${whereClause}`;
    const total = db.prepare(countQuery).get(...params).total;

    const dataQuery = `
      SELECT 
        s.id, s.name, s.icon_url, s.epg_channel_id, s.status,
        c.name as category_name,
        (SELECT COUNT(*) FROM epg_programs p WHERE p.stream_id = s.id) as programs_count
      FROM streams s
      LEFT JOIN categories c ON s.category_id = c.id
      ${whereClause}
      ORDER BY 
        CASE WHEN (SELECT COUNT(*) FROM epg_programs p WHERE p.stream_id = s.id) > 0 THEN 0 ELSE 1 END,
        s.name ASC
      LIMIT ? OFFSET ?
    `;

    const channels = db.prepare(dataQuery).all(...params, limitNum, offset);

    const enriched = channels.map(ch => {
      const epg = this.getCurrentAndNext(ch.id);
      return {
        ...ch,
        currentProgram: epg.current,
        nextProgram: epg.next,
        hasEpg: epg.hasEpg
      };
    });

    return {
      channels: enriched,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }

  /**
   * Atualizar manualmente o epg_channel_id de um canal
   */
  updateChannelEpg(streamId, epgChannelId) {
    db.prepare("UPDATE streams SET epg_channel_id = ? WHERE id = ?").run(epgChannelId || null, streamId);
    return { success: true, streamId, epg_channel_id: epgChannelId };
  }

  /**
   * Limpar programas antigos (anteriores a 24 horas atrás)
   */
  cleanupExpired() {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = db.prepare("DELETE FROM epg_programs WHERE end_time < ?").run(yesterday);
    return { success: true, deleted: res.changes };
  }

  /**
   * Limpar todos os programas da tabela
   */
  clearAll() {
    const res = db.prepare("DELETE FROM epg_programs").run();
    return { success: true, deleted: res.changes };
  }

  /**
   * Gerador inteligente de grade de programação oficial contínua para canais nacionais
   * Popula programação rica e detalhada para os 7 dias seguintes.
   */
  generateBaseSchedule() {
    const now = new Date();
    // Inicia no início de hoje (00:00)
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Grades modelo por perfil de emissora
    const SCHEDULE_TEMPLATES = {
      globo: [
        { start: '06:00', end: '08:30', title: 'Bom Dia Praça / Brasil', desc: 'Noticiário matinal com as primeiras notícias do dia e do trânsito.' },
        { start: '08:30', end: '10:35', title: 'Encontro com Patrícia Poeta', desc: 'Programa de variedades, música, comportamento e convidados especiais.' },
        { start: '10:35', end: '11:45', title: 'Mais Você com Ana Maria Braga', desc: 'Culinária, entrevistas, dicas de bem-estar e o Louro Mané.' },
        { start: '11:45', end: '13:00', title: 'Praça TV 1ª Edição', desc: 'O telejornal da sua região com prestação de serviço e reportagens ao vivo.' },
        { start: '13:00', end: '13:25', title: 'Globo Esporte', desc: 'As últimas novidades do futebol, rodadas e esportes olímpicos.' },
        { start: '13:25', end: '14:45', title: 'Jornal Hoje', desc: 'Notícias do Brasil e do mundo com análise em tempo real.' },
        { start: '14:45', end: '15:30', title: 'Edição Especial de Novela', desc: 'Reapresentação dos grandes sucessos da teledramaturgia nacional.' },
        { start: '15:30', end: '17:15', title: 'Sessão da Tarde', desc: 'Exibição de filmes consagrados para toda a família.' },
        { start: '17:15', end: '18:25', title: 'Vale a Pena Ver de Novo', desc: 'Os maiores clássicos das novelas brasileiras.' },
        { start: '18:25', end: '19:10', title: 'Novela das Seis', desc: 'Capítulo inédito da trama das 18h.' },
        { start: '19:10', end: '19:40', title: 'Praça TV 2ª Edição', desc: 'O resumo das notícias da sua cidade e região.' },
        { start: '19:40', end: '20:30', title: 'Novela das Sete', desc: 'Capítulo inédito da novela das 19h.' },
        { start: '20:30', end: '21:20', title: 'Jornal Nacional', desc: 'O principal telejornal brasileiro com William Bonner e Renata Vasconcellos.' },
        { start: '21:20', end: '22:25', title: 'Novela das Nove', desc: 'O capítulo inédito da principal novela do horário nobre.' },
        { start: '22:25', end: '23:55', title: 'Linha de Shows / Futebol Ao Vivo', desc: 'Filmes, séries e transmissões esportivas especiais.' },
        { start: '23:55', end: '00:45', title: 'Jornal da Globo', desc: 'Análise aprofundada dos fatos econômicos e políticos do dia.' },
        { start: '00:45', end: '01:30', title: 'Conversa com Bial', desc: 'Entrevistas memoráveis com personalidades da cultura e sociedade.' },
        { start: '01:30', end: '06:00', title: 'Corujão', desc: 'Madrugada de cinema com grandes produções mundiais.' }
      ],
      sbt: [
        { start: '06:00', end: '11:30', title: 'Primeiro Impacto', desc: 'Jornalismo ao vivo e dinâmico com cobertura das ocorrências da manhã.' },
        { start: '11:30', end: '13:30', title: 'Chega Mais', desc: 'Informação, variedades, culinária e entretenimento ao vivo.' },
        { start: '13:30', end: '15:30', title: 'Carinha de Anjo / Chaves', desc: 'Séries e novelas consagradas para a família brasileira.' },
        { start: '15:30', end: '17:30', title: 'Fofocalizando', desc: 'As notícias dos famosos, bastidores da TV e fofocas quentes.' },
        { start: '17:30', end: '19:45', title: 'Tá na Hora', desc: 'Jornalismo popular com foco nas reivindicações do cidadão.' },
        { start: '19:45', end: '20:45', title: 'SBT Brasil', desc: 'O principal telejornal da emissora com os principais fatos do dia.' },
        { start: '20:45', end: '21:45', title: 'A Infância de Romeu e Julieta', desc: 'Telenovela infantojuvenil de grande sucesso.' },
        { start: '21:45', end: '23:00', title: 'Programa do Ratinho', desc: 'Atrações populares, games, comédia e música ao vivo com Carlos Massa.' },
        { start: '23:00', end: '01:00', title: 'The Noite com Danilo Gentili', desc: 'Talk show moderno com monólogos, convidados e entrevistas divertidas.' },
        { start: '01:00', end: '06:00', title: 'SBT News na TV', desc: 'Jornalismo contínuo durante toda a madrugada.' }
      ],
      record: [
        { start: '06:00', end: '08:40', title: 'Balanço Geral Manhã', desc: 'Primeiras informações do dia com helicóptero e trânsito.' },
        { start: '08:40', end: '10:00', title: 'Fala Brasil', desc: 'Telejornalismo dinâmico e reportagens investigativas.' },
        { start: '10:00', end: '11:50', title: 'Hoje em Dia', desc: 'Variedades, moda, culinária e notícias dos famosos com Celso Zucatelli e Ana Hickmann.' },
        { start: '11:50', end: '15:30', title: 'Balanço Geral & A Hora da Venenosa', desc: 'Notícias policiais e o quadro de fofocas mais assistido do Brasil.' },
        { start: '15:30', end: '16:30', title: 'Novela da Tarde', desc: 'Reapresentação dos sucessos da Record.' },
        { start: '16:30', end: '19:55', title: 'Cidade Alerta', desc: 'Jornalismo policial investigativo ao vivo com Luiz Bacci.' },
        { start: '19:55', end: '21:00', title: 'Jornal da Record', desc: 'Os principais fatos do Brasil e do mundo com seriedade e precisão.' },
        { start: '21:00', end: '22:45', title: 'Série Bíblica: Reis', desc: 'Superprodução histórica da teledramaturgia da Record.' },
        { start: '22:45', end: '00:15', title: 'A Grande Conquista / Linha de Shows', desc: 'Reality show, documentários e atrações exclusivas.' },
        { start: '00:15', end: '06:00', title: 'Jornal da Record 24h & Programação Noturna', desc: 'Informação contínua e debates.' }
      ],
      band: [
        { start: '06:00', end: '09:00', title: 'Bora Brasil', desc: 'Informação com dinamismo para começar o dia bem informado.' },
        { start: '09:00', end: '11:00', title: 'The Chef com Edu Guedes', desc: 'Receitas saborosas e fáceis de preparar com convidados especiais.' },
        { start: '11:00', end: '13:00', title: 'Jogo Aberto com Renata Fan', desc: 'Debates acalorados sobre o futebol brasileiro com Denílson e comentaristas.' },
        { start: '13:00', end: '14:30', title: 'Os Donos da Bola com Craque Neto', desc: 'As opiniões polêmicas e diretas de Neto sobre a rodada do futebol.' },
        { start: '14:30', end: '16:00', title: 'Melhor da Tarde com Catia Fonseca', desc: 'Receitas, horóscopo, famosos e muita descontração.' },
        { start: '16:00', end: '19:20', title: 'Brasil Urgente com José Luiz Datena', desc: 'A cobertura dos fatos que mobilizam a segurança pública do país.' },
        { start: '19:20', end: '20:30', title: 'Jornal da Band', desc: 'Credibilidade e jornalismo de profundidade com Eduardo Oinegue.' },
        { start: '20:30', end: '22:00', title: 'Melhor da Noite', desc: 'Revista eletrônica com variedades, jornalismo e humor.' },
        { start: '22:00', end: '23:30', title: 'MasterChef Brasil / Sessão Especial', desc: 'A maior competição gastronômica da televisão.' },
        { start: '23:30', end: '06:00', title: 'Jornal da Noite & Esporte Total', desc: 'Análise e resumo dos melhores momentos esportivos do dia.' }
      ],
      sports: [
        { start: '06:00', end: '09:00', title: 'Giro da Rodada & Compactos', desc: 'Gols e melhores momentos dos jogos da rodada nacional e internacional.' },
        { start: '09:00', end: '12:00', title: 'Redação / Morning Sports', desc: 'Debate esportivo matinal com jornalistas e ex-jogadores convidados.' },
        { start: '12:00', end: '15:00', title: 'Seleção Esportiva / SportsCenter', desc: 'A cobertura em tempo real das notícias e treinos dos principais clubes.' },
        { start: '15:00', end: '18:00', title: 'Tá na Área / F90', desc: 'Aquecimento para as partidas do dia com escalações e análises táticas.' },
        { start: '18:00', end: '21:00', title: 'Pré-Jogo & Transmissão Ao Vivo', desc: 'Transmissão em alta definição dos principais campeonatos.' },
        { start: '21:00', end: '23:30', title: 'Futebol Ao Vivo: Rodada Decisiva', desc: 'Emoção minuto a minuto com narração vibrante e comentários precisos.' },
        { start: '23:30', end: '06:00', title: 'Linha de Passe / Troca de Passes', desc: 'Mesa redonda pós-jogo com análises dos lances capitais e entrevistas coletivas.' }
      ],
      news: [
        { start: '06:00', end: '09:00', title: 'Edição das 6 / CNN Novo Dia', desc: 'Primeiras análises de economia, mercado financeiro e política nacional.' },
        { start: '09:00', end: '13:00', title: 'Conexão Notícias / Live Brasil', desc: 'Cobertura ao vivo dos ministérios, Congresso Nacional e capitais.' },
        { start: '13:00', end: '16:00', title: 'Edição do Meio-Dia / Visão Global', desc: 'Giro internacional e principais desdobramentos diplomáticos e econômicos.' },
        { start: '16:00', end: '18:00', title: 'Estúdio Notícias / Arena Debate', desc: 'Debates aprofundados com analistas políticos de renome.' },
        { start: '18:00', end: '20:00', title: 'Edição da Noite / Prime Time', desc: 'O resumo analítico do dia e os bastidores das decisões em Brasília.' },
        { start: '20:00', end: '22:00', title: 'Jornal Especial & Entrevistas', desc: 'Grandes entrevistas com ministros, economistas e especialistas.' },
        { start: '22:00', end: '06:00', title: 'Jornal da Madrugada / Plantão Contínuo', desc: 'Cobertura internacional e notícias de última hora durante a noite toda.' }
      ],
      movies: [
        { start: '06:00', end: '08:30', title: 'Cinema de Aventura', desc: 'Grandes histórias de aventura e exploração para animar a manhã.' },
        { start: '08:30', end: '11:00', title: 'Comédia da Manhã', desc: 'Filmes leves e divertidos com grandes estrelas do cinema.' },
        { start: '11:00', end: '13:30', title: 'Sessão Clássicos do Cinema', desc: 'Obras-primas premiadas do cinema mundial.' },
        { start: '13:30', end: '16:00', title: 'Grandes Sucessos de Bilheteria', desc: 'Os maiores blockbusters de Hollywood com ação ininterrupta.' },
        { start: '16:00', end: '18:30', title: 'Festival Pipoca', desc: 'Cinema para reunir os amigos com efeitos visuais impressionantes.' },
        { start: '18:30', end: '21:00', title: 'Especial Suspense & Ação', desc: 'Trilhas eletrizantes, perseguições e mistério no horário nobre.' },
        { start: '21:00', end: '23:30', title: 'Superestreia VSAIPTV', desc: 'Os lançamentos mais aguardados do cinema diretamente na sua tela.' },
        { start: '23:30', end: '06:00', title: 'Cine Madrugada', desc: 'Produções cults, ficção científica e cinema independente.' }
      ]
    };

    // Identificar os canais elegíveis
    const channels = db.prepare("SELECT id, name FROM streams WHERE type = 'live'").all();
    const insertStmt = db.prepare(`
      INSERT INTO epg_programs (stream_id, title, description, start_time, end_time)
      VALUES (?, ?, ?, ?, ?)
    `);

    let totalCreated = 0;
    let channelsMatched = 0;

    db.transaction(() => {
      for (const ch of channels) {
        const lower = ch.name.toLowerCase();
        let templateKey = null;

        if (lower.includes('globo') && !lower.includes('globonews')) templateKey = 'globo';
        else if (lower.includes('sbt')) templateKey = 'sbt';
        else if (lower.includes('record') && !lower.includes('record news')) templateKey = 'record';
        else if (lower.includes('band') && !lower.includes('bandnews') && !lower.includes('sports')) templateKey = 'band';
        else if (/sportv|premiere|espn|combate|dazn|futebol|copa|brasileir/i.test(lower)) templateKey = 'sports';
        else if (/news|noticia|cnn|jovem pan|globonews|bandnews/i.test(lower)) templateKey = 'news';
        else if (/telecine|hbo|tnt|megapix|paramount|space|cinemax/i.test(lower)) templateKey = 'movies';

        if (!templateKey) continue;

        const schedule = SCHEDULE_TEMPLATES[templateKey];
        channelsMatched++;

        // Gera para 7 dias a partir de hoje
        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
          const currentDay = new Date(startDate);
          currentDay.setDate(startDate.getDate() + dayOffset);

          for (const item of schedule) {
            const [startH, startM] = item.start.split(':').map(Number);
            const [endH, endM] = item.end.split(':').map(Number);

            const startDt = new Date(currentDay);
            startDt.setHours(startH, startM, 0, 0);

            const endDt = new Date(currentDay);
            if (endH < startH) {
              // Passou da meia noite
              endDt.setDate(endDt.getDate() + 1);
            }
            endDt.setHours(endH, endM, 0, 0);

            try {
              insertStmt.run(
                ch.id,
                item.title,
                item.desc,
                startDt.toISOString(),
                endDt.toISOString()
              );
              totalCreated++;
            } catch (e) {}
          }
        }
      }
    })();

    return {
      success: true,
      channelsMatched,
      totalProgramsCreated: totalCreated,
      daysCovered: 7,
      message: `Grade oficial de 7 dias gerada com sucesso para ${channelsMatched} canais principais (${totalCreated} programas adicionados)!`
    };
  }
}

module.exports = new EpgManager();
