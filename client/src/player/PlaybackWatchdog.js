/**
 * PlaybackWatchdog — Monitor de stalls, reconexão resiliente e circuit breaker
 * Garante que a reprodução nunca trave indefinidamente e nunca entre em loops infinitos.
 */
export class PlaybackWatchdog {
  constructor({
    onStallDetected,
    onRecoverAttempt,
    onFailover,
    onFatalError,
    maxRetries = 5,
    fallbackUrls = []
  }) {
    this.onStallDetected = onStallDetected;
    this.onRecoverAttempt = onRecoverAttempt;
    this.onFailover = onFailover;
    this.onFatalError = onFatalError;
    this.maxRetries = maxRetries;
    this.fallbackUrls = fallbackUrls;
    this.fallbackIndex = 0;

    this.retryCount = 0;
    this.lastCurrentTime = 0;
    this.stalledSeconds = 0;
    this.watchdogTimer = null;
    this.isPaused = false;
    this.isSeeking = false;
    this.state = 'IDLE'; // IDLE, LOADING, BUFFERING, PLAYING, PAUSED, SEEKING, STALLED, RECOVERING, FAILOVER, ENDED, ERROR
  }

  start(getCurrentTimeFn, isPlayingFn) {
    this.stop();
    this.retryCount = 0;
    this.stalledSeconds = 0;
    this.state = 'LOADING';

    this.watchdogTimer = setInterval(() => {
      if (this.isPaused || this.isSeeking || this.state === 'ERROR' || this.state === 'ENDED') {
        return;
      }

      const isPlaying = isPlayingFn();
      const currentTime = getCurrentTimeFn();

      if (isPlaying) {
        // Se deveria estar tocando, mas o tempo não avançou há mais de 4 segundos
        if (Math.abs(currentTime - this.lastCurrentTime) < 0.2) {
          this.stalledSeconds += 1;
          if (this.stalledSeconds >= 4) {
            this.handleStall();
          }
        } else {
          this.stalledSeconds = 0;
          this.lastCurrentTime = currentTime;
          if (this.state !== 'PLAYING') {
            this.state = 'PLAYING';
            this.retryCount = 0; // Reseta após reprodução bem-sucedida
          }
        }
      }
    }, 1000);
  }

  handleStall() {
    this.stalledSeconds = 0;
    this.state = 'STALLED';
    if (this.onStallDetected) this.onStallDetected();

    this.triggerRecovery();
  }

  triggerRecovery() {
    this.retryCount += 1;

    if (this.retryCount > this.maxRetries) {
      // Tenta failover se houver URLs alternativas autorizadas
      if (this.fallbackUrls && this.fallbackIndex < this.fallbackUrls.length) {
        const nextUrl = this.fallbackUrls[this.fallbackIndex];
        this.fallbackIndex += 1;
        this.retryCount = 0;
        this.state = 'FAILOVER';
        if (this.onFailover) this.onFailover(nextUrl);
        return;
      }

      this.state = 'ERROR';
      this.stop();
      if (this.onFatalError) {
        this.onFatalError(new Error(`Falha irrecuperável após ${this.maxRetries} tentativas de recuperação.`));
      }
      return;
    }

    this.state = 'RECOVERING';
    
    // Backoff exponencial com jitter (500ms, 1s, 2s, 4s, 8s)
    const baseDelay = Math.min(8000, 500 * Math.pow(2, this.retryCount - 1));
    const jitter = Math.random() * 300;
    const delay = baseDelay + jitter;

    setTimeout(() => {
      if (this.onRecoverAttempt) {
        // Níveis de recuperação conforme FASE 27
        const step = this.retryCount === 1 ? 'light' : (this.retryCount <= 3 ? 'buffer' : 'reload');
        this.onRecoverAttempt({ step, attempt: this.retryCount, maxRetries: this.maxRetries });
      }
    }, delay);
  }

  setPaused(paused) {
    this.isPaused = paused;
    this.state = paused ? 'PAUSED' : 'PLAYING';
  }

  setSeeking(seeking) {
    this.isSeeking = seeking;
    this.stalledSeconds = 0;
  }

  stop() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }
}
