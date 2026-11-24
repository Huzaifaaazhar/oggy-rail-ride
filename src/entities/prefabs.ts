import * as THREE from 'three';
import { makeRng } from '../util/math';

import type { ObstacleKind } from './catalog';

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
  // width = half span across the track
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

/* ------------------------------------------------- more household hazards */

const box3 = (g: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => add(g, new THREE.BoxGeometry(w, h, d), m, [x, y + h / 2, z]);
const rounded = (g: THREE.Object3D, w: number, h: number, d: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const mesh = add(g, new THREE.CapsuleGeometry(r, 1, 6, 14), m, [x, y + h / 2, z], [0, 0, Math.PI / 2], [h / (2 * r), Math.max(0.01, w - 2 * r), d / (2 * r)]);
  return mesh;
};

function sofa(width: number) {
  const g = new THREE.Group();
  const fabric = std('#c0504d', 0.9, { sheen: 1, sheenColor: new THREE.Color('#ffb3a7') });
  const w = width * 2;
  rounded(g, w, 0.75, 1.2, 0.3, fabric, 0, 0.15, 0);
  rounded(g, w, 1.35, 0.42, 0.2, fabric, 0, 0.55, -0.5);
  for (const sx of [-1, 1]) rounded(g, 0.42, 1.15, 1.2, 0.2, fabric, sx * (w / 2 - 0.15), 0.15, 0);
  const cush = std('#e9c46a', 0.9, { sheen: 1, sheenColor: new THREE.Color('#fff2c4') });
  const n = Math.max(2, Math.round(w / 1.1));
  for (let i = 0; i < n; i++) rounded(g, w / n - 0.12, 0.28, 0.95, 0.13, cush, -w / 2 + (i + 0.5) * (w / n), 0.88, 0.08);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, new THREE.CylinderGeometry(0.06, 0.08, 0.16, 10), std('#4a2c17', 0.6), [sx * (w / 2 - 0.2), 0.08, sz * 0.45]);
  return g;
}

function chair() {
  const g = new THREE.Group();
  const wood = std('#9b6a3c', 0.55, { clearcoat: 0.3 });
  box3(g, 0.95, 0.12, 0.9, wood, 0, 0.85);
  for (const [x, z] of [[-0.4, -0.38], [0.4, -0.38], [-0.4, 0.38], [0.4, 0.38]]) add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.85, 10), wood, [x, 0.425, z]);
  for (const x of [-0.4, 0.4]) add(g, new THREE.CylinderGeometry(0.05, 0.05, 1.1, 10), wood, [x, 1.5, -0.4]);
  box3(g, 0.9, 0.36, 0.08, wood, 0, 1.6, -0.4);
  box3(g, 0.9, 0.12, 0.08, wood, 0, 1.2, -0.4);
  add(g, new THREE.CapsuleGeometry(0.14, 0.5, 6, 12), std('#2e86ab', 0.85, { sheen: 1 }), [0, 0.98, 0.02], [0, 0, Math.PI / 2], [1, 1, 2.6]);
  return g;
}

function plant() {
  const g = new THREE.Group();
  add(g, lathe([[0, 0], [0.42, 0], [0.55, 0.8], [0.62, 0.86], [0.62, 0.95], [0, 0.95]]), std('#c96f45', 0.6), [0, 0, 0]);
  const leaf = std('#4c9a2a', 0.65);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    add(g, new THREE.SphereGeometry(1, 14, 10), leaf, [Math.cos(a) * 0.32, 1.7 + (i % 3) * 0.15, Math.sin(a) * 0.32], [Math.sin(a) * 0.45, -a, Math.cos(a) * 0.45], [0.2, 0.85, 0.06]);
  }
  add(g, new THREE.SphereGeometry(0.4, 16, 12), std('#3d8b37', 0.7), [0, 1.3, 0]);
  return g;
}

