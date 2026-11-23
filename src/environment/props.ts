import * as THREE from 'three';
import { makeRng } from '../util/math';
import { painting, rugTexture, woodGrain } from '../util/textures';

/* Giant household props. Every builder returns a Group standing on y = 0,
 * facing +z, in "house scale" metres (the cat is ~2 m tall; furniture is
 * deliberately enormous). */

const matCache = new Map<string, THREE.Material>();
export function mat(color: string, roughness = 0.6, extra: THREE.MeshStandardMaterialParameters & { clearcoat?: number; sheen?: number } = {}) {
  const key = `${color}|${roughness}|${JSON.stringify(extra, (_k, v) => (v instanceof THREE.Texture ? v.uuid : v))}`;
  let m = matCache.get(key);
  if (!m) {
    const { clearcoat, sheen, ...rest } = extra;
    m = clearcoat !== undefined || sheen !== undefined
      ? new THREE.MeshPhysicalMaterial({ color, roughness, clearcoat: clearcoat ?? 0, sheen: sheen ?? 0, sheenColor: new THREE.Color('#ffffff'), ...rest })
      : new THREE.MeshStandardMaterial({ color, roughness, ...rest });
    matCache.set(key, m);
  }
  return m;
}

const WOOD = () => mat('#ffffff', 0.5, { map: woodGrain('furniture-wood', '#8b5a2b', '#5e3a17', '#a8743f') });
const DARKWOOD = () => mat('#ffffff', 0.45, { map: woodGrain('dark-wood', '#5b3417', '#3a1f0b', '#7a4a24') });

export function box(parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, ry = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.rotation.y = ry;
  parent.add(mesh);
  return mesh;
}
function rbox(parent: THREE.Object3D, w: number, h: number, d: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  // rounded cushion: capsule-ish box via scaled sphere-capped cylinder
  const g = new THREE.CapsuleGeometry(r, 1, 6, 16);
  const mesh = new THREE.Mesh(g, m);
  mesh.rotation.z = Math.PI / 2;
  mesh.scale.set(h / (2 * r), Math.max(0.01, (w - 2 * r) / 1), d / (2 * r));
  mesh.position.set(x, y + h / 2, z);
  parent.add(mesh);
  return mesh;
}
function cyl(parent: THREE.Object3D, r0: number, r1: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 24) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, seg), m);
  mesh.position.set(x, y + h / 2, z);
  parent.add(mesh);
  return mesh;
}
function sph(parent: THREE.Object3D, r: number, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), m);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}
function lathe(parent: THREE.Object3D, pts: [number, number][], m: THREE.Material, x = 0, y = 0, z = 0, seg = 32) {
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, yy]) => new THREE.Vector2(r, yy)), seg), m);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

export function sofa(color: string) {
  const g = new THREE.Group();
  const fabric = mat(color, 0.9, { sheen: 1 });
  const W = 16, D = 6.5;
  rbox(g, W, 2.4, D, 1.1, fabric, 0, 0.9, 0);
  rbox(g, W, 4.2, 1.8, 0.9, fabric, 0, 1.6, -D / 2 + 0.9);
  for (const sx of [-1, 1]) rbox(g, 1.8, 3.4, D, 0.9, fabric, sx * (W / 2 - 0.6), 0.9, 0);
  for (let i = -1; i <= 1; i++) rbox(g, W / 3 - 0.4, 1.2, D - 2, 0.6, mat(color, 0.85, { sheen: 1 }), i * (W / 3 - 0.6) * 0.95, 3.1, 0.6);
  for (const [x, z] of [[-W / 2 + 1, -D / 2 + 1], [W / 2 - 1, -D / 2 + 1], [-W / 2 + 1, D / 2 - 1], [W / 2 - 1, D / 2 - 1]]) cyl(g, 0.3, 0.45, 0.9, DARKWOOD(), x, 0, z, 12);
  sph(g, 1.3, mat('#f4d35e', 0.9, { sheen: 1 }), -W / 2 + 3, 4.6, 0.2, 1, 1, 0.45);
  return g;
}

