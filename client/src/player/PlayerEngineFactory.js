import { TVCapabilityDetector } from '../platform/capabilities';
import { HlsJsEngine } from './engines/HlsJsEngine';
import { NativeHlsEngine } from './engines/NativeHlsEngine';
import { Html5Engine } from './engines/Html5Engine';
import { TizenAVPlayEngine } from './engines/TizenAVPlayEngine';

/**
 * PlayerEngineFactory — Seleciona e instancia a melhor engine disponível
 * baseando-se em testes de capacidade e formato do fluxo, com cadeia de fallback.
 */
export class PlayerEngineFactory {
  static create(videoElement, sourceUrl, options = {}) {
    const caps = TVCapabilityDetector.detect();
    const urlLower = (sourceUrl || '').toLowerCase();
    const isM3u8 = urlLower.includes('.m3u8') || options.type === 'live';

    // 1. Se for Samsung com AVPlay habilitado especificamente
    if (caps.nativePlayerAvailable && caps.tvPlatform === 'tizen' && options.preferNative) {
      return new TizenAVPlayEngine(videoElement, options);
    }

    // 2. Se for fluxo HLS (.m3u8 ou live)
    if (isM3u8) {
      if (caps.supportsHlsJs) {
        return new HlsJsEngine(videoElement, {
          ...options,
          performanceTier: caps.performanceClass
        });
      }
      if (caps.supportsNativeHLS) {
        return new NativeHlsEngine(videoElement, options);
      }
    }

    // 3. Se o navegador tiver HLS nativo (Safari, Smart TVs com WebKit nativo)
    if (caps.supportsNativeHLS) {
      return new NativeHlsEngine(videoElement, options);
    }

    // 4. Fallback padrão para HTML5 Video
    return new Html5Engine(videoElement, options);
  }
}
