/**
 * TVCapabilityDetector — VSAIPTV Universal Smart TV
 * 
 * Detecta recursos, codecs, capacidades de hardware e APIs específicas
 * de Smart TVs e navegadores web com graceful degradation e progressive enhancement.
 * Nunca bloqueia o dispositivo apenas por falta de identificação de marca.
 */

export class TVCapabilityDetector {
  static detect() {
    const isBrowser = typeof window !== 'undefined';
    if (!isBrowser) {
      return this.getDefaultCapabilities();
    }

    const nav = window.navigator || {};
    const ua = (nav.userAgent || '').toLowerCase();
    const video = document.createElement('video');

    // 1. Detecção de MSE e formatos de mídia
    const supportsMSE = typeof window.MediaSource !== 'undefined' || typeof window.WebKitMediaSource !== 'undefined';
    
    let supportsNativeHLS = false;
    let supportsNativeDash = false;
    try {
      const hlsCheck1 = video.canPlayType('application/vnd.apple.mpegurl');
      const hlsCheck2 = video.canPlayType('application/x-mpegURL');
      supportsNativeHLS = (hlsCheck1 === 'probably' || hlsCheck1 === 'maybe' || hlsCheck2 === 'probably' || hlsCheck2 === 'maybe');

      const dashCheck = video.canPlayType('application/dash+xml');
      supportsNativeDash = (dashCheck === 'probably' || dashCheck === 'maybe');
    } catch {
      supportsNativeHLS = false;
      supportsNativeDash = false;
    }

    // 2. Detecção de APIs de tela e controle
    const doc = window.document || {};
    const supportsFullscreen = Boolean(
      doc.fullscreenEnabled ||
      doc.webkitFullscreenEnabled ||
      doc.mozFullScreenEnabled ||
      doc.msFullscreenEnabled ||
      video.webkitSupportsFullscreen
    );

    const supportsPiP = Boolean(
      doc.pictureInPictureEnabled &&
      typeof video.requestPictureInPicture === 'function'
    );

    const supportsMediaSession = Boolean(
      'mediaSession' in nav &&
      nav.mediaSession
    );

    // 3. Workers & WebAssembly
    const supportsWebWorkers = typeof window.Worker !== 'undefined';
    const supportsWebAssembly = typeof window.WebAssembly !== 'undefined';

    // 4. Storage
    let supportsLocalStorage = false;
    try {
      const testKey = '__iptv_cap_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      supportsLocalStorage = true;
    } catch {
      supportsLocalStorage = false;
    }

    const supportsIndexedDB = Boolean(window.indexedDB);

    // 5. Detecção de HDR (High Dynamic Range) e Espaço de Cores Amplo (Wide Color Gamut)
    let supportsHDR = false;
    let colorGamut = 'srgb';
    let hdrType = 'sdr';

    if (window.matchMedia) {
      const hasHighDynamicRange = window.matchMedia('(dynamic-range: high)').matches ||
                                  window.matchMedia('(video-dynamic-range: high)').matches;
      const hasRec2020 = window.matchMedia('(color-gamut: rec2020)').matches;
      const hasP3 = window.matchMedia('(color-gamut: p3)').matches;

      if (hasRec2020) colorGamut = 'rec2020';
      else if (hasP3) colorGamut = 'p3';

      if (hasHighDynamicRange) {
        supportsHDR = true;
        hdrType = hasRec2020 ? 'hdr10' : 'hlg';
      }
    }

    // Detecção de decodificação HEVC / H.265 (essencial para HDR em 4K)
    let supportsHEVC = false;
    try {
      const hevcCheck1 = video.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"');
      const hevcCheck2 = video.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"');
      supportsHEVC = (hevcCheck1 === 'probably' || hevcCheck1 === 'maybe' || hevcCheck2 === 'probably' || hevcCheck2 === 'maybe');
    } catch {
      supportsHEVC = false;
    }

    // 6. Entradas (Touch, Pointer, Teclado, D-Pad)
    const maxTouchPoints = nav.maxTouchPoints || 0;
    const supportsTouch = maxTouchPoints > 0 || 'ontouchstart' in window;
    const hasCoarsePointer = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false;
    const hasFinePointer = window.matchMedia ? window.matchMedia('(pointer: fine)').matches : true;
    const supportsPointer = Boolean(window.PointerEvent && hasFinePointer);

    // 6. Plataforma e APIs proprietárias
    const tizenApi = Boolean(window.tizen || window.webapis);
    const webOSApi = Boolean(window.webOS || window.webOSDev || window.PalmSystem);
    const hasAndroidTvSignal = ua.includes('android tv') || ua.includes('googletv') || ua.includes('smart-tv') || ua.includes('mibox') || (ua.includes('android') && !supportsTouch && !hasFinePointer);
    const hasVidaaSignal = ua.includes('vidaa') || ua.includes('hisense');
    const hasRokuSignal = ua.includes('roku');

    let tvPlatform = null;
    if (tizenApi || ua.includes('tizen') || ua.includes('samsung')) {
      tvPlatform = 'tizen';
    } else if (webOSApi || ua.includes('web0s') || ua.includes('webos') || ua.includes('netcast') || ua.includes('lg netcast')) {
      tvPlatform = 'webos';
    } else if (hasAndroidTvSignal || ua.includes('android tv') || ua.includes('google tv')) {
      tvPlatform = 'androidtv';
    } else if (hasVidaaSignal) {
      tvPlatform = 'vidaa';
    } else if (hasRokuSignal) {
      tvPlatform = 'roku';
    } else if (ua.includes('smarttv') || ua.includes('smart-tv') || ua.includes('appletv') || ua.includes('vizio') || ua.includes('philips') || ua.includes('bravia')) {
      tvPlatform = 'generic';
    }

    // 7. Estimativa de Hardware / Memória / Desempenho
    const deviceMemory = nav.deviceMemory || null; // GiB
    const cpuCores = nav.hardwareConcurrency || 2;
    
    let memoryClass = 'medium';
    let performanceClass = 'medium';

    if (deviceMemory) {
      if (deviceMemory <= 1) memoryClass = 'low';
      else if (deviceMemory >= 4) memoryClass = 'high';
      else memoryClass = 'medium';
    } else if (tvPlatform === 'tizen' || tvPlatform === 'webos' || tvPlatform === 'vidaa') {
      // Browsers de TV comumente têm restrição de RAM
      memoryClass = 'low';
    }

    if (memoryClass === 'low' || cpuCores <= 2) {
      performanceClass = 'low';
    } else if (cpuCores >= 6 && (!deviceMemory || deviceMemory >= 4)) {
      performanceClass = 'high';
    }

    // 8. Classificação de Dispositivo
    let deviceType = 'desktop';
    if (tvPlatform !== null) {
      deviceType = 'tv';
    } else if (supportsTouch && !hasFinePointer) {
      const minDimension = Math.min(window.screen.width, window.screen.height);
      deviceType = minDimension >= 600 ? 'tablet' : 'mobile';
    } else {
      deviceType = 'desktop';
    }

    // 9. Player nativo proprietário disponível
    const nativePlayerAvailable = Boolean(
      (window.webapis && window.webapis.avplay) || // Samsung AVPlay
      (window.webOS && window.webOS.service)      // LG webOS Media Service
    );

    return {
      deviceType,
      tvPlatform,
      browserEngine: this.detectBrowserEngine(ua),
      supportsMSE,
      supportsNativeHLS,
      supportsHlsJs: supportsMSE, // hls.js exige MSE
      supportsDASH: supportsNativeDash,
      supportsFullscreen,
      supportsPiP,
      supportsMediaSession,
      supportsWebWorkers,
      supportsWebAssembly,
      supportsPointer,
      supportsTouch,
      supportsKeyboard: true,
      supportsDPad: Boolean(tvPlatform !== null || !hasFinePointer),
      supportsLocalStorage,
      supportsIndexedDB,
      supportsHDR,
      colorGamut,
      hdrType,
      supportsHEVC,
      memoryClass,
      performanceClass,
      nativePlayerAvailable,
      screenResolution: {
        width: window.screen ? window.screen.width : 1920,
        height: window.screen ? window.screen.height : 1080,
        pixelRatio: window.devicePixelRatio || 1
      }
    };
  }

