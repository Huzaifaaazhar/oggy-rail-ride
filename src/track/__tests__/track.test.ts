import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Track, TrackFrame } from '../Track';
import { DS, GeomKind } from '../types';

const ALL: GeomKind[] = ['straight', 'slope', 'wave', 'turn', 'scurve', 'sharpTurn', 'circle', 'helix', 'loop', 'corkscrew', 'drop', 'dip', 'twist'];

describe('Track', () => {
  for (const seed of [1, 7, 42, 1234, 98765]) {
    it(`is continuous with orthonormal frames (seed ${seed})`, () => {
      const t = new Track({ seed });
      t.ensure(12000);
      const a = new TrackFrame();
      const b = new TrackFrame();
      const pa = new THREE.Vector3();
      const pb = new THREE.Vector3();
      let maxX = 0;
      for (let g = 0; g < t.count - 1; g++) {
        t.readSample(g, a);
        t.readSample(g + 1, b);
        const step = a.pos.distanceTo(b.pos);
        expect(step).toBeGreaterThan(DS * 0.97);
        expect(step).toBeLessThan(DS * 1.03);
        // frame orthonormal
        expect(Math.abs(a.fwd.dot(a.right))).toBeLessThan(1e-6);
        expect(Math.abs(a.fwd.dot(a.up))).toBeLessThan(1e-6);
        expect(Math.abs(a.up.length() - 1)).toBeLessThan(1e-6);
        // smooth orientation: no frame jumps between samples
        expect(a.fwd.dot(b.fwd)).toBeGreaterThan(0.995);
        expect(a.up.dot(b.up)).toBeGreaterThan(0.99);
        // rails continuous
        for (let r = 0; r < 3; r++) {
          a.railPoint(r, pa);
          b.railPoint(r, pb);
          expect(pa.distanceTo(pb)).toBeLessThan(1.2);
        }
        maxX = Math.max(maxX, Math.abs(a.pos.x));
      }
      expect(maxX).toBeLessThan(64);
    });
  }

  it('produces every structure type over a long run', () => {
    const seen = new Set<string>();
    const lanes = new Set<string>();
    for (const seed of [3, 4, 5]) {
      const t = new Track({ seed });
      t.ensure(15000);
      t.pieces.forEach((p) => {
        seen.add(p.geom);
        lanes.add(p.lane);
      });
    }
    for (const k of ALL) expect(seen.has(k), k).toBe(true);
    for (const k of ['merge', 'split', 'widePulse', 'staggerPulse', 'cross']) expect(lanes.has(k), k).toBe(true);
  });

  it('keeps rider clearance between rails (no rail passes through a rider)', () => {
    const t = new Track({ seed: 11 });
    t.ensure(10000);
    const f = new TrackFrame();
    for (let g = 0; g < t.count; g += 3) {
      t.readSample(g, f);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          if (i === j) continue;
          const dx = f.lanes[j * 2] - f.lanes[i * 2];
          const dy = f.lanes[j * 2 + 1] - f.lanes[i * 2 + 1];
          // rail j must not sit inside rider-on-i's body box (|dx|<0.5, 0<dy<2.3)
          const inside = Math.abs(dx) < 0.5 && dy > 0.1 && dy < 2.4;
          expect(inside).toBe(false);
        }
    }
  });

  it('loops return the rider upright and laterally offset', () => {
    const t = new Track({ seed: 5, forced: ['loop'] });
    t.ensure(3000);
    const loops = t.pieces.filter((p) => p.geom === 'loop');
    expect(loops.length).toBeGreaterThan(3);
    const f = new TrackFrame();
    const g = new TrackFrame();
    for (const l of loops) {
      t.frameAt(l.s0, f);
      t.frameAt(l.s1, g);
      expect(g.up.y).toBeGreaterThan(0.99);
      // passes upside-down in the middle
      const m = t.frameAt((l.s0 + l.s1) / 2, new TrackFrame());
      expect(m.up.y).toBeLessThan(-0.9);
      const lateral = Math.hypot(g.pos.x - f.pos.x, 0);
      expect(lateral).toBeGreaterThan(8);
    }
  });
});
