/**
 * GenericTVAdapter — Compatibilidade universal com navegadores Smart TV
 */
export class GenericTVAdapter {
  constructor() {
    this.name = 'generic-tv';
    this.isInitialized = false;
  }

  initialize() {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    // Previne scroll acidental do browser ao navegar com setas
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const active = document.activeElement;
        const isTextInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
        if (!isTextInput) {
          // Previne rolagem padrão da janela se não for campo de texto
          if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
            e.preventDefault();
          }
        }
      }
    }, { passive: false });

    // Registra Wake Lock se suportado para não apagar a tela durante o app
    this.requestWakeLock();
  }

  async requestWakeLock() {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
      } catch {
        // Silencioso em TVs sem suporte
      }
    }
  }

  destroy() {
    if (this.wakeLock) {
      try {
        this.wakeLock.release();
      } catch {
        // Ignore
      }
      this.wakeLock = null;
    }
  }
}
