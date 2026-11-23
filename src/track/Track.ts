import * as THREE from 'three';
import { clamp01, makeRng, Rng, TAU, wrapAngle } from '../util/math';
import {
  circle,
  corkscrew,
  dip,
  drop,
  GeomProgram,
  GeomStart,
  helix,
  laneProgram,
  loop,
  scurve,
  slope,
  straight,
  turn,
  twist,
  wave,
} from './pieces';
import {
  CHUNK_SAMPLES,
  DS,
  F_CROSSING,
  F_NO_OBSTACLES,
  F_STAIRS,
  F_SUSPENDED,
  Feature,
  GeomKind,
  LaneKind,
  LaneState,
  MAX_HOP_DISTANCE,
  O_BAL,
  O_FWD,
  O_HEADING,
  O_LANES,
  O_PITCH,
  O_POS,
  O_RIGHT,
  O_ROLL,
  O_UP,
  PieceRecord,
  RAIL_COUNT,
  STANDARD_SPACING,
  STRIDE,
} from './types';

/** Interpolated track frame at an arbitrary distance s. */
export class TrackFrame {
  s = 0;
  pos = new THREE.Vector3();
  fwd = new THREE.Vector3();
  /** Rolled right/up — the frame riders and rails live in. */
  right = new THREE.Vector3();
  up = new THREE.Vector3();
  /** Un-rolled frame (right is always horizontal). */
  baseRight = new THREE.Vector3();
  baseUp = new THREE.Vector3();
  rollCos = 1;
  rollSin = 0;
  lanes = new Float64Array(6);
  bal = 1;
  pitch = 0;
  heading = 0;
  flags = 0;
  pieceIndex = 0;

  /** Position of rail `i` centreline. */
  railPoint(i: number, out: THREE.Vector3) {
    return out
      .copy(this.pos)
      .addScaledVector(this.right, this.lanes[i * 2])
      .addScaledVector(this.up, this.lanes[i * 2 + 1]);
  }

  /** Point at lateral/vertical offset in the rolled frame. */
  offsetPoint(x: number, y: number, out: THREE.Vector3) {
    return out.copy(this.pos).addScaledVector(this.right, x).addScaledVector(this.up, y);
  }
}

interface ChunkData {
  data: Float64Array;
  flags: Uint8Array;
  piece: Int32Array;
}

const fwdOf = (h: number, p: number, out: THREE.Vector3) =>
  out.set(-Math.cos(p) * Math.sin(h), Math.sin(p), -Math.cos(p) * Math.cos(h));
const rightOf = (h: number, out: THREE.Vector3) => out.set(Math.cos(h), 0, -Math.sin(h));

export interface TrackOptions {
  seed?: number;
  /** Force a sequence of geometry kinds (debug / testing), cycled. */
  forced?: GeomKind[];
}

/**
 * Procedural, endless three-rail track.
 *
 * The centreline is produced by integrating heading (about world-up) and pitch
 * (about the always-horizontal right axis) along arc length; pieces describe
 * those angles analytically, so frames are exact through loops and every piece
 * ends precisely aligned. Roll and the three rail offsets are layered on top.
 */
export class Track {
  readonly seed: number;
  private rng: Rng;
  private chunks = new Map<number, ChunkData>();
  /** Number of samples written so far (global index of the next sample). */
  count = 0;
  pieces: PieceRecord[] = [];
  features: Feature[] = [];
  private forced?: GeomKind[];

  // integration state
  private pos = new THREE.Vector3(0, 0, 0);
  private h = 0;
  private p = 0;
  private lanes: LaneState = { w: STANDARD_SPACING, z: 0, rank: [0, 1, 2] };
  private lastKind: GeomKind | null = null;
  private pending: GeomKind | null = null;
  /** planned combo chain (later pieces of a dramatic sequence) */
  private chain: GeomKind[] = [];
  private sinceSpecial = 0;

  private tmpF = new THREE.Vector3();
  private tmpR = new THREE.Vector3();
  private tmpU = new THREE.Vector3();
  private tmpT = new THREE.Vector3();
  private laneBuf = new Float64Array(6);

