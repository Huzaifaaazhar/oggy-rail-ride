import * as THREE from 'three';
import { makeRng } from './math';

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const cache = new Map<string, THREE.Texture>();

export function canvasTexture(
  key: string,
  w: number,
  h: number,
  draw: Draw,
  opts: { repeat?: [number, number]; srgb?: boolean; aniso?: number } = {},
): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit as THREE.CanvasTexture;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = opts.aniso ?? 8;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

const hex = (c: string) => c;

/** Honey-walnut handrail grain, running along the texture's V axis. */
export function woodGrain(key = 'wood', base = '#b86f35', dark = '#7a4220', light = '#d79a5c') {
  return canvasTexture(key, 256, 1024, (ctx, w, h) => {
    const rng = makeRng(17);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = rng.range(0, w);
      const width = rng.range(1, 5);
      ctx.strokeStyle = rng.chance(0.6) ? dark : light;
      ctx.globalAlpha = rng.range(0.08, 0.35);
      ctx.lineWidth = width;
      ctx.beginPath();
      let xx = x;
      ctx.moveTo(xx, 0);
      for (let y = 0; y <= h; y += 16) {
        xx += Math.sin(y * 0.01 + i) * 1.4 + rng.range(-0.8, 0.8);
        ctx.lineTo(xx, y);
      }
      ctx.stroke();
    }
    // knots
    for (let i = 0; i < 5; i++) {
      const x = rng.range(20, w - 20);
      const y = rng.range(0, h);
      for (let r = 14; r > 2; r -= 3) {
        ctx.globalAlpha = 0.12;
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, y, r * 0.6, r * 2.2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  });
}

export function planks(key: string, colors: string[], gap = '#3d2412') {
  return canvasTexture(key, 1024, 1024, (ctx, w, h) => {
    const rng = makeRng(5);
    const rows = 8;
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rng.range(0, 400);
      while (x < w) {
        const len = rng.range(260, 520);
        ctx.fillStyle = rng.pick(colors);
        ctx.fillRect(x, r * rh, len, rh);
        for (let g = 0; g < 14; g++) {
          ctx.globalAlpha = rng.range(0.05, 0.16);
          ctx.fillStyle = rng.chance(0.5) ? '#000' : '#fff';
          ctx.fillRect(x, r * rh + rng.range(0, rh), len, rng.range(1, 3));
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = gap;
        ctx.fillRect(x, r * rh, 3, rh);
        x += len;
      }
      ctx.fillStyle = gap;
      ctx.fillRect(0, r * rh, w, 3);
    }
  });
}

export function checker(key: string, a: string, b: string, n = 8) {
  return canvasTexture(key, 512, 512, (ctx, w, h) => {
    const s = w / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = (i + j) % 2 ? a : b;
        ctx.fillRect(i * s, j * s, s, s);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(i * s + 3, j * s + 3, s - 6, 4);
      }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s, 0);
      ctx.lineTo(i * s, h);
      ctx.moveTo(0, i * s);
      ctx.lineTo(w, i * s);
      ctx.stroke();
    }
  });
}

export function grass(key = 'grass') {
  return canvasTexture(key, 512, 512, (ctx, w, h) => {
    const rng = makeRng(9);
    ctx.fillStyle = '#5c9a3a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) {
      ctx.strokeStyle = rng.pick(['#4b8530', '#6fb247', '#83c35a', '#3f7428']);
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1.5;
      const x = rng.range(0, w);
      const y = rng.range(0, h);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + rng.range(-3, 3), y - rng.range(4, 10));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}

/** Damask-ish wallpaper: stripes + repeating motif. */
export function wallpaper(key: string, base: string, stripe: string, motif: string) {
  return canvasTexture(key, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = stripe;
    for (let x = 0; x < w; x += 128) ctx.fillRect(x + 54, 0, 20, h);
    ctx.fillStyle = motif;
    const drawMotif = (cx: number, cy: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.ellipse(0, -16, 7, 15, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    for (let y = 0; y < h; y += 128)
      for (let x = 0; x < w; x += 128) {
        drawMotif(x, y);
        drawMotif(x + 64 + 0, y + 64);
      }
  });
}

export function carpet(key = 'carpet', base = '#9e1f33', border = '#e3b341') {
  return canvasTexture(key, 256, 256, (ctx, w, h) => {
    const rng = makeRng(3);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(rng.range(0, w), rng.range(0, h), 2, 2);
    }
    ctx.fillStyle = border;
    ctx.fillRect(0, 0, 18, h);
    ctx.fillRect(w - 18, 0, 18, h);
    ctx.fillStyle = base;
    ctx.fillRect(6, 0, 4, h);
    ctx.fillRect(w - 10, 0, 4, h);
  });
}

export function rugTexture(key: string, a: string, b: string, c: string) {
  return canvasTexture(key, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = b;
    ctx.lineWidth = 22;
    ctx.strokeRect(30, 30, w - 60, h - 60);
    ctx.lineWidth = 8;
    ctx.strokeStyle = c;
    ctx.strokeRect(62, 62, w - 124, h - 124);
    ctx.fillStyle = b;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.ellipse(0, -80, 26, 70, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

export function skyTexture(key = 'sky', top = '#5ba7e8', bottom = '#d9f0ff') {
  return canvasTexture(key, 256, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rng = makeRng(21);
    for (let i = 0; i < 7; i++) {
      const cx = rng.range(0, w);
      const cy = rng.range(h * 0.2, h * 0.8);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.arc(cx + k * 14 - 28, cy + Math.sin(k) * 6, rng.range(12, 22), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

/** Painting for picture frames. */
export function painting(key: string, seed: number) {
  return canvasTexture(key, 256, 320, (ctx, w, h) => {
    const rng = makeRng(seed);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rng.pick(['#f6c177', '#8ec5e8', '#f4a6a6', '#c5b4e3']));
    g.addColorStop(1, rng.pick(['#fde8c8', '#e8f5ff', '#fff3e0']));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // hills
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = rng.pick(['#6aa84f', '#93c47d', '#38761d', '#b6d7a8']);
      ctx.beginPath();
      ctx.moveTo(0, h);
      const base = h * (0.55 + i * 0.12);
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, base + Math.sin(x * 0.03 + i * 2 + seed) * 18);
      ctx.lineTo(w, h);
      ctx.fill();
    }
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.arc(rng.range(40, w - 40), rng.range(40, 110), 22, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Fine noise used as a bump map to give fur and fabric a soft tooth. */
export function noiseTexture(key = 'noise', scale = 1) {
  return canvasTexture(
    key,
    256,
    256,
    (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      const rng = makeRng(77);
      for (let i = 0; i < w * h; i++) {
        const v = 128 + (rng.next() - 0.5) * 255 * scale;
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    },
    { srgb: false },
  );
}

export { hex };
