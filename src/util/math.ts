export const TAU = Math.PI * 2;

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const clamp01 = (x: number) => clamp(x, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => clamp01((x - a) / (b - a));

/** Cubic-free ease with zero first AND second derivative at both ends (C2). */
export const smootherstep = (u: number) => {
  const x = clamp01(u);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/**
 * Integral of a raised-cosine rate profile, normalised to 0..1.
 * Rate (derivative) is 0 at both ends and peaks in the middle, so angles
 * built with it ramp in and out smoothly (no curvature discontinuity).
 */
export const sEase = (u: number) => {
  const x = clamp01(u);
  return x - Math.sin(TAU * x) / TAU;
};

/** 0 at both ends, 1 in the middle. */
export const bump = (u: number) => {
  const s = Math.sin(Math.PI * clamp01(u));
  return s * s;
};

/**
 * Trapezoidal rate profile integral: ramps over `a` at each end, constant between.
 * Used for helices so they turn at a steady rate in the middle.
 */
export const trapEase = (u: number, a = 0.12) => {
  const x = clamp01(u);
  const total = 1 - a; // area of the trapezoid with unit plateau
  let area: number;
  if (x < a) area = (x * x) / (2 * a);
  else if (x > 1 - a) {
    const y = 1 - x;
    area = total - (y * y) / (2 * a);
  } else area = a / 2 + (x - a);
  return area / total;
};

/** Smooth plateau: rises over [a0,a1], holds, falls over [b0,b1]. */
export const plateau = (u: number, a0 = 0.05, a1 = 0.32, b0 = 0.68, b1 = 0.95) =>
  smootherstep(invLerp(a0, a1, u)) * (1 - smootherstep(invLerp(b0, b1, u)));

/** Piecewise smooth keyframes [[u, value], ...] (sorted by u). */
export function keys(u: number, k: ReadonlyArray<readonly [number, number]>): number {
  if (u <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (u <= k[i][0]) {
      const [u0, v0] = k[i - 1];
      const [u1, v1] = k[i];
      return lerp(v0, v1, smootherstep((u - u0) / (u1 - u0)));
    }
  }
  return k[k.length - 1][1];
}

/** Frame-rate independent exponential smoothing factor. */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** Deterministic PRNG (mulberry32). */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a0: number, b0: number) => a0 + (b0 - a0) * next(),
    int: (a0: number, b0: number) => Math.floor(a0 + (b0 - a0 + 1) * next()),
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
    weighted: <T,>(items: ReadonlyArray<readonly [T, number]>): T => {
      let total = 0;
      for (const [, w] of items) total += Math.max(0, w);
      let r = next() * total;
      for (const [v, w] of items) {
        r -= Math.max(0, w);
        if (r <= 0) return v;
      }
      return items[items.length - 1][0];
    },
  };
}
export type Rng = ReturnType<typeof makeRng>;

export const wrapAngle = (a: number) => {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  if (x < -Math.PI) x += TAU;
  return x;
};