  constructor(opts: TrackOptions = {}) {
    this.seed = opts.seed ?? (Math.random() * 1e9) | 0;
    this.rng = makeRng(this.seed);
    this.forced = opts.forced;
  }

  get length() {
    return Math.max(0, (this.count - 1) * DS);
  }

  /** Generate until the track extends to at least distance s. */
  ensure(s: number) {
    while (this.length < s) this.appendPiece();
  }

  /** World position of the last generated sample. */
  endZ() {
    return this.pos.z;
  }

  /** Drop stored samples behind sMin. */
  prune(sMin: number) {
    const keepFrom = Math.floor(sMin / DS / CHUNK_SAMPLES);
    for (const k of this.chunks.keys()) if (k < keepFrom) this.chunks.delete(k);
    while (this.pieces.length > 2 && this.pieces[1].s1 < sMin) this.pieces.shift();
    this.features = this.features.filter((f) => f.s > sMin - 400);
  }

  hasChunk(k: number) {
    return this.chunks.has(k);
  }

  pieceAt(s: number): PieceRecord | undefined {
    for (let i = this.pieces.length - 1; i >= 0; i--) if (this.pieces[i].s0 <= s) return this.pieces[i];
    return this.pieces[0];
  }

  /* ----------------------------------------------------------- sampling */

  private loc(g: number): [ChunkData, number] | null {
    const k = Math.floor(g / CHUNK_SAMPLES);
    const c = this.chunks.get(k);
    if (!c) return null;
    return [c, g - k * CHUNK_SAMPLES];
  }

  /** Raw access to sample g (global index) — used by mesh builders. */
  readSample(g: number, out: TrackFrame) {
    const gg = Math.max(0, Math.min(this.count - 1, g));
    const l = this.loc(gg);
    if (!l) return out;
    const [c, i] = l;
    const d = c.data;
    const o = i * STRIDE;
    out.s = gg * DS;
    out.pos.set(d[o + O_POS], d[o + O_POS + 1], d[o + O_POS + 2]);
    out.fwd.set(d[o + O_FWD], d[o + O_FWD + 1], d[o + O_FWD + 2]);
    out.baseRight.set(d[o + O_RIGHT], d[o + O_RIGHT + 1], d[o + O_RIGHT + 2]);
    out.baseUp.set(d[o + O_UP], d[o + O_UP + 1], d[o + O_UP + 2]);
    out.rollCos = d[o + O_ROLL];
    out.rollSin = d[o + O_ROLL + 1];
    for (let j = 0; j < 6; j++) out.lanes[j] = d[o + O_LANES + j];
    out.bal = d[o + O_BAL];
    out.pitch = d[o + O_PITCH];
    out.heading = d[o + O_HEADING];
    out.flags = c.flags[i];
    out.pieceIndex = c.piece[i];
    this.applyRoll(out);
    return out;
  }

  private applyRoll(out: TrackFrame) {
    const c = out.rollCos;
    const s = out.rollSin;
    out.right.copy(out.baseRight).multiplyScalar(c).addScaledVector(out.baseUp, s);
    out.up.copy(out.baseUp).multiplyScalar(c).addScaledVector(out.baseRight, -s);
  }

  private fa = new TrackFrame();
  private fb = new TrackFrame();

