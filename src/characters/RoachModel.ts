import * as THREE from 'three';
import { characterMaterial } from './charMaterial';
import { CartoonEye } from './face';
import { Rig, SpringChain } from './rig';
import { attachRigid, buildSkeleton, BuiltSkeleton, meshGeometry, sculptAsync, skinnedMesh } from './sculpt/runtime';
import { antennaPoints, browPos, PLANS, RoachPlan, roachBodySpec, roachBrowSpec, roachHeadSpec, roachWingSpec } from './specs/roachSpecs';

export const ROACH_JOINTS = [
  'mover', 'pelvis', 'body', 'chest', 'neck', 'head', 'jaw', 'tongue', 'mouthL', 'mouthR', 'browL', 'browR', 'wingL', 'wingR',
  'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR', 'midL', 'midR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
  'antL0', 'antL1', 'antL2', 'antL3', 'antR0', 'antR1', 'antR2', 'antR3',
] as const;

export type RoachId = 'skitter' | 'chomp' | 'twig';

export interface RoachSpec {
  id: RoachId;
  name: string;
  iris: string;
  irisDark: string;
  plan: RoachPlan;
}

/** Three original pests, each with its own body plan, palette and personality. */
export const ROACHES: Record<RoachId, RoachSpec> = {
  skitter: { id: 'skitter', name: 'Skitter', iris: '#c9e83a', irisDark: '#4d6a08', plan: PLANS.skitter },
  chomp: { id: 'chomp', name: 'Chomp', iris: '#f2a33a', irisDark: '#7a3e06', plan: PLANS.chomp },
  twig: { id: 'twig', name: 'Twig', iris: '#7cc4ff', irisDark: '#1d4f8a', plan: PLANS.twig },
};

/** Skinned antenna: a beaded, tapering tube along the bind-pose chain. */
function antennaGeometry(pts: THREE.Vector3[], boneIdx: number[], r0: number) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const tubular = 48;
  const radial = 8;
  const geo = new THREE.TubeGeometry(curve, tubular, r0, radial, false);
  const pos = geo.getAttribute('position');
  const n = pos.count;
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  const segs = boneIdx.length;
  for (let i = 0; i < n; i++) {
    const ring = Math.floor(i / (radial + 1));
    const u = ring / tubular;
    curve.getPointAt(Math.min(1, u), c);
    v.fromBufferAttribute(pos, i).sub(c);
    const bead = 1 + 0.35 * Math.pow(Math.max(0, Math.cos(u * segs * 2 * Math.PI)), 6);
    v.multiplyScalar((1 - 0.55 * u) * bead).add(c);
    pos.setXYZ(i, v.x, v.y, v.z);
    const f = u * segs;
    const s0 = Math.min(segs - 1, Math.floor(f));
    const t = f - s0;
    const s1 = Math.min(segs - 1, s0 + 1);
    const blend = t > 0.7 ? (t - 0.7) / 0.3 * 0.5 : 0;
    skinIndex[i * 4] = boneIdx[s0];
    skinIndex[i * 4 + 1] = boneIdx[s1];
    skinWeight[i * 4] = 1 - blend;
    skinWeight[i * 4 + 1] = blend;
  }
  geo.computeVertexNormals();
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  return geo;
}

export class RoachModel {
  root = new THREE.Group();
  rig = new Rig();
  sk: BuiltSkeleton;
  eyes: CartoonEye[] = [];
  antennae: SpringChain[] = [];
  dims: { l1: number; l2: number; ankle: number; hipX: number };
  /** Socket in the right hand for thrown props. */
  handSocket = new THREE.Group();
  ready: Promise<void>;
  plan: RoachPlan;

