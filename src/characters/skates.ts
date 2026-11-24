import * as THREE from 'three';

/**
 * Inline roller skates for the cat. They are rigid props bound to the foot
 * bones (built in model space at the bind pose, then re-parented with
 * attachRigid), so they follow the leg IK without any skinning. The wheels sit
 * in a single line under the paw, which is what lets the rider "roll" along a
 * banister rail.
 *
 * Everything is sized against the paw sculpt in catSpec: the paw ellipsoid is
 * centred at (±hipX, 0.066, 0.085) with radii (0.096, 0.066, 0.14), so its sole
 * is at y = 0. The skate hangs below that and the whole character is lifted by
 * SKATE_LIFT so the wheels, not the paws, touch the rail.
 */

export const WHEEL_R = 0.042;
const WHEEL_W = 0.026;
const WHEEL_Y = -0.064;
const WHEEL_Z = [-0.03, 0.057, 0.144, 0.231];
const PLATE_TOP = 0.012;
const PLATE_T = 0.024;
/** how far the skeleton is raised so the wheel bottoms sit at the old sole height */
export const SKATE_LIFT = -(WHEEL_Y - WHEEL_R);

export const SKATE_COLORS = {
  boot: '#2e323d',
  trim: '#d0302a',
  frame: '#b8c0cb',
  wheel: '#f2b33d',
  hub: '#eef1f5',
};

export interface SkateMaterials {
  boot: THREE.Material;
  trim: THREE.Material;
  frame: THREE.Material;
  wheel: THREE.Material;
  hub: THREE.Material;
}

export function skateMaterials(): SkateMaterials {
  return {
    boot: new THREE.MeshPhysicalMaterial({ color: SKATE_COLORS.boot, roughness: 0.6, sheen: 0.5, sheenColor: new THREE.Color('#8a93a8'), clearcoat: 0.25, clearcoatRoughness: 0.5, side: THREE.DoubleSide }),
    trim: new THREE.MeshPhysicalMaterial({ color: SKATE_COLORS.trim, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3, side: THREE.DoubleSide }),
    frame: new THREE.MeshStandardMaterial({ color: SKATE_COLORS.frame, metalness: 0.9, roughness: 0.28 }),
    wheel: new THREE.MeshPhysicalMaterial({ color: SKATE_COLORS.wheel, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
    hub: new THREE.MeshStandardMaterial({ color: SKATE_COLORS.hub, metalness: 1, roughness: 0.22 }),
  };
}

/** Rounded rectangle footprint, in the XZ plane once rotated. */
function footprint(w: number, l: number, r: number, toeW: number) {
  const s = new THREE.Shape();
  const hw = w / 2;
  const tw = toeW / 2;
  const hl = l / 2;
  // heel at -hl, toe at +hl (shape y becomes -z after rotation, so we flip later)
  s.moveTo(-hw + r, -hl);
  s.lineTo(hw - r, -hl);
  s.quadraticCurveTo(hw, -hl, hw, -hl + r);
  s.lineTo(tw, hl - r * 1.6);
  s.quadraticCurveTo(tw, hl, tw - r * 1.6, hl);
  s.lineTo(-tw + r * 1.6, hl);
  s.quadraticCurveTo(-tw, hl, -tw, hl - r * 1.6);
  s.lineTo(-hw, -hl + r);
  s.quadraticCurveTo(-hw, -hl, -hw + r, -hl);
  return s;
}

/** Sole plate: a bevelled slab under the whole paw. */
function plateGeometry() {
  const len = 0.34;
  const geo = new THREE.ExtrudeGeometry(footprint(0.17, len, 0.05, 0.2), {
    depth: PLATE_T - 0.012,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.008,
    bevelSegments: 3,
    curveSegments: 10,
  });
  // shape XY → model XZ (shape +y = toe = model +z), extrusion along -y
  geo.rotateX(Math.PI / 2);
  geo.scale(1, 1, -1);
  geo.translate(0, PLATE_TOP - 0.006, 0);
  geo.computeVertexNormals();
  return geo;
}

/** Heel cup wrapping the back of the paw, open at the front. */
function heelCupGeometry() {
  const pts: THREE.Vector2[] = [];
  // lathe profile (radius, height): flared lip at the top, rolled edge at the bottom
  const h = 0.1;
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(0.1 + 0.012 * Math.sin(t * Math.PI) - 0.008 * t, t * h));
  }
  const geo = new THREE.LatheGeometry(pts, 28, Math.PI * 0.5, Math.PI);
  // lathe: theta 0 = +z. start at +x, sweep through -z to -x → covers the heel
  geo.scale(1, 1, 1.2);
  return geo;
}

/** Ankle cuff: a padded collar. */
function cuffGeometry() {
  return new THREE.TorusGeometry(0.083, 0.018, 12, 32);
}

