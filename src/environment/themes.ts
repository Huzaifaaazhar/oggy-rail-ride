import * as THREE from 'three';
import { canvasTexture, checker, grass, planks, skyTexture, wallpaper } from '../util/textures';

export type ThemeId = 'hallway' | 'living' | 'kitchen' | 'garden' | 'library' | 'balcony' | 'bedroom' | 'rooftop' | 'impossible';

export interface Theme {
  id: ThemeId;
  name: string;
  fog: string;
  sky: string;
  ground: string;
  wallHalf: number;
  floor: () => THREE.Material;
  wall: () => THREE.Material;
  wainscot: string;
  curtain: string;
}

const m = new Map<string, THREE.Material>();
const cached = (key: string, f: () => THREE.Material) => () => {
  let x = m.get(key);
  if (!x) {
    x = f();
    m.set(key, x);
  }
  return x;
};

const tex = (t: THREE.Texture, rx: number, ry: number) => {
  t.repeat.set(rx, ry);
  return t;
};

export const THEMES: Record<ThemeId, Theme> = {
  hallway: {
    id: 'hallway',
    name: 'Grand hallway',
    fog: '#e8c79a',
    sky: '#fff1d9',
    ground: '#6b4a33',
    wallHalf: 92,
    floor: cached('f-hall', () => new THREE.MeshStandardMaterial({ map: tex(planks('planks-hall', ['#9a6234', '#a86d3b', '#8c5a2e', '#b07642']), 12, 36), roughness: 0.55 })),
    wall: cached('w-hall', () => new THREE.MeshStandardMaterial({ map: tex(wallpaper('wp-hall', '#a83f4a', '#952f3b', '#c9a24a'), 8, 10), roughness: 0.8 })),
    wainscot: '#5a3519',
    curtain: '#2f6f5e',
  },
  living: {
    id: 'living',
    name: 'Living room',
    fog: '#e9d3b0',
    sky: '#fff6e6',
    ground: '#7a5a3a',
    wallHalf: 104,
    floor: cached('f-living', () => new THREE.MeshStandardMaterial({ map: tex(planks('planks-living', ['#c48b55', '#b97f4b', '#cf9762', '#ad7443']), 12, 36), roughness: 0.5 })),
    wall: cached('w-living', () => new THREE.MeshStandardMaterial({ map: tex(wallpaper('wp-living', '#6f9a8d', '#628c80', '#e7d7b1'), 8, 10), roughness: 0.85 })),
    wainscot: '#f0e4cf',
    curtain: '#c0504d',
  },
  kitchen: {
    id: 'kitchen',
    name: 'Kitchen',
    fog: '#f1e3c4',
    sky: '#fffaf0',
    ground: '#8a7a6a',
    wallHalf: 100,
    floor: cached('f-kitchen', () => new THREE.MeshStandardMaterial({ map: tex(checker('chk-kitchen', '#2f3e46', '#f4efe6', 8), 14, 40), roughness: 0.35 })),
    wall: cached('w-kitchen', () => new THREE.MeshStandardMaterial({ map: tex(wallpaper('wp-kitchen', '#f2d388', '#ecc970', '#ffffff'), 8, 10), roughness: 0.8 })),
    wainscot: '#9fd3c7',
    curtain: '#e76f51',
  },
  garden: {
    id: 'garden',
    name: 'Indoor garden',
    fog: '#cfe6c8',
    sky: '#f2fff0',
    ground: '#4f7a3a',
    wallHalf: 108,
    floor: cached('f-garden', () => new THREE.MeshStandardMaterial({ map: tex(grass(), 30, 80), roughness: 0.95 })),
    wall: cached('w-garden', () => new THREE.MeshStandardMaterial({ map: tex(wallpaper('wp-garden', '#cfe8d0', '#bcdcbf', '#7fb77e'), 8, 10), roughness: 0.9 })),
    wainscot: '#ffffff',
    curtain: '#f4a261',
  },
  library: {
    id: 'library',
    name: 'Library',
    fog: '#d9c1a0',
    sky: '#fff0d8',
    ground: '#4a3020',
    wallHalf: 96,
    floor: cached('f-library', () => new THREE.MeshStandardMaterial({ map: tex(planks('planks-lib', ['#5e3a1d', '#6b4425', '#53331a']), 12, 36), roughness: 0.5 })),
    wall: cached('w-library', () => new THREE.MeshStandardMaterial({ map: tex(wallpaper('wp-lib', '#2f4858', '#294050', '#c9a24a'), 8, 10), roughness: 0.85 })),
    wainscot: '#3b2412',
    curtain: '#8e3b46',
  },
  balcony: {
    id: 'balcony',
    name: 'Sky balcony',
    fog: '#bfe0f5',
    sky: '#e6f6ff',
    ground: '#9ab0c0',
    wallHalf: 100,
    floor: cached('f-balcony', () => new THREE.MeshStandardMaterial({ map: tex(checker('chk-balcony', '#d8cbb3', '#efe6d6', 6), 14, 40), roughness: 0.7 })),
    wall: cached('w-balcony', () => new THREE.MeshStandardMaterial({ map: tex(wallpaper('wp-balcony', '#f4e1c1', '#ecd6b0', '#d9a86c'), 8, 10), roughness: 0.85 })),
    wainscot: '#e8dcc4',
    curtain: '#3d7ea6',
  },
  bedroom: {
    id: 'bedroom',
    name: 'Bedroom',
    fog: '#e6d6ef',
    sky: '#fff4ff',
    ground: '#6d5a7a',
    wallHalf: 98,
    floor: cached('f-bedroom', () => new THREE.MeshStandardMaterial({ map: tex(planks('planks-bed', ['#c99a6b', '#bd8d5f', '#d3a676']), 12, 36), roughness: 0.55 })),
    wall: cached('w-bedroom', () => new THREE.MeshStandardMaterial({ map: tex(wallpaper('wp-bedroom', '#5b6fb3', '#5266a8', '#f6d86b'), 8, 10), roughness: 0.85 })),
    wainscot: '#f5ecdc',
    curtain: '#f28f8f',
  },
  rooftop: {
    id: 'rooftop',
    name: 'Rooftop',
    fog: '#b9dcf2',
    sky: '#eaf6ff',
    ground: '#7d4a37',
    wallHalf: 104,
    floor: cached('f-rooftop', () => new THREE.MeshStandardMaterial({ map: tex(roofTiles(), 18, 50), roughness: 0.75 })),
    wall: cached('w-rooftop', () => new THREE.MeshStandardMaterial({ color: '#c9a27a', roughness: 0.9 })),
    wainscot: '#8a5a44',
    curtain: '#3d7ea6',
  },
  impossible: {
    id: 'impossible',
    name: 'Impossible staircase',
    fog: '#cdbfe8',
    sky: '#f4eaff',
    ground: '#3b2f5c',
    wallHalf: 110,
    floor: cached('f-impossible', () => new THREE.MeshStandardMaterial({ map: tex(checker('chk-impossible', '#3b2f5c', '#e9dcff', 6), 16, 46), roughness: 0.4 })),
    wall: cached('w-impossible', () => new THREE.MeshStandardMaterial({ map: tex(wallpaper('wp-impossible', '#a58bd8', '#9a7fcf', '#ffe38a'), 6, 8), roughness: 0.85 })),
    wainscot: '#3b2f5c',
    curtain: '#e9c46a',
  },
};

/** Terracotta roof tiles. */
function roofTiles() {
  return canvasTexture('roof-tiles', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8f4a33';
    ctx.fillRect(0, 0, w, h);
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 9; c++) {
        const x = c * 32 + (r % 2 ? 16 : 0) - 16;
        const y = r * 32;
        const g = ctx.createLinearGradient(0, y, 0, y + 32);
        g.addColorStop(0, '#c86b47');
        g.addColorStop(1, '#8a3f2a');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 32, y);
        ctx.lineTo(x + 32, y + 22);
        ctx.quadraticCurveTo(x + 16, y + 36, x, y + 22);
        ctx.closePath();
        ctx.fill();
      }
    }
  });
}

export const THEME_ORDER: ThemeId[] = ['hallway', 'living', 'kitchen', 'bedroom', 'garden', 'library', 'balcony', 'rooftop'];

export const SKY = () => skyTexture('sky-window');
