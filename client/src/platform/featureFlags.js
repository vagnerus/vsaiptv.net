import { DeviceProfile } from './deviceProfile';

/**
 * FeatureFlags — Centralização de diretivas de recursos da plataforma
 */
export class FeatureFlags {
  static getFlags() {
    const profile = DeviceProfile.getProfile();
    const isTV = profile.category === 'tv';
    const isLowTier = profile.performanceTier === 'low';

    return {
      enablePiP: profile.capabilities.supportsPiP && !isTV,
      enableAnimations: !isLowTier,
      enableNativePlayer: profile.capabilities.nativePlayerAvailable,
      enableHlsJs: profile.capabilities.supportsHlsJs,
      enableDiagnostics: true, // Acessível em TVs e Web para depuração/suporte
      enablePrefetch: !isLowTier && !isTV, // Evita sobrecarga de memória na TV
      enableSpatialNavigation: isTV || profile.inputMode === 'remote',
      enableHighContrastFocus: isTV,
      enableAggressiveMemoryCleanup: isTV || isLowTier,
      overscanSafeMargin: isTV ? '4%' : '0'
    };
  }
}
