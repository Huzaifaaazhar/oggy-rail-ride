export type Action = 'left' | 'right' | 'jump' | 'slide' | 'pause' | 'start';

/**
 * Keyboard + touch-swipe input. Actions are queued and consumed once per frame
 * so quick taps between frames are never lost.
 */
export class Input {
  private queue: Action[] = [];
  private el: HTMLElement | Window;

  private attached = false;

  constructor(el: HTMLElement | Window = window) {
    this.el = el;
  }

  /** Start listening (idempotent; safe under React StrictMode remounts). */
  attach() {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKey);
    this.el.addEventListener('touchstart', this.onTouchStart as EventListener, { passive: true });
    this.el.addEventListener('touchmove', this.onTouchMove as EventListener, { passive: false });
    this.el.addEventListener('touchend', this.onTouchEnd as EventListener, { passive: true });
    this.el.addEventListener('touchcancel', this.onTouchCancel as EventListener, { passive: true });
  }

  dispose() {
    this.attached = false;
    window.removeEventListener('keydown', this.onKey);
    this.el.removeEventListener('touchstart', this.onTouchStart as EventListener);
    this.el.removeEventListener('touchmove', this.onTouchMove as EventListener);
    this.el.removeEventListener('touchend', this.onTouchEnd as EventListener);
    this.el.removeEventListener('touchcancel', this.onTouchCancel as EventListener);
    this.stroke = null;
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
      case 'KeyR':
        this.push('start');
        break;
    }
  };

  /**
   * One finger stroke = one action. A swipe fires as soon as the finger has
   * travelled far enough (not on release, so it feels instant), and then the
   * stroke is spent: continuing to drag never produces a second rail hop. To
   * hop two rails the player swipes twice.
   */
  private stroke: { x: number; y: number; t: number; fired: boolean; id: number } | null = null;

  /** Swipe distance scales with the screen so small phones and tablets feel alike. */
  private threshold() {
    const short = Math.min(window.innerWidth || 400, window.innerHeight || 800);
    return Math.max(34, Math.min(70, short * 0.085));
  }

  private onTouchStart = (e: TouchEvent) => {
    // a second finger landing mid-stroke must not start a new swipe
    if (this.stroke && !this.stroke.fired) return;
    const t = e.changedTouches[0];
    this.stroke = { x: t.clientX, y: t.clientY, t: performance.now(), fired: false, id: t.identifier };
  };

  private find(e: TouchEvent) {
    if (!this.stroke) return null;
    for (let i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === this.stroke.id) return e.changedTouches[i];
    return null;
  }

  private fire(dx: number, dy: number) {
    const s = this.stroke!;
    s.fired = true;
    if (Math.abs(dx) > Math.abs(dy) * 1.15) this.push(dx < 0 ? 'left' : 'right');
    else if (Math.abs(dy) > Math.abs(dx) * 1.15) this.push(dy < 0 ? 'jump' : 'slide');
    // a perfect diagonal is ambiguous: ignore it rather than guess
  }

  private onTouchMove = (e: TouchEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button, input, .card')) return;
    if (!this.stroke) return;
    e.preventDefault();
    if (this.stroke.fired) return;
    const t = this.find(e);
    if (!t) return;
    const dx = t.clientX - this.stroke.x;
    const dy = t.clientY - this.stroke.y;
    if (Math.hypot(dx, dy) < this.threshold()) return;
    this.fire(dx, dy);
  };

  private onTouchCancel = () => {
    this.stroke = null;
  };

  private onTouchEnd = (e: TouchEvent) => {
    const s = this.stroke;
    const t = this.find(e);
    if (!s || !t) return;
    this.stroke = null;
    if (s.fired) return;
    // a quick flick that ended before reaching the drag threshold still counts
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    const dt = performance.now() - s.t;
    if (Math.hypot(dx, dy) < this.threshold() * 0.6 || dt > 350) return;
    this.stroke = s;
    this.fire(dx, dy);
    this.stroke = null;
  };
}
