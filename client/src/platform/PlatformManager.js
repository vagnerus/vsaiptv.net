import { DeviceProfile } from './deviceProfile';
import { GenericTVAdapter } from './adapters/GenericTVAdapter';
import { TizenPlatformAdapter } from './adapters/TizenPlatformAdapter';
import { WebOSPlatformAdapter } from './adapters/WebOSPlatformAdapter';
import { AndroidTVAdapter } from './adapters/AndroidTVAdapter';
import { VidaaAdapter } from './adapters/VidaaAdapter';

/**
 * PlatformManager — Orquestrador de plataforma do VSAIPTV
 */
export class PlatformManager {
  static instance = null;

  static getInstance() {
    if (!PlatformManager.instance) {
      PlatformManager.instance = new PlatformManager();
    }
    return PlatformManager.instance;
  }

  constructor() {
    this.profile = DeviceProfile.getProfile();
    this.adapter = null;
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const platform = this.profile.platform;

    if (platform === 'tizen') {
      this.adapter = new TizenPlatformAdapter();
    } else if (platform === 'webos') {
      this.adapter = new WebOSPlatformAdapter();
    } else if (platform === 'androidtv' || platform === 'firetv') {
      this.adapter = new AndroidTVAdapter();
    } else if (platform === 'vidaa') {
      this.adapter = new VidaaAdapter();
    } else {
      this.adapter = new GenericTVAdapter();
    }

    if (this.adapter && typeof this.adapter.initialize === 'function') {
      this.adapter.initialize();
    }
  }

  getProfile() {
    return this.profile;
  }

  exit() {
    if (this.adapter && typeof this.adapter.exitApp === 'function') {
      this.adapter.exitApp();
    }
  }
}