export function armchair(color: string) {
  const g = new THREE.Group();
  const fabric = mat(color, 0.9, { sheen: 1 });
  rbox(g, 7, 2.4, 6, 1, fabric, 0, 0.9, 0);
  rbox(g, 7, 5.4, 1.6, 0.8, fabric, 0, 1.4, -2.4);
  for (const sx of [-1, 1]) rbox(g, 1.6, 3.6, 6, 0.8, fabric, sx * 3.2, 0.9, 0);
  for (const [x, z] of [[-3, -2.4], [3, -2.4], [-3, 2.4], [3, 2.4]]) cyl(g, 0.25, 0.4, 0.9, DARKWOOD(), x, 0, z, 10);
  return g;
}

export function coffeeTable() {
  const g = new THREE.Group();
  const w = WOOD();
  box(g, 10, 0.6, 5.5, w, 0, 3.2, 0);
  for (const [x, z] of [[-4.4, -2.2], [4.4, -2.2], [-4.4, 2.2], [4.4, 2.2]]) cyl(g, 0.3, 0.2, 3.2, w, x, 0, z, 10);
  // teacup + saucer + book
  cyl(g, 1.2, 1.2, 0.12, mat('#ffffff', 0.2, { clearcoat: 1 }), -2, 3.8, 0, 28);
  lathe(g, [[0, 0], [0.55, 0], [0.8, 0.9], [0.85, 1.0], [0, 1.0]], mat('#f2f6ff', 0.2, { clearcoat: 1 }), -2, 3.92, 0);
  box(g, 2.6, 0.5, 3.4, mat('#b23a48', 0.6), 2.2, 3.8, 0.2, 0.3);
  return g;
}

export function rug(w: number, d: number, seed: number) {
  const g = new THREE.Group();
  const pal = [['#7a2e3a', '#e9c46a', '#264653'], ['#2a4d69', '#f4a261', '#e9e9e9'], ['#5b3a6b', '#f2cc8f', '#81b29a']][seed % 3];
  const tex = rugTexture(`rug-${seed % 3}`, pal[0], pal[1], pal[2]);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d), mat('#ffffff', 0.95, { map: tex }));
  m.position.y = 0.12;
  g.add(m);
  return g;
}

export function floorLamp() {
  const g = new THREE.Group();
  const brass = mat('#d4a24c', 0.3, { metalness: 0.9 });
  cyl(g, 1.6, 1.4, 0.5, brass);
  cyl(g, 0.25, 0.25, 16, brass, 0, 0.5);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 3.2, 3.2, 28, 1, true), mat('#fff1c9', 0.8, { emissive: '#ffcf7a', emissiveIntensity: 0.9, side: THREE.DoubleSide }));
  shade.position.y = 17.5;
  g.add(shade);
  return g;
}

export function bookshelf(w: number, h: number, seed: number) {
  const g = new THREE.Group();
  const wood = DARKWOOD();
  const D = 4;
  box(g, w, h, 0.6, wood, 0, 0, -D / 2 + 0.3);
  for (const sx of [-1, 1]) box(g, 0.7, h, D, wood, sx * (w / 2 - 0.35), 0, 0);
  const shelves = Math.max(3, Math.floor(h / 5.5));
  const rng = makeRng(seed);
  const colors = ['#b23a48', '#2e86ab', '#3f8f4e', '#e1a730', '#6c4f8f', '#d96c3b', '#1d3557'];
  const bookGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i <= shelves; i++) {
    const y = (i * h) / shelves;
    box(g, w, 0.5, D, wood, 0, Math.min(y, h - 0.5), 0);
    if (i === shelves) break;
    let x = -w / 2 + 1;
    const gapH = h / shelves - 0.6;
    while (x < w / 2 - 1.5) {
      const bw = rng.range(0.5, 1.0);
      const bh = gapH * rng.range(0.6, 0.92);
      const b = new THREE.Mesh(bookGeo, mat(rng.pick(colors), 0.65));
      b.scale.set(bw, bh, D * 0.8);
      const lean = rng.chance(0.08) ? rng.range(-0.3, 0.3) : 0;
      b.rotation.z = lean;
      b.position.set(x + bw / 2, y + 0.5 + bh / 2, 0.2);
      g.add(b);
      x += bw + 0.05 + (rng.chance(0.06) ? rng.range(0.5, 1.5) : 0);
    }
  }
  return g;
}

