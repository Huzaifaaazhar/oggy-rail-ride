import { bump, clamp01, invLerp, keys, lerp, plateau, sEase, smootherstep, trapEase, TAU } from '../util/math';
import {
  CROSS_HEIGHT,
  GeomKind,
  LaneKind,
  LaneState,
  MERGED_SPACING,
  STANDARD_SPACING,
  WIDE_SPACING,
} from './types';

/**
 * A geometry program describes the centreline of one track piece as smooth
 * functions of the normalised parameter u ∈ [0,1]. All angles are absolute so
 * a piece always ends exactly where it intends to (no integration drift in
 * orientation). Position is integrated from heading/pitch by the generator.
 */
export interface GeomProgram {
  kind: GeomKind;
  label: string;
  length: number;
  heading(u: number): number;
  pitch(u: number): number;
  roll(u: number): number;
  /** Absolute lateral sidestep from the piece start (along the horizontal right axis). */
  side(u: number): number;
  stairs: boolean;
  suspended: boolean;
  obstacles: 'normal' | 'light' | 'none';
  /** Lane programs that are geometrically safe on this piece. */
  lanes: LaneKind[];
  helix?: { turns: number; dir: number };
}

export interface LaneProgram {
  kind: LaneKind;
  /** Writes [x0,y0,x1,y1,x2,y2] in the rolled (right, up) plane. */
  offsets(u: number, out: Float64Array | number[]): void;
  balustrade(u: number): number;
  crossing(u: number): boolean;
  end: LaneState;
}

export interface GeomStart {
  heading: number;
  pitch: number;
}

const BANK_K = 34; // bank = atan(K * curvature)

function withBank(heading: (u: number) => number, length: number, scale: number) {
  const e = 1e-3;
  return (u: number) => {
    const a = heading(Math.max(0, u - e));
    const b = heading(Math.min(1, u + e));
    const du = Math.min(1, u + e) - Math.max(0, u - e);
    const k = (b - a) / (du * length);
    // positive yaw (left turn) → positive roll (right side up)
    return Math.atan(BANK_K * k) * scale;
  };
}

const constant = (v: number) => () => v;
const ALL_LANES: LaneKind[] = ['hold', 'merge', 'split', 'widePulse', 'staggerPulse', 'stackPulse', 'cross'];
const SAFE_LANES: LaneKind[] = ['hold', 'merge', 'split', 'widePulse', 'staggerPulse', 'stackPulse'];

export function straight(st: GeomStart, length: number): GeomProgram {
  return {
    kind: 'straight',
    label: 'Long landing',
    length,
    heading: constant(st.heading),
    pitch: constant(st.pitch),
    roll: constant(0),
    side: constant(0),
    stairs: true,
    suspended: false,
    obstacles: 'normal',
    lanes: ALL_LANES,
  };
}

export function slope(st: GeomStart, length: number, target: number): GeomProgram {
  return {
    kind: 'slope',
    label: target > st.pitch ? 'Staircase climb' : 'Staircase descent',
    length,
    heading: constant(st.heading),
    pitch: (u) => lerp(st.pitch, target, sEase(u)),
    roll: constant(0),
    side: constant(0),
    stairs: true,
    suspended: false,
    obstacles: 'normal',
    lanes: ALL_LANES,
  };
}

export function wave(st: GeomStart, length: number, amp: number, humps: number): GeomProgram {
  return {
    kind: 'wave',
    label: 'Bumpy banister',
    length,
    heading: constant(st.heading),
    pitch: (u) => st.pitch + amp * Math.sin(TAU * humps * u) * Math.min(1, Math.min(u, 1 - u) * 8),
    roll: constant(0),
    side: constant(0),
    stairs: false,
    suspended: false,
    obstacles: 'light',
    lanes: SAFE_LANES,
  };
}

export function turn(st: GeomStart, length: number, angle: number, sharp = false): GeomProgram {
  const heading = (u: number) => st.heading + angle * sEase(u);
  return {
    kind: sharp ? 'sharpTurn' : 'turn',
    label: sharp ? 'Hairpin bend' : 'Banked curve',
    length,
    heading,
    pitch: constant(st.pitch),
    roll: withBank(heading, length, sharp ? 1.0 : 0.85),
    side: constant(0),
    stairs: false,
    suspended: false,
    obstacles: sharp ? 'light' : 'normal',
    lanes: sharp ? ['hold', 'merge', 'split'] : SAFE_LANES,
  };
}

export function scurve(st: GeomStart, length: number, angle: number): GeomProgram {
  const heading = (u: number) => keys(u, [
    [0, st.heading],
    [0.5, st.heading + angle],
    [1, st.heading],
  ]);
  return {
    kind: 'scurve',
    label: 'S-bend',
    length,
    heading,
    pitch: constant(st.pitch),
    roll: withBank(heading, length, 0.8),
    side: constant(0),
    stairs: false,
    suspended: false,
    obstacles: 'normal',
    lanes: SAFE_LANES,
  };
}