function cupboard(width: number) {
  const g = new THREE.Group();
  const w = width * 2;
  const paint = std('#6c9a8b', 0.5, { clearcoat: 0.3 });
  box3(g, w, 2.9, 1.0, paint);
  box3(g, w + 0.15, 0.12, 1.1, std('#4f7366', 0.5), 0, 2.9);
  const n = Math.max(2, Math.round(w / 0.8));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    box3(g, w / n - 0.12, 1.25, 0.06, std('#7fb3a1', 0.45), x, 1.5, 0.5);
    box3(g, w / n - 0.12, 1.2, 0.06, std('#7fb3a1', 0.45), x, 0.15, 0.5);
    add(g, new THREE.SphereGeometry(0.06, 10, 8), std('#d4a24c', 0.3, { metalness: 0.9 }), [x + (i % 2 ? -1 : 1) * (w / n / 2 - 0.15), 1.4, 0.56]);
  }
  return g;
}

function fridge() {
  const g = new THREE.Group();
  const body = std('#f1f4f3', 0.22, { clearcoat: 0.9 });
  rounded(g, 1.15, 2.95, 1.0, 0.18, body, 0, 0, 0);
  box3(g, 1.1, 0.03, 0.04, std('#b9c1c0', 0.4), 0, 1.95, 0.5);
  for (const y of [1.0, 2.2]) add(g, new THREE.CapsuleGeometry(0.04, 0.5, 4, 8), std('#9aa5a4', 0.25, { metalness: 0.8 }), [0.42, y + 0.3, 0.55]);
  for (let i = 0; i < 4; i++) add(g, new THREE.SphereGeometry(0.07, 10, 8), std(['#ff595e', '#ffca3a', '#8ac926', '#1982c4'][i], 0.4), [-0.3 + i * 0.16, 1.4 + (i % 2) * 0.25, 0.52], [0, 0, 0], [1, 1, 0.4]);
  return g;
}

function washer() {
  const g = new THREE.Group();
  rounded(g, 1.1, 1.85, 1.0, 0.12, std('#eef1f4', 0.25, { clearcoat: 0.8 }), 0, 0, 0);
  add(g, new THREE.TorusGeometry(0.36, 0.06, 12, 32), std('#b8c2cc', 0.3, { metalness: 0.6 }), [0, 0.85, 0.52]);
  add(g, new THREE.CircleGeometry(0.33, 32), new THREE.MeshPhysicalMaterial({ color: '#7fc8f8', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85 }), [0, 0.85, 0.53]);
  for (let i = 0; i < 3; i++) add(g, new THREE.SphereGeometry(0.1, 10, 8), std(['#ff99c8', '#fcf6bd', '#a9def9'][i], 0.9), [-0.1 + i * 0.1, 0.78 + (i % 2) * 0.1, 0.45]);
  box3(g, 1.0, 0.18, 0.05, std('#cfd6dd', 0.4), 0, 1.55, 0.5);
  return g;
}

function door() {
  // pivot at the hinge; panel extends along +x, closes by rotating about y
  const g = new THREE.Group();
  const panel = new THREE.Group();
  panel.name = 'panel';
  g.add(panel);
  const wood = std('#7b3f2a', 0.5, { clearcoat: 0.3 });
  box3(panel, 1.5, 2.55, 0.12, wood, 0.75, 0);
  for (const y of [0.25, 1.35]) box3(panel, 1.1, 0.95, 0.06, std('#8e4e35', 0.45), 0.75, y, 0.07);
  add(panel, new THREE.SphereGeometry(0.08, 12, 10), std('#d4a24c', 0.25, { metalness: 0.9 }), [1.3, 1.25, 0.12]);
  // frame posts stand beside the rail
  const frame = std('#f1e6d2', 0.6);
  box3(g, 0.14, 2.8, 0.2, frame, -0.07, 0);
  g.userData.panel = panel;
  void frame;
  return g;
}

function box() {
  const g = new THREE.Group();
  const card = std('#c9a26b', 0.85);
  box3(g, 0.85, 0.75, 0.8, card);
  box3(g, 0.87, 0.05, 0.18, std('#d8c49e', 0.7), 0, 0.75);
  add(g, new THREE.PlaneGeometry(0.4, 0.2), std('#7a4b2a', 0.9), [0, 0.45, 0.41]);
  return g;
}

