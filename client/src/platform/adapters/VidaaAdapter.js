/**
 * VidaaAdapter — Hisense / Toshiba VIDAA OS
 * Suporte a navegador embarcado VIDAA e normalização de teclas
 */
export class VidaaAdapter {
  constructor() {
    this.name = 'vidaa';
  }

  initialize() {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      // Tecla Back em browsers VIDAA (geralmente VK_BACK / 8 ou 10009 / 461)
      if (e.keyCode === 8 || e.keyCode === 10009) {
        const active = document.activeElement;
        const isTextInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
        if (!isTextInput) {
          e.preventDefault();
          const backEvt = new CustomEvent('tv:back');
          window.dispatchEvent(backEvt);
        }
      }
    });
  }
}
