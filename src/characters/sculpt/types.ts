/** Serializable sculpt description (sent to the worker). All positions in model space, metres. */
export type V3 = [number, number, number];

export interface Xf {
  /** origin of the local frame */
  o: V3;
  /** euler XYZ rotation of the local frame */
  r?: V3;
  /** non-uniform scale of the local frame */
  s?: V3;
}

export type Shape =
  | { type: 'ell'; c: V3; r: V3; rot?: V3 }
  | { type: 'cone'; a: V3; b: V3; ra: number; rb: number; xf?: Xf }
  | { type: 'plane'; n: V3; d: number };

export interface Prim {
  shape: Shape;
  op: 'add' | 'sub';
  /** smooth blend radius */
  k: number;
  /** bone this primitive deforms with (add only) */
  bone?: string;
  /** skin influence multiplier */
  skin?: number;
  color?: string;
  rough?: number;
}

export interface Paint {
  shape: Shape;
  color?: string;
  rough?: number;
  /** edge softness (m) */
  soft: number;
  strength?: number;
  /** optional stripes inside the region, along axis */
  bands?: { axis: V3; period: number; width: number; color: string; phase?: number };
}

export interface WeightOverride {
  bone: string;
  shape: Shape;
  soft: number;
  max: number;
}

export interface BoneSpec {
  name: string;
  parent: string | null;
  /** model-space rest position */
  pos: V3;
  /** orient the bone so its local +Y points at this model-space point */
  aim?: V3;
}

export interface SculptSpec {
  name: string;
  min: V3;
  max: V3;
  cell: number;
  baseColor: string;
  baseRough: number;
  /** colour jitter amplitude and frequency */
  noise?: { amp: number; freq: number };
  prims: Prim[];
  paints: Paint[];
  weights: WeightOverride[];
  bones: BoneSpec[];
  /** Laplacian relaxation passes */
  relax?: number;
}

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  rough: Float32Array;
  index: Uint32Array;
  skinIndex?: Uint16Array;
  skinWeight?: Float32Array;
  ms: number;
}
