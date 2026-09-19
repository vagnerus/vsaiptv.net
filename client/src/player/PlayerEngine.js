/**
 * PlayerEngine — Contrato e classe base unificada de motor de reprodução
 * Desacopla a interface do player do motor subjacente (Hls.js, HTML5 nativo, AVPlay, etc.)
 */
export class PlayerEngine {
  constructor(videoElement, options = {}) {
    this.video = videoElement;
    this.options = options;
    this.listeners = new Map();
    this.isDestroyed = false;
  }

  // --- Sistema de Eventos Pub/Sub ---
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.isDestroyed) return;
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(data);
        } catch {
          // Proteção contra erro em handler de evento
        }
      });
    }
  }

  // --- Contrato do Player Engine ---
  async load(_sourceUrl, _options = {}) {
    throw new Error('Método load() deve ser implementado pela engine.');
  }

  play() {
    if (this.video) {
      return this.video.play().catch((err) => {
        this.emit('error', { type: 'play-failed', detail: err.message });
      });
    }
  }

  pause() {
    if (this.video) {
      this.video.pause();
    }
  }

  seek(seconds) {
    if (this.video && Number.isFinite(seconds)) {
      this.video.currentTime = Math.max(0, seconds);
    }
  }

  setVolume(value) {
    if (this.video) {
      this.video.volume = Math.max(0, Math.min(1, value));
    }
  }

  setMuted(muted) {
    if (this.video) {
      this.video.muted = Boolean(muted);
    }
  }

  getCurrentTime() {
    return this.video ? this.video.currentTime : 0;
  }

  getDuration() {
    return this.video ? this.video.duration || 0 : 0;
  }

  getBuffered() {
    if (!this.video || !this.video.buffered.length) return 0;
    try {
      return this.video.buffered.end(this.video.buffered.length - 1);
    } catch {
      return 0;
    }
  }

  getTracks() {
    return [];
  }

  getQualityLevels() {
    return [];
  }

  setQuality(_qualityIndex) {
    // Implementado nas subclasses
  }

  destroy() {
    this.isDestroyed = true;
    this.listeners.clear();
  }
}
