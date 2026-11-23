import * as THREE from 'three';
import { carpet, woodGrain } from '../util/textures';
import { Track, TrackFrame } from './Track';
import { BALUSTRADE_DEPTH, CHUNK_SAMPLES, F_STAIRS, RAIL_COUNT } from './types';

/** Classic mushroom handrail profile (x lateral, y vertical), top at y = 0.2. */
const HALF_PROFILE: [number, number][] = [
  [0, 0.2],
  [0.07, 0.197],
  [0.13, 0.182],
  [0.175, 0.15],
  [0.198, 0.1],
  [0.2, 0.05],
  [0.185, 0.01],
  [0.15, -0.025],
  [0.11, -0.05],
  [0.1, -0.08],
  [0.115, -0.12],
  [0.14, -0.155],
  [0.13, -0.19],
  [0.08, -0.215],
  [0, -0.222],
];

function buildProfile(): { pts: [number, number][]; nrm: [number, number][] } {
  const pts: [number, number][] = [];
  for (let i = 0; i < HALF_PROFILE.length; i++) pts.push(HALF_PROFILE[i]);
  for (let i = HALF_PROFILE.length - 2; i >= 1; i--) pts.push([-HALF_PROFILE[i][0], HALF_PROFILE[i][1]]);
  const n = pts.length;
  const nrm: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    // clockwise traversal (right side first going down) → outward normal = (dy, -dx)
    let nx = b[1] - a[1];
    let ny = -(b[0] - a[0]);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    nrm.push([nx, ny]);
  }
  return { pts, nrm };
}

const PROFILE = buildProfile();
const RING = (() => {
  const pts: [number, number][] = [];
  const nrm: [number, number][] = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = -(i / n) * Math.PI * 2 + Math.PI / 2;
    pts.push([Math.cos(a), Math.sin(a)]);
    nrm.push([Math.cos(a), Math.sin(a)]);
  }
  return { pts, nrm };
})();

/** Turned baluster (spindle) — lathe profile, y from 0 (top) to -1 (bottom). */
function spindleGeometry() {
  const p: [number, number][] = [
    [0.0, 0.0],
    [0.07, 0.0],
    [0.07, -0.05],
    [0.05, -0.08],
    [0.045, -0.18],
    [0.075, -0.24],
    [0.055, -0.3],
    [0.035, -0.42],
    [0.05, -0.55],
    [0.08, -0.64],
    [0.05, -0.72],
    [0.06, -0.8],
    [0.085, -0.84],
    [0.085, -0.97],
    [0.06, -1.0],
    [0.0, -1.0],
  ];
  const g = new THREE.LatheGeometry(
    p.map(([r, y]) => new THREE.Vector2(r, y)),
    12,
  );
  g.computeVertexNormals();
  return g;
}

export interface TrackMaterials {
  rail: THREE.Material;
  bottomRail: THREE.Material;
  spindle: THREE.Material;
  brass: THREE.Material;
  stepTread: THREE.Material;
  stepSide: THREE.Material;
  stepRiser: THREE.Material;
  carpet: THREE.Material;
}

let mats: TrackMaterials | null = null;
export function trackMaterials(): TrackMaterials {
  if (mats) return mats;
  const wood = woodGrain('rail-wood', '#b4692f', '#6e3918', '#d9995a');
  wood.repeat.set(1, 1);
  const treadWood = woodGrain('tread-wood', '#8a5228', '#5a2f14', '#a96a3a');
  mats = {
    rail: new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: wood, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.18 }),
    bottomRail: new THREE.MeshStandardMaterial({ color: '#7d4422', roughness: 0.45, metalness: 0.0 }),
    spindle: new THREE.MeshPhysicalMaterial({ color: '#f4ead6', roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    brass: new THREE.MeshStandardMaterial({ color: '#e2b04a', roughness: 0.22, metalness: 0.95 }),
    stepTread: new THREE.MeshStandardMaterial({ color: '#ffffff', map: treadWood, roughness: 0.5 }),
    stepSide: new THREE.MeshStandardMaterial({ color: '#efe2c9', roughness: 0.7 }),
    stepRiser: new THREE.MeshStandardMaterial({ color: '#f7efe0', roughness: 0.6 }),
    carpet: new THREE.MeshStandardMaterial({ color: '#ffffff', map: carpet(), roughness: 0.95 }),
  };
  return mats;
}

let spindleGeo: THREE.BufferGeometry | null = null;
let collarGeo: THREE.BufferGeometry | null = null;
let boxGeo: THREE.BufferGeometry | null = null;

