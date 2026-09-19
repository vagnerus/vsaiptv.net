/**
 * WebOSPlatformAdapter — LG Smart TV (webOS)
 * Suporte a eventos de controle remoto webOS sem dependências externas duras.
 */
export class WebOSPlatformAdapter {
  constructor() {
    this.name = 'webos';
    this.isWebOS = typeof window !== 'undefined' && Boolean(window.webOS || window.webOSDev || window.PalmSystem);
  }

  initialize() {
    if (!this.isWebOS) return;

    // Listener para o botão Back nativo do controle LG Magic Remote
    window.addEventListener('webOSRelaunch', () => {
      // Evento disparado quando o app é reaberto no webOS
    });

    document.addEventListener('webOSLaunch', () => {
      // Evento de inicialização do webOS
    });

    // Trata tecla 'Back' do webOS (geralmente keyCode 461)
    window.addEventListener('keydown', (e) => {
      if (e.keyCode === 461) {
        const backEvt = new CustomEvent('tv:back');
        window.dispatchEvent(backEvt);
      }
    });
  }

  exitApp() {
    if (typeof window !== 'undefined' && window.webOS && typeof window.webOS.platformBack === 'function') {
      window.webOS.platformBack();
    } else if (typeof window !== 'undefined' && window.PalmSystem && typeof window.PalmSystem.platformBack === 'function') {
      window.PalmSystem.platformBack();
    }
  }
}