  /** Interpolated frame at distance s (clamped to the generated range). */
  frameAt(s: number, out: TrackFrame): TrackFrame {
    const g = Math.max(0, Math.min(this.count - 1.0001, s / DS));
    const i0 = Math.floor(g);
    const t = g - i0;
    const a = this.readSample(i0, this.fa);
    const b = this.readSample(i0 + 1, this.fb);
    out.s = s;
    out.pos.lerpVectors(a.pos, b.pos, t);
    out.fwd.lerpVectors(a.fwd, b.fwd, t).normalize();
    out.baseRight.lerpVectors(a.baseRight, b.baseRight, t).normalize();
    out.baseUp.lerpVectors(a.baseUp, b.baseUp, t).normalize();
    let rc = a.rollCos + (b.rollCos - a.rollCos) * t;
    let rs = a.rollSin + (b.rollSin - a.rollSin) * t;
    const rl = Math.hypot(rc, rs) || 1;
    rc /= rl;
    rs /= rl;
    out.rollCos = rc;
    out.rollSin = rs;
    for (let j = 0; j < 6; j++) out.lanes[j] = a.lanes[j] + (b.lanes[j] - a.lanes[j]) * t;
    out.bal = a.bal + (b.bal - a.bal) * t;
    out.pitch = a.pitch + (b.pitch - a.pitch) * t;
    out.heading = a.heading + wrapAngle(b.heading - a.heading) * t;
    out.flags = t < 0.5 ? a.flags : b.flags;
    out.pieceIndex = t < 0.5 ? a.pieceIndex : b.pieceIndex;
    this.applyRoll(out);
    return out;
  }

  /** Distance between two rails at frame f, in the rolled rider plane. */
  static railDistance(f: TrackFrame, a: number, b: number) {
    return Math.hypot(f.lanes[a * 2] - f.lanes[b * 2], f.lanes[a * 2 + 1] - f.lanes[b * 2 + 1]);
  }

  static canHop(f: TrackFrame, a: number, b: number) {
    if (f.flags & F_CROSSING) return false;
    return Track.railDistance(f, a, b) < MAX_HOP_DISTANCE;
  }

  /** Rail physically next to `rail` in direction dir (-1 left, +1 right), or -1. */
  static neighbour(f: TrackFrame, rail: number, dir: number) {
    const x0 = f.lanes[rail * 2];
    let best = -1;
    let bestDx = Infinity;
    for (let i = 0; i < RAIL_COUNT; i++) {
      if (i === rail) continue;
      const dx = (f.lanes[i * 2] - x0) * dir;
      if (dx > 0.05 && dx < bestDx) {
        bestDx = dx;
        best = i;
      }
    }
    return best;
  }

  /* --------------------------------------------------------- generation */

  private difficulty() {
    return clamp01(this.length / 2600);
  }

  private buildGeom(kind: GeomKind, st: GeomStart): GeomProgram {
    const r = this.rng;
    const d = this.difficulty();
    const towardCentre = () => {
      // steer heading/x back toward the main axis most of the time
      // heading h>0 moves toward -x, so the heading that returns to the axis is ≈ x/90
      const bias = this.pos.x / 90 - wrapAngle(this.h);
      return r.chance(0.8) ? (bias >= 0 ? 1 : -1) : r.sign();
    };
    switch (kind) {
      case 'straight':
        return straight(st, r.range(40, 85));
      case 'slope': {
        const all = [-0.24, -0.1, 0, 0.14, 0.26, 0.38, ...(d > 0.25 ? [0.52] : [])];
        const opts = all.filter((x) => Math.abs(x - this.p) > 0.08);
        const target = r.weighted(opts.map((x) => [x, x > 0.45 ? 0.9 * d + 0.3 : x > 0 ? 1.6 : x === 0 ? 1.2 : 0.8] as const));
        const g = slope(st, r.range(45, 80), target);
        if (target > 0.45) g.label = 'Steep climb';
        return g;
      }
      case 'wave':
        return wave(st, r.range(110, 150), r.range(0.13, 0.2), r.int(2, 3));
      case 'turn':
        return turn(st, r.range(55, 90), towardCentre() * r.range(0.45, 1.2));
      case 'sharpTurn':
        return turn(st, r.range(46, 58), towardCentre() * r.range(1.55, 2.05), true);
      case 'scurve':
        return scurve(st, r.range(95, 130), r.sign() * r.range(0.45, 0.85));
      case 'circle':
        return circle(st, r.range(24, 28), towardCentre());
      case 'helix':
        return helix(st, r.range(18, 21), 2, towardCentre());
      case 'loop':
        return loop(st, r.range(126, 140), (this.pos.x > 0 ? -1 : 1) * 14);
      case 'corkscrew': {
        const two = d > 0.55 && r.chance(0.4);
        return corkscrew(st, two ? r.range(140, 160) : r.range(75, 95), two ? 2 : 1, r.sign(), r.range(0, 0.12));
      }
      case 'drop':
        return drop(st, r.range(90, 115), r.range(0.8, 1.15));
      case 'dip':
        return dip(st, r.range(48, 62), r.range(0.45, 0.6 + 0.2 * d));
      case 'twist':
        return twist(st, r.range(110, 150), r.sign() * 0.35, r.range(0.5, 0.8));
    }
  }

