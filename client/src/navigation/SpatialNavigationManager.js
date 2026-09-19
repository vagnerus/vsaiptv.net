/**
 * SpatialNavigationManager — Motor de Navegação Espacial 2D para Smart TVs
 * Permite navegação completa por D-Pad (Controle Remoto / Teclado) com restauração de foco.
 */
export class SpatialNavigationManager {
  static instance = null;

  static getInstance() {
    if (!SpatialNavigationManager.instance) {
      SpatialNavigationManager.instance = new SpatialNavigationManager();
    }
    return SpatialNavigationManager.instance;
  }

  constructor() {
    this.focusHistory = [];
    this.lastFocusedElement = null;
    this.isEnabled = false;
    this.onBackHandlers = new Set();
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleTvBack = this.handleTvBack.bind(this);
  }

  init() {
    if (this.isEnabled || typeof window === 'undefined') return;
    this.isEnabled = true;

    window.addEventListener('keydown', this.handleKeyDown, { capture: false });
    window.addEventListener('tv:back', this.handleTvBack);
  }

  destroy() {
    if (!this.isEnabled || typeof window === 'undefined') return;
    this.isEnabled = false;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('tv:back', this.handleTvBack);
  }

  registerBackHandler(handler) {
    this.onBackHandlers.add(handler);
    return () => this.onBackHandlers.delete(handler);
  }

  handleTvBack() {
    // Executa o handler de voltar mais recente
    for (const handler of Array.from(this.onBackHandlers).reverse()) {
      const handled = handler();
      if (handled) return;
    }

    // Se houver modal aberto, fecha
    const openModal = document.querySelector('.detail-modal-backdrop, .modal-backdrop, [data-modal="true"]');
    if (openModal) {
      const closeBtn = openModal.querySelector('button[aria-label="Fechar"], .btn-close, [data-close="true"]');
      if (closeBtn) {
        closeBtn.click();
        this.restoreFocus();
        return;
      }
    }

    // Se estiver em aba secundária ou player fullscreen, volta
    const backBtn = document.querySelector('[data-nav-back="true"], .btn-player-back');
    if (backBtn) {
      backBtn.click();
      this.restoreFocus();
    }
  }

  saveFocus() {
    if (typeof document !== 'undefined' && document.activeElement) {
      this.lastFocusedElement = document.activeElement;
      this.focusHistory.push(document.activeElement);
      if (this.focusHistory.length > 20) this.focusHistory.shift();
    }
  }

  restoreFocus() {
    while (this.focusHistory.length > 0) {
      const el = this.focusHistory.pop();
      if (el && document.body.contains(el) && typeof el.focus === 'function') {
        el.focus();
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        return true;
      }
    }
    // Fallback: foca o primeiro elemento navegável
    this.focusFirst();
    return false;
  }

  focusFirst() {
    const focusables = this.getFocusableElements();
    if (focusables.length > 0) {
      focusables[0].focus();
      return true;
    }
    return false;
  }

  getFocusableElements() {
    if (typeof document === 'undefined') return [];

    // Prioriza elementos dentro do modal se houver modal aberto
    const openModal = document.querySelector('.detail-modal-backdrop, .modal-backdrop, [data-modal="true"]');
    const rootScope = openModal || document;

    const selector = '[tabindex="0"]:not([disabled]), button:not([disabled]):not([tabindex="-1"]), a[href]:not([tabindex="-1"]), input:not([disabled]):not([type="hidden"]), select:not([disabled])';
    const elements = Array.from(rootScope.querySelectorAll(selector));

    return elements.filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.opacity !== '0'
      );
    });
  }

  handleKeyDown(e) {
    const activeEl = document.activeElement;
    const isTextInput = activeEl && (
      activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.isContentEditable
    );

    // Tecla Back / Escape
    if (e.key === 'Escape' || e.key === 'Back' || e.key === 'BrowserBack') {
      e.preventDefault();
      this.handleTvBack();
      return;
    }

    const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
    if (!isArrow) return;

    // Se estiver digitando em input de texto com setas esquerda/direita, deixa navegar no texto
    if (isTextInput && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
      return;
    }

    const focusables = this.getFocusableElements();
    if (focusables.length === 0) return;

    // Se nada estiver focado, foca o primeiro
    if (!activeEl || !focusables.includes(activeEl)) {
      focusables[0].focus();
      e.preventDefault();
      return;
    }

    const currentRect = activeEl.getBoundingClientRect();
    const currentCenter = {
      x: currentRect.left + currentRect.width / 2,
      y: currentRect.top + currentRect.height / 2
    };

    let bestCandidate = null;
    let minDistance = Infinity;

    for (const el of focusables) {
      if (el === activeEl) continue;

      const rect = el.getBoundingClientRect();
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };

      const dx = center.x - currentCenter.x;
      const dy = center.y - currentCenter.y;

      let inCone = false;
      if (e.key === 'ArrowRight' && dx > 15 && Math.abs(dy) <= Math.max(140, Math.abs(dx) * 1.6)) inCone = true;
      if (e.key === 'ArrowLeft' && dx < -15 && Math.abs(dy) <= Math.max(140, Math.abs(dx) * 1.6)) inCone = true;
      if (e.key === 'ArrowDown' && dy > 15 && Math.abs(dx) <= Math.max(220, Math.abs(dy) * 1.8)) inCone = true;
      if (e.key === 'ArrowUp' && dy < -15 && Math.abs(dx) <= Math.max(220, Math.abs(dy) * 1.8)) inCone = true;

      if (inCone) {
        // Ponderação: favorece elementos alinhados no eixo do movimento
        const weight = (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
          ? Math.hypot(dx, dy * 1.8)
          : Math.hypot(dx * 1.8, dy);

        if (weight < minDistance) {
          minDistance = weight;
          bestCandidate = el;
        }
      }
    }

    if (bestCandidate) {
      e.preventDefault();
      this.lastFocusedElement = bestCandidate;
      bestCandidate.focus();
      bestCandidate.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }
}
