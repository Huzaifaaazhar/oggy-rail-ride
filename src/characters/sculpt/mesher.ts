import { compileShape, CShape, smax, smin } from './sdf';
import type { MeshData, SculptSpec, V3 } from './types';

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function hexLinear(hex: string): V3 {
  const n = parseInt(hex.replace('#', ''), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// cheap 3D value noise for colour variation
function hash3(x: number, y: number, z: number) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let dz = 0; dz < 2; dz++)
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++)
        r += hash3(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  return r;
}

interface CPrim {
  s: CShape;
  op: 'add' | 'sub';
  k: number;
  bone: number;
  skin: number;
  color?: V3;
  rough?: number;
  lo: V3;
  hi: V3;
}

/**
 * Sculpts a smooth surface from blended signed-distance primitives:
 * field stamping on a grid → naive surface nets → Newton projection onto the
 * exact field → Laplacian relaxation (better triangle shapes) → analytic
 * normals, painted colours/roughness and bone weights.
 */
export function sculpt(spec: SculptSpec): MeshData {
  const t0 = Date.now();
  const cell = spec.cell;
  const bmin = spec.min;
  const nx = Math.ceil((spec.max[0] - bmin[0]) / cell) + 1;
  const ny = Math.ceil((spec.max[1] - bmin[1]) / cell) + 1;
  const nz = Math.ceil((spec.max[2] - bmin[2]) / cell) + 1;
  const boneIndex = new Map(spec.bones.map((b, i) => [b.name, i]));

  const prims: CPrim[] = spec.prims.map((p) => {
    const s = compileShape(p.shape, spec.min, spec.max);
    const pad = p.k + cell * 3;
    return {
      s,
      op: p.op,
      k: p.k,
      bone: p.bone !== undefined ? boneIndex.get(p.bone) ?? -1 : -1,
      skin: p.skin ?? 1,
      color: p.color ? hexLinear(p.color) : undefined,
      rough: p.rough,
      lo: [s.min[0] - pad, s.min[1] - pad, s.min[2] - pad],
      hi: [s.max[0] + pad, s.max[1] + pad, s.max[2] + pad],
    };
  });

  // ---- field stamping
  const N = nx * ny * nz;
  const field = new Float32Array(N).fill(1e3);
  const idx = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  for (const p of prims) {
    const i0 = Math.max(0, Math.floor((p.lo[0] - bmin[0]) / cell));
    const i1 = Math.min(nx - 1, Math.ceil((p.hi[0] - bmin[0]) / cell));
    const j0 = Math.max(0, Math.floor((p.lo[1] - bmin[1]) / cell));
    const j1 = Math.min(ny - 1, Math.ceil((p.hi[1] - bmin[1]) / cell));
    const k0 = Math.max(0, Math.floor((p.lo[2] - bmin[2]) / cell));
    const k1 = Math.min(nz - 1, Math.ceil((p.hi[2] - bmin[2]) / cell));
    for (let k = k0; k <= k1; k++) {
      const z = bmin[2] + k * cell;
      for (let j = j0; j <= j1; j++) {
        const y = bmin[1] + j * cell;
        let o = idx(i0, j, k);
        for (let i = i0; i <= i1; i++, o++) {
          const d = p.s.d(bmin[0] + i * cell, y, z);
          field[o] = p.op === 'add' ? smin(field[o], d, p.k) : smax(field[o], -d, p.k);
        }
      }
    }
  }

  const evalSDF = (x: number, y: number, z: number) => {
    let f = 1e3;
    for (const p of prims) {
      if (x < p.lo[0] || y < p.lo[1] || z < p.lo[2] || x > p.hi[0] || y > p.hi[1] || z > p.hi[2]) continue;
      const d = p.s.d(x, y, z);
      f = p.op === 'add' ? smin(f, d, p.k) : smax(f, -d, p.k);
    }
    return f;
  };
  const h = cell * 0.3;
  const grad = (x: number, y: number, z: number, out: number[]) => {
    out[0] = evalSDF(x + h, y, z) - evalSDF(x - h, y, z);
    out[1] = evalSDF(x, y + h, z) - evalSDF(x, y - h, z);
    out[2] = evalSDF(x, y, z + h) - evalSDF(x, y, z - h);
    const l = Math.hypot(out[0], out[1], out[2]) || 1;
    out[0] /= l;
    out[1] /= l;
    out[2] /= l;
  };

  // ---- surface nets
  const cnx = nx - 1, cny = ny - 1, cnz = nz - 1;
  const cellVert = new Int32Array(cnx * cny * cnz).fill(-1);
  const verts: number[] = [];
  const corner = new Float32Array(8);
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  for (let k = 0; k < cnz; k++)
    for (let j = 0; j < cny; j++)
      for (let i = 0; i < cnx; i++) {
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          const v = field[idx(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
          corner[c] = v;
          if (v < 0) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of EDGES) {
          const va = corner[a], vb = corner[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + (((b & 1) - (a & 1)) * t);
          sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t);
          sz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t);
          n++;
        }
        cellVert[i + cnx * (j + cny * k)] = verts.length / 3;
        verts.push(bmin[0] + (i + sx / n) * cell, bmin[1] + (j + sy / n) * cell, bmin[2] + (k + sz / n) * cell);
      }

  const quads: number[] = [];
  const cv = (i: number, j: number, k: number) => cellVert[i + cnx * (j + cny * k)];
  for (let k = 1; k < cnz; k++)
    for (let j = 1; j < cny; j++)
      for (let i = 1; i < cnx; i++) {
        const f0 = field[idx(i, j, k)] < 0;
        // edge along x from (i,j,k)
        if (i < cnx && f0 !== field[idx(i + 1, j, k)] < 0) quads.push(cv(i, j - 1, k - 1), cv(i, j, k - 1), cv(i, j, k), cv(i, j - 1, k));
        if (j < cny && f0 !== field[idx(i, j + 1, k)] < 0) quads.push(cv(i - 1, j, k - 1), cv(i, j, k - 1), cv(i, j, k), cv(i - 1, j, k));
        if (k < cnz && f0 !== field[idx(i, j, k + 1)] < 0) quads.push(cv(i - 1, j - 1, k), cv(i, j - 1, k), cv(i, j, k), cv(i - 1, j, k));
      }

  const nv = verts.length / 3;
  const P = new Float32Array(verts);
  const g = [0, 0, 0];
  const project = (iters: number) => {
    for (let v = 0; v < nv; v++) {
      let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      for (let it = 0; it < iters; it++) {
        const d = evalSDF(x, y, z);
        if (Math.abs(d) < cell * 0.002) break;
        grad(x, y, z, g);
        x -= g[0] * d;
        y -= g[1] * d;
        z -= g[2] * d;
      }
      P[v * 3] = x;
      P[v * 3 + 1] = y;
      P[v * 3 + 2] = z;
    }
  };
  project(3);

  // ---- relaxation with re-projection
  const relax = spec.relax ?? 2;
  if (relax > 0) {
    const nbStart = new Int32Array(nv + 1);
    const deg = new Int32Array(nv);
    for (let q = 0; q < quads.length; q += 4) for (let e = 0; e < 4; e++) deg[quads[q + e]] += 2;
    for (let v = 0; v < nv; v++) nbStart[v + 1] = nbStart[v] + deg[v];
    const nb = new Int32Array(nbStart[nv]);
    const fill = new Int32Array(nv);
    for (let q = 0; q < quads.length; q += 4)
      for (let e = 0; e < 4; e++) {
        const a = quads[q + e], b = quads[q + ((e + 1) & 3)];
        nb[nbStart[a] + fill[a]++] = b;
        nb[nbStart[b] + fill[b]++] = a;
      }
    const tmp = new Float32Array(nv * 3);
    for (let r = 0; r < relax; r++) {
      for (let v = 0; v < nv; v++) {
        let ax = 0, ay = 0, az = 0;
        const s = nbStart[v], e = nbStart[v + 1];
        for (let n = s; n < e; n++) {
          ax += P[nb[n] * 3];
          ay += P[nb[n] * 3 + 1];
          az += P[nb[n] * 3 + 2];
        }
        const c = e - s || 1;
        tmp[v * 3] = P[v * 3] * 0.5 + (ax / c) * 0.5;
        tmp[v * 3 + 1] = P[v * 3 + 1] * 0.5 + (ay / c) * 0.5;
        tmp[v * 3 + 2] = P[v * 3 + 2] * 0.5 + (az / c) * 0.5;
      }
      P.set(tmp);
      project(2);
    }
  }

  // ---- normals
  const Nrm = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) {
    grad(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], g);
    Nrm[v * 3] = g[0];
    Nrm[v * 3 + 1] = g[1];
    Nrm[v * 3 + 2] = g[2];
  }

  // ---- triangles (split along shorter diagonal, orient by normal)
  const tris: number[] = [];
  const dist2 = (a: number, b: number) => (P[a * 3] - P[b * 3]) ** 2 + (P[a * 3 + 1] - P[b * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[b * 3 + 2]) ** 2;
  const pushTri = (a: number, b: number, c: number) => {
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const nxs = Nrm[a * 3] + Nrm[b * 3] + Nrm[c * 3];
    const nys = Nrm[a * 3 + 1] + Nrm[b * 3 + 1] + Nrm[c * 3 + 1];
    const nzs = Nrm[a * 3 + 2] + Nrm[b * 3 + 2] + Nrm[c * 3 + 2];
    if (cx * nxs + cy * nys + cz * nzs >= 0) tris.push(a, b, c);
    else tris.push(a, c, b);
  };
  for (let q = 0; q < quads.length; q += 4) {
    const a = quads[q], b = quads[q + 1], c = quads[q + 2], d = quads[q + 3];
    if (a < 0 || b < 0 || c < 0 || d < 0) continue;
    if (dist2(a, c) < dist2(b, d)) {
      pushTri(a, b, c);
      pushTri(a, c, d);
    } else {
      pushTri(a, b, d);
      pushTri(b, c, d);
    }
  }

  // ---- colours and roughness
  const base = hexLinear(spec.baseColor);
  const paints = spec.paints.map((p) => ({
    s: compileShape(p.shape, spec.min, spec.max),
    color: p.color ? hexLinear(p.color) : undefined,
    rough: p.rough,
    soft: p.soft,
    strength: p.strength ?? 1,
    bands: p.bands ? { ...p.bands, color: hexLinear(p.bands.color) } : undefined,
  }));
  const C = new Float32Array(nv * 3);
  const R = new Float32Array(nv);
  const noise = spec.noise ?? { amp: 0.05, freq: 30 };
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    let r = base[0], gg = base[1], b = base[2];
    let ro = spec.baseRough;
    for (const p of prims) {
      if (p.op !== 'add' || (!p.color && p.rough === undefined)) continue;
      if (x < p.lo[0] || y < p.lo[1] || z < p.lo[2] || x > p.hi[0] || y > p.hi[1] || z > p.hi[2]) continue;
      const w = smooth(p.k * 0.5 + 0.002, -0.002, p.s.d(x, y, z));
      if (w <= 0) continue;
      if (p.color) {
        r += (p.color[0] - r) * w;
        gg += (p.color[1] - gg) * w;
        b += (p.color[2] - b) * w;
      }
      if (p.rough !== undefined) ro += (p.rough - ro) * w;
    }
    for (const p of paints) {
      const d = p.s.d(x, y, z);
      let w = smooth(p.soft, -p.soft, d) * p.strength;
      if (w <= 0) continue;
      let col = p.color;
      if (p.bands) {
        const a = p.bands.axis;
        const t = (x * a[0] + y * a[1] + z * a[2]) / p.bands.period + (p.bands.phase ?? 0);
        const f = Math.abs(t - Math.round(t));
        const bw = smooth(p.bands.width, p.bands.width * 0.4, f);
        if (!col) {
          w *= bw;
          col = p.bands.color;
        } else if (bw > 0) {
          col = [col[0] + (p.bands.color[0] - col[0]) * bw, col[1] + (p.bands.color[1] - col[1]) * bw, col[2] + (p.bands.color[2] - col[2]) * bw];
        }
      }
      if (col) {
        r += (col[0] - r) * w;
        gg += (col[1] - gg) * w;
        b += (col[2] - b) * w;
      }
      if (p.rough !== undefined) ro += (p.rough - ro) * w;
    }
    const n = 1 + noise.amp * ((vnoise(x * noise.freq, y * noise.freq, z * noise.freq) - 0.5) * 2 + (vnoise(x * noise.freq * 3.1, y * noise.freq * 3.1, z * noise.freq * 3.1) - 0.5));
    C[v * 3] = r * n;
    C[v * 3 + 1] = gg * n;
    C[v * 3 + 2] = b * n;
    R[v] = ro;
  }

  // ---- skin weights
  let skinIndex: Uint16Array | undefined;
  let skinWeight: Float32Array | undefined;
  if (spec.bones.length) {
    skinIndex = new Uint16Array(nv * 4);
    skinWeight = new Float32Array(nv * 4);
    const nb = spec.bones.length;
    const acc = new Float32Array(nb);
    const overrides = spec.weights.map((w) => ({ s: compileShape(w.shape, spec.min, spec.max), bone: boneIndex.get(w.bone) ?? -1, soft: w.soft, max: w.max }));
    for (let v = 0; v < nv; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      acc.fill(0);
      let best = -1;
      let bestD = Infinity;
      for (const p of prims) {
        if (p.op !== 'add' || p.bone < 0) continue;
        const d = p.s.d(x, y, z);
        if (d < bestD) {
          bestD = d;
          best = p.bone;
        }
        const sigma = Math.max(0.012, p.k * 0.55);
        const dd = Math.max(0, d) / sigma;
        if (dd > 3.5) continue;
        acc[p.bone] += Math.exp(-dd * dd) * p.skin;
      }
      let total = 0;
      for (let i = 0; i < nb; i++) total += acc[i];
      if (total < 1e-6 && best >= 0) acc[best] = 1;
      else for (let i = 0; i < nb; i++) acc[i] /= total;
      for (const o of overrides) {
        if (o.bone < 0) continue;
        const f = smooth(o.soft, -o.soft, o.s.d(x, y, z)) * o.max;
        if (f <= 0) continue;
        for (let i = 0; i < nb; i++) acc[i] *= 1 - f;
        acc[o.bone] += f;
      }
      // top 4
      for (let slot = 0; slot < 4; slot++) {
        let bi = 0, bw = -1;
        for (let i = 0; i < nb; i++) if (acc[i] > bw) {
          bw = acc[i];
          bi = i;
        }
        skinIndex[v * 4 + slot] = bi;
        skinWeight[v * 4 + slot] = Math.max(0, bw);
        acc[bi] = -1;
      }
      const s = skinWeight[v * 4] + skinWeight[v * 4 + 1] + skinWeight[v * 4 + 2] + skinWeight[v * 4 + 3] || 1;
      for (let slot = 0; slot < 4; slot++) skinWeight[v * 4 + slot] /= s;
    }
  }

  return {
    positions: P,
    normals: Nrm,
    colors: C,
    rough: R,
    index: new Uint32Array(tris),
    skinIndex,
    skinWeight,
    ms: Date.now() - t0,
  };
}
