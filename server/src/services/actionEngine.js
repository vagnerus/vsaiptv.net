const db = require('../db/database');
const healthCenter = require('./healthCenter');

/**
 * ActionEngine — Registro e Execução Segura de Ferramentas dos Agentes
 * Garante RBAC, sanitização, proibição de ações destrutivas e auditoria.
 */
class ActionEngine {
  constructor() {
    this.registry = new Map();
    this.registerDefaultActions();
  }

  register(actionName, definition) {
    this.registry.set(actionName, definition);
  }

  registerDefaultActions() {
    // 1. Busca no Catálogo (Real)
    this.register('searchCatalog', {
      description: 'Busca conteúdos reais (canais ao vivo, filmes, séries) no catálogo do VSAIPTV',
      roles: ['support', 'sentinel', 'admin', 'user'],
      parameters: {
        query: { type: 'string', description: 'Termo de busca (título, gênero ou nome)' },
        type: { type: 'string', enum: ['all', 'live', 'movie', 'series'], default: 'all' },
        limit: { type: 'number', default: 5 }
      },
      execute: async ({ query, type = 'all', limit = 5 }) => {
        if (!query || typeof query !== 'string') return { results: [] };
        const cleanQuery = `%${query.trim().toLowerCase()}%`;
        const lim = Math.min(Math.max(1, parseInt(limit) || 5), 10);

        let sql = `
          SELECT s.id, s.name, s.type, s.icon_url, s.poster_url, s.rating, s.release_date, c.name as category_name
          FROM streams s
          LEFT JOIN categories c ON s.category_id = c.id
          WHERE LOWER(s.name) LIKE ?
        `;
        const params = [cleanQuery];

        if (type && type !== 'all' && ['live', 'movie', 'series'].includes(type)) {
          sql += ` AND s.type = ?`;
          params.push(type);
        }

        sql += ` ORDER BY s.rating DESC, s.name ASC LIMIT ?`;
        params.push(lim);

        const rows = db.prepare(sql).all(...params);
        return {
          count: rows.length,
          query,
          results: rows.map(r => ({
            id: r.id,
            name: r.name,
            type: r.type,
            category: r.category_name || 'Geral',
            poster: r.poster_url || r.icon_url || '',
            rating: r.rating || '8.0',
            year: r.release_date || ''
          }))
        };
      }
    });

    // 2. Detalhes de Conteúdo
    this.register('getContentDetails', {
      description: 'Obtém detalhes de um canal, filme ou série por ID',
      roles: ['support', 'sentinel', 'admin', 'user'],
      parameters: {
        id: { type: 'number', description: 'ID do conteúdo' }
      },
      execute: async ({ id }) => {
        if (!id) return { error: 'ID do conteúdo é obrigatório' };
        const stream = db.prepare(`
          SELECT s.*, c.name as category_name 
          FROM streams s 
          LEFT JOIN categories c ON s.category_id = c.id 
          WHERE s.id = ?
        `).get(Number(id));

        if (!stream) return { error: 'Conteúdo não encontrado' };

        let episodes = [];
        if (stream.type === 'series') {
          episodes = db.prepare(`
            SELECT id, season_num, episode_num, title, duration_minutes 
            FROM series_episodes 
            WHERE series_id = ? 
            ORDER BY season_num ASC, episode_num ASC LIMIT 30
          `).all(stream.id);
        }

        return {
          id: stream.id,
          name: stream.name,
          type: stream.type,
          category: stream.category_name,
          description: stream.description,
          rating: stream.rating,
          release_date: stream.release_date,
          status: stream.status,
          episodes_count: episodes.length,
          episodes
        };
      }
    });

    // 3. Diagnóstico do Player e Conexão
    this.register('getPlayerDiagnostics', {
      description: 'Analisa o estado da sessão de reprodução, falhas recentes e conectividade',
      roles: ['support', 'sentinel', 'admin'],
      parameters: {
        userId: { type: 'number' },
        streamId: { type: 'number' }
      },
      execute: async ({ userId, streamId }) => {
        let activeConn = null;
        if (userId) {
          activeConn = db.prepare(`
            SELECT stream_id, ip_address, device_type, connected_at, last_ping_at, bytes_transferred
            FROM active_connections 
            WHERE user_id = ? 
            ORDER BY last_ping_at DESC LIMIT 1
          `).get(Number(userId));
        }

        let recentErrors = [];
        if (userId || streamId) {
          recentErrors = db.prepare(`
            SELECT error_type, content_name, error_message, http_status, created_at 
            FROM system_error_logs 
            WHERE (user_id = ? OR content_id = ?) 
            ORDER BY created_at DESC LIMIT 5
          `).all(userId || -1, streamId || -1);
        }

        return {
          sessionActive: Boolean(activeConn),
          activeConnection: activeConn || null,
          recentErrorsCount: recentErrors.length,
          recentErrors,
          timestamp: new Date().toISOString()
        };
      }
    });

    // 4. Ação de Recuperação Segura do Player
    this.register('recoverPlayer', {
      description: 'Instrui a recuperação determinística do player (flush buffer, reload manifest ou failover)',
      roles: ['support', 'sentinel', 'admin'],
      parameters: {
        action: { type: 'string', enum: ['RELOAD_MANIFEST', 'RECOVER_MEDIA', 'FAILOVER_STREAM'] },
        streamId: { type: 'number' },
        userId: { type: 'number' }
      },
      execute: async ({ action = 'RECOVER_MEDIA', streamId, userId }) => {
        const approvedActions = ['RELOAD_MANIFEST', 'RECOVER_MEDIA', 'FAILOVER_STREAM'];
        if (!approvedActions.includes(action)) {
          return { success: false, error: 'Ação de recuperação não autorizada.' };
        }

        // Registrar auditoria da recuperação
        db.prepare(`
          INSERT INTO audit_logs (user_id, action, details) 
          VALUES (?, 'SAFE_PLAYER_RECOVERY', ?)
        `).run(userId || null, JSON.stringify({ action, streamId }));

        return {
          success: true,
          action,
          recommendedInstruction: action,
          message: `Comando seguro de recuperação emitido: ${action}`
        };
      }
    });

    // 5. Saúde Geral da API & Serviços
    this.register('checkApiHealth', {
      description: 'Verifica o status de saúde da infraestrutura VSAIPTV',
      roles: ['support', 'sentinel', 'admin'],
      parameters: {},
      execute: async () => {
        return await healthCenter.getSystemHealth();
      }
    });

    // 6. Reportar Conteúdo Quebrado
    this.register('reportBrokenContent', {
      description: 'Registra reporte de canal/filme quebrado para análise técnica do Master',
      roles: ['support', 'sentinel', 'admin', 'user'],
      parameters: {
        streamId: { type: 'number' },
        reason: { type: 'string' }
      },
      execute: async ({ streamId, reason }) => {
        if (!streamId) return { error: 'streamId é obrigatório' };
        db.prepare(`
          UPDATE streams SET health_status = 'broken', health_last_checked = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(Number(streamId));

        db.prepare(`
          INSERT INTO system_error_logs (error_type, content_id, error_message)
          VALUES ('STREAM_REPORTED_BROKEN', ?, ?)
        `).run(Number(streamId), reason || 'Reportado pelo usuário via suporte');

        return { success: true, message: 'Canal sinalizado para verificação técnica.' };
      }
    });

    // 7. Criar/Escalar Chamado para Suporte Humano
    this.register('createSupportIncident', {
      description: 'Cria ou escala um chamado para a equipe técnica no painel Master',
      roles: ['support', 'sentinel', 'admin', 'user'],
      parameters: {
        userId: { type: 'number' },
        subject: { type: 'string' },
        priority: { type: 'string', enum: ['P1', 'P2', 'P3', 'P4'] },
        diagnostics: { type: 'object' }
      },
      execute: async ({ userId, subject = 'Suporte Solicitado', priority = 'P3', diagnostics = {} }) => {
        if (!userId) return { error: 'userId obrigatório para criar chamado' };

        const userExists = db.prepare("SELECT id FROM users WHERE id = ?").get(Number(userId));
        if (!userExists) {
          return { success: false, error: 'Usuário inexistente para associar chamado.' };
        }

        // Verifica se já tem chamado aberto em andamento
        let conv = db.prepare(`
          SELECT id, status, mode FROM support_conversations 
          WHERE user_id = ? AND status NOT IN ('RESOLVED', 'CLOSED') 
          ORDER BY updated_at DESC LIMIT 1
        `).get(Number(userId));

        if (conv) {
          db.prepare(`
            UPDATE support_conversations 
            SET mode = 'HUMAN', status = 'WAITING_ADMIN', priority = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(priority, conv.id);
        } else {
          const res = db.prepare(`
            INSERT INTO support_conversations (user_id, status, priority, mode, subject) 
            VALUES (?, 'WAITING_ADMIN', ?, 'HUMAN', ?)
          `).run(Number(userId), priority, subject);
          conv = { id: res.lastInsertRowid, mode: 'HUMAN', status: 'WAITING_ADMIN' };
        }

        // Salva snapshot de diagnóstico se fornecido
        if (diagnostics && Object.keys(diagnostics).length > 0) {
          db.prepare(`
            INSERT INTO support_diagnostics (conversation_id, snapshot_json) 
            VALUES (?, ?)
          `).run(conv.id, JSON.stringify(diagnostics));
        }

        return {
          success: true,
          conversationId: conv.id,
          mode: 'HUMAN',
          status: 'WAITING_ADMIN',
          message: 'Chamado escalado para a Central Dev com sucesso.'
        };
      }
    });

    // 8. Consultar Progresso do Próprio Usuário ("Onde eu parei?")
    this.register('getMyWatchProgress', {
      description: 'Consulta onde o próprio usuário autenticado parou de assistir (filmes ou episódios recentes).',
      roles: ['support', 'user', 'admin'],
      parameters: {
        userId: { type: 'number', description: 'ID do usuário autenticado' },
        contentName: { type: 'string', description: 'Nome aproximado do filme ou série (opcional)' }
      },
      execute: async ({ userId, contentName }) => {
        if (!userId) return { error: 'Usuário não autenticado' };

        let sql = `
          SELECT 
            up.stream_id,
            up.episode_id,
            up.type,
            up.progress_time,
            up.duration,
            up.progress_percent,
            up.completed,
            up.last_watched,
            s.name as title,
            ep.title as episode_title,
            ep.season_num,
            ep.episode_num
          FROM user_progress up
          JOIN streams s ON up.stream_id = s.id
          LEFT JOIN series_episodes ep ON up.episode_id = ep.id
          WHERE up.user_id = ? AND up.is_removed = 0
        `;
        const params = [Number(userId)];

        if (contentName && typeof contentName === 'string') {
          sql += ` AND LOWER(s.name) LIKE ?`;
          params.push(`%${contentName.trim().toLowerCase()}%`);
        }

        sql += ` ORDER BY up.last_watched DESC LIMIT 5`;

        const rows = db.prepare(sql).all(...params);
        if (!rows || rows.length === 0) {
          return { message: 'Nenhum histórico recente de reprodução encontrado para você.' };
        }

        const formatTime = (secs) => {
          const h = Math.floor(secs / 3600);
          const m = Math.floor((secs % 3600) / 60);
          const s = Math.floor(secs % 60);
          if (h > 0) return `${h}h ${m < 10 ? '0' : ''}${m}m ${s < 10 ? '0' : ''}${s}s`;
          return `${m}m ${s < 10 ? '0' : ''}${s}s`;
        };

        return {
          count: rows.length,
          items: rows.map(r => ({
            streamId: r.stream_id,
            title: r.title,
            type: r.type,
            episode: r.episode_num ? `Temporada ${r.season_num || 1}, Episódio ${r.episode_num}${r.episode_title ? ' - ' + r.episode_title : ''}` : null,
            stoppedAt: formatTime(r.progress_time),
            progressPercent: `${r.progress_percent || 0}%`,
            completed: Boolean(r.completed),
            lastWatched: r.last_watched
          }))
        };
      }
    });
  }

