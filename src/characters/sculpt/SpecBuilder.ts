import type { BoneSpec, Paint, Prim, SculptSpec, Shape, V3, Xf } from './types';

interface PrimOpts {
  k?: number;
  color?: string;
  rough?: number;
  skin?: number;
}

/** Small DSL for writing sculpt specs; `mirror` builds left (+x) and right (−x) halves. */
export class SpecBuilder {
  spec: SculptSpec;
  constructor(name: string, min: V3, max: V3, cell: number, baseColor: string, baseRough: number) {
    this.spec = { name, min, max, cell, baseColor, baseRough, prims: [], paints: [], weights: [], bones: [] };
  }
  bone(name: string, parent: string | null, pos: V3, aim?: V3) {
    this.spec.bones.push({ name, parent, pos, aim } as BoneSpec);
    return this;
  }
  add(bone: string, shape: Shape, o: PrimOpts = {}) {
    this.spec.prims.push({ shape, op: 'add', k: o.k ?? 0.04, bone, color: o.color, rough: o.rough, skin: o.skin } as Prim);
    return this;
  }
  ell(bone: string, c: V3, r: V3, o: PrimOpts & { rot?: V3 } = {}) {
    return this.add(bone, { type: 'ell', c, r, rot: o.rot }, o);
  }
  cone(bone: string, a: V3, b: V3, ra: number, rb: number, o: PrimOpts & { xf?: Xf } = {}) {
    return this.add(bone, { type: 'cone', a, b, ra, rb, xf: o.xf }, o);
  }
  sub(shape: Shape, k = 0.02) {
    this.spec.prims.push({ shape, op: 'sub', k });
    return this;
  }
  paint(shape: Shape, color: string | undefined, soft: number, o: Partial<Paint> = {}) {
    this.spec.paints.push({ shape, color, soft, ...o });
    return this;
  }
  weight(bone: string, shape: Shape, soft: number, max = 1) {
    this.spec.weights.push({ bone, shape, soft, max });
    return this;
  }
  /** Call f twice: side = 1 for the left (+x) half, −1 for the right; L/R suffix. */
  mirror(f: (s: number, LR: 'L' | 'R') => void) {
    f(1, 'L');
    f(-1, 'R');
    return this;
  }
}

export const mx = (v: V3, s: number): V3 => [v[0] * s, v[1], v[2]];
export const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
