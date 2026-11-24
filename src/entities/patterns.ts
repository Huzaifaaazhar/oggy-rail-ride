import { makeRng, Rng } from '../util/math';
import { BLOCK_KINDS, CATALOG, CoinSpec, HIGH_KINDS, LOW_KINDS, ObstacleKind, ObstacleSpec } from './catalog';

/** What the planner needs to know about the track near s. */
export interface ZoneInfo {
  /** no obstacles allowed here (loops, corkscrews, crossings…) */
  blocked: boolean;
  /** rails bundled into a single route */
  merged: boolean;
  /** every pair of neighbouring rails can be hopped */
  hop: boolean;
  /** rails level with each other (multi-rail objects allowed) */
  flat: boolean;
}

export interface TrackQuery {
  zone(s0: number, s1: number): ZoneInfo;
}

export interface Row {
  obstacles: ObstacleSpec[];
  coins: CoinSpec[];
  /** distance to advance before planning the next row */
  advance: number;
  name: string;
}

const RANKS = [-1, 0, 1];

/** Ranks fully covered by an obstacle (span centred on u). */
export function ranksCovered(o: Pick<ObstacleSpec, 'u' | 'span'>, u = o.u): number[] {
  const half = (o.span - 1) / 2;
  return RANKS.filter((r) => r >= u - half - 0.25 && r <= u + half + 0.25);
}

/**
 * A row is fair when at least one rank is free of full-height blocks, counting
 * every position a moving block passes through (start and end of a slide).
 */
export function rowIsFair(obstacles: ObstacleSpec[]): boolean {
  const blocked = new Set<number>();
  for (const o of obstacles) {
    if (CATALOG[o.kind].cls !== 'block') continue;
    for (const r of ranksCovered(o)) blocked.add(r);
    if (o.motion.type === 'slide') for (const r of ranksCovered(o, o.motion.u1)) blocked.add(r);
  }
  return blocked.size < 3;
}

const stat = { type: 'static' as const };

/**
 * Procedural obstacle/coin pattern library. Rows are chosen by difficulty and
 * local track context and are always checked for a passable route.
 */
export class PatternPlanner {
  private rng: Rng;
  private sinceBonus = 0;

  constructor(seed: number) {
    this.rng = makeRng(seed ^ 0x2545f491);
  }

  /** Spacing between rows: shrinks with difficulty, never below 0.9 s of travel. */
  spacing(d: number, speed: number) {
    return Math.max(speed * 0.95, 48 - d * 22 + this.rng.range(0, 12));
  }

  next(s: number, d: number, speed: number, q: TrackQuery): Row {
    const r = this.rng;
    const z = q.zone(s - 26, s + 6);
    const gap = this.spacing(d, speed);
    if (z.blocked) return { obstacles: [], coins: this.line(s, 0, 7, 3), advance: 24, name: 'free ride' };

    if (z.merged) {
      const high = r.chance(0.45);
      const kind: ObstacleKind = high ? r.pick(['laundry', 'fan'] as ObstacleKind[]) : r.pick(['rugRoll', 'barrel'] as ObstacleKind[]);
      const o: ObstacleSpec = { s, kind, u: 0, span: 3, motion: kind === 'fan' ? { type: 'spin' } : stat, warn: false };
      return { obstacles: [o], coins: high ? this.tunnel(s, 0) : this.arc(s, 0), advance: gap, name: 'merged' };
    }

    if (!z.hop || !z.flat) {
      // rails too far apart to hop: every rail gets its own jump/slide challenge
      const obstacles: ObstacleSpec[] = [];
      for (const u of RANKS) if (r.chance(0.55)) obstacles.push({ s: s + r.range(-2, 2), kind: r.chance(0.6) ? r.pick(LOW_KINDS) : r.pick(HIGH_KINDS), u, span: 1, motion: stat, warn: false });
      const cu = r.pick(RANKS);
      return { obstacles, coins: obstacles.some((o) => o.u === cu) ? [] : this.line(s - 10, cu, 7), advance: gap, name: 'apart' };
    }

    const table: [string, number][] = [
      ['single', 3],
      ['double', 2 + d * 2],
      ['sofa', 1.2 + d],
      ['lowAll', 1.0],
      ['highAll', 0.9 + d * 0.5],
      ['roller', d > 0.08 ? 1 + d : 0],
      ['slider', d > 0.15 ? 0.8 + d : 0],
      ['door', d > 0.12 ? 0.8 + d : 0],
      ['lamp', d > 0.1 ? 0.8 : 0],
      ['vacuum', d > 0.2 ? 0.7 + d * 0.6 : 0],
      ['dropTable', d > 0.25 ? 0.7 + d : 0],
      ['zigzag', d > 0.3 ? 0.8 + d * 1.5 : 0],
      ['combo', d > 0.45 ? 1 + d : 0],
      ['gauntlet', d > 0.65 ? 0.8 + d : 0],
    ];
    for (let attempt = 0; attempt < 6; attempt++) {
      const name = r.weighted(table);
      const row = this.build(name, s, d, speed, gap);
      if (row.obstacles.every((o, _i, all) => rowIsFair(all.filter((x) => Math.abs(x.s - o.s) < 6)))) {
        this.decorate(row);
        return row;
      }
    }
    return { obstacles: [], coins: this.line(s, r.pick(RANKS), 8), advance: gap, name: 'rest' };
  }