  constructor(public spec: RoachSpec) {
    const p = spec.plan;
    this.plan = p;
    this.dims = { l1: p.l1, l2: p.l2, ankle: p.ankle, hipX: p.hipX };
    const body = roachBodySpec(p);
    this.sk = buildSkeleton(body.bones);
    this.root.add(this.sk.root);
    for (const b of this.sk.bones) this.rig.add(b.name, b);

    const chitin = characterMaterial({ clearcoat: 0.9, clearcoatRoughness: 0.14, bump: 0.22, bumpFreq: 240, sheen: 0.15, rim: 0.3, rimColor: '#fff6e6' });
    const lidMat = new THREE.MeshPhysicalMaterial({ color: p.shell, roughness: 0.35, clearcoat: 0.8 });

    // eyes
    for (const s of [1, -1]) {
      const eye = new CartoonEye({ radius: p.eyeR, iris: spec.iris, irisDark: spec.irisDark, lidMaterial: lidMat, restLid: p.restLid, pupilScale: 1.05 });
      eye.group.position.set(s * p.eyePos[0], p.eyePos[1], p.eyePos[2]);
      eye.group.rotation.y = s * 0.22;
      attachRigid(eye.group, this.sk, 'head');
      this.eyes.push(eye);
    }

    // mouth interior + teeth
    const cavity = new THREE.MeshStandardMaterial({ color: '#2f0a12', roughness: 0.7 });
    const up = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), cavity);
    up.scale.set(p.mouthW * 0.95, 0.022, 0.05);
    up.position.set(0, p.mouthY + 0.01, p.mouthZ - 0.07);
    attachRigid(up, this.sk, 'head');
    const lo = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), cavity);
    lo.scale.set(p.mouthW * 0.9, 0.02, 0.048);
    lo.position.set(0, p.mouthY - 0.012, p.mouthZ - 0.07);
    attachRigid(lo, this.sk, 'jaw');
    const tooth = new THREE.MeshPhysicalMaterial({ color: '#fffaf0', roughness: 0.2, clearcoat: 0.7 });
    if (p.id === 'chomp') {
      for (const s of [1, -1]) {
        const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.02, 4, 10), tooth);
        t.scale.set(1.1, 1, 0.5);
        t.position.set(s * 0.014, p.mouthY - 0.016, p.mouthZ + 0.006);
        attachRigid(t, this.sk, 'head');
      }
    } else {
      const row = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, p.mouthW * 1.1, 4, 8), tooth);
      row.rotation.z = Math.PI / 2;
      row.position.set(0, p.mouthY - 0.002, p.mouthZ - 0.045);
      attachRigid(row, this.sk, 'head');
    }
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshPhysicalMaterial({ color: '#ff6f8f', roughness: 0.4, clearcoat: 0.5 }));
    tongue.scale.set(p.mouthW * 0.5, 0.012, 0.045);
    tongue.position.set(0, p.mouthY - 0.012, p.mouthZ - 0.05);
    attachRigid(tongue, this.sk, 'tongue');

    this.sk.byName.handR.add(this.handSocket);
    this.handSocket.position.set(0, -0.05, 0.03);

    // rest pose: arms hang from the A-pose bind
    this.sk.byName.shoulderL.rotation.z -= p.armAngle - 0.22;
    this.sk.byName.shoulderR.rotation.z += p.armAngle - 0.22;
    this.rig.captureRest();
    for (const LR of ['L', 'R']) this.antennae.push(new SpringChain([0, 1, 2, 3].map((i) => this.sk.byName[`ant${LR}${i}`]), 40, 4, 0.03));

    const tipMat = new THREE.MeshPhysicalMaterial({ color: p.shellDark, roughness: 0.25, clearcoat: 1 });
    const antMat = characterMaterial({ vertexColors: false, color: p.limb, roughness: 0.3, clearcoat: 0.8, rim: 0.2 });
    for (const [s, LR] of [[1, 'L'], [-1, 'R']] as const) {
      const pts = antennaPoints(p, s).map((q) => new THREE.Vector3(...q));
      const idx = [0, 1, 2, 3].map((i) => this.sk.bones.findIndex((b) => b.name === `ant${LR}${i}`));
      const r0 = p.id === 'chomp' ? 0.013 : 0.01;
      const geo = antennaGeometry(pts, idx, r0);
      this.root.add(skinnedMesh(geo, this.sk, antMat));
      const tip = new THREE.Mesh(new THREE.SphereGeometry(r0 * 1.5, 14, 10), tipMat);
      tip.position.copy(pts[4]);
      attachRigid(tip, this.sk, `ant${LR}3`);
    }

    this.ready = Promise.all([sculptAsync(roachHeadSpec(p)), sculptAsync(body), sculptAsync(roachWingSpec(p)), sculptAsync(roachBrowSpec(p))]).then(([head, bodyM, wing, brow]) => {
      for (const part of [bodyM, head]) {
        const m = skinnedMesh(meshGeometry(part), this.sk, chitin);
        m.castShadow = true;
        m.receiveShadow = true;
        this.root.add(m);
      }
      const wingMat = characterMaterial({ clearcoat: 1, clearcoatRoughness: 0.06, rim: 0.25, side: THREE.DoubleSide } as never);
      wingMat.side = THREE.DoubleSide;
      const wingGeo = meshGeometry(wing);
      for (const s of [1, -1]) {
        const w = new THREE.Mesh(wingGeo, wingMat);
        w.position.set(s * p.wing.c[0], p.wing.c[1], p.wing.c[2]);
        w.rotation.set(p.wing.rot[0], 0, s * p.wing.rot[2]);
        w.castShadow = true;
        attachRigid(w, this.sk, s > 0 ? 'wingL' : 'wingR');
      }
      const browMat = characterMaterial({ clearcoat: 0.3, rim: 0.1 });
      const browGeo = meshGeometry(brow);
      for (const s of [1, -1]) {
        const bm = new THREE.Mesh(browGeo, browMat);
        bm.position.set(...browPos(p, s));
        bm.rotation.set(-0.25, s * 0.3, 0);
        attachRigid(bm, this.sk, s > 0 ? 'browL' : 'browR');
      }
    });
  }
}