export function fireplace() {
  const g = new THREE.Group();
  const stone = mat('#cdb9a0', 0.85);
  const dark = mat('#2b211c', 0.9);
  box(g, 16, 14, 3, stone, 0, 0, 0);
  box(g, 18, 1.2, 4, mat('#ffffff', 0.4, { map: woodGrain('mantel', '#e8dccb', '#bfae98', '#f4eee4') }), 0, 14, 0.3);
  box(g, 9, 7, 1, dark, 0, 0.5, 1.2);
  const fire = mat('#ff9b3d', 0.5, { emissive: '#ff7a1a', emissiveIntensity: 2.2 });
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.9 + (i % 2) * 0.3, 3 + (i % 3), 10), fire);
    c.position.set(-3 + i * 1.5, 2.4 + (i % 3) * 0.4, 1.4);
    g.add(c);
  }
  cyl(g, 0.6, 0.6, 5, mat('#6b3e1e', 0.7), 0, 0.8, 1.5).rotation.z = Math.PI / 2;
  // clock on mantel
  cyl(g, 1.4, 1.4, 0.6, mat('#d4a24c', 0.3, { metalness: 0.8 }), 4, 15.2, 0.3).rotation.x = Math.PI / 2;
  return g;
}

export function pictureFrame(w: number, h: number, seed: number) {
  const g = new THREE.Group();
  const gold = mat('#c99a3b', 0.35, { metalness: 0.85 });
  const t = 0.9;
  box(g, w + t * 2, t, 0.6, gold, 0, -t, 0);
  box(g, w + t * 2, t, 0.6, gold, 0, h, 0);
  box(g, t, h + 2 * t, 0.6, gold, -w / 2 - t / 2, -t, 0);
  box(g, t, h + 2 * t, 0.6, gold, w / 2 + t / 2, -t, 0);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat('#ffffff', 0.7, { map: painting(`painting-${seed % 6}`, seed % 6) }));
  art.position.set(0, h / 2, 0.05);
  g.add(art);
  return g;
}

export function grandfatherClock() {
  const g = new THREE.Group();
  const wood = DARKWOOD();
  box(g, 5, 2, 3.5, wood);
  box(g, 3.6, 14, 2.8, wood, 0, 2);
  box(g, 5, 6, 3.5, wood, 0, 16);
  lathe(g, [[0, 0], [2.6, 0], [2.4, 1], [0, 2.2]], wood, 0, 22).scale.set(1, 1, 0.7);
  const face = new THREE.Mesh(new THREE.CircleGeometry(1.9, 32), mat('#fbf3e2', 0.5));
  face.position.set(0, 19, 1.8);
  g.add(face);
  const hand = mat('#222', 0.4);
  box(g, 0.12, 1.4, 0.1, hand, 0, 19, 1.9).rotation.z = 0.6;
  box(g, 0.12, 1.0, 0.1, hand, 0, 19, 1.9).rotation.z = -1.3;
  sph(g, 1.1, mat('#d4a24c', 0.25, { metalness: 0.9 }), 0, 6, 1.45, 1, 1, 0.2);
  return g;
}