/** Strap arching over the instep. */
function strapGeometry(rx: number, ry: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI * (i / 20);
    pts.push(new THREE.Vector3(Math.cos(a) * rx, Math.sin(a) * ry, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 24, 0.012, 6, false);
  geo.scale(1, 1, 1.9); // flatten into a band
  return geo;
}

/** Frame: one slim side rail from the plate to just below the axles. Extruded across X. */
function frameSideGeometry() {
  const s = new THREE.Shape();
  const z0 = WHEEL_Z[0] - 0.034;
  const z1 = WHEEL_Z[WHEEL_Z.length - 1] + 0.034;
  const top = PLATE_TOP - PLATE_T + 0.004;
  const bot = WHEEL_Y - 0.012;
  const r = 0.018;
  // shape coords: x = model z, y = model y; slight rocker so the ends lift
  s.moveTo(z0 + 0.03, top);
  s.lineTo(z1 - 0.03, top);
  s.quadraticCurveTo(z1, top, z1, top - 0.02);
  s.lineTo(z1, bot + r);
  s.quadraticCurveTo(z1, bot, z1 - r, bot);
  // lightening cut-outs read as a hollow aluminium frame
  s.lineTo(z0 + r, bot);
  s.quadraticCurveTo(z0, bot, z0, bot + r);
  s.lineTo(z0, top - 0.02);
  s.quadraticCurveTo(z0, top, z0 + 0.03, top);
  for (let i = 0; i < WHEEL_Z.length - 1; i++) {
    const zm = (WHEEL_Z[i] + WHEEL_Z[i + 1]) / 2;
    const h = new THREE.Path();
    h.absellipse(zm, (top + WHEEL_Y) / 2 + 0.004, 0.022, 0.011, 0, Math.PI * 2, false, 0);
    s.holes.push(h);
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 10 });
  // shape (x,y) = (z,y); extrusion along +z → put it along x
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/** Wheel: solid urethane tyre with a rounded crown, axis along X. */
function tyreGeometry() {
  const pts: THREE.Vector2[] = [];
  const hub = WHEEL_R * 0.5;
  const hw = WHEEL_W / 2;
  const cr = hw * 0.95; // crown radius
  pts.push(new THREE.Vector2(hub, -hw * 0.8));
  pts.push(new THREE.Vector2(WHEEL_R - cr, -hw * 0.8));
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 2 + Math.PI * (i / 12);
    pts.push(new THREE.Vector2(WHEEL_R - cr + Math.cos(a) * cr, Math.sin(a) * hw * 0.8));
  }
  pts.push(new THREE.Vector2(hub, hw * 0.8));
  const geo = new THREE.LatheGeometry(pts, 32);
  geo.rotateZ(Math.PI / 2); // lathe axis Y → X
  geo.computeVertexNormals();
  return geo;
}

function hubGeometry() {
  const g = new THREE.CylinderGeometry(WHEEL_R * 0.52, WHEEL_R * 0.52, WHEEL_W * 0.7, 18);
  g.rotateZ(Math.PI / 2);
  return g;
}

function spokeGeometry() {
  // three spokes on each face so the spin reads
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const b = new THREE.BoxGeometry(WHEEL_W * 0.86, WHEEL_R * 0.13, WHEEL_R * 0.5);
    b.translate(0, 0, WHEEL_R * 0.25);
    b.rotateX((k / 3) * Math.PI * 2);
    parts.push(b);
  }
  return mergeSimple(parts);
}

function mergeSimple(parts: THREE.BufferGeometry[]) {
  const geos = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  let n = 0;
  for (const g of geos) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    g.computeVertexNormals();
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

/** Shared geometry: built once, used by both feet (and every cat preview). */
let shared: ReturnType<typeof buildShared> | null = null;
function buildShared() {
  return {
    plate: plateGeometry(),
    heel: heelCupGeometry(),
    cuff: cuffGeometry(),
    strap: strapGeometry(0.097, 0.128),
    frameSide: frameSideGeometry(),
    tyre: tyreGeometry(),
    hub: hubGeometry(),
    spokes: spokeGeometry(),
    axle: (() => {
      const g = new THREE.CylinderGeometry(0.008, 0.008, 0.062, 10);
      g.rotateZ(Math.PI / 2);
      return g;
    })(),
    toeStop: (() => {
      const g = new THREE.CapsuleGeometry(0.022, 0.03, 4, 10);
      g.rotateX(Math.PI / 2);
      return g;
    })(),
  };
}

export interface Skate {
  /** model-space group at the paw; hand to attachRigid with the foot bone */
  group: THREE.Group;
  /** wheel pivots, spun about local X */
  wheels: THREE.Object3D[];
}

/** One skate, centred under the paw at model-space x. */
export function buildSkate(x: number, mats: SkateMaterials): Skate {
  shared ??= buildShared();
  const G = shared;
  const group = new THREE.Group();
  group.name = 'skate';
  const zc = 0.085; // paw centre
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.castShadow = true;
    group.add(m);
    return m;
  };

  add(G.plate, mats.frame, x, 0, zc + 0.01);
  // heel cup: around the back half of the paw
  const heel = add(G.heel, mats.boot, x, PLATE_TOP - 0.004, zc - 0.02);
  heel.scale.set(1.0, 1, 1);
  // padded cuff ringing the ankle, tilted back slightly
  const cuff = add(G.cuff, mats.boot, x, 0.118, 0.04);
  cuff.rotation.x = Math.PI / 2 + 0.22;
  cuff.scale.set(1.08, 1, 1);
  // one wide strap over the instep; the toes stay free in front of it
  const strap = add(G.strap, mats.trim, x, PLATE_TOP - 0.006, zc + 0.072);
  strap.rotation.x = -0.18;

  // frame: two walls either side of the wheels
  for (const sx of [-1, 1]) add(G.frameSide, mats.frame, x + sx * (WHEEL_W / 2 + 0.004) + (sx < 0 ? 0 : 0.006), 0, 0);
  // rubber heel brake, a nod to classic skates
  add(G.toeStop, mats.boot, x, WHEEL_Y + 0.012, WHEEL_Z[0] - 0.064);

  const wheels: THREE.Object3D[] = [];
  for (const z of WHEEL_Z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, WHEEL_Y, z);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(G.tyre, mats.wheel);
    tyre.castShadow = true;
    spin.add(tyre, new THREE.Mesh(G.hub, mats.hub), new THREE.Mesh(G.spokes, mats.trim));
    pivot.add(spin, new THREE.Mesh(G.axle, mats.hub));
    group.add(pivot);
    wheels.push(spin);
  }
  return { group, wheels };
}
