import { TVCapabilityDetector } from './capabilities';

/**
 * DeviceProfile — VSAIPTV Universal Smart TV
 * Consolida a identidade, limitações e perfil operacional do dispositivo
 */
export class DeviceProfile {
  static getProfile() {
    const caps = TVCapabilityDetector.detect();
    const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '').toLowerCase() : '';

    let platform = caps.tvPlatform || 'web';
    let manufacturer = 'Generic';

    if (platform === 'tizen' || ua.includes('samsung') || ua.includes('tizen')) {
      manufacturer = 'Samsung';
    } else if (platform === 'webos' || ua.includes('lg') || ua.includes('webos')) {
      manufacturer = 'LG';
    } else if (ua.includes('sony') || ua.includes('bravia')) {
      manufacturer = 'Sony';
    } else if (ua.includes('tcl')) {
      manufacturer = 'TCL';
    } else if (ua.includes('philips')) {
      manufacturer = 'Philips';
    } else if (ua.includes('roku') || ua.includes('hisense') || platform === 'vidaa') {
      manufacturer = ua.includes('roku') ? 'Roku' : 'Hisense';
    } else if (ua.includes('firetv') || ua.includes('aft')) {
      manufacturer = 'Amazon';
      platform = 'firetv';
    } else if (ua.includes('apple') || ua.includes('macintosh') || ua.includes('iphone') || ua.includes('ipad')) {
      manufacturer = 'Apple';
    }

    let inputMode = 'mouse';
    if (caps.deviceType === 'tv' || caps.supportsDPad) {
      inputMode = 'remote';
    } else if (caps.supportsTouch && !caps.supportsPointer) {
      inputMode = 'touch';
    }

    // Seleção preliminar da melhor engine suportada
    let preferredPlayerEngine = 'html5';
    if (caps.nativePlayerAvailable && platform === 'tizen') {
      preferredPlayerEngine = 'avplay';
    } else if (caps.supportsHlsJs) {
      preferredPlayerEngine = 'hlsjs';
    } else if (caps.supportsNativeHLS) {
      preferredPlayerEngine = 'native-hls';
    }

    return {
      category: caps.deviceType,
      platform,
      manufacturer,
      inputMode,
      performanceTier: caps.performanceClass,
      preferredPlayerEngine,
      supportsHDR: caps.supportsHDR,
      hdrType: caps.hdrType,
      colorGamut: caps.colorGamut,
      capabilities: caps
    };
  }
}
