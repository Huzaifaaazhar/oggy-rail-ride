/** Household obstacles. Pure data (no three.js) so planners and tests can use it. */
export type ObstacleKind =
  // low: jump over
  | 'books' | 'box' | 'toyCar' | 'bucket' | 'pots' | 'barrel' | 'vacuum' | 'cushion' | 'yarn' | 'can' | 'rugRoll'
  // high: slide under
  | 'laundry' | 'lamp' | 'fan' | 'table' | 'pans'
  // block: change rail
  | 'sofa' | 'chair' | 'plant' | 'cupboard' | 'fridge' | 'washer' | 'teapot' | 'vase' | 'door'
  // signature-moment giants
  | 'giantPot' | 'bigYarn';

export type ObstacleClass = 'low' | 'high' | 'block';

export interface ObstacleInfo {
  cls: ObstacleClass;
  /** vertical extent above the rail top (along the rider's up axis) */
  y0: number;
  y1: number;
  /** half length along the track */
  halfLen: number;
  /** half width across the track for a single-rail placement */
  halfW: number;
  /** what the game-over card blames */
  blame: string;
}

export const CATALOG: Record<ObstacleKind, ObstacleInfo> = {
  books: { cls: 'low', y0: 0, y1: 0.85, halfLen: 0.45, halfW: 0.45, blame: 'tripped over a stack of library books' },
  box: { cls: 'low', y0: 0, y1: 0.8, halfLen: 0.45, halfW: 0.45, blame: 'kicked a cardboard box and the box won' },
  toyCar: { cls: 'low', y0: 0, y1: 0.7, halfLen: 0.6, halfW: 0.4, blame: 'got run over by a toy car' },
  bucket: { cls: 'low', y0: 0, y1: 0.8, halfLen: 0.4, halfW: 0.4, blame: 'took an unplanned bath in a mop bucket' },
  pots: { cls: 'low', y0: 0, y1: 0.75, halfLen: 0.45, halfW: 0.45, blame: 'clattered into a pile of pots' },
  barrel: { cls: 'low', y0: 0, y1: 0.85, halfLen: 0.45, halfW: 0.5, blame: 'was flattened by a rolling barrel' },
  vacuum: { cls: 'low', y0: 0, y1: 0.8, halfLen: 0.5, halfW: 0.55, blame: 'got sucked up by the vacuum cleaner' },
  cushion: { cls: 'low', y0: 0, y1: 0.65, halfLen: 0.45, halfW: 0.5, blame: 'tripped on a flying cushion' },
  yarn: { cls: 'low', y0: 0, y1: 0.8, halfLen: 0.4, halfW: 0.4, blame: 'got tangled in a ball of yarn' },
  can: { cls: 'low', y0: 0, y1: 0.75, halfLen: 0.35, halfW: 0.35, blame: 'slipped on a tin of soup' },
  rugRoll: { cls: 'low', y0: 0, y1: 0.7, halfLen: 0.4, halfW: 0.5, blame: 'tripped on a rolled-up rug' },
  laundry: { cls: 'high', y0: 0.95, y1: 2.6, halfLen: 0.3, halfW: 0.6, blame: 'got wrapped up in the washing line' },
  lamp: { cls: 'high', y0: 1.0, y1: 2.4, halfLen: 0.45, halfW: 0.55, blame: 'headbutted a hanging lamp' },
  fan: { cls: 'high', y0: 1.0, y1: 1.7, halfLen: 0.9, halfW: 0.8, blame: 'got spun round by the ceiling fan' },
  table: { cls: 'high', y0: 0.95, y1: 1.3, halfLen: 0.8, halfW: 0.75, blame: 'went face-first into a falling table' },
  pans: { cls: 'high', y0: 1.0, y1: 2.3, halfLen: 0.3, halfW: 0.6, blame: 'rang the frying pans like a gong' },
  sofa: { cls: 'block', y0: 0, y1: 1.9, halfLen: 0.6, halfW: 0.8, blame: 'crash-landed on the sofa' },
  chair: { cls: 'block', y0: 0, y1: 2.0, halfLen: 0.5, halfW: 0.5, blame: 'sat down on a chair at full speed' },
  plant: { cls: 'block', y0: 0, y1: 2.6, halfLen: 0.5, halfW: 0.5, blame: 'hugged a potted plant' },
  cupboard: { cls: 'block', y0: 0, y1: 3.0, halfLen: 0.5, halfW: 0.7, blame: 'smacked into the cupboard' },
  fridge: { cls: 'block', y0: 0, y1: 3.0, halfLen: 0.55, halfW: 0.6, blame: 'went cold on the fridge' },
  washer: { cls: 'block', y0: 0, y1: 1.9, halfLen: 0.55, halfW: 0.55, blame: 'got rinsed by the washing machine' },
  teapot: { cls: 'block', y0: 0, y1: 2.8, halfLen: 0.7, halfW: 0.6, blame: 'lost an argument with a teapot' },
  vase: { cls: 'block', y0: 0, y1: 3.2, halfLen: 0.55, halfW: 0.5, blame: 'knocked over the precious vase' },
  door: { cls: 'block', y0: 0, y1: 2.6, halfLen: 0.25, halfW: 0.7, blame: 'met a door that opened at the worst moment' },
  giantPot: { cls: 'block', y0: 0, y1: 3.6, halfLen: 1.4, halfW: 1.0, blame: 'was flattened by a giant cooking pot' },
  bigYarn: { cls: 'block', y0: 0, y1: 2.6, halfLen: 1.2, halfW: 1.1, blame: 'got rolled up in a giant ball of yarn' },
};

export const LOW_KINDS: ObstacleKind[] = ['books', 'box', 'bucket', 'pots', 'yarn', 'can'];
export const BLOCK_KINDS: ObstacleKind[] = ['sofa', 'chair', 'plant', 'cupboard', 'fridge', 'washer', 'teapot', 'vase'];
export const HIGH_KINDS: ObstacleKind[] = ['laundry', 'pans'];

export type Motion =
  | { type: 'static' }
  /** rolls along its rail toward the player once triggered (m/s) */
  | { type: 'roll'; speed: number; trigger: number }
  /** slides sideways from rank u0 to u1 when the player comes within trigger */
  | { type: 'slide'; u1: number; trigger: number; dur: number }
  /** falls from above onto the rail when the player comes within trigger */
  | { type: 'drop'; trigger: number; height: number }
  /** swings shut across the rail */
  | { type: 'door'; trigger: number; side: number }
  /** hanging object swinging side to side (rank units) */
  | { type: 'swing'; amp: number; period: number }
  /** drives back and forth across all rails */
  | { type: 'cross'; speed: number }
  /** blades spinning (visual only) */
  | { type: 'spin' };

export type Actor = 'skitter' | 'chomp' | 'twig';

export interface ObstacleSpec {
  s: number;
  kind: ObstacleKind;
  /** physical rank coordinate: −1 left rail, 0 middle, +1 right (fractions between) */
  u: number;
  /** number of neighbouring rails covered */
  span: 1 | 2 | 3;
  motion: Motion;
  /** show a hazard marker before it moves */
  warn: boolean;
  by?: Actor;
}

export interface CoinSpec {
  s: number;
  u: number;
  /** height above the rail top */
  h: number;
  item?: 'fish' | 'magnet' | 'tray';
}
