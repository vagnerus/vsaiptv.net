/**
 * progressSyncManager — Gerenciador Inteligente de Sincronização de Progresso
 * - Throttle de 10-15s durante reprodução contínua
 * - Salvamento imediato em pause, ended, unmount, visibilitychange e pagehide
 * - Envio com keepalive: true e fallback para navigator.sendBeacon
 * - Fila offline com sincronização automática no evento 'online'
 * - Identificador único de sessão para resolução de conflitos multi-dispositivo
 */

class ProgressSyncManager {
  constructor() {
    this.currentSessionId = this.generateSessionId();
    this.activePayload = null;
    this.throttleTimer = null;
    this.lastSavedPosition = null;
    this.lastSaveTimestamp = 0;
    this.isFlushing = false;
    this.THROTTLE_INTERVAL_MS = 12000; // 12 segundos

    this.initOfflineHandler();
  }

  generateSessionId() {
    return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  startNewSession() {
    this.currentSessionId = this.generateSessionId();
    this.lastSavedPosition = null;
    this.lastSaveTimestamp = 0;
    return this.currentSessionId;
  }

  getSessionId() {
    return this.currentSessionId;
  }

  getToken() {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('iptv_token');
  }

  // Inicializa o ouvinte de rede para reenviar fila quando a conexão voltar
  initOfflineHandler() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => {
      this.drainOfflineQueue();
    });
  }

  // Adiciona progresso não enviado na fila offline (localStorage)
  enqueueOffline(payload) {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('vsa_pending_progress') || '[]';
      let queue = JSON.parse(raw);
      if (!Array.isArray(queue)) queue = [];

      // Substitui item anterior do mesmo stream/episódio para evitar fila inchada
      queue = queue.filter(
        (item) => !(item.contentId === payload.contentId && item.episodeId === payload.episodeId)
      );
      queue.push({ ...payload, timestamp: Date.now() });

      // Limita fila a no máximo 20 itens
      if (queue.length > 20) queue = queue.slice(-20);
      localStorage.setItem('vsa_pending_progress', JSON.stringify(queue));
    } catch {
      // Ignora erro de cota de storage
    }
  }

  // Esvazia a fila offline enviando ao backend
  async drainOfflineQueue() {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem('vsa_pending_progress');
    if (!raw) return;

    try {
      const queue = JSON.parse(raw);
      if (!Array.isArray(queue) || queue.length === 0) return;

      localStorage.removeItem('vsa_pending_progress');
      const token = this.getToken();
      if (!token) return;

      for (const item of queue) {
        try {
          await fetch(`/api/watch-progress/${item.contentId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(item)
          });
        } catch {
          // Re-enfileira se falhar
          this.enqueueOffline(item);
        }
      }
    } catch {
      // Falha ao processar fila
    }
  }

  /**
   * Atualiza o progresso em buffer com throttle inteligente (10-15s)
   */
  updateProgress(payload) {
    if (!payload || !payload.contentId) return;

    this.activePayload = {
      ...payload,
      sessionId: this.currentSessionId,
    };

    const now = Date.now();
    const elapsedSinceLastSave = now - this.lastSaveTimestamp;

    // Se já passou o tempo de throttle, salva
    if (elapsedSinceLastSave >= this.THROTTLE_INTERVAL_MS) {
      this.flushImmediate();
    } else if (!this.throttleTimer) {
      // Caso contrário, programa próximo envio
      this.throttleTimer = setTimeout(() => {
        this.throttleTimer = null;
        this.flushImmediate();
      }, this.THROTTLE_INTERVAL_MS - elapsedSinceLastSave);
    }
  }

  /**
   * Força o envio imediato do progresso (em pause, ended, unmount ou fechamento)
   */
  async flushImmediate(keepalive = false) {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }

    if (!this.activePayload) return;
    const payload = { ...this.activePayload };

    // Evita chamadas redundantes para a mesma posição se não houver mudança significativa
    if (
      this.lastSavedPosition !== null &&
      Math.abs(this.lastSavedPosition - payload.position) < 2 &&
      !payload.completed
    ) {
      return;
    }

    this.lastSavedPosition = payload.position;
    this.lastSaveTimestamp = Date.now();

    const token = this.getToken();
    if (!token) return;

    const url = `/api/watch-progress/${payload.contentId}?token=${encodeURIComponent(token)}`;
    const bodyStr = JSON.stringify(payload);

    // Se a página estiver sendo descarregada ou especificado keepalive
    if (keepalive && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      try {
        const blob = new Blob([bodyStr], { type: 'application/json' });
        const sent = navigator.sendBeacon(url, blob);
        if (sent) return;
      } catch {
        // fallback para fetch com keepalive
      }
    }

    try {
      await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: bodyStr,
        keepalive: Boolean(keepalive)
      });
    } catch {
      // Fallback offline se a rede falhou
      this.enqueueOffline(payload);
    }
  }

  /**
   * Consulta o progresso atual de um conteúdo no servidor
   */
  async getProgress(contentId, episodeId = null) {
    const token = this.getToken();
    if (!token || !contentId) return null;

    try {
      let url = `/api/watch-progress/${contentId}`;
      if (episodeId) url += `?episodeId=${episodeId}`;

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * Remove / oculta o progresso de "Continuar Assistindo"
   */
  async removeProgress(contentId, episodeId = null) {
    const token = this.getToken();
    if (!token || !contentId) return false;

    try {
      let url = `/api/watch-progress/${contentId}`;
      if (episodeId) url += `?episodeId=${episodeId}`;

      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Obtém a preferência de "Continuar Automaticamente"
   */
  getAutoResumePreference() {
    if (typeof window === 'undefined') return false;
    const pref = localStorage.getItem('vsa_auto_resume');
    return pref === 'true';
  }

  /**
   * Salva a preferência de "Continuar Automaticamente"
   */
  setAutoResumePreference(enabled) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('vsa_auto_resume', enabled ? 'true' : 'false');
  }
}

export const progressSyncManager = new ProgressSyncManager();
export default progressSyncManager;