export function sideTable(withLamp: boolean) {
  const g = new THREE.Group();
  const w = WOOD();
  box(g, 5, 0.5, 4, w, 0, 6);
  for (const [x, z] of [[-2, -1.6], [2, -1.6], [-2, 1.6], [2, 1.6]]) cyl(g, 0.25, 0.18, 6, w, x, 0, z, 8);
  if (withLamp) {
    lathe(g, [[0, 0], [1.1, 0], [1.3, 1.2], [0.6, 2.6], [0.3, 3], [0, 3]], mat('#3a7ca5', 0.2, { clearcoat: 1 }), 0, 6.5);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 2.4, 24, 1, true), mat('#fff1c9', 0.8, { emissive: '#ffcf7a', emissiveIntensity: 0.8, side: THREE.DoubleSide }));
    shade.position.y = 10.6;
    g.add(shade);
  } else {
    lathe(g, [[0, 0], [0.8, 0], [1.4, 1.5], [0.6, 3.5], [0.9, 4], [0, 4]], mat('#c0392b', 0.2, { clearcoat: 1 }), 0, 6.5);
    for (let i = 0; i < 4; i++) sph(g, 0.6, mat(['#ffd166', '#ef476f', '#ffffff', '#06d6a0'][i], 0.7), Math.cos(i * 1.6) * 0.8, 11.3 + (i % 2) * 0.5, Math.sin(i * 1.6) * 0.8);
  }
  return g;
}

export function door(w: number, h: number, color: string) {
  const g = new THREE.Group();
  const frame = mat('#f1e6d2', 0.6);
  box(g, w + 2, 1, 1, frame, 0, h, 0);
  box(g, 1, h, 1, frame, -w / 2 - 0.5, 0, 0);
  box(g, 1, h, 1, frame, w / 2 + 0.5, 0, 0);
  box(g, w, h, 0.5, mat(color, 0.55), 0, 0, -0.1);
  const panel = mat(color, 0.45);
  for (const y of [h * 0.12, h * 0.55]) for (const sx of [-1, 1]) box(g, w * 0.36, h * 0.33, 0.4, panel, sx * w * 0.22, y, 0.1);
  sph(g, 0.5, mat('#d4a24c', 0.25, { metalness: 0.9 }), w * 0.38, h * 0.48, 0.5);
  return g;
}

export function windowUnit(w: number, h: number, sky: THREE.Texture, curtain: string) {
  const g = new THREE.Group();
  const frame = mat('#fbf6ec', 0.5);
  const t = 1.2;
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: sky, toneMapped: false, fog: false }));
  pane.position.set(0, h / 2, -0.2);
  g.add(pane);
  box(g, w + 2 * t, t, 1.4, frame, 0, -t, 0);
  box(g, w + 2 * t, t, 1.4, frame, 0, h, 0);
  box(g, t, h + 2 * t, 1.4, frame, -w / 2 - t / 2, -t, 0);
  box(g, t, h + 2 * t, 1.4, frame, w / 2 + t / 2, -t, 0);
  box(g, 0.5, h, 0.8, frame, 0, 0, 0);
  box(g, w, 0.5, 0.8, frame, 0, h * 0.55, 0);
  box(g, w + 6, 1, 3, frame, 0, -t - 1, 0.8);
  // curtains: gathered folds
  const cm = mat(curtain, 0.9, { sheen: 1, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    const geo = new THREE.CylinderGeometry(3.2, 4.2, h + 6, 18, 1, true, 0, Math.PI);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const r = Math.hypot(pos.getX(i), pos.getZ(i)) * (1 + 0.12 * Math.sin(a * 9));
      pos.setXYZ(i, Math.cos(a) * r, pos.getY(i), Math.sin(a) * r * 0.35);
    }
    geo.computeVertexNormals();
    const c = new THREE.Mesh(geo, cm);
    c.position.set(sx * (w / 2 + 1.5), (h + 6) / 2 - 3, 1.6);
    g.add(c);
  }
  box(g, w + 14, 0.8, 0.8, mat('#d4a24c', 0.3, { metalness: 0.8 }), 0, h + 2.5, 1.8);
  return g;
}