  private build(name: string, s: number, d: number, speed: number, gap: number): Row {
    const r = this.rng;
    const free = (taken: number[]) => RANKS.filter((u) => !taken.includes(u));
    const o = (kind: ObstacleKind, u: number, extra: Partial<ObstacleSpec> = {}): ObstacleSpec => ({ s, kind, u, span: 1, motion: stat, warn: false, ...extra });
    switch (name) {
      case 'single': {
        const u = r.pick(RANKS);
        const roll = r.next();
        const kind = roll < 0.5 ? r.pick(BLOCK_KINDS) : roll < 0.8 ? r.pick(LOW_KINDS) : r.pick(HIGH_KINDS);
        const coinsU = r.pick(free([u]));
        return { obstacles: [o(kind, u)], coins: CATALOG[kind].cls === 'low' && r.chance(0.5) ? this.arc(s, u) : this.line(s - 12, coinsU, 8), advance: gap, name };
      }
      case 'double': {
        const us = [...RANKS].sort(() => r.next() - 0.5).slice(0, 2);
        const obstacles = us.map((u) => o(r.chance(0.6) ? r.pick(BLOCK_KINDS) : r.chance(0.5) ? r.pick(LOW_KINDS) : r.pick(HIGH_KINDS), u));
        return { obstacles, coins: this.line(s - 14, free(us)[0], 9), advance: gap, name };
      }
      case 'sofa': {
        const u = r.pick([-0.5, 0.5]);
        const kind: ObstacleKind = r.chance(0.7) ? 'sofa' : 'cupboard';
        const left = u < 0 ? 1 : -1;
        return { obstacles: [{ ...o(kind, u), span: 2 }], coins: this.line(s - 14, left, 9), advance: gap, name };
      }
      case 'lowAll': {
        const kind: ObstacleKind = r.pick(['rugRoll', 'barrel'] as ObstacleKind[]);
        return { obstacles: [{ ...o(kind, 0), span: 3 }], coins: this.arc(s, r.pick(RANKS)), advance: gap, name };
      }
      case 'highAll': {
        const kind: ObstacleKind = r.pick(['laundry', 'fan'] as ObstacleKind[]);
        return { obstacles: [{ ...o(kind, 0), span: 3, motion: kind === 'fan' ? { type: 'spin' } : stat }], coins: this.tunnel(s, r.pick(RANKS)), advance: gap, name };
      }
      case 'roller': {
        const u = r.pick(RANKS);
        const kind: ObstacleKind = r.chance(0.5) ? 'toyCar' : 'barrel';
        const sp = 5 + d * 6;
        // starts further ahead so it meets the player around s
        const lead = (sp / Math.max(10, speed)) * 55;
        return { obstacles: [o(kind, u, { s: s + lead, motion: { type: 'roll', speed: sp, trigger: 70 }, warn: true })], coins: this.line(s - 10, r.pick(free([u])), 8), advance: gap + lead, name };
      }
      case 'slider': {
        const u0 = r.pick(RANKS);
        const u1 = u0 === 0 ? r.pick([-1, 1]) : 0;
        const third = free([u0, u1])[0];
        return { obstacles: [o(r.pick(['sofa', 'washer', 'cupboard'] as ObstacleKind[]), u0, { motion: { type: 'slide', u1, trigger: 34 + d * 10, dur: 0.9 }, warn: true })], coins: this.line(s - 12, third, 9), advance: gap, name };
      }
      case 'door': {
        const u = r.pick(RANKS);
        const side = u === 0 ? r.sign() : -u;
        return { obstacles: [o('door', u, { motion: { type: 'door', trigger: 32 + d * 8, side }, warn: true })], coins: this.line(s - 10, r.pick(free([u])), 8), advance: gap, name };
      }
      case 'lamp': {
        const u = r.pick(RANKS);
        return { obstacles: [o('lamp', u, { motion: { type: 'swing', amp: 0.35, period: 1.6 } })], coins: this.tunnel(s, u), advance: gap, name };
      }
      case 'vacuum':
        return { obstacles: [{ ...o('vacuum', 0), motion: { type: 'cross', speed: 0.9 + d }, warn: true }], coins: this.arc(s, 0), advance: gap, name };
      case 'dropTable': {
        const u = r.pick([-0.5, 0.5]);
        return { obstacles: [{ ...o('table', u), span: 2, motion: { type: 'drop', trigger: 40 + d * 10, height: 7 }, warn: true }], coins: this.tunnel(s, u < 0 ? -1 : 1), advance: gap, name };
      }
      case 'zigzag': {
        // consecutive rows that force a switch each time, with a coin path through
        const step = Math.max(16, speed * 0.75);
        const obstacles: ObstacleSpec[] = [];
        const coins: CoinSpec[] = [];
        let freeU = r.pick(RANKS);
        for (let i = 0; i < 3; i++) {
          const rs = s + i * step;
          for (const u of RANKS) if (u !== freeU) obstacles.push({ s: rs, kind: r.pick(BLOCK_KINDS), u, span: 1, motion: stat, warn: false });
          coins.push(...this.line(rs - 6, freeU, 3, 2.4));
          const options = RANKS.filter((u) => Math.abs(u - freeU) === 1);
          freeU = r.pick(options);
        }
        return { obstacles, coins, advance: gap + step * 2, name };
      }
      case 'combo': {
        // two blocks plus a low obstacle on the open rail: switch, then jump
        const fu = r.pick(RANKS);
        const obstacles = RANKS.filter((u) => u !== fu).map((u) => o(r.pick(BLOCK_KINDS), u));
        obstacles.push(o(r.pick(LOW_KINDS), fu, { s: s + 9 }));
        return { obstacles, coins: this.arc(s + 9, fu), advance: gap + 9, name };
      }
      case 'gauntlet': {
        const step = Math.max(13, speed * 0.55);
        return {
          obstacles: [
            { ...o(r.pick(['rugRoll', 'barrel'] as ObstacleKind[]), 0), span: 3 },
            { ...o('laundry', 0, { s: s + step }), span: 3 },
          ],
          coins: [...this.arc(s, 0), ...this.tunnel(s + step, 0)],
          advance: gap + step,
          name,
        };
      }
    }
    return { obstacles: [], coins: [], advance: gap, name: 'empty' };
  }