/** Sweep a 2D profile along rail i for samples [g0, g1] every `step` samples. */
function sweep(
  track: Track,
  g0: number,
  g1: number,
  step: number,
  profile: { pts: [number, number][]; nrm: [number, number][] },
  place: (f: TrackFrame, outC: THREE.Vector3) => { sx: number; sy: number } | null,
): THREE.BufferGeometry | null {
  const f = new TrackFrame();
  const c = new THREE.Vector3();
  const P = profile.pts.length;
  const rings: number[] = [];
  for (let g = g0; g <= g1; g += step) rings.push(g);
  if (rings[rings.length - 1] !== g1) rings.push(g1);
  const pos = new Float32Array(rings.length * (P + 1) * 3);
  const nor = new Float32Array(rings.length * (P + 1) * 3);
  const uv = new Float32Array(rings.length * (P + 1) * 2);
  let any = false;
  for (let r = 0; r < rings.length; r++) {
    track.readSample(rings[r], f);
    const sc = place(f, c);
    const sx = sc ? sc.sx : 0.0001;
    const sy = sc ? sc.sy : 0.0001;
    if (sc) any = true;
    for (let j = 0; j <= P; j++) {
      const jj = j % P;
      const [px, py] = profile.pts[jj];
      const [nx, ny] = profile.nrm[jj];
      const o = (r * (P + 1) + j) * 3;
      pos[o] = c.x + f.right.x * px * sx + f.up.x * py * sy;
      pos[o + 1] = c.y + f.right.y * px * sx + f.up.y * py * sy;
      pos[o + 2] = c.z + f.right.z * px * sx + f.up.z * py * sy;
      nor[o] = f.right.x * nx + f.up.x * ny;
      nor[o + 1] = f.right.y * nx + f.up.y * ny;
      nor[o + 2] = f.right.z * nx + f.up.z * ny;
      const uo = (r * (P + 1) + j) * 2;
      uv[uo] = j / P;
      uv[uo + 1] = f.s / 6;
    }
  }
  if (!any) return null;
  const idx: number[] = [];
  for (let r = 0; r < rings.length - 1; r++)
    for (let j = 0; j < P; j++) {
      const a = r * (P + 1) + j;
      const b = a + 1;
      const cc = a + (P + 1);
      const d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  fixWinding(geo);
  geo.computeBoundingSphere();
  return geo;
}

/** Ensure triangle winding agrees with the supplied normals (front faces outward). */
function fixWinding(geo: THREE.BufferGeometry) {
  const index = geo.getIndex()!;
  const p = geo.getAttribute('position');
  const n = geo.getAttribute('normal');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const nn = new THREE.Vector3();
  let votes = 0;
  for (let t = 0; t < Math.min(index.count, 300); t += 3) {
    const i0 = index.getX(t);
    const i1 = index.getX(t + 1);
    const i2 = index.getX(t + 2);
    a.fromBufferAttribute(p, i0);
    b.fromBufferAttribute(p, i1).sub(a);
    c.fromBufferAttribute(p, i2).sub(a);
    nn.fromBufferAttribute(n, i0);
    const cr = b.cross(c);
    if (cr.lengthSq() < 1e-12) continue;
    votes += cr.dot(nn) > 0 ? 1 : -1;
  }
  if (votes < 0) {
    const arr = index.array as Uint16Array | Uint32Array;
    for (let t = 0; t < arr.length; t += 3) {
      const tmp = arr[t + 1];
      arr[t + 1] = arr[t + 2];
      arr[t + 2] = tmp;
    }
    index.needsUpdate = true;
  }
}

const tmpM = new THREE.Matrix4();
const tmpV = new THREE.Vector3();
const tmpX = new THREE.Vector3();
const tmpY = new THREE.Vector3();
const tmpZ = new THREE.Vector3();

/**
 * Builds all rail-related meshes for one storage chunk: three handrails,
 * balustrade spindles and bottom rails, brass collars, and the giant carpeted
 * staircase underneath sections flagged as stairs.
 */
export function buildTrackChunk(track: Track, chunk: number): THREE.Group {
  const m = trackMaterials();
  spindleGeo ??= spindleGeometry();
  collarGeo ??= new THREE.TorusGeometry(0.235, 0.045, 8, 20);
  boxGeo ??= new THREE.BoxGeometry(1, 1, 1);

  const group = new THREE.Group();
  group.name = `track-chunk-${chunk}`;
  const g0 = chunk * CHUNK_SAMPLES;
  const g1 = Math.min(track.count - 1, g0 + CHUNK_SAMPLES);

  for (let i = 0; i < RAIL_COUNT; i++) {
    const hand = sweep(track, g0, g1, 2, PROFILE, (f, out) => {
      f.railPoint(i, out);
      return { sx: 1, sy: 1 };
    });
    if (hand) {
      const mesh = new THREE.Mesh(hand, m.rail);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    const bottom = sweep(track, g0, g1, 2, RING, (f, out) => {
      if (f.bal < 0.05) {
        f.railPoint(i, out);
        return null;
      }
      f.railPoint(i, out).addScaledVector(f.up, -BALUSTRADE_DEPTH * f.bal);
      const r = 0.1 * Math.min(1, f.bal * 3);
      return { sx: r, sy: r };
    });
    if (bottom) {
      const mesh = new THREE.Mesh(bottom, m.bottomRail);
      mesh.castShadow = true;
      group.add(mesh);
    }
  }

  // spindles + collars
  const f = new TrackFrame();
  const spindleMats: THREE.Matrix4[] = [];
  const collarMats: THREE.Matrix4[] = [];
  for (let g = g0; g < g1; g += 3) {
    track.readSample(g, f);
    for (let i = 0; i < RAIL_COUNT; i++) {
      if (f.bal > 0.15) {
        f.railPoint(i, tmpV);
        const len = BALUSTRADE_DEPTH * f.bal;
        tmpX.copy(f.right);
        tmpY.copy(f.up).multiplyScalar(len);
        tmpZ.copy(f.fwd).negate();
        tmpM.makeBasis(tmpX, tmpY, tmpZ).setPosition(tmpV.addScaledVector(f.up, -0.05));
        spindleMats.push(tmpM.clone());
      }
      if (g % 40 === 0) {
        f.railPoint(i, tmpV);
        tmpM.makeBasis(f.right, f.up, tmpZ.copy(f.fwd).negate()).setPosition(tmpV);
        collarMats.push(tmpM.clone());
      }
    }
  }
  if (spindleMats.length) {
    const inst = new THREE.InstancedMesh(spindleGeo, m.spindle, spindleMats.length);
    spindleMats.forEach((mm, k) => inst.setMatrixAt(k, mm));
    inst.castShadow = true;
    inst.computeBoundingSphere();
    group.add(inst);
  }
  if (collarMats.length) {
    const inst = new THREE.InstancedMesh(collarGeo, m.brass, collarMats.length);
    collarMats.forEach((mm, k) => inst.setMatrixAt(k, mm));
    inst.computeBoundingSphere();
    group.add(inst);
  }

  // giant staircase under "stairs" sections
  const stepMats: THREE.Matrix4[] = [];
  const carpetMats: THREE.Matrix4[] = [];
  const STEP_RUN = 1.5;
  for (let g = g0; g < g1; g += 3) {
    track.readSample(g, f);
    if (!(f.flags & F_STAIRS)) continue;
    let maxX = 0;
    for (let i = 0; i < RAIL_COUNT; i++) maxX = Math.max(maxX, Math.abs(f.lanes[i * 2]));
    const width = 2 * (maxX + 1.6);
    const h = 4.5;
    const top = f.pos.y - (BALUSTRADE_DEPTH + 0.35);
    tmpZ.set(f.fwd.x, 0, f.fwd.z).normalize();
    tmpX.set(-tmpZ.z, 0, tmpZ.x); // horizontal right
    tmpY.set(0, 1, 0);
    // box local axes: x = width (right), y = up, z = run (−forward so +z faces back toward the rider = riser)
    const zAxis = tmpV.copy(tmpZ).negate();
    const mm = new THREE.Matrix4().makeBasis(tmpX.clone().multiplyScalar(width), tmpY.clone().multiplyScalar(h), zAxis.clone().multiplyScalar(STEP_RUN + 0.04));
    mm.setPosition(f.pos.x, top - h / 2, f.pos.z);
    stepMats.push(mm);
    const cm = new THREE.Matrix4().makeBasis(tmpX.clone().multiplyScalar(Math.min(width * 0.6, 5.2)), tmpY.clone().multiplyScalar(0.08), zAxis.clone().multiplyScalar(STEP_RUN + 0.05));
    cm.setPosition(f.pos.x, top + 0.04, f.pos.z);
    carpetMats.push(cm);
  }
  if (stepMats.length) {
    // box groups: +x, -x, +y (tread), -y, +z (riser, faces back down the stairs), -z
    const inst = new THREE.InstancedMesh(boxGeo, [m.stepSide, m.stepSide, m.stepTread, m.stepSide, m.stepRiser, m.stepSide], stepMats.length);
    stepMats.forEach((mm, k) => inst.setMatrixAt(k, mm));
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    group.add(inst);
    const carp = new THREE.InstancedMesh(boxGeo, m.carpet, carpetMats.length);
    carpetMats.forEach((mm, k) => carp.setMatrixAt(k, mm));
    carp.receiveShadow = true;
    carp.computeBoundingSphere();
    group.add(carp);
  }
  return group;
}

export function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && mesh.geometry !== spindleGeo && mesh.geometry !== collarGeo && mesh.geometry !== boxGeo && !(mesh.geometry.userData as { shared?: boolean }).shared) mesh.geometry.dispose();
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
}
