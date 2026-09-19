/**
 * TizenPlatformAdapter — Samsung Smart TV (Tizen OS)
 * Registra chaves de controle remoto via tizen.tvinputdevice sem quebrar browsers web padrão.
 */
export class TizenPlatformAdapter {
  constructor() {
    this.name = 'tizen';
    this.isTizen = typeof window !== 'undefined' && Boolean(window.tizen && window.tizen.tvinputdevice);
  }

  initialize() {
    if (!this.isTizen) return;

    try {
      const tvInput = window.tizen.tvinputdevice;
      const keysToRegister = [
        'MediaPlay',
        'MediaPause',
        'MediaPlayPause',
        'MediaStop',
        'MediaFastForward',
        'MediaRewind',
        'ColorF0Red',
        'ColorF1Green',
        'ColorF2Yellow',
        'ColorF3Blue',
        'Info',
        'ChannelUp',
        'ChannelDown',
        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
      ];

      keysToRegister.forEach((keyName) => {
        try {
          tvInput.registerKey(keyName);
        } catch {
          // Tecla não suportada pelo modelo de TV
        }
      });
    } catch {
      // Ignora com segurança em ambientes simulados
    }

    // Gerencia botão de voltar físico do controle Samsung
    window.addEventListener('tizenhwkey', (e) => {
      if (e.keyName === 'back') {
        const backEvt = new CustomEvent('tv:back');
        window.dispatchEvent(backEvt);
      }
    });
  }

  exitApp() {
    if (this.isTizen && window.tizen && window.tizen.application) {
      try {
        const app = window.tizen.application.getCurrentApplication();
        app.exit();
      } catch {
        // Ignore
      }
    }
  }
}
