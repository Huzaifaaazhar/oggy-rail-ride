import * as THREE from 'three';
import { makeRng } from '../util/math';

export type ObstacleKind = 'books' | 'yarn' | 'can' | 'laundry' | 'teapot' | 'vase';
export type ObstacleClass = 'low' | 'high' | 'block';

export interface ObstacleInfo {
  cls: ObstacleClass;
  /** vertical extent above the rail top (rider-up axis) */
  y0: number;
  y1: number;
  halfLen: number;
}

export const OBSTACLES: Record<ObstacleKind, ObstacleInfo> = {
  books: { cls: 'low', y0: 0, y1: 0.85, halfLen: 0.45 },
  yarn: { cls: 'low', y0: 0, y1: 0.8, halfLen: 0.4 },
  can: { cls: 'low', y0: 0, y1: 0.75, halfLen: 0.35 },
  laundry: { cls: 'high', y0: 0.95, y1: 2.6, halfLen: 0.3 },
  teapot: { cls: 'block', y0: 0, y1: 2.8, halfLen: 0.7 },
  vase: { cls: 'block', y0: 0, y1: 3.2, halfLen: 0.55 },
};

const std = (color: string, roughness = 0.55, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness, ...extra });

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, p: [number, number, number], r: [number, number, number] = [0, 0, 0], s: [number, number, number] = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.rotation.set(...r);
  m.scale.set(...s);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function lathe(pts: [number, number][], seg = 40) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

function books() {
  const g = new THREE.Group();
  const rng = makeRng(4);
  const pages = std('#f7f0dc', 0.8);
  const covers = ['#c0392b', '#2e86ab', '#3f8f4e', '#7d3c98', '#e1a730'];
  let y = 0;
  for (let i = 0; i < 3; i++) {
    const h = 0.22 + rng.range(0, 0.08);
    const w = 0.75 - i * 0.06;
    const d = 0.95 - i * 0.08;
    const book = new THREE.Group();
    book.position.y = y + h / 2;
    book.rotation.y = rng.range(-0.35, 0.35);
    add(book, new THREE.BoxGeometry(w, h, d), std(covers[i % covers.length], 0.5, { clearcoat: 0.3 }), [0, 0, 0]);
    add(book, new THREE.BoxGeometry(w * 0.94, h * 0.82, d * 1.005), pages, [0.03, 0, 0]);
    g.add(book);
    y += h;
  }
  return g;
}

function yarn() {
  const g = new THREE.Group();
  const wool = std('#e8577d', 0.95, { sheen: 1, sheenColor: new THREE.Color('#ffc0d0') });
  add(g, new THREE.SphereGeometry(0.4, 28, 20), wool, [0, 0.4, 0]);
  const strand = std('#c93f66', 0.9);
  for (let i = 0; i < 6; i++) add(g, new THREE.TorusGeometry(0.4, 0.022, 6, 36), strand, [0, 0.4, 0], [i * 0.55, i * 0.9, 0]);
  return g;
}

function can() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.3, 0.3, 0.72, 28), std('#d9d9de', 0.25, { metalness: 0.9 }), [0, 0.36, 0]);
  add(g, new THREE.CylinderGeometry(0.305, 0.305, 0.42, 28, 1, true), std('#e2452f', 0.5), [0, 0.36, 0]);
  add(g, new THREE.CylinderGeometry(0.306, 0.306, 0.08, 28, 1, true), std('#f6d24a', 0.5), [0, 0.36, 0]);
  return g;
}

function laundry(width = 1.1) {
  const g = new THREE.Group();
  const wood = std('#9c6a3c', 0.6);
  const top = 2.55;
  for (const sx of [-1, 1]) {
    add(g, new THREE.CylinderGeometry(0.05, 0.06, top + 0.25, 10), wood, [sx * width, top / 2 - 0.25, 0]);
    add(g, new THREE.SphereGeometry(0.08, 12, 10), wood, [sx * width, top + 0.02, 0]);
  }
  add(g, new THREE.CylinderGeometry(0.025, 0.025, width * 2, 8), std('#ece6da', 0.6), [0, top, 0], [0, 0, Math.PI / 2]);
  const cloths = ['#5dade2', '#f5b041', '#ec7063', '#58d68d', '#af7ac5'];
  const n = Math.max(2, Math.round(width * 2.2));
  for (let i = 0; i < n; i++) {
    const x = -width + 0.25 + (i * (width * 2 - 0.5)) / Math.max(1, n - 1);
    const isSock = i % 2 === 1;
    const m = std(cloths[i % cloths.length], 0.9, { sheen: 0.6, sheenColor: new THREE.Color('#ffffff'), side: THREE.DoubleSide });
    if (isSock) {
      add(g, new THREE.CapsuleGeometry(0.1, 0.65, 6, 12), m, [x, top - 0.5, 0]);
      add(g, new THREE.CapsuleGeometry(0.1, 0.18, 6, 12), m, [x + 0.1, top - 0.93, 0.0], [0, 0, Math.PI / 2]);
    } else {
      add(g, new THREE.BoxGeometry(0.5, 1.45, 0.04), m, [x, top - 0.75, 0]);
    }
    add(g, new THREE.BoxGeometry(0.06, 0.14, 0.06), std('#f4d03f', 0.6), [x, top, 0]);
  }
  return g;
}

