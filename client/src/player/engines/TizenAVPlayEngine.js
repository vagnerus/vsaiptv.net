import { PlayerEngine } from '../PlayerEngine';

/**
 * TizenAVPlayEngine — Adapter para a API Samsung AVPlay (Tizen Smart TV)
 * Utilizado apenas quando window.webapis.avplay existir fisicamente na TV.
 */
export class TizenAVPlayEngine extends PlayerEngine {
  constructor(videoElement, options = {}) {
    super(videoElement, options);
    this.avplay = typeof window !== 'undefined' && window.webapis ? window.webapis.avplay : null;
    this.isPrepared = false;
  }

  async load(sourceUrl) {
    this.destroy();
    this.isDestroyed = false;

    if (!this.avplay) {
      throw new Error('Samsung AVPlay não está disponível neste dispositivo.');
    }

    return new Promise((resolve, reject) => {
      try {
        this.avplay.open(sourceUrl);

        const listener = {
          onbufferingstart: () => {
            this.emit('buffering', { isBuffering: true });
          },
          onbufferingprogress: (percent) => {
            this.emit('buffering', { isBuffering: true, percent });
          },
          onbufferingcomplete: () => {
            this.emit('buffering', { isBuffering: false });
          },
          oncurrentplaytime: (currentTime) => {
            this.currentTime = currentTime / 1000;
          },
          onerror: (errorType) => {
            this.emit('error', { type: 'avplay-error', detail: errorType });
          },
          onevent: (eventType, _eventData) => {
            if (eventType === 'PLAYER_EVENT_BITRATE_CHANGE') {
              this.emit('qualitychange', {});
            }
          },
          onstreamcompleted: () => {
            this.emit('ended');
          }
        };

        this.avplay.setListener(listener);

        // Define posição de renderização conforme o container/vídeo
        if (this.video) {
          const rect = this.video.getBoundingClientRect();
          this.avplay.setDisplayRect(rect.left, rect.top, rect.width, rect.height);
        }

        this.avplay.prepareAsync(() => {
          this.isPrepared = true;
          this.emit('ready', {
            levels: this.getQualityLevels(),
            tracks: this.getTracks()
          });
          resolve();
        }, (err) => {
          reject(new Error(err ? err.message : 'Falha no prepareAsync do AVPlay'));
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  play() {
    if (this.avplay && this.isPrepared) {
      try {
        this.avplay.play();
        this.emit('playing');
      } catch {
        // Ignore
      }
    }
  }

  pause() {
    if (this.avplay && this.isPrepared) {
      try {
        this.avplay.pause();
        this.emit('pause');
      } catch {
        // Ignore
      }
    }
  }

  seek(seconds) {
    if (this.avplay && this.isPrepared) {
      try {
        this.avplay.seekTo(seconds * 1000);
      } catch {
        // Ignore
      }
    }
  }

  getCurrentTime() {
    if (this.avplay && this.isPrepared) {
      try {
        return this.avplay.getCurrentTime() / 1000;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  getDuration() {
    if (this.avplay && this.isPrepared) {
      try {
        return this.avplay.getDuration() / 1000;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  destroy() {
    if (this.avplay) {
      try {
        this.avplay.stop();
        this.avplay.close();
      } catch {
        // Ignore
      }
      this.isPrepared = false;
    }
    super.destroy();
  }
}
