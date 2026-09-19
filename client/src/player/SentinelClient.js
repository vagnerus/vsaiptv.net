/**
 * SentinelClient — Cliente de Telemetria e Auto-Recuperação do Player
 * Integração frontend do player com o Agente Sentinela do VSAIPTV.
 */
class SentinelClient {
  constructor() {
    this.activeSessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.recoveryAttempts = 0;
    this.maxLocalAttempts = 3;
    this.lastReportTime = 0;
  }

  /**
   * Envia evento para o barramento via endpoint ou WebSocket
   */
  reportEvent(type, context = {}, streamId = null) {
    const now = Date.now();
    // Previne envio em rajada de eventos idênticos (cooldown de 1.5s)
    if (now - this.lastReportTime < 1500 && this.lastEventType === type) {
      return;
    }
    this.lastReportTime = now;
    this.lastEventType = type;

    const token = localStorage.getItem('iptv_token');
    if (!token) return;

    const payload = {
      type,
      streamId,
      sessionId: this.activeSessionId,
      timestamp: new Date().toISOString(),
      context: {
        userAgent: navigator.userAgent,
        url: window.location.href,
        ...context
      }
    };

    fetch('/api/client/player/error', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        errorType: type,
        streamId,
        details: payload
      })
    }).catch(() => {});
  }

  /**
   * Executa recuperação determinística local no elemento de vídeo e HLS
   */
  executeDeterministicRecovery(videoEl, hlsInstance, sourceUrl) {
    this.recoveryAttempts += 1;

    if (this.recoveryAttempts === 1) {
      // Tentativa 1: Avanço suave para desengasgar buffer
      if (videoEl && !isNaN(videoEl.currentTime)) {
        try {
          videoEl.currentTime += 0.2;
          videoEl.play().catch(() => {});
        } catch (e) {}
      }
      return { action: 'SEEK_OFFSET', attempt: 1 };
    }

    if (this.recoveryAttempts === 2) {
      // Tentativa 2: Recarregar manifest HLS
      if (hlsInstance && sourceUrl) {
        try {
          hlsInstance.recoverMediaError();
          hlsInstance.loadSource(sourceUrl);
          hlsInstance.startLoad();
        } catch (e) {}
      }
      return { action: 'HLS_RELOAD', attempt: 2 };
    }

    if (this.recoveryAttempts === 3) {
      // Tentativa 3: Reiniciar vídeo
      if (videoEl) {
        try {
          videoEl.load();
          videoEl.play().catch(() => {});
        } catch (e) {}
      }
      return { action: 'VIDEO_RELOAD', attempt: 3 };
    }

    return { action: 'CIRCUIT_BREAKER_MAX_ATTEMPTS', attempt: this.recoveryAttempts };
  }

  resetAttempts() {
    this.recoveryAttempts = 0;
  }
}

export const sentinelClient = new SentinelClient();
