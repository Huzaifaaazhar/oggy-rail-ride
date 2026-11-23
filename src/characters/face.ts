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
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 28), ballMat);
    this.group.add(this.ball);

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

/* --------------------------------------------------------------- mouth */

export interface MouthStyle {
  lip: string;
  inside: string;
  tongue: string;
  /** draw the little "ω" cat mouth when closed */
  catLine?: boolean;
  width?: number;
  line?: string;
}

/**
 * Mouth drawn into a canvas that textures a curved patch of the snout.
 * Redrawn only when the expression changes noticeably.
 */
export class MouthRig {
  mesh: THREE.Mesh;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private last = [NaN, NaN, NaN, NaN, NaN];

  constructor(
    radius: number,
    private style: MouthStyle,
    patch = { phi: 1.5, thetaStart: 0.15, theta: 1.2 },
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 160;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const geo = new THREE.SphereGeometry(
      radius,
      32,
      20,
      Math.PI / 2 - patch.phi / 2,
      patch.phi,
      Math.PI / 2 - patch.thetaStart,
      patch.theta,
    );
    const mat = new THREE.MeshStandardMaterial({
      map: this.tex,
      transparent: true,
      roughness: 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 2;
    // SphereGeometry's u runs from −x to +x when seen from the front; flip so the canvas reads naturally
    this.tex.wrapS = THREE.RepeatWrapping;
    this.tex.repeat.x = -1;
    this.draw(0, 0, 0, 0, 0);
  }

  update(face: FaceState) {
    const open = clamp(face.mouthOpen, 0, 1);
    const smile = clamp(face.smile, -1, 1);
    const teeth = clamp(face.teeth, 0, 1);
    const tongue = clamp(face.tongue, 0, 1);
    const smirk = clamp(face.smirk, -1, 1);
    const vals = [open, smile, teeth, tongue, smirk];
    let changed = false;
    for (let i = 0; i < 5; i++) if (!(Math.abs(vals[i] - this.last[i]) < 0.025)) changed = true;
    if (!changed) return;
    this.last = vals;
    this.draw(open, smile, teeth, tongue, smirk);
  }

  private draw(open: number, smile: number, teeth: number, tongue: number, smirk: number) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2;
    const top = H * 0.36;
    const halfW = W * 0.25 * (this.style.width ?? 1) * (1 + open * 0.25 + Math.max(0, smile) * 0.15);
    const lift = smile * 16;
    const lCorner = top - lift + smirk * 10;
    const rCorner = top - lift - smirk * 10;
    const depth = open * H * 0.5;
    const lineColor = this.style.line ?? '#2a1410';

    if (open < 0.06) {
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      if (this.style.catLine && smile > -0.2) {
        // ω cat mouth with a philtrum
        ctx.beginPath();
        ctx.moveTo(cx, top - 26);
        ctx.lineTo(cx, top);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - halfW * 0.9, lCorner - 4);
        ctx.quadraticCurveTo(cx - halfW * 0.45, top + 22 + smile * 8, cx, top);
        ctx.quadraticCurveTo(cx + halfW * 0.45, top + 22 + smile * 8, cx + halfW * 0.9, rCorner - 4);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(cx - halfW, lCorner);
        ctx.quadraticCurveTo(cx, top + smile * 26, cx + halfW, rCorner);
        ctx.stroke();
      }
      this.tex.needsUpdate = true;
      return;
    }

    // open mouth: upper lip curve + lower lip curve
    const upperMid = top + smile * 14 - open * 4;
    const lowerMid = top + depth + Math.max(0, smile) * 18;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, lCorner);
    ctx.quadraticCurveTo(cx, upperMid, cx + halfW, rCorner);
    ctx.quadraticCurveTo(cx + halfW * 0.6, lowerMid, cx, lowerMid);
    ctx.quadraticCurveTo(cx - halfW * 0.6, lowerMid, cx - halfW, lCorner);
    ctx.closePath();
    ctx.fillStyle = this.style.inside;
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (teeth > 0.2) {
      ctx.fillStyle = '#fffdf5';
      ctx.fillRect(cx - halfW, upperMid - 30, halfW * 2, 30 + 12 * teeth);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(cx + k * halfW * 0.28, upperMid - 30);
        ctx.lineTo(cx + k * halfW * 0.28, upperMid + 12 * teeth);
        ctx.stroke();
      }
      if (teeth > 0.6) {
        ctx.fillStyle = '#fffdf5';
        ctx.fillRect(cx - halfW, lowerMid - 12, halfW * 2, 20);
      }
    }
    if (tongue > 0.05 || open > 0.4) {
      ctx.fillStyle = this.style.tongue;
      ctx.beginPath();
      ctx.ellipse(cx + smirk * 10, lowerMid + tongue * 18, halfW * 0.55, depth * 0.35 + tongue * 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - halfW, lCorner);
    ctx.quadraticCurveTo(cx, upperMid, cx + halfW, rCorner);
    ctx.quadraticCurveTo(cx + halfW * 0.6, lowerMid, cx, lowerMid);
    ctx.quadraticCurveTo(cx - halfW * 0.6, lowerMid, cx - halfW, lCorner);
    ctx.stroke();
    if (tongue > 0.5) {
      // tongue poking out past the lower lip
      ctx.fillStyle = this.style.tongue;
      ctx.beginPath();
      ctx.ellipse(cx + smirk * 10, lowerMid + 14, halfW * 0.42, 26 * tongue, 0, 0, Math.PI);
      ctx.fill();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    this.tex.needsUpdate = true;
  }
}

/** Brow: a soft rounded bar that tilts and lifts. */
export function makeBrow(len: number, thick: number, mat: THREE.Material) {
  const g = new THREE.CapsuleGeometry(thick, len, 6, 12);
  g.rotateZ(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  const pivot = new THREE.Group();
  pivot.add(m);
  return pivot;
}