function toyCar() {
  const g = new THREE.Group();
  const paint = std('#e63946', 0.25, { clearcoat: 1 });
  rounded(g, 0.75, 0.38, 1.2, 0.17, paint, 0, 0.14, 0);
  rounded(g, 0.6, 0.32, 0.6, 0.14, paint, 0, 0.45, -0.08);
  add(g, new THREE.BoxGeometry(0.5, 0.2, 0.05), new THREE.MeshPhysicalMaterial({ color: '#a8dadc', roughness: 0.05, clearcoat: 1 }), [0, 0.6, 0.22]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, new THREE.CylinderGeometry(0.16, 0.16, 0.12, 18), std('#222', 0.6), [sx * 0.38, 0.16, sz * 0.38], [0, 0, Math.PI / 2]);
  add(g, new THREE.SphereGeometry(0.06, 10, 8), std('#ffd166', 0.3, { emissive: '#ffd166', emissiveIntensity: 1 }), [0.22, 0.32, 0.6]);
  add(g, new THREE.SphereGeometry(0.06, 10, 8), std('#ffd166', 0.3, { emissive: '#ffd166', emissiveIntensity: 1 }), [-0.22, 0.32, 0.6]);
  return g;
}

function bucket() {
  const g = new THREE.Group();
  add(g, lathe([[0, 0], [0.3, 0], [0.4, 0.7], [0.43, 0.72], [0.4, 0.74], [0, 0.6]], 32), std('#4ea8de', 0.35, { clearcoat: 0.6, side: THREE.DoubleSide }), [0, 0, 0]);
  add(g, new THREE.CircleGeometry(0.38, 28), new THREE.MeshPhysicalMaterial({ color: '#9ad7ff', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85 }), [0, 0.62, 0], [-Math.PI / 2, 0, 0]);
  add(g, new THREE.TorusGeometry(0.4, 0.015, 6, 24, Math.PI), std('#666', 0.4, { metalness: 0.8 }), [0, 0.72, 0], [0, 0, 0]);
  add(g, new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), std('#c8a06b', 0.7), [0.15, 0.9, -0.05], [0.3, 0, -0.35]);
  return g;
}

function pots() {
  const g = new THREE.Group();
  const steel = std('#c8ccd2', 0.25, { metalness: 0.9 });
  const red = std('#d1495b', 0.3, { clearcoat: 1 });
  add(g, new THREE.CylinderGeometry(0.42, 0.4, 0.42, 28), red, [0, 0.21, 0]);
  add(g, new THREE.CylinderGeometry(0.32, 0.3, 0.3, 28), steel, [0.05, 0.57, 0.02], [0.15, 0, 0.1]);
  add(g, new THREE.CylinderGeometry(0.2, 0.22, 0.03, 20), steel, [-0.06, 0.74, 0], [0.4, 0, -0.3]);
  add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), std('#222', 0.6), [0.45, 0.4, 0], [0, 0, Math.PI / 2]);
  return g;
}

function barrel(width: number) {
  const g = new THREE.Group();
  const len = Math.max(0.9, width * 2 - 0.3);
  const wood = std('#a0632f', 0.55);
  const hoop = std('#555b60', 0.35, { metalness: 0.8 });
  const body = add(g, lathe([[0.36, -len / 2], [0.42, -len / 4], [0.44, 0], [0.42, len / 4], [0.36, len / 2], [0, len / 2]], 28), wood, [0, 0.44, 0], [0, 0, Math.PI / 2]);
  void body;
  add(g, new THREE.CircleGeometry(0.36, 24), std('#8b5426', 0.6), [-len / 2, 0.44, 0], [0, -Math.PI / 2, 0]);
  for (const t of [-0.38, 0, 0.38]) add(g, new THREE.TorusGeometry(0.43, 0.025, 8, 28), hoop, [t * len, 0.44, 0], [0, Math.PI / 2, 0]);
  g.userData.roll = true;
  return g;
}

