import * as THREE from 'three';
import { checker, grass, planks, skyTexture, wallpaper } from '../util/textures';

export type ThemeId = 'hallway' | 'living' | 'kitchen' | 'garden' | 'library' | 'balcony';

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
};

export const THEME_ORDER: ThemeId[] = ['hallway', 'living', 'kitchen', 'garden', 'library', 'balcony'];

export const SKY = () => skyTexture('sky-window');
