import * as THREE from 'three';
import { canvasTexture, noiseTexture } from '../util/textures';
import { makeRng } from '../util/math';

/** Velvety fur: sheen + fine bump so it reads soft rather than plastic. */
export function furMaterial(map: THREE.Texture | null, color: string, sheen: string) {
  return new THREE.MeshPhysicalMaterial({
    color: map ? '#ffffff' : color,
    map,
    roughness: 0.82,
    sheen: 1,
    sheenColor: new THREE.Color(sheen),
    sheenRoughness: 0.45,
    bumpMap: noiseTexture('fur-noise', 0.8),
    bumpScale: 0.35,
  });
}

/** Glossy insect shell with a lacquer clearcoat. */
export function shellMaterial(map: THREE.Texture | null, color: string) {
  return new THREE.MeshPhysicalMaterial({
    color: map ? '#ffffff' : color,
    map,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    sheen: 0.3,
    sheenColor: new THREE.Color('#ffffff'),
  });
}

export function plainMaterial(color: string, roughness = 0.6, extra: THREE.MeshPhysicalMaterialParameters = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, ...extra });
}

/** Tabby fur: base colour with irregular darker stripes in the given UV band. */
export function tabbyTexture(
  key: string,
  base: string,
  stripe: string,
  band: { u0: number; u1: number; v0: number; v1: number; vertical?: boolean },
  count = 7,
) {
  return canvasTexture(key, 512, 256, (ctx, w, h) => {
    const rng = makeRng(key.length * 31);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // soft fur mottling
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = rng.chance(0.5) ? 'rgba(255,240,220,0.06)' : 'rgba(90,40,10,0.05)';
      ctx.beginPath();
      ctx.ellipse(rng.range(0, w), rng.range(0, h), rng.range(2, 6), rng.range(1, 2), rng.range(0, 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = stripe;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      if (band.vertical) {
        const x = (band.u0 + (band.u1 - band.u0) * t) * w;
        const y0 = band.v0 * h;
        const y1 = band.v1 * h;
        const wid = rng.range(7, 13);
        ctx.moveTo(x - wid, y0);
        ctx.quadraticCurveTo(x + rng.range(-12, 12), (y0 + y1) / 2, x - 2, y1);
        ctx.lineTo(x + 2, y1);
        ctx.quadraticCurveTo(x + rng.range(-12, 12) + wid, (y0 + y1) / 2, x + wid, y0);
      } else {
        const y = (band.v0 + (band.v1 - band.v0) * t) * h;
        const x0 = band.u0 * w;
        const x1 = band.u1 * w;
        const thick = rng.range(4, 8);
        ctx.moveTo(x0, y);
        ctx.quadraticCurveTo((x0 + x1) / 2, y - thick * 2, x1, y);
        ctx.quadraticCurveTo((x0 + x1) / 2, y + thick, x0, y);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}

export function stripeTexture(key: string, a: string, b: string, n = 6, vertical = false) {
  return canvasTexture(key, 256, 256, (ctx, w, h) => {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? a : b;
      if (vertical) ctx.fillRect((i * w) / n, 0, w / n + 1, h);
      else ctx.fillRect(0, (i * h) / n, w, h / n + 1);
    }
  });
}

/** Segmented belly plates for insects (horizontal bands with soft shading). */
export function segmentTexture(key: string, base: string, line: string, n = 6) {
  return canvasTexture(key, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 1; i < n; i++) {
      const y = (i / n) * h;
      const g = ctx.createLinearGradient(0, y - 10, 0, y + 6);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.7, line);
      g.addColorStop(1, 'rgba(255,255,255,0.3)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 10, w, 16);
    }
  });
}

export function checkTexture(key: string, a: string, b: string, n = 8) {
  return canvasTexture(key, 128, 128, (ctx, w) => {
    const s = w / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = (i + j) % 2 ? a : b;
        ctx.fillRect(i * s, j * s, s, s);
      }
  });
}
