import { PlayerEngine } from '../PlayerEngine';

/**
 * NativeHlsEngine — Reprodução de HLS nativo através da tag <video>
 * Essencial para navegadores baseados em WebKit antigo ou Safari sem MSE
 */
export class NativeHlsEngine extends PlayerEngine {
  async load(sourceUrl) {
    this.destroy();
    this.isDestroyed = false;

    if (!this.video) {
      throw new Error('Elemento de vídeo não encontrado.');
    }

    return new Promise((resolve, reject) => {
      let resolved = false;

      const onLoadedMetadata = () => {
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

      const onError = (e) => {
        cleanup();
        const err = this.video ? this.video.error : e;
        const msg = err ? `Erro nativo de playback: código ${err.code}` : 'Falha ao carregar HLS nativo';
        this.emit('error', { type: 'native-hls-error', detail: msg });
        if (!resolved) {
          resolved = true;
          reject(new Error(msg));
        }
      };

      const cleanup = () => {
        this.video.removeEventListener('loadedmetadata', onLoadedMetadata);
        this.video.removeEventListener('error', onError);
      };

      this.video.addEventListener('loadedmetadata', onLoadedMetadata);
      this.video.addEventListener('error', onError);

      this.video.src = sourceUrl;
      this.video.load();
    });
  }

  getQualityLevels() {
    // No HLS nativo via tag <video>, o ABR é gerenciado pelo pipeline interno do sistema
    return [{ index: -1, name: 'Automático (Nativo)' }];
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
