import { PlayerEngine } from '../PlayerEngine';

/**
 * Html5Engine — Reprodução direta de arquivos e fluxos compatíveis (MP4, WebM, etc.)
 */
export class Html5Engine extends PlayerEngine {
  async load(sourceUrl) {
    this.destroy();
    this.isDestroyed = false;

    if (!this.video) {
      throw new Error('Elemento de vídeo não inicializado.');
    }

    return new Promise((resolve, reject) => {
      let resolved = false;

      const onCanPlay = () => {
        cleanup();
        if (!resolved) {
          resolved = true;
          this.emit('ready', {
            levels: this.getQualityLevels(),
            tracks: this.getTracks()
          });
          resolve();
        }
      };

      const onError = () => {
        cleanup();
        const err = this.video ? this.video.error : null;
        const msg = err ? `Erro HTML5: código ${err.code}` : 'Falha na mídia HTML5';
        this.emit('error', { type: 'html5-error', detail: msg });
        if (!resolved) {
          resolved = true;
          reject(new Error(msg));
        }
      };

      const cleanup = () => {
        this.video.removeEventListener('canplay', onCanPlay);
        this.video.removeEventListener('error', onError);
      };

      this.video.addEventListener('canplay', onCanPlay);
      this.video.addEventListener('error', onError);

      this.video.src = sourceUrl;
      this.video.load();
    });
  }

  getQualityLevels() {
    return [{ index: -1, name: 'Original' }];
  }

  destroy() {
    if (this.video) {
      try {
        this.video.pause();
        this.video.removeAttribute('src');
        this.video.load();
      } catch {
        // Ignore
      }
    }
    super.destroy();
  }
}
