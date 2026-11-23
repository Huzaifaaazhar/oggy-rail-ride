import * as THREE from 'three';
import { clamp, lerp } from '../util/math';
import { FaceState } from './rig';

const irisCache = new Map<string, THREE.CanvasTexture>();

/** Equirectangular eyeball texture with the iris centred on +Z. */
function eyeTexture(iris: string, irisDark: string, pupilScale = 1) {
  const key = `${iris}-${irisDark}-${pupilScale}`;
  const hit = irisCache.get(key);
  if (hit) return hit;
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  // sclera with faint warm vignette toward the back
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#f2ece4');
  g.addColorStop(0.25, '#ffffff');
  g.addColorStop(0.5, '#f2ece4');
  g.addColorStop(1, '#e9e1d6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // +Z is at u = 0.25, v = 0.5
  const cx = W * 0.25;
  const cy = H * 0.5;
  const rx = (W * 38) / 360; // iris ≈ 38° radius
  const ry = (H * 38) / 180;
  const ig = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
  ig.addColorStop(0, irisDark);
  ig.addColorStop(0.45, iris);
  ig.addColorStop(0.85, iris);
  ig.addColorStop(1, irisDark);
  ctx.fillStyle = ig;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // radial fibres
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * rx * 0.45, cy + Math.sin(a) * ry * 0.45);
    ctx.lineTo(cx + Math.cos(a) * rx * 0.9, cy + Math.sin(a) * ry * 0.9);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  // limbal shading and a warm caustic glow opposite the light
  const lg = ctx.createRadialGradient(cx, cy + ry * 0.35, 0, cx, cy + ry * 0.35, rx * 0.8);
  lg.addColorStop(0, 'rgba(255,255,200,0.35)');
  lg.addColorStop(1, 'rgba(255,255,200,0)');
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // pupil
  ctx.fillStyle = '#0b0a10';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.46 * pupilScale, ry * 0.46 * pupilScale, 0, 0, Math.PI * 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  irisCache.set(key, t);
  return t;
}

export interface EyeOptions {
  radius: number;
  iris: string;
  irisDark: string;
  lidMaterial: THREE.Material;
  pupilScale?: number;
  /** extra lid coverage at rest (sleepy / sly characters) */
  restLid?: number;
}

const highlightMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

/**
 * Eyeball (rotates to look), upper and lower lid shells, and a fixed catch-light.
 */
export class CartoonEye {
  group = new THREE.Group();
  ball: THREE.Mesh;
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  private spiral: THREE.Mesh;
  private restLid: number;

  constructor(o: EyeOptions) {
    const r = o.radius;
    this.restLid = o.restLid ?? 0;
    const ballMat = new THREE.MeshPhysicalMaterial({
      map: eyeTexture(o.iris, o.irisDark, o.pupilScale ?? 1),
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), ballMat);
    this.group.add(this.ball);
    // clear cornea bulge over the iris catches environment reflections
    const cornea = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.62, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.42),
      new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.02, metalness: 0, transparent: true, opacity: 0.18, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false }),
    );
    cornea.rotation.x = Math.PI / 2;
    cornea.position.z = r * 0.82;
    this.ball.add(cornea);

    const lidGeoTop = new THREE.SphereGeometry(r * 1.07, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const lidGeoBottom = new THREE.SphereGeometry(r * 1.065, 32, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const lidMat = o.lidMaterial.clone();
    (lidMat as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    this.upper = new THREE.Mesh(lidGeoTop, lidMat);
    this.lower = new THREE.Mesh(lidGeoBottom, lidMat);
    this.group.add(this.upper, this.lower);

    const hl = new THREE.Mesh(new THREE.SphereGeometry(r * 0.17, 12, 10), highlightMat);
    hl.position.set(r * 0.32, r * 0.38, r * 0.9);
    const hl2 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.08, 10, 8), highlightMat);
    hl2.position.set(-r * 0.22, -r * 0.2, r * 0.97);
    this.group.add(hl, hl2);

    // dizzy spiral overlay
    const sc = document.createElement('canvas');
    sc.width = sc.height = 128;
    const sx = sc.getContext('2d')!;
    sx.strokeStyle = '#1b1020';
    sx.lineWidth = 7;
    sx.beginPath();
    for (let a = 0; a < Math.PI * 7; a += 0.1) {
      const rr = 4 + a * 2.7;
      sx.lineTo(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr);
    }
    sx.stroke();
    const st = new THREE.CanvasTexture(sc);
    st.colorSpace = THREE.SRGBColorSpace;
    this.spiral = new THREE.Mesh(
      new THREE.CircleGeometry(r * 0.75, 24),
      new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false }),
    );
    this.spiral.position.z = r * 1.005;
    this.spiral.visible = false;
    this.group.add(this.spiral);
  }

  update(face: FaceState, time: number, mirror: number) {
    const lx = clamp(face.lookX, -1, 1);
    const ly = clamp(face.lookY, -1, 1);
    this.ball.rotation.set(-ly * 0.45, lx * 0.6, 0);
    const blink = clamp(face.blink + this.restLid - face.wide * 0.6, 0, 1);
    // upper lid: −0.75 rad (open, tucked back) → 1.62 rad (closed)
    const upperOpen = -0.98 - face.wide * 0.25 + face.browAngry * 0.38 - face.browSad * 0.12;
    this.upper.rotation.set(lerp(upperOpen, 1.6, blink) + ly * 0.25, 0, (face.browAngry * 0.35 - face.browSad * 0.3) * mirror);
    const squint = clamp(face.squint, 0, 1);
    this.lower.rotation.set(lerp(0.72, -0.15, squint * 0.9 + blink * 0.1), 0, 0);
    const dz = face.dizzy > 0.5;
    this.spiral.visible = dz;
    if (dz) this.spiral.rotation.z = time * 9 * mirror;
  }
}
