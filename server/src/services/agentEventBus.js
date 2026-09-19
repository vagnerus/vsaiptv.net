const EventEmitter = require('events');
const crypto = require('crypto');
const db = require('../db/database');

/**
 * AgentEventBus — Barramento de Eventos Central do VSAIPTV
 * Normaliza telemetria de player, API e segurança.
 * Filtra dados sensíveis e correlaciona incidentes globais.
 */
class AgentEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    // Janela deslizante para correlação de incidentes: key -> Array of timestamps { timestamp, userId, sessionId }
    this.incidentWindows = new Map();
    // Limpeza periódica de janelas antigas
    setInterval(() => this.cleanupSlidingWindows(), 60000).unref();
  }

  /**
   * Sanitiza contexto para garantir que nenhuma credencial ou segredo vaze
   */
  sanitizeContext(context) {
    if (!context || typeof context !== 'object') return {};

    const sensitiveKeys = [
      'password', 'plain_password', 'password_hash', 'token', 'jwt',
      'authorization', 'cookie', 'secret', 'api_key', 'card', 'cvv',
      'credit_card', 'pass', 'auth_token'
    ];

    const clean = {};
    for (const [k, v] of Object.entries(context)) {
      const lower = k.toLowerCase();
      if (sensitiveKeys.some(s => lower.includes(s))) {
        clean[k] = '[REDACTED]';
      } else if (typeof v === 'object' && v !== null) {
        clean[k] = this.sanitizeContext(v);
      } else if (typeof v === 'string' && v.length > 2000) {
        clean[k] = v.substring(0, 2000) + '... [TRUNCATED]';
      } else {
        clean[k] = v;
      }
    }
    return clean;
  }

  /**
   * Publica um evento normalizado
   */
  publish(rawEvent) {
    if (!rawEvent || !rawEvent.type) {
      return null;
    }

    const eventId = rawEvent.id || `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const correlationId = rawEvent.correlationId || `corr_${crypto.randomBytes(6).toString('hex')}`;

    const normalized = {
      id: eventId,
      type: String(rawEvent.type).toUpperCase(),
      severity: rawEvent.severity || 'info', // 'info' | 'warn' | 'error' | 'critical'
      source: rawEvent.source || 'system',
      userId: rawEvent.userId || null,
      sessionId: rawEvent.sessionId || null,
      deviceId: rawEvent.deviceId || null,
      streamId: rawEvent.streamId || null,
      timestamp: rawEvent.timestamp ? new Date(rawEvent.timestamp).toISOString() : new Date().toISOString(),
      sanitizedContext: this.sanitizeContext(rawEvent.context || rawEvent.sanitizedContext || {}),
      correlationId
    };

    // Detecção de anomalias/incidentes globais em streams ou endpoints
    this.correlateGlobalIncidents(normalized);

    // Emite no barramento interno
    this.emit(normalized.type, normalized);
    this.emit('*', normalized);

    return normalized;
  }

  /**
   * Correlaciona incidentes globais (ex: múltiplos usuários com erro no mesmo stream/origem)
   */
  correlateGlobalIncidents(event) {
    if (!['STREAM_TIMEOUT', 'HLS_FATAL_ERROR', 'API_5XX', 'SEGMENT_ERROR'].includes(event.type)) {
      return;
    }

    const streamKey = event.streamId || event.sanitizedContext?.streamId || event.sanitizedContext?.targetHost || 'generic_source';
    const now = Date.now();
    const windowMs = 3 * 60 * 1000; // 3 minutos

    if (!this.incidentWindows.has(streamKey)) {
      this.incidentWindows.set(streamKey, []);
    }

    const entries = this.incidentWindows.get(streamKey);
    entries.push({ timestamp: now, userId: event.userId, sessionId: event.sessionId });

    // Filtrar apenas eventos dentro da janela
    const recent = entries.filter(e => now - e.timestamp <= windowMs);
    this.incidentWindows.set(streamKey, recent);

    // Se >= 5 ocorrências de usuários/sessões distintas
    const uniqueUsers = new Set(recent.map(r => r.userId || r.sessionId)).size;
    if (uniqueUsers >= 5) {
      this.triggerGlobalIncident(streamKey, event, uniqueUsers);
    }
  }

  triggerGlobalIncident(sourceKey, triggerEvent, affectedCount) {
    try {
      const code = `INC-${Date.now().toString().slice(-6)}`;
      const title = `Incidente Global: Falha recorrente em ${sourceKey} (${triggerEvent.type})`;

      // Verifica se já existe incidente ativo recente para esta origem
      const existing = db.prepare(
        "SELECT id, incident_code, affected_count FROM agent_global_incidents WHERE source = ? AND status = 'ACTIVE'"
      ).get(String(sourceKey));

      if (existing) {
        db.prepare(
          "UPDATE agent_global_incidents SET affected_count = ?, details = ? WHERE id = ?"
        ).run(
          Math.max(existing.affected_count, affectedCount),
          JSON.stringify({ lastEvent: triggerEvent.type, time: new Date().toISOString() }),
          existing.id
        );
      } else {
        db.prepare(
          "INSERT INTO agent_global_incidents (incident_code, title, source, affected_count, status, details) VALUES (?, ?, ?, ?, 'ACTIVE', ?)"
        ).run(
          code,
          title,
          String(sourceKey),
          affectedCount,
          JSON.stringify({ triggerEvent, initialTime: new Date().toISOString() })
        );

        this.emit('GLOBAL_INCIDENT_DETECTED', {
          code,
          source: sourceKey,
          affectedCount,
          triggerEvent
        });
      }
    } catch (err) {
      console.error('[AgentEventBus] Erro ao registrar incidente global:', err.message);
    }
  }

  cleanupSlidingWindows() {
    const now = Date.now();
    const windowMs = 5 * 60 * 1000;
    for (const [key, entries] of this.incidentWindows.entries()) {
      const filtered = entries.filter(e => now - e.timestamp <= windowMs);
      if (filtered.length === 0) {
        this.incidentWindows.delete(key);
      } else {
        this.incidentWindows.set(key, filtered);
      }
    }
  }
}

const eventBusInstance = new AgentEventBus();
module.exports = eventBusInstance;