export function counter(w: number) {
  const g = new THREE.Group();
  const cab = mat('#9fd3c7', 0.55);
  const top = mat('#f4f1ea', 0.25, { clearcoat: 0.6 });
  box(g, w, 6.2, 4.5, cab);
  box(g, w + 0.4, 0.5, 4.9, top, 0, 6.2, 0.1);
  const n = Math.floor(w / 3.4);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 1.7 + i * 3.4;
    box(g, 3.0, 5.2, 0.2, mat('#b6e0d6', 0.5), x, 0.5, 2.3);
    box(g, 1.2, 0.25, 0.4, mat('#d4a24c', 0.3, { metalness: 0.9 }), x, 4.8, 2.45);
  }
  return g;
}

export function fridge() {
  const g = new THREE.Group();
  const body = mat('#f2f4f3', 0.25, { clearcoat: 0.8 });
  rbox(g, 7, 17, 6, 1, body, 0, 0, 0);
  box(g, 6.6, 0.15, 0.2, mat('#b9c1c0', 0.4), 0, 11.5, 3.0);
  box(g, 0.4, 3, 0.4, mat('#9aa5a4', 0.3, { metalness: 0.7 }), 2.6, 12.5, 3.1);
  box(g, 0.4, 4, 0.4, mat('#9aa5a4', 0.3, { metalness: 0.7 }), 2.6, 6, 3.1);
  // magnets
  for (let i = 0; i < 4; i++) sph(g, 0.4, mat(['#ff595e', '#ffca3a', '#8ac926', '#1982c4'][i], 0.4), -1.5 + i * 0.9, 8 + (i % 2) * 1.5, 3.05, 1, 1, 0.4);
  return g;
}

export function stove() {
  const g = new THREE.Group();
  box(g, 7, 6.2, 5, mat('#e9ecef', 0.3, { clearcoat: 0.5 }));
  box(g, 5.6, 3.4, 0.2, mat('#1d1d1d', 0.15, { clearcoat: 1 }), 0, 1.2, 2.5);
  for (const [x, z] of [[-1.7, -1.2], [1.7, -1.2], [-1.7, 1.2], [1.7, 1.2]]) cyl(g, 1.1, 1.1, 0.12, mat('#333', 0.6), x, 6.2, z, 20);
  // pot with steam-less lid
  cyl(g, 1.5, 1.5, 2.2, mat('#c0392b', 0.3, { clearcoat: 1 }), -1.7, 6.35, -1.2, 28);
  lathe(g, [[0, 0.25], [1.55, 0], [0, 0]], mat('#c0392b', 0.3, { clearcoat: 1 }), -1.7, 8.55, -1.2);
  return g;
}

export function diningTable(withChairs: boolean) {
  const g = new THREE.Group();
  const w = WOOD();
  box(g, 14, 0.6, 8, w, 0, 6.2);
  for (const [x, z] of [[-6, -3.2], [6, -3.2], [-6, 3.2], [6, 3.2]]) lathe(g, [[0.4, 0], [0.6, 0.6], [0.3, 2], [0.5, 4], [0.3, 6.2], [0, 6.2]], w, x, 0, z, 12);
  box(g, 15, 0.1, 9, mat('#f8f1f1', 0.9, { map: undefined }), 0, 6.8);
  // fruit bowl
  lathe(g, [[0, 0], [1.6, 0.2], [2.4, 1.2], [2.5, 1.3], [0, 0.2]], mat('#f7f7ff', 0.2, { clearcoat: 1 }), 0, 6.9);
  const fruit = ['#ff5a5f', '#ffb400', '#7fb800', '#ff7f11'];
  for (let i = 0; i < 6; i++) sph(g, 0.75, mat(fruit[i % 4], 0.45, { clearcoat: 0.4 }), Math.cos(i) * 1.1, 8.1 + (i % 2) * 0.5, Math.sin(i) * 1.1);
  if (withChairs) for (const [x, z, r] of [[-4, 6, Math.PI], [4, 6, Math.PI], [-4, -6, 0], [4, -6, 0]] as const) {
    const c = chair();
    c.position.set(x, 0, z);
    c.rotation.y = r;
    g.add(c);
  }
  return g;
}

