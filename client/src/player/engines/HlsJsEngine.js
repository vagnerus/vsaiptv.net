import Hls from 'hls.js';
import { PlayerEngine } from '../PlayerEngine';

/**
 * HlsJsEngine — Engine baseada em MSE + hls.js
 * Otimizada com limites de buffer para Smart TVs com pouca memória
 */
export class HlsJsEngine extends PlayerEngine {
  constructor(videoElement, options = {}) {
    super(videoElement, options);
    this.hls = null;
    this.isLowTier = options.performanceTier === 'low';
  }

  async load(sourceUrl, options = {}) {
    this.destroy();
    this.isDestroyed = false;

    if (!Hls.isSupported()) {
      throw new Error('Hls.js não é suportado pelo navegador.');
    }

    const isLive = options.type === 'live';

    // Configuração com buffer contido para TVs com baixa RAM
    const config = {
      enableWorker: !this.isLowTier, // Desativa WebWorkers se device for muito limitado
      maxBufferLength: isLive ? (this.isLowTier ? 6 : 12) : (this.isLowTier ? 15 : 30),
      maxMaxBufferLength: isLive ? (this.isLowTier ? 12 : 20) : (this.isLowTier ? 30 : 60),
      maxBufferSize: this.isLowTier ? 15 * 1000 * 1000 : 40 * 1000 * 1000, // 15MB em low, 40MB em high
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 6,
      fragLoadingTimeOut: 15000,
      manifestLoadingTimeOut: 15000,
      fragLoadingMaxRetry: 4,
      manifestLoadingMaxRetry: 3,
      backBufferLength: this.isLowTier ? 5 : 15 // Libera buffer antigo rapidamente da memória
    };

    this.hls = new Hls(config);
    this.hls.attachMedia(this.video);

    return new Promise((resolve, reject) => {
      let resolved = false;

      this.hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        this.hls.loadSource(sourceUrl);
      });

      this.hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        if (!resolved) {
          resolved = true;
          this.emit('ready', {
            levels: this.getQualityLevels(),
            tracks: this.getTracks()
          });
          resolve();
        }
      });

      this.hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        this.emit('qualitychange', { levelIndex: data.level });
      });

      this.hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => {
        this.emit('trackchange', { trackId: data.id });
      });

      this.hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              this.emit('error', { type: 'network', details: data.details, fatal: true });
              this.hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              this.emit('error', { type: 'media', details: data.details, fatal: true });
              this.hls.recoverMediaError();
              break;
            default:
              this.emit('error', { type: 'fatal', details: data.details, fatal: true });
              if (!resolved) {
                resolved = true;
                reject(new Error(data.details));
              }
              break;
          }
        }
      });
    });
  }

  getQualityLevels() {
    if (!this.hls || !this.hls.levels) return [];
    return this.hls.levels.map((lvl, index) => {
      const isHdr = lvl.videoRange === 'PQ' ||
                    lvl.videoRange === 'HLG' ||
                    (lvl.attrs && (lvl.attrs['VIDEO-RANGE'] === 'PQ' || lvl.attrs['VIDEO-RANGE'] === 'HLG')) ||
                    (lvl.attrs?.CODECS && (lvl.attrs.CODECS.includes('dvh1') || lvl.attrs.CODECS.includes('dvhe')));

      let baseName = lvl.height ? `${lvl.height}p` : `Nível ${index + 1}`;
      if (isHdr) baseName += ' HDR';

      return {
        index,
        width: lvl.width,
        height: lvl.height,
        bitrate: lvl.bitrate,
        isHdr: Boolean(isHdr),
        videoRange: lvl.videoRange || (lvl.attrs ? lvl.attrs['VIDEO-RANGE'] : null),
        name: baseName
      };
    });
  }

  setQuality(qualityIndex) {
    if (!this.hls) return;
    this.hls.currentLevel = qualityIndex; // -1 é Auto (ABR)
  }

  getTracks() {
    if (!this.hls || !this.hls.audioTracks) return [];
    return this.hls.audioTracks.map((tr) => ({
      id: tr.id,
      name: tr.name || tr.lang || `Áudio ${tr.id + 1}`,
      lang: tr.lang
    }));
  }

  setTrack(trackId) {
    if (this.hls && typeof trackId === 'number') {
      this.hls.audioTrack = trackId;
    }
  }

  destroy() {
    if (this.hls) {
      try {
        this.hls.stopLoad();
        this.hls.detachMedia();
        this.hls.destroy();
      } catch {
        // Ignora erros ao desmontar
      }
      this.hls = null;
    }
    super.destroy();
  }
}
