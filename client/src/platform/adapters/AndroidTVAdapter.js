/**
 * AndroidTVAdapter — Android TV / Google TV / Fire TV
 * Mapeamento e normalização de keycodes do controle remoto Android TV.
 */
export class AndroidTVAdapter {
  constructor() {
    this.name = 'androidtv';
  }

  initialize() {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      // Keycode 4 no Android é KEYCODE_BACK
      if (e.keyCode === 4) {
        const backEvt = new CustomEvent('tv:back');
        window.dispatchEvent(backEvt);
      }
      // Keycode 82 é KEYCODE_MENU
      if (e.keyCode === 82) {
        const menuEvt = new CustomEvent('tv:menu');
        window.dispatchEvent(menuEvt);
      }
    });
  }
}