function rugRoll(width: number) {
  const g = new THREE.Group();
  const len = width * 2;
  add(g, new THREE.CylinderGeometry(0.34, 0.34, len, 24), std('#8e3b46', 0.95, { sheen: 1, sheenColor: new THREE.Color('#ffb3c1') }), [0, 0.34, 0], [0, 0, Math.PI / 2]);
  for (let i = 0; i < Math.max(3, Math.round(len / 0.8)); i++) add(g, new THREE.TorusGeometry(0.345, 0.03, 6, 24), std('#e9c46a', 0.8), [-len / 2 + 0.3 + i * 0.8, 0.34, 0], [0, Math.PI / 2, 0]);
  return g;
}

function vacuum() {
  const g = new THREE.Group();
  rounded(g, 0.9, 0.6, 0.6, 0.25, std('#7b2cbf', 0.3, { clearcoat: 1 }), 0, 0.08, 0);
  add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.6, 14), std('#222', 0.6), [0, 0.12, 0.25], [0, 0, Math.PI / 2]);
  add(g, new THREE.CylinderGeometry(0.035, 0.035, 1.3, 8), std('#ccc', 0.3, { metalness: 0.8 }), [0, 1.1, -0.15], [-0.25, 0, 0]);
  add(g, new THREE.SphereGeometry(0.09, 10, 8), std('#ffd166', 0.3, { emissive: '#ffd166', emissiveIntensity: 1.2 }), [0, 0.6, 0.27]);
  return g;
}

function cushion() {
  const g = new THREE.Group();
  add(g, new THREE.SphereGeometry(0.5, 24, 16), std('#f4a261', 0.9, { sheen: 1, sheenColor: new THREE.Color('#ffe0c2') }), [0, 0.3, 0], [0, 0, 0], [1, 0.55, 1]);
  for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) add(g, new THREE.SphereGeometry(0.06, 8, 6), std('#e76f51', 0.9), [x, 0.3, z]);
  return g;
}

function lamp() {
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.name = 'swing';
  pivot.position.y = 9;
  g.add(pivot);
  add(pivot, new THREE.CylinderGeometry(0.02, 0.02, 7.4, 6), std('#333', 0.5), [0, -3.7, 0]);
  const shade = add(pivot, new THREE.CylinderGeometry(0.25, 0.75, 0.7, 28, 1, true), std('#ffe8a3', 0.7, { emissive: '#ffd27a', emissiveIntensity: 0.7, side: THREE.DoubleSide }), [0, -7.6, 0]);
  void shade;
  add(pivot, new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshBasicMaterial({ color: '#fff3c4' }), [0, -7.85, 0]);
  g.userData.swing = pivot;
  return g;
}

function fan(width: number) {
  const g = new THREE.Group();
  const hub = new THREE.Group();
  hub.name = 'spin';
  hub.position.y = 1.35;
  g.add(hub);
  add(g, new THREE.CylinderGeometry(0.04, 0.04, 6, 6), std('#d4a24c', 0.3, { metalness: 0.9 }), [0, 4.4, 0]);
  add(hub, new THREE.SphereGeometry(0.28, 18, 12), std('#d4a24c', 0.25, { metalness: 0.9 }), [0, 0.12, 0], [0, 0, 0], [1, 0.6, 1]);
  const blade = std('#8b5a2b', 0.45, { clearcoat: 0.4 });
  const r = Math.max(1.2, width);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group();
    b.rotation.y = (i / 4) * Math.PI * 2;
    hub.add(b);
    add(b, new THREE.BoxGeometry(r, 0.04, 0.38), blade, [r / 2 + 0.2, 0.05, 0], [0.12, 0, 0]);
  }
  g.userData.spin = hub;
  return g;
}