export function chair() {
  const g = new THREE.Group();
  const w = WOOD();
  box(g, 4.4, 0.5, 4.2, w, 0, 3.8);
  for (const [x, z] of [[-1.9, -1.8], [1.9, -1.8], [-1.9, 1.8], [1.9, 1.8]]) cyl(g, 0.2, 0.2, 3.8, w, x, 0, z, 8);
  for (const sx of [-1.9, 1.9]) cyl(g, 0.22, 0.22, 5, w, sx, 4.3, 1.8, 8);
  box(g, 4.2, 1.2, 0.3, w, 0, 7.6, 1.8);
  box(g, 4.2, 0.6, 0.3, w, 0, 5.6, 1.8);
  return g;
}

export function pottedPlant(seed: number, scale = 1) {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  const potColor = rng.pick(['#c96f45', '#e8d5b7', '#4f6d7a', '#d17a8a']);
  lathe(g, [[0, 0], [2.0, 0], [2.6, 3.5], [2.9, 3.7], [2.9, 4.0], [0, 4.0]], mat(potColor, 0.6));
  cyl(g, 2.6, 2.6, 0.2, mat('#5a3b22', 0.9), 0, 3.7, 0);
  const leaf = mat(rng.pick(['#4c9a2a', '#3d8b37', '#6cae3e']), 0.7);
  if (rng.chance(0.5)) {
    // round bush
    for (let i = 0; i < 7; i++) sph(g, rng.range(1.8, 2.6), leaf, rng.range(-1.5, 1.5), 6 + rng.range(0, 3), rng.range(-1.5, 1.5));
  } else {
    // tall leaves
    for (let i = 0; i < 9; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), leaf);
      const a = (i / 9) * Math.PI * 2;
      l.scale.set(0.7, 4, 0.25);
      l.position.set(Math.cos(a) * 1.4, 7.5, Math.sin(a) * 1.4);
      l.rotation.set(Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5);
      g.add(l);
    }
  }
  g.scale.setScalar(scale);
  return g;
}

export function tree(seed: number) {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  lathe(g, [[0, 0], [5, 0], [5.6, 6], [6, 6.4], [0, 6.4]], mat('#b5651d', 0.7));
  lathe(g, [[1.5, 0], [1.1, 10], [0.8, 18], [0, 18]], mat('#7b5133', 0.85), 0, 6);
  const leaf = mat(rng.pick(['#5aa02c', '#4a8f3a', '#79b83c']), 0.75);
  for (let i = 0; i < 9; i++) sph(g, rng.range(4, 6), leaf, rng.range(-4, 4), 24 + rng.range(-3, 5), rng.range(-4, 4));
  for (let i = 0; i < 6; i++) sph(g, 0.9, mat('#ff6b6b', 0.4, { clearcoat: 0.6 }), rng.range(-6, 6), 22 + rng.range(-2, 6), rng.range(4, 6) * rng.sign());
  return g;
}

export function flowerBed(w: number, d: number, seed: number) {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  box(g, w, 2, d, mat('#8d6e4f', 0.8));
  box(g, w - 1, 0.3, d - 1, mat('#4e342e', 0.95), 0, 2);
  const colors = ['#ff6b6b', '#feca57', '#ff9ff3', '#ffffff', '#54a0ff'];
  const stem = mat('#3f7d20', 0.7);
  for (let i = 0; i < (w * d) / 6; i++) {
    const x = rng.range(-w / 2 + 1, w / 2 - 1);
    const z = rng.range(-d / 2 + 1, d / 2 - 1);
    const h = rng.range(2, 4.5);
    cyl(g, 0.12, 0.12, h, stem, x, 2.2, z, 5);
    sph(g, rng.range(0.5, 0.9), mat(rng.pick(colors), 0.6), x, 2.2 + h, z);
  }
  return g;
}

