const eventBus = require('./agentEventBus');
const db = require('../db/database');

/**
 * SecurityAgent — Agente Defensivo 24h
 * Monitoramento contínuo contra brute-force, anomalias de JWT e ataques.
 * Executa APENAS ações defensivas autorizadas e reversíveis.
 * NUNCA executa ações destrutivas (excluir usuário, apagar banco, comandos shell).
 */
class SecurityAgent {
  constructor() {
    this.failureCountsByIp = new Map(); // ip -> { count, firstSeen, blockedUntil }
    this.init();
  }

  init() {
    const securityEvents = [
      'LOGIN_FAILED',
      'JWT_INVALID',
      'RATE_LIMIT_HIT',
      'UNAUTHORIZED_ADMIN_PROBE',
      'SESSION_ANOMALY',
      'SSRF_ATTEMPT'
    ];

    securityEvents.forEach((evtType) => {
      eventBus.on(evtType, (event) => this.handleSecurityEvent(event));
    });

    setInterval(() => this.cleanupIpTracking(), 10 * 60 * 1000).unref();
  }

  isAutoActionEnabled() {
    try {
      const setting = db.prepare("SELECT value FROM system_settings WHERE key = 'security_auto_action'").get();
      return setting ? setting.value === 'true' : true;
    } catch (e) {
      return true;
    }
  }

  async handleSecurityEvent(event) {
    const ip = event.sanitizedContext?.ip || event.sanitizedContext?.ip_address || 'unknown';
    const now = Date.now();

    const runId = this.startAgentRun('SecurityAgent', event.type, event.correlationId);

    // Registra evento no audit_logs
    try {
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, details, ip_address) 
        VALUES (?, ?, ?, ?)
      `).run(
        event.userId || null,
        `SECURITY_ALERT_${event.type}`,
        JSON.stringify(event.sanitizedContext || {}),
        ip !== 'unknown' ? ip : null
      );
    } catch (e) {}

    if (!this.isAutoActionEnabled()) {
      this.finishAgentRun(runId, 'success', 0, 'Alerta registrado em auditoria (Ações automáticas desligadas pelo Master).');
      return;
    }

    // Monitora Brute Force ou Probes Maliciosos
    if (ip && ip !== 'unknown' && ip !== '127.0.0.1' && ip !== '::1') {
      let tracker = this.failureCountsByIp.get(ip) || { count: 0, firstSeen: now };
      tracker.count += 1;
      this.failureCountsByIp.set(ip, tracker);

      // Limite: 8 falhas graves de segurança em 5 minutos -> Bloqueio defensivo temporário (Reversível)
      if (tracker.count >= 8) {
        try {
          const reason = `Bloqueio defensivo temporário pelo SecurityAgent (${event.type}: ${tracker.count} ocorrências)`;
          
          // Adiciona ou atualiza no firewall_rules existente
          db.prepare(`
            INSERT INTO firewall_rules (ip_address, rule_type, reason)
            VALUES (?, 'block', ?)
            ON CONFLICT(ip_address) DO UPDATE SET reason = excluded.reason
          `).run(ip, reason);

          this.finishAgentRun(runId, 'recovered', 1, `IP ${ip} bloqueado preventivamente no firewall por excesso de anomalias.`);
          
          eventBus.emit('SECURITY_ACTION_TAKEN', {
            action: 'TEMPORARY_FIREWALL_BLOCK',
            ip,
            reason
          });
          return;
        } catch (fwErr) {
          console.error('[SecurityAgent] Erro ao aplicar regra de firewall:', fwErr.message);
        }
      }
    }

    // Anomalia de Sessão: se token foi comprometido ou detectada duplicação concorrente não autorizada
    if (event.type === 'SESSION_ANOMALY' && event.sanitizedContext?.tokenHash) {
      try {
        db.prepare(`
          UPDATE user_devices 
          SET is_revoked = 1 
          WHERE token_hash = ?
        `).run(event.sanitizedContext.tokenHash);

        this.finishAgentRun(runId, 'recovered', 1, `Sessão comprometida revogada preventivamente.`);
        return;
      } catch (sessErr) {
        console.error('[SecurityAgent] Erro ao revogar sessão anômala:', sessErr.message);
      }
    }

    this.finishAgentRun(runId, 'success', 0, 'Evento analisado. Nenhuma ação defensiva imediata necessária.');
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

  cleanupIpTracking() {
    const now = Date.now();
    for (const [ip, data] of this.failureCountsByIp.entries()) {
      if (now - data.firstSeen > 15 * 60 * 1000) {
        this.failureCountsByIp.delete(ip);
      }
    }
  }
}

const securityInstance = new SecurityAgent();
module.exports = securityInstance;
