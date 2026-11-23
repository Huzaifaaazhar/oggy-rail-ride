export type Action = 'left' | 'right' | 'jump' | 'slide' | 'pause' | 'start';

/**
 * Keyboard + touch-swipe input. Actions are queued and consumed once per frame
 * so quick taps between frames are never lost.
 */
export class Input {
  private queue: Action[] = [];
  private touchStart: { x: number; y: number; t: number } | null = null;
  private el: HTMLElement | Window;

  constructor(el: HTMLElement | Window = window) {
    this.el = el;
    window.addEventListener('keydown', this.onKey);
    el.addEventListener('touchstart', this.onTouchStart as EventListener, { passive: true });
    el.addEventListener('touchend', this.onTouchEnd as EventListener, { passive: true });
  }

  dispose() {
    window.removeEventListener('keydown', this.onKey);
    this.el.removeEventListener('touchstart', this.onTouchStart as EventListener);
    this.el.removeEventListener('touchend', this.onTouchEnd as EventListener);
  }

  push(a: Action) {
    this.queue.push(a);
  }

  consume(): Action[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'BUTTON' || target.tagName === 'INPUT') && (e.code === 'Space' || e.code === 'Enter')) return;
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.push('left');
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.push('right');
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        this.push('jump');
        e.preventDefault();
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.push('slide');
        e.preventDefault();
        break;
      case 'Escape':
      case 'KeyP':
        this.push('pause');
        break;
      case 'Enter':
        this.push('start');
        break;
    }
  };

  private onTouchStart = (e: TouchEvent) => {
    const t = e.changedTouches[0];
    this.touchStart = { x: t.clientX, y: t.clientY, t: performance.now() };
  };

  private onTouchEnd = (e: TouchEvent) => {
    if (!this.touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - this.touchStart.x;
    const dy = t.clientY - this.touchStart.y;
    const dt = performance.now() - this.touchStart.t;
    this.touchStart = null;
    const min = 28;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < min || dt > 700) return;
    if (Math.abs(dx) > Math.abs(dy)) this.push(dx < 0 ? 'left' : 'right');
    else this.push(dy < 0 ? 'jump' : 'slide');
  };
}