  /** occasional bonus collectibles and zig-zag coin trails */
  private decorate(row: Row) {
    const r = this.rng;
    this.sinceBonus++;
    if (this.sinceBonus > 14 && r.chance(0.12)) {
      this.sinceBonus = 0;
      const c = row.coins[Math.floor(row.coins.length / 2)];
      if (c) c.item = r.chance(0.6) ? 'fish' : 'magnet';
    }
  }

  line(s: number, u: number, n: number, spacing = 2.6): CoinSpec[] {
    return Array.from({ length: n }, (_, k) => ({ s: s + k * spacing, u, h: 0.75 }));
  }
  arc(s: number, u: number): CoinSpec[] {
    return Array.from({ length: 7 }, (_, k) => {
      const ss = s - 7.2 + k * 2.4;
      const t = (ss - s) / 7.5;
      return { s: ss, u, h: 0.75 + Math.max(0, 1.7 * (1 - t * t)) };
    });
  }
  tunnel(s: number, u: number): CoinSpec[] {
    return Array.from({ length: 6 }, (_, k) => ({ s: s - 6 + k * 2.4, u, h: 0.35 }));
  }
  /** coins that sweep diagonally across rails to encourage switching */
  zigzag(s: number, from: number, to: number): CoinSpec[] {
    return Array.from({ length: 9 }, (_, k) => ({ s: s + k * 2.4, u: from + ((to - from) * Math.min(1, Math.max(0, (k - 2) / 4))), h: 0.75 }));
  }
}
