/** Distance between stored track samples along the centreline (metres). */
export const DS = 0.5;
/** Samples per storage chunk (256 m). */
export const CHUNK_SAMPLES = 512;
export const CHUNK_LENGTH = DS * CHUNK_SAMPLES;
export const RAIL_COUNT = 3;

/** Height of the walkable top surface of a handrail above its centreline. */
export const RAIL_TOP = 0.2;
/** Full balustrade depth (handrail to bottom rail). */
export const BALUSTRADE_DEPTH = 2.6;
/** Max distance between two rails for a hop to be allowed. */
export const MAX_HOP_DISTANCE = 5.2;

export const STANDARD_SPACING = 2.4;
export const MERGED_SPACING = 0.62;
export const WIDE_SPACING = 7.5;
export const CROSS_HEIGHT = 5.6;

export type GeomKind =
  | 'straight'
  | 'slope'
  | 'wave'
  | 'turn'
  | 'scurve'
  | 'sharpTurn'
  | 'circle'
  | 'helix'
  | 'loop'
  | 'corkscrew'
  | 'drop'
  | 'twist';

export type LaneKind = 'hold' | 'merge' | 'split' | 'widePulse' | 'staggerPulse' | 'cross';

/** Sample flags */
export const F_STAIRS = 1;
export const F_SUSPENDED = 2;
export const F_CROSSING = 4;
export const F_NO_OBSTACLES = 8;

/**
 * Float layout of one stored sample.
 * Base frame (fwd/right/up) is the un-rolled frame: `right` is always horizontal
 * (heading/pitch only), so loops are handled exactly, without gimbal issues.
 * Roll (banking, corkscrews) is stored separately as cos/sin so it can be
 * interpolated safely across 2π wraps.
 */
export const O_POS = 0;
export const O_FWD = 3;
export const O_RIGHT = 6;
export const O_UP = 9;
export const O_ROLL = 12; // cos, sin
export const O_LANES = 14; // x0,y0,x1,y1,x2,y2
export const O_BAL = 20;
export const O_PITCH = 21;
export const O_HEADING = 22;
export const STRIDE = 23;

export interface LaneState {
  /** Spacing between neighbouring rails along the rolled right axis. */
  w: number;
  /** Vertical stagger between neighbouring rails. */
  z: number;
  /** rank[i] = physical order (0 = left, 1 = middle, 2 = right) of rail i. */
  rank: [number, number, number];
}

export interface PieceRecord {
  index: number;
  geom: GeomKind;
  lane: LaneKind;
  label: string;
  s0: number;
  s1: number;
  /** Lane state at the end of the piece. */
  lanesEnd: LaneState;
  obstacles: 'normal' | 'light' | 'none';
}

export interface Feature {
  kind: 'column';
  x: number;
  z: number;
  yTop: number;
  yBottom: number;
  radius: number;
  s: number;
}