  /**
   * Executa uma ferramenta com validação rigorosa de RBAC e bloqueio de comandos destrutivos
   */
  async executeAction(actionName, params = {}, agentRole = 'support') {
    const actionDef = this.registry.get(actionName);
    if (!actionDef) {
      throw new Error(`Ação [${actionName}] não registrada no ActionEngine.`);
    }

    if (actionDef.roles && !actionDef.roles.includes(agentRole) && agentRole !== 'master') {
      throw new Error(`Permissão negada: o agente '${agentRole}' não tem permissão para '${actionName}'.`);
    }

    // Regra Final: Nunca permitir execução arbitrária de shell ou SQL direto por agentes
    const forbiddenPatterns = ['drop', 'truncate', 'delete from users', 'rm -rf', 'exec', 'system'];
    const paramStr = JSON.stringify(params).toLowerCase();
    for (const p of forbiddenPatterns) {
      if (paramStr.includes(p)) {
        throw new Error(`Tentativa de comando destrutivo bloqueada pelo ActionEngine.`);
      }
    }

    try {
      const result = await actionDef.execute(params);
      return result;
    } catch (err) {
      console.error(`[ActionEngine] Erro ao executar [${actionName}]:`, err.message);
      return { error: err.message };
    }
  }

  getToolsDefinitions() {
    const defs = [];
    for (const [name, def] of this.registry.entries()) {
      defs.push({
        type: 'function',
        function: {
          name,
          description: def.description,
          parameters: {
            type: 'object',
            properties: def.parameters,
            required: Object.entries(def.parameters)
              .filter(([_, v]) => v.required)
              .map(([k, _]) => k)
          }
        }
      });
    }
    return defs;
  }
}

const actionEngineInstance = new ActionEngine();
module.exports = actionEngineInstance;