/** Full 360° circular turn that climbs over itself. */
export function circle(st: GeomStart, radius: number, dir: number): GeomProgram {
  const length = (TAU * radius) / 0.88;
  const heading = (u: number) => st.heading + dir * TAU * trapEase(u, 0.12);
  return {
    kind: 'circle',
    label: 'Circular turn',
    length,
    heading,
    pitch: (u) => keys(u, [
      [0, st.pitch],
      [0.15, 0.11],
      [0.85, 0.11],
      [1, st.pitch],
    ]),
    roll: withBank(heading, length, 0.55),
    side: constant(0),
    stairs: false,
    suspended: true,
    obstacles: 'light',
    lanes: ['hold'],
    helix: { turns: 1, dir },
  };
}

/** Spiral staircase: two turns while climbing steeply around a giant newel column. */
export function helix(st: GeomStart, radius: number, turns: number, dir: number): GeomProgram {
  const length = (turns * TAU * radius) / 0.88;
  const heading = (u: number) => st.heading + dir * TAU * turns * trapEase(u, 0.1);
  return {
    kind: 'helix',
    label: 'Spiral staircase',
    length,
    heading,
    pitch: (u) => keys(u, [
      [0, st.pitch],
      [0.1, 0.24],
      [0.9, 0.24],
      [1, st.pitch],
    ]),
    roll: withBank(heading, length, 0.1),
    side: constant(0),
    stairs: true,
    suspended: false,
    obstacles: 'light',
    lanes: ['hold'],
    helix: { turns, dir },
  };
}

/** Vertical loop with a lateral offset so the exit clears the entry. */
export function loop(st: GeomStart, length: number, sideStep: number): GeomProgram {
  return {
    kind: 'loop',
    label: 'Loop-the-loop',
    length,
    heading: constant(st.heading),
    pitch: (u) => st.pitch + TAU * sEase(u),
    roll: constant(0),
    side: (u) => sideStep * smootherstep(u),
    stairs: false,
    suspended: true,
    obstacles: 'none',
    lanes: ['hold'],
  };
}

export function corkscrew(st: GeomStart, length: number, turns: number, dir: number, climb: number): GeomProgram {
  return {
    kind: 'corkscrew',
    label: turns > 1 ? 'Double corkscrew' : 'Corkscrew',
    length,
    heading: constant(st.heading),
    pitch: (u) => st.pitch + climb * bump(u),
    roll: (u) => dir * TAU * turns * sEase(invLerp(0.08, 0.92, u)),
    side: constant(0),
    stairs: false,
    suspended: true,
    obstacles: 'none',
    lanes: ['hold'],
  };
}

export function drop(st: GeomStart, length: number, depth: number): GeomProgram {
  return {
    kind: 'drop',
    label: 'Vertical drop',
    length,
    heading: constant(st.heading),
    pitch: (u) => keys(u, [
      [0, st.pitch],
      [0.12, 0.18],
      [0.32, -depth],
      [0.58, -depth],
      [0.9, 0],
      [1, 0],
    ]),
    roll: constant(0),
    side: constant(0),
    stairs: false,
    suspended: true,
    obstacles: 'none',
    lanes: ['hold'],
  };
}

/** A huge loop that climbs while inverted, so the exit is a floor higher. */
export function giantLoop(st: GeomStart, length: number, sideStep: number, climb: number): GeomProgram {
  return {
    kind: 'giantLoop',
    label: 'Giant loop',
    length,
    heading: constant(st.heading),
    // loop over the first 72 %, then a steep kick up to the next floor
    pitch: (u) => (u < 0.72 ? st.pitch + TAU * sEase(u / 0.72) : st.pitch + climb * bump((u - 0.72) / 0.28)),
    roll: constant(0),
    side: (u) => sideStep * smootherstep(Math.min(1, u / 0.72)),
    stairs: false,
    suspended: true,
    obstacles: 'none',
    lanes: ['hold'],
  };
}

/** Three-turn giant spiral around a newel column. */
export function giantSpiral(st: GeomStart, radius: number, dir: number): GeomProgram {
  const g = helix(st, radius, 3, dir);
  g.kind = 'giantSpiral';
  g.label = 'Giant spiral';
  g.pitch = (u) => keys(u, [
    [0, st.pitch],
    [0.08, 0.2],
    [0.92, 0.2],
    [1, st.pitch],
  ]);
  return g;
}

