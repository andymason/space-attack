import type { Controls } from './game/model';

export class Keyboard {
  private held = new Set<string>();
  constructor(action: (key: string) => void, loseFocus: () => void) {
    const gameKeys = new Set(['ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Escape', 'KeyM']);
    window.addEventListener('keydown', event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      // Let Enter/Space activate focused native controls without also firing game shortcuts.
      if (target instanceof HTMLButtonElement && (event.code === 'Enter' || event.code === 'Space')) return;
      if (gameKeys.has(event.code)) event.preventDefault();
      this.held.add(event.code);
      if (!event.repeat) action(event.code);
    });
    window.addEventListener('keyup', event => { this.held.delete(event.code); });
    window.addEventListener('blur', () => { this.clear(); loseFocus(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.clear(); loseFocus(); }
    });
  }
  get controls(): Controls { return { left: this.held.has('ArrowLeft'), right: this.held.has('ArrowRight'), fire: this.held.has('Space') }; }
  clear() { this.held.clear(); }
}
