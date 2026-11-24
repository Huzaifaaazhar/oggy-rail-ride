import { describe, expect, it } from 'vitest';
import { CATALOG } from '../catalog';
import { PatternPlanner, ranksCovered, rowIsFair, ZoneInfo } from '../patterns';

const zones: Record<string, ZoneInfo> = {
  normal: { blocked: false, merged: false, hop: true, flat: true },
  merged: { blocked: false, merged: true, hop: true, flat: true },
  apart: { blocked: false, merged: false, hop: false, flat: false },
  blocked: { blocked: true, merged: false, hop: true, flat: true },
};

describe('PatternPlanner', () => {
  for (const [name, zone] of Object.entries(zones)) {
    it(`always leaves a way through (${name} rails)`, () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        const planner = new PatternPlanner(seed);
        let s = 100;
        for (let i = 0; i < 400; i++) {
          const d = Math.min(1, i / 300);
          const row = planner.next(s, d, 20 + d * 30, { zone: () => zone });
          // every cluster of obstacles at roughly the same distance keeps a rank free of blocks
          for (const o of row.obstacles) expect(rowIsFair(row.obstacles.filter((x) => Math.abs(x.s - o.s) < 6))).toBe(true);
          if (name === 'blocked') expect(row.obstacles.length).toBe(0);
          if (name === 'merged') for (const o of row.obstacles) {
            expect(o.span).toBe(3);
            expect(CATALOG[o.kind].cls).not.toBe('block');
          }
          if (name === 'apart') for (const o of row.obstacles) {
            expect(o.span).toBe(1);
            expect(CATALOG[o.kind].cls).not.toBe('block');
          }
          // rows never overlap: the planner advances past everything it placed
          for (const o of row.obstacles) expect(o.s).toBeLessThan(s + row.advance + 1);
          expect(row.advance).toBeGreaterThan(10);
          s += row.advance;
        }
      }
    });
  }

  it('gets harder: more obstacles per 1000 m and more varied patterns later', () => {
    const planner = new PatternPlanner(9);
    const count = (d: number) => {
      let s = 0;
      let n = 0;
      const names = new Set<string>();
      while (s < 3000) {
        const row = planner.next(s, d, 20 + d * 30, { zone: () => zones.normal });
        n += row.obstacles.length;
        names.add(row.name);
        s += row.advance;
      }
      return { n, names };
    };
    const easy = count(0);
    const hard = count(1);
    expect(hard.n).toBeGreaterThan(easy.n * 1.2);
    expect(hard.names.size).toBeGreaterThan(easy.names.size);
    for (const n of ['zigzag', 'combo', 'gauntlet', 'dropTable', 'door', 'slider', 'roller']) expect(hard.names.has(n), n).toBe(true);
  });

  it('places some bonus collectibles', () => {
    const planner = new PatternPlanner(4);
    let s = 0;
    let bonus = 0;
    for (let i = 0; i < 600; i++) {
      const row = planner.next(s, 0.5, 30, { zone: () => zones.normal });
      bonus += row.coins.filter((c) => c.item).length;
      s += row.advance;
    }
    expect(bonus).toBeGreaterThan(5);
  });

  it('rowIsFair counts sliding furniture at both ends', () => {
    expect(ranksCovered({ u: 0.5, span: 2 })).toEqual([0, 1]);
    const slide = { s: 0, kind: 'sofa' as const, u: -1, span: 1 as const, motion: { type: 'slide' as const, u1: 0, trigger: 30, dur: 1 }, warn: true };
    const block = { s: 0, kind: 'fridge' as const, u: 1, span: 1 as const, motion: { type: 'static' as const }, warn: false };
    expect(rowIsFair([slide])).toBe(true);
    expect(rowIsFair([slide, block])).toBe(false);
  });
});