  static detectBrowserEngine(ua) {
    if (ua.includes('chrome') || ua.includes('crios') || ua.includes('blink')) return 'blink';
    if (ua.includes('safari') && !ua.includes('chrome')) return 'webkit';
    if (ua.includes('firefox')) return 'gecko';
    if (ua.includes('edge') || ua.includes('edg/')) return 'blink';
    return 'other';
  }

  static getDefaultCapabilities() {
    return {
      deviceType: 'desktop',
      tvPlatform: null,
      browserEngine: 'other',
      supportsMSE: true,
      supportsNativeHLS: false,
      supportsHlsJs: true,
      supportsDASH: false,
      supportsFullscreen: true,
      supportsPiP: false,
      supportsMediaSession: false,
      supportsWebWorkers: true,
      supportsWebAssembly: true,
      supportsPointer: true,
      supportsTouch: false,
      supportsKeyboard: true,
      supportsDPad: false,
      supportsLocalStorage: true,
      supportsIndexedDB: true,
      supportsHDR: false,
      colorGamut: 'srgb',
      hdrType: 'sdr',
      supportsHEVC: false,
      memoryClass: 'medium',
      performanceClass: 'medium',
      nativePlayerAvailable: false,
      screenResolution: { width: 1920, height: 1080, pixelRatio: 1 }
    };
  }
}
