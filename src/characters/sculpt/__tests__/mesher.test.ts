import { describe, expect, it } from 'vitest';
import { sculpt } from '../mesher';
import type { SculptSpec } from '../types';

const spec: SculptSpec = {
  name: 'blob',
  min: [-0.5, -0.5, -0.5],
  max: [0.5, 1.0, 0.5],
  cell: 0.012,
  baseColor: '#808080',
  baseRough: 0.8,
  prims: [
    { shape: { type: 'ell', c: [0, 0, 0], r: [0.3, 0.25, 0.25] }, op: 'add', k: 0.05, bone: 'a' },
    { shape: { type: 'cone', a: [0, 0.1, 0], b: [0, 0.8, 0], ra: 0.12, rb: 0.06 }, op: 'add', k: 0.08, bone: 'b' },
    { shape: { type: 'ell', c: [0, 0, 0.28], r: [0.08, 0.08, 0.08] }, op: 'sub', k: 0.02 },
  ],
  paints: [],
  weights: [],
  bones: [
    { name: 'a', parent: null, pos: [0, 0, 0] },
    { name: 'b', parent: 'a', pos: [0, 0.3, 0] },
  ],
};

describe('sculpt mesher', () => {
  it('produces a closed, consistently wound, skinned surface', () => {
    const m = sculpt(spec);
    const nv = m.positions.length / 3;
    expect(nv).toBeGreaterThan(3000);
    // every directed edge appears once and its reverse once → closed, manifold, consistently oriented
    const edges = new Set<number>();
    const key = (a: number, b: number) => a * 1048576 + b;
    for (let t = 0; t < m.index.length; t += 3)
      for (let e = 0; e < 3; e++) edges.add(key(m.index[t + e], m.index[t + ((e + 1) % 3)]));
    let bad = 0;
    for (const k of edges) {
      const a = Math.floor(k / 1048576);
      const b = k % 1048576;
      if (!edges.has(key(b, a))) bad++;
    }
    expect(bad).toBe(0);
    let usedB = 0;
    let worst = 0;
    for (let v = 0; v < nv; v++) {
      const s = m.skinWeight![v * 4] + m.skinWeight![v * 4 + 1] + m.skinWeight![v * 4 + 2] + m.skinWeight![v * 4 + 3];
      worst = Math.max(worst, Math.abs(s - 1));
      if (m.skinIndex![v * 4] === 1) usedB++;
    }
    expect(worst).toBeLessThan(1e-4);
    expect(usedB).toBeGreaterThan(nv * 0.2);
  });
});
