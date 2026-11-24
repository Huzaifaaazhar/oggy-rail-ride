import { beforeAll, describe, expect, it } from 'vitest';
import { Input } from '../Input';

// Minimal browser stubs: Input only needs window size and listeners.
beforeAll(() => {
  (globalThis as Record<string, unknown>).window ??= { innerWidth: 390, innerHeight: 844, addEventListener() {}, removeEventListener() {} };
});

type Fake = { changedTouches: { identifier: number; clientX: number; clientY: number }[]; target: null; preventDefault(): void };
const ev = (x: number, y: number, id = 0): Fake => ({ changedTouches: [{ identifier: id, clientX: x, clientY: y }], target: null, preventDefault() {} });

/** Drive a whole finger stroke from (x0,y0) by (dx,dy) in `steps` touchmoves. */
function swipe(input: Input, dx: number, dy: number, steps = 12, x0 = 200, y0 = 400) {
  const h = input as unknown as Record<string, (e: Fake) => void>;
  h.onTouchStart(ev(x0, y0));
  for (let i = 1; i <= steps; i++) h.onTouchMove(ev(x0 + (dx * i) / steps, y0 + (dy * i) / steps));
  h.onTouchEnd(ev(x0 + dx, y0 + dy));
  return input.consume();
}

describe('touch swipes', () => {
  it('a long horizontal drag is one rail hop, not several', () => {
    const input = new Input();
    expect(swipe(input, 260, 0)).toEqual(['right']);
    expect(swipe(input, -90, 0, 4)).toEqual(['left']);
  });

  it('a short wobble below the threshold does nothing', () => {
    const input = new Input();
    expect(swipe(input, 18, 6)).toEqual([]);
  });

  it('a quick flick that ends before the drag threshold still counts', () => {
    const input = new Input();
    const h = input as unknown as Record<string, (e: Fake) => void>;
    h.onTouchStart(ev(200, 400));
    h.onTouchEnd(ev(176, 402));
    expect(input.consume()).toEqual(['left']);
  });

  it('vertical swipes jump and slide; diagonals are ignored', () => {
    const input = new Input();
    expect(swipe(input, 0, -200)).toEqual(['jump']);
    expect(swipe(input, 4, 150)).toEqual(['slide']);
    expect(swipe(input, 100, 100)).toEqual([]);
  });

  it('two separate swipes give two hops', () => {
    const input = new Input();
    const h = input as unknown as Record<string, (e: Fake) => void>;
    swipe(input, 120, 0);
    h.onTouchStart(ev(200, 400));
    for (let i = 1; i <= 6; i++) h.onTouchMove(ev(200 + i * 20, 400));
    h.onTouchEnd(ev(320, 400));
    expect(input.consume()).toEqual(['right']);
  });
});
