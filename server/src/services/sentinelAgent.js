const eventBus = require('./agentEventBus');
const actionEngine = require('./actionEngine');
const db = require('../db/database');

/**
 * SentinelAgent — Agente Operacional 24h & Auto-Healing Determinístico
 * Monitora erros do player, APIs e streams.
 * Tenta autorrecuperação determinística com circuit-breaker sem desperdiçar LLM.
 */
class SentinelAgent {
  constructor() {
    this.maxRecoveryAttempts = 3;
    this.sessionRecoveryCounts = new Map(); // sessionId/userId -> { count, lastAttempt, state }
    this.init();
  }

  init() {
    // Escuta eventos operacionais no barramento
    const operationalEvents = [
      'PLAYER_STALLED',
      'HLS_FATAL_ERROR',
      'STREAM_TIMEOUT',
      'MANIFEST_ERROR',
      'SEGMENT_ERROR',
      'API_TIMEOUT',
      'API_5XX',
      'IMAGE_FAILURE',
      'BACKEND_UNHEALTHY'
    ];

    operationalEvents.forEach((evtType) => {
      eventBus.on(evtType, (event) => this.handleOperationalEvent(event));
    });

    // Limpeza de histórico a cada 10 minutos
    setInterval(() => this.cleanupSessions(), 10 * 60 * 1000).unref();
  }

  isAutoHealEnabled() {
    try {
      const setting = db.prepare("SELECT value FROM system_settings WHERE key = 'sentinel_auto_heal'").get();
      return setting ? setting.value === 'true' : true;
    } catch (e) {
      return true;
    }
  }

  async handleOperationalEvent(event) {
    if (!this.isAutoHealEnabled()) {
      return; // Kill-switch ativo
    }

    const sessionKey = event.sessionId || `user_${event.userId}` || `stream_${event.streamId}`;
    const now = Date.now();

    let record = this.sessionRecoveryCounts.get(sessionKey);
    if (!record || (now - record.lastAttempt > 60000)) {
      record = { count: 0, lastAttempt: now, initialStreamId: event.streamId };
    }

    record.count += 1;
    record.lastAttempt = now;
    this.sessionRecoveryCounts.set(sessionKey, record);

    const runId = this.startAgentRun('SentinelAgent', event.type, event.correlationId);

    // DETERMINÍSTICO PRIMEIRO:
    // Tentativa 1: recoverMedia (buffer flush / currentTime seek)
    // Tentativa 2: reloadManifest (recarregar manifest HLS)
    // Tentativa 3: authorizedFailover (tentar stream alternativo ou via proxy limpo)
    // > 3: Circuit breaker -> Abrir incidente
    if (record.count <= this.maxRecoveryAttempts) {
      let actionToExecute = 'RECOVER_MEDIA';
      if (record.count === 2) actionToExecute = 'RELOAD_MANIFEST';
      if (record.count === 3) actionToExecute = 'FAILOVER_STREAM';

      try {
        const result = await actionEngine.executeAction('recoverPlayer', {
          action: actionToExecute,
          streamId: event.streamId,
          userId: event.userId
        }, 'sentinel');

        this.finishAgentRun(runId, 'recovered', 1, `Auto-healing determinístico (${actionToExecute}) acionado. Tentativa ${record.count}/${this.maxRecoveryAttempts}`);

        // Emite instrução de volta pelo barramento para o cliente conectado
        eventBus.emit('SENTINEL_RECOVERY_INSTRUCTION', {
          targetSessionId: event.sessionId,
          targetUserId: event.userId,
          instruction: actionToExecute,
          attempt: record.count,
          streamId: event.streamId
        });

      } catch (err) {
        this.finishAgentRun(runId, 'failed', 0, `Falha na ação determinística: ${err.message}`);
      }
    } else {
      // Limite de tentativas atingido -> Circuit breaker e abertura de incidente
      this.finishAgentRun(runId, 'escalated', 0, `Circuit breaker acionado após ${this.maxRecoveryAttempts} tentativas.`);

      try {
        // Registra erro no log de erros do sistema
        db.prepare(`
          INSERT INTO system_error_logs (error_type, content_id, error_message, user_id)
          VALUES ('SENTINEL_CIRCUIT_BREAKER', ?, ?, ?)
        `).run(
          event.streamId || null,
          `Falha persistente após auto-recovery: ${event.type}. Contexto: ${JSON.stringify(event.sanitizedContext)}`,
          event.userId || null
        );

        // Se houver usuário associado, escala para a fila de suporte
        if (event.userId) {
          await actionEngine.executeAction('createSupportIncident', {
            userId: event.userId,
            subject: `Falha técnica persistente na reprodução (${event.type})`,
            priority: 'P2',
            diagnostics: {
              event,
              attempts: record.count,
              reason: 'Sentinela não conseguiu recuperar automaticamente'
            }
          }, 'sentinel');
        }
      } catch (incidentErr) {
        console.error('[SentinelAgent] Erro ao abrir incidente:', incidentErr.message);
      }
    }
  }

  startAgentRun(agent, trigger, correlationId) {
    try {
      const res = db.prepare(`
        INSERT INTO agent_runs (agent, trigger, started_at, status, correlation_id)
        VALUES (?, ?, CURRENT_TIMESTAMP, 'running', ?)
      `).run(agent, trigger, correlationId || null);
      return res.lastInsertRowid;
    } catch (e) {
      return null;
    }
  }

  finishAgentRun(runId, status, actionsCount, result) {
    if (!runId) return;
    try {
      db.prepare(`
        UPDATE agent_runs 
        SET status = ?, finished_at = CURRENT_TIMESTAMP, actions_count = ?, result = ?
        WHERE id = ?
      `).run(status, actionsCount, result, runId);
    } catch (e) {}
  }

  cleanupSessions() {
    const now = Date.now();
    for (const [key, val] of this.sessionRecoveryCounts.entries()) {
      if (now - val.lastAttempt > 15 * 60 * 1000) {
        this.sessionRecoveryCounts.delete(key);
      }
    }
  }
}

const sentinelInstance = new SentinelAgent();
module.exports = sentinelInstance;