function table(width: number) {
  const g = new THREE.Group();
  const w = width * 2;
  const wood = std('#b07b47', 0.5, { clearcoat: 0.3 });
  box3(g, w, 0.14, 1.5, wood, 0, 1.12);
  add(g, new THREE.BoxGeometry(w + 0.1, 0.02, 1.6), std('#f8f1f1', 0.9), [0, 1.27, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, new THREE.CylinderGeometry(0.06, 0.05, 1.12, 10), wood, [sx * (w / 2 - 0.1), 0.56, sz * 0.62]);
  // a teacup and a bowl ride along for slapstick
  add(g, lathe([[0, 0], [0.12, 0], [0.16, 0.14], [0, 0.14]]), std('#fff', 0.2, { clearcoat: 1 }), [w * 0.2, 1.28, 0.1]);
  add(g, new THREE.SphereGeometry(0.12, 12, 10), std('#ff5a5f', 0.4), [-w * 0.25, 1.38, -0.1]);
  return g;
}

function pans(width: number) {
  const g = new THREE.Group();
  const top = 2.45;
  const wood = std('#8b5a2b', 0.6);
  for (const sx of [-1, 1]) add(g, new THREE.CylinderGeometry(0.05, 0.06, top + 0.2, 10), wood, [sx * width, top / 2 - 0.1, 0]);
  add(g, new THREE.CylinderGeometry(0.035, 0.035, width * 2, 8), std('#c8ccd2', 0.25, { metalness: 0.9 }), [0, top, 0], [0, 0, Math.PI / 2]);
  const n = Math.max(2, Math.round(width * 2.4));
  for (let i = 0; i < n; i++) {
    const x = -width + 0.3 + (i * (width * 2 - 0.6)) / Math.max(1, n - 1);
    add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.55, 6), std('#333', 0.5), [x, top - 0.27, 0]);
    add(g, new THREE.CylinderGeometry(0.36, 0.3, 0.08, 24), std(i % 2 ? '#2b2d42' : '#d1495b', 0.3, { metalness: i % 2 ? 0.6 : 0 }), [x, top - 0.92, 0], [Math.PI / 2, 0, 0]);
  }
  return g;
}

function giantPot(width: number) {
  const g = new THREE.Group();
  const r = Math.max(1.6, width);
  const red = std('#c0392b', 0.25, { clearcoat: 1 });
  const steel = std('#c8ccd2', 0.25, { metalness: 0.9 });
  add(g, lathe([[0, 0], [r * 0.95, 0], [r, 0.15], [r, 2.8], [r * 1.04, 2.9], [0, 2.9]], 48), red, [0, 0, 0]);
  add(g, lathe([[0, 0], [r * 1.02, 0], [r * 0.8, 0.35], [0.25, 0.6], [0, 0.6]], 48), red, [0, 2.9, 0]);
  add(g, new THREE.SphereGeometry(0.3, 16, 12), steel, [0, 3.6, 0]);
  for (const sx of [-1, 1]) add(g, new THREE.TorusGeometry(0.45, 0.12, 10, 24, Math.PI), steel, [sx * (r + 0.1), 2.2, 0], [0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0]);
  // steam swirl of vegetables peeking out
  for (let i = 0; i < 5; i++) add(g, new THREE.SphereGeometry(0.28, 12, 10), std(['#f4a261', '#2a9d8f', '#e9c46a'][i % 3], 0.6), [Math.cos(i * 1.3) * r * 0.5, 3.0, Math.sin(i * 1.3) * r * 0.5]);
  return g;
}

function bigYarn() {
  const g = yarn();
  g.scale.setScalar(3.1);
  g.userData.roll = true;
  return g;
}

const cache = new Map<string, THREE.Object3D>();

/**
 * Factory for obstacle meshes. `halfW` is the half width across the track
 * the object must cover (multi-rail placements pass a larger value).
 */