export function fountain() {
  const g = new THREE.Group();
  const stone = mat('#d9d4c7', 0.7);
  lathe(g, [[0, 0], [11, 0], [11, 2.5], [10, 2.5], [10, 1], [0, 1]], stone);
  const water = new THREE.Mesh(new THREE.CircleGeometry(10, 40), mat('#6ec6ff', 0.05, { clearcoat: 1, transparent: true, opacity: 0.85 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 2.0;
  g.add(water);
  lathe(g, [[0, 0], [1.8, 0], [1.0, 6], [5, 7], [5, 7.8], [0, 7.8]], stone);
  lathe(g, [[0, 0], [0.8, 0], [0.5, 3], [2.5, 3.6], [2.5, 4.2], [0, 4.2]], stone, 0, 7.8);
  const jet = mat('#bfe9ff', 0.1, { transparent: true, opacity: 0.6, emissive: '#bfe9ff', emissiveIntensity: 0.3 });
  cyl(g, 0.4, 0.1, 5, jet, 0, 12, 0, 10);
  return g;
}

export function stoneRailing(len: number) {
  const g = new THREE.Group();
  const stone = mat('#efe6d6', 0.75);
  box(g, len, 1.2, 3, stone);
  box(g, len, 1.2, 3.4, stone, 0, 8.5);
  const n = Math.floor(len / 2.4);
  for (let i = 0; i < n; i++) lathe(g, [[0.9, 0], [0.5, 1.5], [1.1, 3.6], [0.6, 6], [0.9, 7.3], [0, 7.3]], stone, -len / 2 + 1.2 + i * 2.4, 1.2, 0, 12);
  return g;
}

export function cloud(seed: number) {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  const m = mat('#ffffff', 1, { emissive: '#ffffff', emissiveIntensity: 0.25 });
  for (let i = 0; i < 7; i++) sph(g, rng.range(8, 15), m, rng.range(-22, 22), rng.range(-3, 5), rng.range(-8, 8), 1, 0.7, 1);
  return g;
}

export function globe() {
  const g = new THREE.Group();
  const brass = mat('#c99a3b', 0.3, { metalness: 0.85 });
  lathe(g, [[0, 0], [3, 0], [2.4, 0.8], [0.6, 2], [0.5, 8], [0, 8]], DARKWOOD());
  sph(g, 4.2, mat('#3d85c6', 0.4, { clearcoat: 0.6 }), 0, 12.5, 0);
  for (let i = 0; i < 5; i++) sph(g, 1.6, mat('#6aa84f', 0.6), Math.cos(i * 1.3) * 3.3, 12.5 + Math.sin(i * 2) * 2, Math.sin(i * 1.3) * 3.3, 1, 0.7, 0.45);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.25, 8, 40), brass);
  ring.position.y = 12.5;
  ring.rotation.set(0.4, 0, 0.4);
  g.add(ring);
  return g;
}

export function chandelier() {
  const g = new THREE.Group();
  const brass = mat('#d4a24c', 0.25, { metalness: 0.9 });
  cyl(g, 0.15, 0.15, 30, brass, 0, 6);
  lathe(g, [[0, 0], [2, 1], [1, 3], [0.5, 6], [0, 6]], brass);
  const glow = mat('#fff3c4', 0.3, { emissive: '#ffd27a', emissiveIntensity: 2 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.2, 8, 20, Math.PI), brass);
    arm.position.set(Math.cos(a) * 2.5, 2, Math.sin(a) * 2.5);
    arm.rotation.set(0, -a, Math.PI);
    g.add(arm);
    sph(g, 0.6, glow, Math.cos(a) * 5, 2.6, Math.sin(a) * 5, 1, 1.4, 1);
  }
  return g;
}

/** Turned support post for the track (unit height, scaled per instance). */
export function supportPostGeometry() {
  const pts: [number, number][] = [
    [0, 0], [1.1, 0], [1.1, 0.02], [0.85, 0.035], [0.7, 0.05], [0.65, 0.5], [0.75, 0.9], [0.9, 0.94], [0.9, 0.97], [0.6, 0.985], [0.6, 1], [0, 1],
  ];
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 16);
}

