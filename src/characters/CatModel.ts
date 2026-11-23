import * as THREE from 'three';
import { characterMaterial } from './charMaterial';
import { CartoonEye } from './face';
import { Rig, SpringChain } from './rig';
import { attachRigid, buildSkeleton, BuiltSkeleton, meshGeometry, sculptAsync, skinnedMesh } from './sculpt/runtime';
import { CAT, catBrowSpec, catHeadSpec, catNoseSpec, catSpec, catTongueSpec } from './specs/catSpec';

export const CAT_JOINTS = [
  'mover', 'pelvis', 'spine', 'chest', 'neck', 'head', 'jaw', 'tongue', 'mouthL', 'mouthR', 'earL', 'earR', 'browL', 'browR',
  'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
  'tail0', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6', 'tail7',
] as const;

export const CAT_DIMS = { l1: CAT.dims.l1, l2: CAT.dims.l2, ankle: CAT.dims.ankle, pelvisY: CAT.dims.pelvisY, hipX: CAT.dims.hipX };

const _tmpV = new THREE.Vector3();
const FUR_SHELLS = 5;
const FUR_LENGTH = 0.0095;

/** Tapered whisker tube along a gentle arc. */
function whisker(from: THREE.Vector3, dir: THREE.Vector3, len: number, droop: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(from.clone().addScaledVector(dir, len * t).add(new THREE.Vector3(0, -droop * t * t, 0)));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 24, 0.0045, 6, false);
  const pos = geo.getAttribute('position');
  const ref = new THREE.Vector3();
  // taper toward the tip
  for (let i = 0; i < pos.count; i++) {
    const seg = Math.floor(i / 7) / 24;
    curve.getPointAt(Math.min(1, seg), ref);
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    v.sub(ref).multiplyScalar(1 - seg * 0.8).add(ref);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Biscuit — sculpted, skinned cat. The rig (bones) exists immediately so the
 * animator can run; the sculpted skin arrives from a worker a moment later.
 */
export class CatModel {
  root = new THREE.Group();
  rig = new Rig();
  sk: BuiltSkeleton;
  eyes: CartoonEye[] = [];
  tail: SpringChain;
  fur: THREE.MeshPhysicalMaterial & { charUniforms: Record<string, { value: unknown }> };
  shellMats: THREE.MeshPhysicalMaterial[] = [];
  headFur: THREE.MeshPhysicalMaterial;
  blushMat: THREE.MeshBasicMaterial;
  ready: Promise<void>;
  body: THREE.SkinnedMesh | null = null;
  private shells: THREE.Object3D[] = [];
  private camDist = 0;

  constructor() {
    const spec = catSpec();
    this.sk = buildSkeleton(spec.bones);
    this.root.add(this.sk.root);
    for (const b of this.sk.bones) this.rig.add(b.name, b);

    this.fur = characterMaterial({ sheen: 0.5, sheenColor: '#8fa9e8', bump: 0.55, bumpFreq: 140, rim: 0.22, rimColor: '#f4f0ff' }) as never;
    this.headFur = this.fur;
    for (let i = 1; i <= FUR_SHELLS; i++) {
      const h = i / FUR_SHELLS;
      this.shellMats.push(characterMaterial({ sheen: 0.5, sheenColor: '#8fa9e8', rim: 0.2, shell: { h, offset: FUR_LENGTH * h, density: 520, fade: 7.5 } }));
    }

    // ---- eyes (big, green), lids in fur colour
    const lidMat = new THREE.MeshPhysicalMaterial({ color: CAT.fur, roughness: 0.85, sheen: 0.8, sheenColor: new THREE.Color('#8fa9e8') });
    for (const s of [1, -1]) {
      const eye = new CartoonEye({ radius: CAT.eyeR, iris: '#7fcf45', irisDark: '#2c6a12', lidMaterial: lidMat, pupilScale: 0.95 });
      eye.group.position.set(s * CAT.eyePos[0], CAT.eyePos[1], CAT.eyePos[2]);
      eye.group.rotation.y = s * 0.12;
      attachRigid(eye.group, this.sk, 'head');
      this.eyes.push(eye);
    }

    // ---- mouth interior: dark cavity halves, fangs, tongue
    const cavity = new THREE.MeshStandardMaterial({ color: '#3d0f18', roughness: 0.7 });
    const upper = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), cavity);
    upper.scale.set(0.115, 0.04, 0.085);
    upper.position.set(0, 1.262, 0.29);
    attachRigid(upper, this.sk, 'head');
    const lower = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), cavity);
    lower.scale.set(0.105, 0.035, 0.08);
    lower.position.set(0, 1.232, 0.29);
    attachRigid(lower, this.sk, 'jaw');
    const toothMat = new THREE.MeshPhysicalMaterial({ color: '#fffaf0', roughness: 0.25, clearcoat: 0.6 });
    for (const s of [1, -1]) {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.03, 10), toothMat);
      fang.rotation.x = Math.PI;
      fang.scale.setScalar(0.8);
      fang.position.set(s * 0.046, 1.236, 0.352);
      attachRigid(fang, this.sk, 'head');
    }

    // ---- whiskers from the whisker pads
    const wMat = new THREE.MeshStandardMaterial({ color: '#fbfaf6', roughness: 0.35 });
    for (const s of [1, -1])
      for (let k = 0; k < 3; k++) {
        const from = new THREE.Vector3(s * 0.12, 1.305 - k * 0.022, 0.405);
        const dir = new THREE.Vector3(s, 0.16 - k * 0.16, -0.12).normalize();
        const w = new THREE.Mesh(whisker(from, dir, 0.4 - k * 0.03, 0.03 + k * 0.01), wMat);
        attachRigid(w, this.sk, 'head');
      }

    // ---- blush (anger flush / happy cheeks)
    const blushTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,90,110,1)');
      gr.addColorStop(1, 'rgba(255,90,110,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    this.blushMat = new THREE.MeshBasicMaterial({ map: blushTex, transparent: true, opacity: 0, depthWrite: false });
    for (const s of [1, -1]) {
      const bl = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.1), this.blushMat);
      bl.position.set(s * 0.255, 1.33, 0.33);
      bl.rotation.set(-0.1, s * 0.75, 0);
      attachRigid(bl, this.sk, 'head');
    }

    // ---- rest pose: arms hang from the A-pose bind
    this.sk.byName.shoulderL.rotation.z -= CAT.armAngle - 0.18;
    this.sk.byName.shoulderR.rotation.z += CAT.armAngle - 0.18;
    this.rig.captureRest();
    this.tail = new SpringChain(['tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6', 'tail7'].map((n) => this.sk.byName[n]), 50, 6.5, 0.02);
    this.root.scale.setScalar(1.1);

    this.ready = Promise.all([
      sculptAsync(catHeadSpec()),
      sculptAsync(spec),
      sculptAsync(catNoseSpec()),
      sculptAsync(catBrowSpec()),
      sculptAsync(catTongueSpec()),
    ]).then(([head, body, nose, brow, tongue]) => {
        for (const part of [body, head]) {
          const geo = meshGeometry(part);
          const mesh = skinnedMesh(geo, this.sk, this.fur);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.root.add(mesh);
          if (part === body) this.body = mesh;
          for (const m of this.shellMats) {
            const shell = skinnedMesh(geo, this.sk, m);
            shell.renderOrder = 1;
            this.root.add(shell);
            this.shells.push(shell);
          }
          // fur shells are only worth drawing up close: measure camera distance each render
          mesh.onBeforeRender = (_r, _s, camera) => {
            this.camDist = camera.position.distanceTo(this.root.getWorldPosition(_tmpV));
          };
        }
        const glossy = characterMaterial({ clearcoat: 1, clearcoatRoughness: 0.08, rim: 0.15 });
        const n = new THREE.Mesh(meshGeometry(nose), glossy);
        n.scale.setScalar(0.88);
        n.position.set(0, 1.342, 0.442);
        n.castShadow = true;
        attachRigid(n, this.sk, 'head');
        const browMat = characterMaterial({ sheen: 0.6, bump: 0.4, bumpFreq: 160, rim: 0.1 });
        for (const s of [1, -1]) {
          const bm = new THREE.Mesh(meshGeometry(brow), browMat);
          bm.scale.x = s;
          bm.position.set(s * CAT.brow[0], CAT.brow[1], CAT.brow[2]);
          bm.rotation.y = s * 0.18;
          attachRigid(bm, this.sk, s > 0 ? 'browL' : 'browR');
        }
        const t = new THREE.Mesh(meshGeometry(tongue), characterMaterial({ clearcoat: 0.6, clearcoatRoughness: 0.3, rim: 0.05 }));
        t.position.set(0, 1.232, 0.31);
        attachRigid(t, this.sk, 'tongue');
    });
  }

  /** Called once per frame: level of detail for the fur. */
  updateLod() {
    const show = this.camDist < 7.5;
    for (const s of this.shells) s.visible = show;
  }

  /** Model-space rest matrix helper for gameplay sockets. */
  boneWorld(name: string, out: THREE.Vector3) {
    return this.sk.byName[name].getWorldPosition(out);
  }
}