  private static NEEDS_LEVEL: GeomKind[] = ['loop', 'helix', 'circle', 'drop', 'dip'];
  /** Dramatic multi-piece sequences unlocked as difficulty rises. */
  private static COMBOS: GeomKind[][] = [
    ['drop', 'loop'],
    ['helix', 'drop'],
    ['corkscrew', 'sharpTurn'],
    ['loop', 'corkscrew'],
    ['dip', 'dip', 'twist'],
    ['circle', 'drop', 'loop'],
    ['sharpTurn', 'corkscrew', 'dip'],
  ];
  private static SPECIAL: GeomKind[] = ['loop', 'helix', 'circle', 'drop', 'corkscrew', 'twist', 'sharpTurn', 'dip'];

  /** Quick coarse simulation to keep the track inside the house. */
  private fits(g: GeomProgram) {
    const step = 2;
    const n = Math.max(2, Math.ceil(g.length / step));
    let x = this.pos.x;
    let prevSide = 0;
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      const um = (k - 0.5) / n;
      const h = g.heading(um);
      const p = g.pitch(um);
      const ds = g.length / n;
      x += -Math.cos(p) * Math.sin(h) * ds;
      const sd = g.side(u);
      x += Math.cos(h) * (sd - prevSide);
      prevSide = sd;
      if (Math.abs(x) > 62) return false;
    }
    const hEnd = wrapAngle(g.heading(1));
    if (Math.abs(hEnd) > 1.75) return false;
    // leave room for the next piece: project 45 m ahead along the exit heading
    const ahead = x - Math.sin(hEnd) * 45;
    if (Math.abs(ahead) > 60) return false;
    return true;
  }

  /** Max |x| reached plus a penalty for the exit heading (lower is better). */
  private score(g: GeomProgram) {
    let x = this.pos.x;
    let m = 0;
    const n = Math.ceil(g.length / 2);
    for (let k = 1; k <= n; k++) {
      const um = (k - 0.5) / n;
      x += -Math.cos(g.pitch(um)) * Math.sin(g.heading(um)) * (g.length / n);
      m = Math.max(m, Math.abs(x));
    }
    const hEnd = wrapAngle(g.heading(1));
    return m + Math.abs(x - Math.sin(hEnd) * 45) * 0.5 + Math.abs(hEnd) * 10;
  }

  private pickKind(): GeomKind {
    const r = this.rng;
    const d = this.difficulty();
    if (this.forced && this.forced.length) {
      return this.forced[(this.pieces.length - 2 + this.forced.length * 100) % this.forced.length];
    }
    const specialBoost = this.sinceSpecial > 3 ? 1.8 : 1;
    const table: [GeomKind, number][] = [
      ['straight', 2.2],
      ['slope', 3.0],
      ['wave', 1.4],
      ['turn', 3.0],
      ['scurve', 1.8],
      ['sharpTurn', (0.8 + 1.4 * d) * specialBoost],
      ['circle', (0.5 + 1.0 * d) * specialBoost],
      ['helix', (0.55 + 1.0 * d) * specialBoost],
      ['loop', (0.45 + 1.4 * d) * specialBoost],
      ['corkscrew', (0.45 + 1.4 * d) * specialBoost],
      ['drop', (0.5 + 1.0 * d) * specialBoost],
      ['twist', (0.35 + 1.0 * d) * specialBoost],
      ['dip', 0.6 + 1.0 * d],
    ];
    // past the warm-up, sometimes string specials together into a set piece
    if (d > 0.3 && !this.chain.length && r.chance(0.12 + 0.25 * d)) {
      const combo = r.pick(Track.COMBOS);
      this.chain = combo.slice(1);
      return combo[0];
    }
    return r.weighted(table.filter(([k]) => k !== this.lastKind || k === 'slope' || k === 'turn'));
  }

  private pickLane(g: GeomProgram): LaneKind {
    const r = this.rng;
    if (this.pieces.length < 3) return 'hold';
    const l = this.lanes;
    const merged = l.w < 1;
    const opts: [LaneKind, number][] = [];
    for (const k of g.lanes) {
      if (k === 'hold') opts.push([k, merged ? 1.5 : 4]);
      if (k === 'merge' && !merged) opts.push([k, 1.2]);
      if (k === 'split' && merged) opts.push([k, 5]);
      if (k === 'widePulse' && !merged) opts.push([k, 1.3]);
      if (k === 'staggerPulse' && !merged) opts.push([k, 1.0]);
      if (k === 'cross' && !merged && l.z === 0) opts.push([k, 1.4]);
    }
    if (!opts.length) return 'hold';
    return r.weighted(opts);
  }

  private nextProgram(): { geom: GeomProgram; lane: LaneKind } {
    const st: GeomStart = { heading: this.h, pitch: this.p };
    const idx = this.pieces.length;
    if (idx === 0) return { geom: straight(st, 90), lane: 'hold' };
    if (idx === 1) return { geom: slope(st, 60, 0.16), lane: 'hold' };

    for (let attempt = 0; attempt < 24; attempt++) {
      let kind = this.pending ?? (this.chain.length && !this.forced ? this.chain.shift()! : this.pickKind());
      this.pending = null;
      if (Track.NEEDS_LEVEL.includes(kind) && Math.abs(this.p) > 0.02) {
        // level out first, keep the special for the next piece
        this.pending = kind;
        const g = slope(st, this.rng.range(35, 50), 0);
        if (this.fits(g)) return { geom: g, lane: this.pickLane(g) };
        this.pending = null;
        continue;
      }
      const g = this.buildGeom(kind, st);
      if (!this.fits(g)) {
        if (this.forced) {
          // forced sequence: steer instead of skipping
          const fix = turn(st, 70, Math.max(-1.2, Math.min(1.2, this.pos.x / 60 - wrapAngle(this.h))));
          this.pending = kind;
          return { geom: fix, lane: 'hold' };
        }
        continue;
      }
      return { geom: g, lane: this.pickLane(g) };
    }
    // fallback: pick the steering turn that best returns to the main axis
    let best: GeomProgram | null = null;
    let bestScore = Infinity;
    for (let a = -1.6; a <= 1.6001; a += 0.2) {
      for (const len of [50, 70, 95]) {
        const g = turn(st, len, a);
        const score = this.score(g);
        if (score < bestScore) {
          bestScore = score;
          best = g;
        }
      }
    }
    return { geom: best!, lane: 'hold' };
  }

  private ensureChunk(k: number): ChunkData {
    let c = this.chunks.get(k);
    if (!c) {
      c = {
        data: new Float64Array(CHUNK_SAMPLES * STRIDE),
        flags: new Uint8Array(CHUNK_SAMPLES),
        piece: new Int32Array(CHUNK_SAMPLES),
      };
      this.chunks.set(k, c);
    }
    return c;
  }

  private appendPiece() {
    const { geom, lane: laneKind } = this.nextProgram();
    const lp = laneProgram(laneKind, this.lanes);
    const n = Math.max(2, Math.round(geom.length / DS));
    const s0 = this.length;
    const pieceIndex = this.pieces.length;

    const F = this.tmpF;
    const R = this.tmpR;
    const U = this.tmpU;
    const T = this.tmpT;
    const lanes = this.laneBuf;

    let helixSumX = 0;
    let helixSumZ = 0;
    let helixN = 0;
    let maxY = -Infinity;

    const k0 = this.count === 0 ? 0 : 1;
    for (let k = k0; k <= n; k++) {
      const u = k / n;
      if (k > 0) {
        const up = (k - 1) / n;
        const um = (k - 0.5) / n;
        fwdOf(geom.heading(um), geom.pitch(um), F);
        rightOf(geom.heading(um), R);
        this.pos.addScaledVector(F, DS).addScaledVector(R, geom.side(u) - geom.side(up));
      }
      const h = geom.heading(u);
      const p = geom.pitch(u);
      const roll = geom.roll(u);
      // true tangent including the sidestep
      const e = 1 / n;
      const dSide = (geom.side(Math.min(1, u + e)) - geom.side(Math.max(0, u - e))) / ((Math.min(1, u + e) - Math.max(0, u - e)) * n * DS);
      fwdOf(h, p, F);
      rightOf(h, R);
      T.copy(F).addScaledVector(R, dSide).normalize();
      R.addScaledVector(T, -R.dot(T)).normalize();
      U.crossVectors(R, T).normalize();

      lp.offsets(u, lanes);
      const bal = lp.balustrade(u);
      const crossing = lp.crossing(u);

      const g = this.count;
      const c = this.ensureChunk(Math.floor(g / CHUNK_SAMPLES));
      const i = g % CHUNK_SAMPLES;
      const o = i * STRIDE;
      const d = c.data;
      d[o + O_POS] = this.pos.x;
      d[o + O_POS + 1] = this.pos.y;
      d[o + O_POS + 2] = this.pos.z;
      d[o + O_FWD] = T.x;
      d[o + O_FWD + 1] = T.y;
      d[o + O_FWD + 2] = T.z;
      d[o + O_RIGHT] = R.x;
      d[o + O_RIGHT + 1] = R.y;
      d[o + O_RIGHT + 2] = R.z;
      d[o + O_UP] = U.x;
      d[o + O_UP + 1] = U.y;
      d[o + O_UP + 2] = U.z;
      d[o + O_ROLL] = Math.cos(roll);
      d[o + O_ROLL + 1] = Math.sin(roll);
      for (let j = 0; j < 6; j++) d[o + O_LANES + j] = lanes[j];
      d[o + O_BAL] = bal;
      d[o + O_PITCH] = wrapAngle(p);
      d[o + O_HEADING] = wrapAngle(h);

      let flags = 0;
      const flat = Math.abs(lanes[1]) < 0.05 && Math.abs(lanes[3]) < 0.05 && Math.abs(lanes[5]) < 0.05;
      if (geom.stairs && Math.abs(Math.sin(roll)) < 0.12 && Math.cos(roll) > 0 && U.y > 0.9 && flat && bal > 0.95) flags |= F_STAIRS;
      if (geom.suspended) flags |= F_SUSPENDED;
      if (crossing) flags |= F_CROSSING;
      if (geom.obstacles === 'none' || crossing) flags |= F_NO_OBSTACLES;
      c.flags[i] = flags;
      c.piece[i] = pieceIndex;
      this.count++;

      if (geom.helix && u > 0.1 && u < 0.9) {
        helixSumX += this.pos.x;
        helixSumZ += this.pos.z;
        helixN++;
      }
      maxY = Math.max(maxY, this.pos.y);
    }

    this.h = wrapAngle(geom.heading(1));
    this.p = wrapAngle(geom.pitch(1));
    if (Math.abs(this.p) < 1e-6) this.p = 0;
    this.lanes = lp.end;

    this.pieces.push({
      index: pieceIndex,
      geom: geom.kind,
      lane: lp.kind,
      label: geom.label,
      s0,
      s1: this.length,
      lanesEnd: lp.end,
      obstacles: geom.obstacles,
    });
    if (geom.kind === 'helix' && helixN > 0) {
      const radius = geom.length * 0.88 / (TAU * (geom.helix?.turns ?? 1));
      this.features.push({
        kind: 'column',
        x: helixSumX / helixN,
        z: helixSumZ / helixN,
        yTop: maxY + 14,
        yBottom: -Infinity,
        radius: Math.max(4, radius - 7.5),
        s: (s0 + this.length) / 2,
      });
    }
    if (Track.SPECIAL.includes(geom.kind)) this.sinceSpecial = 0;
    else this.sinceSpecial++;
    this.lastKind = geom.kind;
  }
}