function teapot() {
  const g = new THREE.Group();
  const porcelain = std('#f5f2ec', 0.18, { clearcoat: 1, clearcoatRoughness: 0.05 });
  const blue = std('#2d5fa8', 0.25, { clearcoat: 1 });
  const body = lathe([[0, 0], [0.55, 0.02], [0.85, 0.35], [0.95, 0.85], [0.85, 1.45], [0.55, 1.75], [0.35, 1.8], [0, 1.8]]);
  add(g, body, porcelain, [0, 0, 0]);
  add(g, new THREE.TorusGeometry(0.91, 0.06, 10, 40), blue, [0, 0.85, 0], [Math.PI / 2, 0, 0]);
  add(g, lathe([[0, 0], [0.42, 0], [0.38, 0.15], [0.2, 0.28], [0.08, 0.32], [0, 0.42]]), porcelain, [0, 1.78, 0]);
  add(g, new THREE.SphereGeometry(0.1, 14, 10), blue, [0, 2.24, 0]);
  const spout = new THREE.CylinderGeometry(0.09, 0.2, 1.0, 16);
  add(g, spout, porcelain, [0.0, 1.05, 1.05], [0.9, 0, 0]);
  add(g, new THREE.TorusGeometry(0.42, 0.08, 12, 30, Math.PI * 1.2), porcelain, [0, 1.0, -0.86], [0, Math.PI / 2, Math.PI * 0.4]);
  // painted flowers
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    add(g, new THREE.SphereGeometry(0.09, 10, 8), blue, [Math.sin(a) * 0.93, 1.2, Math.cos(a) * 0.93], [0, 0, 0], [1, 1, 0.3]);
  }
  g.scale.setScalar(1.25);
  return g;
}

function vase() {
  const g = new THREE.Group();
  const glaze = std('#1f7a8c', 0.2, { clearcoat: 1, clearcoatRoughness: 0.08 });
  add(g, lathe([[0, 0], [0.4, 0], [0.62, 0.4], [0.68, 0.95], [0.45, 1.6], [0.28, 2.0], [0.36, 2.25], [0.3, 2.3], [0, 2.3]]), glaze, [0, 0, 0]);
  add(g, new THREE.TorusGeometry(0.66, 0.04, 8, 36), std('#e3b341', 0.3, { metalness: 0.8 }), [0, 0.95, 0], [Math.PI / 2, 0, 0]);
  const stem = std('#4f8a3a', 0.7);
  const petals = ['#ff6b6b', '#ffd93d', '#ffffff', '#ff9ff3'];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const tilt = 0.25;
    const sx = Math.sin(a) * tilt;
    const sz = Math.cos(a) * tilt;
    add(g, new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), stem, [sx * 0.6, 2.7, sz * 0.6], [sz, 0, -sx]);
    add(g, new THREE.SphereGeometry(0.17, 14, 10), std(petals[i % petals.length], 0.7), [sx * 1.4, 3.15, sz * 1.4]);
    add(g, new THREE.SphereGeometry(0.07, 10, 8), std('#f39c12', 0.6), [sx * 1.4, 3.2, sz * 1.4 + 0.12]);
  }
  return g;
}

const cache = new Map<string, THREE.Object3D>();

export function makeObstacle(kind: ObstacleKind, width = 1.1): THREE.Object3D {
  const key = kind === 'laundry' ? `${kind}-${width.toFixed(2)}` : kind;
  let proto = cache.get(key);
  if (!proto) {
    proto = { books, yarn, can, laundry: () => laundry(width), teapot, vase }[kind]();
    cache.set(key, proto);
  }
  return proto.clone();
}

/* ----------------------------------------------------------------- coins */

/** Gold coin stamped with a fish — geometry for an InstancedMesh. */
export function coinGeometry() {
  const shape = new THREE.Shape();
  const r = 0.34;
  shape.absarc(0, 0, r, 0, Math.PI * 2, false);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.03, bevelSegments: 3, curveSegments: 32 });
  geo.translate(0, 0, -0.03);
  return geo;
}

export function coinEmblemGeometry() {
  const fish = new THREE.Shape();
  fish.moveTo(-0.17, 0);
  fish.quadraticCurveTo(-0.02, 0.14, 0.12, 0.02);
  fish.lineTo(0.2, 0.09);
  fish.lineTo(0.2, -0.09);
  fish.lineTo(0.12, -0.02);
  fish.quadraticCurveTo(-0.02, -0.14, -0.17, 0);
  const geo = new THREE.ExtrudeGeometry(fish, { depth: 0.13, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2 });
  geo.translate(0.0, 0, -0.065);
  return geo;
}