/** Sudden dip: a short, sharp plunge and kick back up. */
export function dip(st: GeomStart, length: number, depth: number): GeomProgram {
  return {
    kind: 'dip',
    label: 'Sudden dip',
    length,
    heading: constant(st.heading),
    pitch: (u) => keys(u, [
      [0, st.pitch],
      [0.22, -depth],
      [0.5, -depth * 0.2],
      [0.72, depth * 0.75],
      [1, st.pitch],
    ]),
    roll: constant(0),
    side: constant(0),
    stairs: false,
    suspended: true,
    obstacles: 'light',
    lanes: ['hold', 'merge', 'split'],
  };
}

/** Twisting staircase: rolling side to side while snaking, rails staggered in height. */
export function twist(st: GeomStart, length: number, angle: number, rollAmp: number): GeomProgram {
  const heading = (u: number) => st.heading + angle * Math.sin(TAU * u) * 0.5 * (1 - Math.cos(TAU * u)) * 0.5;
  return {
    kind: 'twist',
    label: 'Twisting staircase',
    length,
    heading,
    pitch: (u) => st.pitch + 0.08 * bump(u),
    roll: (u) => rollAmp * Math.sin(2 * TAU * u) * bump(u),
    side: constant(0),
    stairs: false,
    suspended: true,
    obstacles: 'light',
    lanes: ['hold', 'staggerPulse'],
  };
}

/* ------------------------------------------------------------------ lanes */

function writeLayout(w: number, z: number, rank: readonly number[], out: Float64Array | number[]) {
  for (let i = 0; i < 3; i++) {
    const r = rank[i] - 1;
    out[i * 2] = r * w;
    out[i * 2 + 1] = r * z;
  }
}

export function laneProgram(kind: LaneKind, s: LaneState): LaneProgram {
  const rank = s.rank;
  const balOn = () => 1;
  switch (kind) {
    case 'merge':
    case 'split': {
      const wT = kind === 'merge' ? MERGED_SPACING : STANDARD_SPACING;
      return {
        kind,
        offsets: (u, out) => {
          const t = smootherstep(invLerp(0.1, 0.9, u));
          writeLayout(lerp(s.w, wT, t), lerp(s.z, 0, t), rank, out);
        },
        balustrade: balOn,
        crossing: () => false,
        end: { w: wT, z: 0, rank: [...rank] as LaneState['rank'] },
      };
    }
    case 'widePulse':
      return {
        kind,
        offsets: (u, out) => writeLayout(lerp(s.w, WIDE_SPACING, plateau(u)), s.z * (1 - plateau(u)), rank, out),
        balustrade: balOn,
        crossing: () => false,
        end: { w: s.w, z: 0, rank: [...rank] as LaneState['rank'] },
      };
    case 'stackPulse':
      // rails step up like a staircase cross-section: stacked levels, hop diagonally
      return {
        kind,
        offsets: (u, out) => writeLayout(lerp(s.w, 2.0, plateau(u)), 3.1 * plateau(u), rank, out),
        balustrade: (u) => 1 - 0.7 * plateau(u),
        crossing: () => false,
        end: { w: s.w, z: 0, rank: [...rank] as LaneState['rank'] },
      };
    case 'staggerPulse':
      return {
        kind,
        offsets: (u, out) => writeLayout(lerp(s.w, STANDARD_SPACING, plateau(u)), 1.7 * plateau(u), rank, out),
        balustrade: balOn,
        crossing: () => false,
        end: { w: s.w, z: 0, rank: [...rank] as LaneState['rank'] },
      };
    case 'cross': {
      // the left-most rail arcs over the middle one while the right-most dips under it
      const newRank: LaneState['rank'] = [rank[0], rank[1], rank[2]];
      for (let i = 0; i < 3; i++) if (rank[i] !== 1) newRank[i] = 2 - rank[i];
      const w = s.w;
      return {
        kind,
        offsets: (u, out) => {
          const c = clamp01((u - 0.15) / 0.7);
          const t = smootherstep(c);
          const b = bump(c);
          for (let i = 0; i < 3; i++) {
            const r0 = rank[i] - 1;
            if (r0 === 0) {
              out[i * 2] = 0;
              out[i * 2 + 1] = 0;
            } else {
              out[i * 2] = lerp(r0 * w, -r0 * w, t);
              out[i * 2 + 1] = (r0 < 0 ? CROSS_HEIGHT : -CROSS_HEIGHT) * b;
            }
          }
        },
        balustrade: (u) => 1 - smootherstep(invLerp(0.02, 0.14, u)) * (1 - smootherstep(invLerp(0.86, 0.98, u))),
        crossing: (u) => u > 0.1 && u < 0.9,
        end: { w, z: 0, rank: newRank },
      };
    }
    case 'hold':
    default:
      return {
        kind: 'hold',
        offsets: (_u, out) => writeLayout(s.w, s.z, rank, out),
        balustrade: balOn,
        crossing: () => false,
        end: { w: s.w, z: s.z, rank: [...rank] as LaneState['rank'] },
      };
  }
}