/** Giant newel column for spiral staircases (unit height). */
export function newelColumnGeometry() {
  const pts: [number, number][] = [
    [0, 0], [1.25, 0], [1.25, 0.015], [1.1, 0.03], [1.0, 0.04], [0.92, 0.06], [0.92, 0.94], [1.0, 0.95], [1.15, 0.97], [1.15, 0.985], [0.9, 0.99], [0, 1],
  ];
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 40);
}

export function bed() {
  const g = new THREE.Group();
  const wood = DARKWOOD();
  box(g, 18, 3, 26, wood, 0, 0, 0);
  rbox(g, 17, 3.2, 24, 1.4, mat('#fdf6ec', 0.9, { sheen: 1 }), 0, 3, 0);
  rbox(g, 17.5, 1.6, 15, 0.7, mat('#f28f8f', 0.9, { sheen: 1 }), 0, 5.6, 4.2);
  for (const sx of [-1, 1]) rbox(g, 6.5, 2.2, 4, 1.1, mat('#ffffff', 0.9, { sheen: 1 }), sx * 4, 6, -9);
  box(g, 18, 12, 1.2, wood, 0, 0, -12.6);
  sph(g, 1.2, mat('#d4a24c', 0.3, { metalness: 0.9 }), -8.5, 12.3, -12.6);
  sph(g, 1.2, mat('#d4a24c', 0.3, { metalness: 0.9 }), 8.5, 12.3, -12.6);
  return g;
}

export function wardrobe() {
  const g = new THREE.Group();
  const wood = WOOD();
  box(g, 16, 30, 7, wood);
  box(g, 17, 1.2, 7.6, DARKWOOD(), 0, 30);
  for (const sx of [-1, 1]) {
    box(g, 7.4, 26, 0.4, mat('#a8743f', 0.45), sx * 3.9, 2, 3.6);
    sph(g, 0.4, mat('#d4a24c', 0.25, { metalness: 0.9 }), sx * 0.8, 15, 3.9);
  }
  return g;
}

export function toyBlocks(seed: number) {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  const colors = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#e9c46a'];
  let y = 0;
  for (let i = 0; i < 5; i++) {
    const s = 4 - i * 0.4;
    const b = box(g, s, s, s, mat(rng.pick(colors), 0.45, { clearcoat: 0.4 }), rng.range(-0.6, 0.6), y, rng.range(-0.6, 0.6), rng.range(-0.5, 0.5));
    void b;
    y += s;
  }
  return g;
}

export function chimney() {
  const g = new THREE.Group();
  const brick = mat('#a34a32', 0.85);
  box(g, 10, 26, 10, brick);
  box(g, 12, 2, 12, mat('#7a3524', 0.8), 0, 26);
  for (const sx of [-2.2, 2.2]) cyl(g, 1.4, 1.4, 5, mat('#c0703f', 0.7), sx, 28, 0, 16);
  return g;
}

export function aerial() {
  const g = new THREE.Group();
  const steel = mat('#9aa5a4', 0.3, { metalness: 0.9 });
  cyl(g, 0.4, 0.3, 30, steel);
  for (let i = 0; i < 5; i++) {
    const bar = box(g, 12 - i * 1.6, 0.4, 0.4, steel, 0, 22 + i * 1.6, 0);
    void bar;
  }
  return g;
}

/** A chunk of staircase floating in mid-air, for the impossible rooms. */
export function floatingStairs(seed: number) {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  const tread = mat('#ffffff', 0.5, { map: woodGrain('tread-wood', '#8a5228', '#5a2f14', '#a96a3a') });
  const carpetM = mat('#b3263a', 0.95);
  const n = rng.int(6, 12);
  for (let i = 0; i < n; i++) {
    box(g, 16, 3, 5, tread, 0, i * 3, i * 5);
    box(g, 8, 0.3, 5, carpetM, 0, i * 3 + 3, i * 5);
  }
  for (let i = 0; i < n; i += 2) cyl(g, 0.4, 0.4, 7, mat('#f4ead6', 0.4), 7.5, i * 3 + 3, i * 5, 10);
  return g;
}

export function standingDoor(color: string) {
  const g = door(14, 30, color);
  return g;
}
