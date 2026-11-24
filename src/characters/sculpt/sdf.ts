import type { Shape, V3, Xf } from './types';

/** Compiled shape: evaluates signed distance at (x,y,z) and knows its bounds. */
export interface CShape {
  d(x: number, y: number, z: number): number;
  min: V3;
  max: V3;
}

export function smin(a: number, b: number, k: number) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export function smax(a: number, b: number, k: number) {
  return -smin(-a, -b, k);
}

type M3 = [number, number, number, number, number, number, number, number, number];

function eulerToMat(r: V3): M3 {
  // matches THREE.Euler 'XYZ': M = Rx * Ry * Rz
  const [x, y, z] = r;
  const a = Math.cos(x), b = Math.sin(x);
  const c = Math.cos(y), d = Math.sin(y);
  const e = Math.cos(z), f = Math.sin(z);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return [
    c * e, -c * f, d,
    af + be * d, ae - bf * d, -b * c,
    bf - ae * d, be + af * d, a * c,
  ];
}

/** Rotate by transpose (world → local). */
function invRot(m: M3, x: number, y: number, z: number, out: number[]) {
  out[0] = m[0] * x + m[3] * y + m[6] * z;
  out[1] = m[1] * x + m[4] * y + m[7] * z;
  out[2] = m[2] * x + m[5] * y + m[8] * z;
}

function sdEllipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number) {
  const k0 = Math.sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2);
  const k1 = Math.sqrt((x / (rx * rx)) ** 2 + (y / (ry * ry)) ** 2 + (z / (rz * rz)) ** 2);
  if (k1 < 1e-9) return -Math.min(rx, ry, rz);
  return (k0 * (k0 - 1)) / k1;
}

/** Exact round cone (capsule with different end radii), Inigo Quilez. */
function sdRoundCone(px: number, py: number, pz: number, a: V3, b: V3, r1: number, r2: number) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const xx = pax * l2 - bax * y, xy = pay * l2 - bay * y, xz = paz * l2 - baz * y;
  const x2 = xx * xx + xy * xy + xz * xz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

function boundsOfPoints(pts: V3[], pad: number): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pts)
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p[i] - pad);
      max[i] = Math.max(max[i], p[i] + pad);
    }
  return { min, max };
}

export function compileShape(s: Shape, worldMin: V3, worldMax: V3): CShape {
  const t = [0, 0, 0];
  if (s.type === 'ell') {
    const [cx, cy, cz] = s.c;
    const [rx, ry, rz] = s.r;
    const rmax = Math.max(rx, ry, rz);
    const b = boundsOfPoints([s.c], rmax);
    if (!s.rot) return { d: (x, y, z) => sdEllipsoid(x - cx, y - cy, z - cz, rx, ry, rz), ...b };
    const m = eulerToMat(s.rot);
    return {
      d: (x, y, z) => {
        invRot(m, x - cx, y - cy, z - cz, t);
        return sdEllipsoid(t[0], t[1], t[2], rx, ry, rz);
      },
      ...b,
    };
  }
  if (s.type === 'cone') {
    const pad = Math.max(s.ra, s.rb);
    if (!s.xf) {
      const b = boundsOfPoints([s.a, s.b], pad);
      return { d: (x, y, z) => sdRoundCone(x, y, z, s.a, s.b, s.ra, s.rb), ...b };
    }
    const xf: Xf = s.xf;
    const m = eulerToMat(xf.r ?? [0, 0, 0]);
    const sc = xf.s ?? [1, 1, 1];
    const smin_ = Math.min(sc[0], sc[1], sc[2]);
    const smax_ = Math.max(sc[0], sc[1], sc[2]);
    // conservative bounds: transform endpoints, pad by radius * max scale
    const toWorld = (p: V3): V3 => {
      const lx = p[0] * sc[0], ly = p[1] * sc[1], lz = p[2] * sc[2];
      return [
        xf.o[0] + m[0] * lx + m[1] * ly + m[2] * lz,
        xf.o[1] + m[3] * lx + m[4] * ly + m[5] * lz,
        xf.o[2] + m[6] * lx + m[7] * ly + m[8] * lz,
      ];
    };
    const b = boundsOfPoints([toWorld(s.a), toWorld(s.b)], pad * smax_);
    return {
      d: (x, y, z) => {
        invRot(m, x - xf.o[0], y - xf.o[1], z - xf.o[2], t);
        return sdRoundCone(t[0] / sc[0], t[1] / sc[1], t[2] / sc[2], s.a, s.b, s.ra, s.rb) * smin_;
      },
      ...b,
    };
  }
  const [nx, ny, nz] = s.n;
  const l = Math.hypot(nx, ny, nz);
  return { d: (x, y, z) => (x * nx + y * ny + z * nz) / l - s.d, min: [...worldMin] as V3, max: [...worldMax] as V3 };
}
