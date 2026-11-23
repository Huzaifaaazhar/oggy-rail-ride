import * as THREE from 'three';
import { sculpt } from './mesher';
import type { BoneSpec, MeshData, SculptSpec } from './types';

/* ------------------------------------------------------------ worker queue */

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (d: MeshData) => void>();
const cache = new Map<string, Promise<MeshData>>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./sculpt.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; data: MeshData }>) => {
      pending.get(e.data.id)?.(e.data.data);
      pending.delete(e.data.id);
    };
    return worker;
  } catch {
    return null;
  }
}

/** Sculpt off the main thread (falls back to synchronous when workers are unavailable). Cached per spec name. */
export function sculptAsync(spec: SculptSpec): Promise<MeshData> {
  const hit = cache.get(spec.name);
  if (hit) return hit;
  const w = getWorker();
  const p = w
    ? new Promise<MeshData>((resolve) => {
        const id = nextId++;
        pending.set(id, resolve);
        w.postMessage({ id, spec });
      })
    : Promise.resolve(sculpt(spec));
  cache.set(spec.name, p);
  return p;
}

export function meshGeometry(d: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
  g.setAttribute('aRough', new THREE.BufferAttribute(d.rough, 1));
  if (d.skinIndex && d.skinWeight) {
    g.setAttribute('skinIndex', new THREE.BufferAttribute(d.skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(d.skinWeight, 4));
  }
  g.setIndex(new THREE.BufferAttribute(d.index, 1));
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------ skeleton */

export interface BuiltSkeleton {
  bones: THREE.Bone[];
  byName: Record<string, THREE.Bone>;
  root: THREE.Bone;
  /** inverse bind matrices in model space */
  inverses: THREE.Matrix4[];
  /** model-space rest matrix of each bone (bind pose) */
  rest: Record<string, THREE.Matrix4>;
}

const _y = new THREE.Vector3();
const _x = new THREE.Vector3();
const _z = new THREE.Vector3();

/** Creates bones from model-space positions (and optional aim targets for chain bones). */
export function buildSkeleton(specs: BoneSpec[]): BuiltSkeleton {
  const byName: Record<string, THREE.Bone> = {};
  const rest: Record<string, THREE.Matrix4> = {};
  const bones: THREE.Bone[] = [];
  let root: THREE.Bone | null = null;
  for (const s of specs) {
    const b = new THREE.Bone();
    b.name = s.name;
    const m = new THREE.Matrix4();
    if (s.aim) {
      _y.set(s.aim[0] - s.pos[0], s.aim[1] - s.pos[1], s.aim[2] - s.pos[2]).normalize();
      _x.set(1, 0, 0);
      if (Math.abs(_y.x) > 0.9) _x.set(0, 0, 1);
      _z.crossVectors(_x, _y).normalize();
      _x.crossVectors(_y, _z).normalize();
      m.makeBasis(_x, _y, _z);
    }
    m.setPosition(s.pos[0], s.pos[1], s.pos[2]);
    rest[s.name] = m;
    if (s.parent) {
      const parentM = rest[s.parent];
      const local = parentM.clone().invert().multiply(m);
      local.decompose(b.position, b.quaternion, b.scale);
      byName[s.parent].add(b);
    } else {
      m.decompose(b.position, b.quaternion, b.scale);
      root = b;
    }
    byName[s.name] = b;
    bones.push(b);
  }
  const inverses = specs.map((s) => rest[s.name].clone().invert());
  return { bones, byName, root: root!, inverses, rest };
}

/** Skinned mesh bound in model space; correct no matter where the character already is. */
export function skinnedMesh(geo: THREE.BufferGeometry, sk: BuiltSkeleton, mat: THREE.Material) {
  const mesh = new THREE.SkinnedMesh(geo, mat);
  const skeleton = new THREE.Skeleton(sk.bones, sk.inverses);
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.frustumCulled = false;
  return mesh;
}

/** Attach a rigid part authored in model space to a bone (bind pose). */
export function attachRigid(obj: THREE.Object3D, sk: BuiltSkeleton, bone: string) {
  const inv = sk.rest[bone].clone().invert();
  obj.applyMatrix4(inv);
  sk.byName[bone].add(obj);
  return obj;
}