export function makeObstacle(kind: ObstacleKind, halfW = 0.6): THREE.Object3D {
  const key = `${kind}-${halfW.toFixed(2)}`;
  let proto = cache.get(key);
  if (!proto) {
    const builders: Record<ObstacleKind, () => THREE.Object3D> = {
      books, yarn, can, teapot, vase,
      laundry: () => laundry(Math.max(0.8, halfW)),
      sofa: () => sofa(Math.max(0.9, halfW)),
      chair, plant,
      cupboard: () => cupboard(Math.max(0.6, halfW)),
      fridge, washer, door, box, toyCar, bucket, pots,
      barrel: () => barrel(Math.max(0.5, halfW)),
      rugRoll: () => rugRoll(Math.max(0.6, halfW)),
      vacuum, cushion, lamp,
      giantPot: () => giantPot(Math.max(1.6, halfW)),
      bigYarn,
      fan: () => fan(Math.max(1.2, halfW)),
      table: () => table(Math.max(0.8, halfW)),
      pans: () => pans(Math.max(0.7, halfW)),
    };
    proto = builders[kind]();
    cache.set(key, proto);
  }
  const c = proto.clone(true);
  // re-link animated sub-parts to the clone's own copies
  for (const k of ['panel', 'swing', 'spin'] as const) {
    const part = c.getObjectByName(k);
    if (part) c.userData[k] = part;
    else delete c.userData[k];
  }
  return c;
}

/** Pulsing red-and-white hazard marker shown above dynamic dangers. */
export function hazardMarker(): THREE.Object3D {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e63946';
  g.beginPath();
  g.moveTo(64, 8);
  g.lineTo(122, 116);
  g.lineTo(6, 116);
  g.closePath();
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#fff6e5';
  g.stroke();
  g.fillStyle = '#fff6e5';
  g.font = 'bold 78px sans-serif';
  g.textAlign = 'center';
  g.fillText('!', 64, 104);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  sprite.scale.set(1.1, 1.1, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** Bonus collectibles: golden fish (+25 coins), coin magnet, tea-tray ride. */
export function bonusItem(kind: 'fish' | 'magnet' | 'tray'): THREE.Object3D {
  const g = new THREE.Group();
  if (kind === 'tray') {
    g.add(teaTray());
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 14), new THREE.MeshBasicMaterial({ color: '#fff2b0', transparent: true, opacity: 0.25, depthWrite: false }));
    g.add(glow);
    return g;
  }
  if (kind === 'fish') {
    const gold = new THREE.MeshPhysicalMaterial({ color: '#ffcf33', metalness: 1, roughness: 0.15, emissive: '#b36b00', emissiveIntensity: 0.6, clearcoat: 1 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16), gold);
    body.scale.set(1.5, 0.85, 0.5);
    g.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.35, 3), gold);
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -0.6;
    tail.scale.set(1, 1, 0.3);
    g.add(tail);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: '#1b1020' }));
    eye.position.set(0.3, 0.08, 0.15);
    g.add(eye);
  } else {
    const red = new THREE.MeshPhysicalMaterial({ color: '#e63946', roughness: 0.25, clearcoat: 1 });
    const steel = new THREE.MeshStandardMaterial({ color: '#dfe3e6', metalness: 0.9, roughness: 0.2 });
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.12, 14, 32, Math.PI), red);
    arc.rotation.z = Math.PI;
    g.add(arc);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 16), red);
      leg.position.set(sx * 0.32, 0.15, 0);
      g.add(leg);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.14, 16), steel);
      tip.position.set(sx * 0.32, 0.37, 0);
      g.add(tip);
    }
  }
  return g;
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

/** Silver tea tray: the cat surfs on it during a tray ride. */
export function teaTray(): THREE.Object3D {
  const g = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({ color: '#e7ecef', metalness: 1, roughness: 0.18 });
  const tray = new THREE.Mesh(lathe([[0, 0], [0.5, 0], [0.56, 0.06], [0.6, 0.1], [0.57, 0.11], [0.52, 0.04], [0, 0.04]], 40), silver);
  tray.scale.set(1.25, 1, 0.8);
  g.add(tray);
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 18, Math.PI), silver);
    h.position.set(sx * 0.76, 0.08, 0);
    h.rotation.set(Math.PI / 2, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
    g.add(h);
  }
  return g;
}
