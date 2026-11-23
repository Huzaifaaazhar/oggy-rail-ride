import * as THREE from 'three';
import { CartoonEye, makeBrow, MouthRig } from './face';
import { checkTexture, plainMaterial, segmentTexture, shellMaterial, stripeTexture } from './materials';
import { Rig, SpringChain } from './rig';

export const ROACH_JOINTS = [
  'mover', 'pelvis', 'body', 'chest', 'neck', 'head', 'browL', 'browR', 'wingL', 'wingR',
  'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR', 'midL', 'midR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
  'antL0', 'antL1', 'antL2', 'antL3', 'antR0', 'antR1', 'antR2', 'antR3', 'acc0',
] as const;
type JointName = (typeof ROACH_JOINTS)[number];

export type RoachId = 'skitter' | 'chomp' | 'twig';

export interface RoachSpec {
  id: RoachId;
  name: string;
  shell: string;
  shellDark: string;
  belly: string;
  iris: string;
  irisDark: string;
  shoe: string;
  /** overall scale */
  scale: number;
  /** body width / height / depth multipliers */
  girth: number;
  height: number;
  head: number;
  legLen: number;
  armLen: number;
  antennaLen: number;
  antennaCurl: number;
  restLid: number;
  accessory: 'goggles' | 'bib' | 'scarf';
}

/** Three original pests, each with its own silhouette and palette. */
export const ROACHES: Record<RoachId, RoachSpec> = {
  skitter: {
    id: 'skitter',
    name: 'Skitter',
    shell: '#e2622e',
    shellDark: '#9c3514',
    belly: '#f8cf9c',
    iris: '#c9e83a',
    irisDark: '#5d7a0c',
    shoe: '#f4f1ea',
    scale: 0.82,
    girth: 0.95,
    height: 0.95,
    head: 1.18,
    legLen: 0.95,
    armLen: 0.95,
    antennaLen: 0.75,
    antennaCurl: -0.35,
    restLid: 0.05,
    accessory: 'goggles',
  },
  chomp: {
    id: 'chomp',
    name: 'Chomp',
    shell: '#7b9a2e',
    shellDark: '#45601a',
    belly: '#e9e59a',
    iris: '#f2a33a',
    irisDark: '#8a4a0a',
    shoe: '#7a4b2a',
    scale: 1.0,
    girth: 1.55,
    height: 1.0,
    head: 0.95,
    legLen: 0.8,
    armLen: 0.9,
    antennaLen: 1.0,
    antennaCurl: 0.45,
    restLid: 0.22,
    accessory: 'bib',
  },
  twig: {
    id: 'twig',
    name: 'Twig',
    shell: '#1f8f8c',
    shellDark: '#0f5452',
    belly: '#c4ece0',
    iris: '#7cc4ff',
    irisDark: '#1d4f8a',
    shoe: '#2b2530',
    scale: 1.12,
    girth: 0.82,
    height: 1.3,
    head: 0.92,
    legLen: 1.35,
    armLen: 1.25,
    antennaLen: 1.45,
    antennaCurl: 0.75,
    restLid: 0.12,
    accessory: 'scarf',
  },
};

export class RoachModel {
  root = new THREE.Group();
  rig = new Rig();
  eyes: CartoonEye[] = [];
  mouth: MouthRig;
  antennae: SpringChain[] = [];
  accessory: SpringChain | null = null;
  dims: { l1: number; l2: number; ankle: number; hipX: number };
  /** Socket in the right hand for thrown props. */
  handSocket = new THREE.Group();

  constructor(public spec: RoachSpec) {
    const S = spec;
    const shellTex = stripeTexture(`shell-${S.id}`, S.shell, S.shellDark, 2, true);
    shellTex.repeat.set(1, 1);
    const shell = shellMaterial(null, S.shell);
    const shellDark = shellMaterial(null, S.shellDark);
    const belly = plainMaterial('#ffffff', 0.55, { map: segmentTexture(`belly-${S.id}`, S.belly, 'rgba(90,60,20,0.35)', 7), clearcoat: 0.3 });
    const limb = shellMaterial(null, S.shellDark);
    const joint = shellMaterial(null, S.shell);
    const shoe = plainMaterial(S.shoe, 0.5, { clearcoat: 0.5 });
    const browMat = plainMaterial('#2b1810', 0.6);

    const J = (name: JointName, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return this.rig.add(name, g);
    };
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, p?: [number, number, number], s?: [number, number, number], r?: [number, number, number]) => {
      const m = new THREE.Mesh(geo, mat);
      if (p) m.position.set(...p);
      if (s) m.scale.set(...s);
      if (r) m.rotation.set(...r);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const sphere = (r: number, ws = 36, hs = 26) => new THREE.SphereGeometry(r, ws, hs);
    const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 8, 14);

    const legL1 = 0.26 * S.legLen;
    const legL2 = 0.26 * S.legLen;
    const ankle = 0.07;
    const hipX = 0.12 * S.girth;
    this.dims = { l1: legL1, l2: legL2, ankle, hipX };
    const pelvisY = ankle + (legL1 + legL2) * 0.93 + 0.06;

    const mover = J('mover', this.root);
    const pelvis = J('pelvis', mover, 0, pelvisY, 0);

    // body: bean-shaped torso with segmented belly and a glossy back shell
    const body = J('body', pelvis, 0, 0.05, 0);
    const bw = 0.27 * S.girth;
    const bh = 0.36 * S.height;
    const bd = 0.24 * Math.sqrt(S.girth);
    mesh(sphere(1, 48, 36), belly, body, [0, bh * 0.75, 0.02], [bw, bh, bd]);
    // back shell (elytra) as two hinged halves
    for (const [name, sx] of [['wingL', 1], ['wingR', -1]] as const) {
      const w = J(name, body, sx * 0.012, bh * 1.35, -bd * 0.35);
      const geo = new THREE.SphereGeometry(1, 32, 24, sx > 0 ? 0 : Math.PI, Math.PI, 0, Math.PI * 0.62);
      const m = mesh(geo, shell, w, [0, -bh * 0.55, -bd * 0.18], [bw * 1.08, bh * 1.02, bd * 1.12], [0.32, Math.PI / 2, 0]);
      m.rotation.order = 'YXZ';
      // dark seam line + spots
      mesh(sphere(0.035, 12, 10), shellDark, w, [sx * bw * 0.45, -bh * 0.35, -bd * 0.95]);
      mesh(sphere(0.025, 12, 10), shellDark, w, [sx * bw * 0.6, -bh * 0.8, -bd * 0.8]);
    }
    // tail tip of abdomen
    mesh(sphere(1, 24, 18), shellDark, body, [0, bh * 0.08, -bd * 0.55], [bw * 0.55, bh * 0.35, bd * 0.6]);

    const chest = J('chest', body, 0, bh * 1.35, 0.02);
    const neck = J('neck', chest, 0, 0.05 * S.height, 0.02);
    mesh(capsule(0.06, 0.08 * S.height), limb, neck, [0, 0.06 * S.height, 0]);
    const hr = 0.22 * S.head;
    const head = J('head', neck, 0, 0.12 * S.height + hr * 0.75, 0.03);
    mesh(sphere(hr, 48, 36), shell, head, [0, 0, 0], [1.05, 0.95, 1]);
    // face plate (lighter snout) with mouth rig
    const snout = new THREE.Group();
    snout.position.set(0, -hr * 0.32, hr * 0.62);
    snout.scale.set(1.25, 0.75, 0.75);
    head.add(snout);
    mesh(sphere(hr * 0.5), plainMaterial(S.belly, 0.5, { clearcoat: 0.4 }), snout);
    this.mouth = new MouthRig(hr * 0.505, { lip: '#2a1410', inside: '#3d0f18', tongue: '#ff6f8f', width: 1.1 }, { phi: 1.8, thetaStart: 0.15, theta: 1.25 });
    snout.add(this.mouth.mesh);
    // eyes — big and expressive
    for (const sx of [1, -1]) {
      const eye = new CartoonEye({ radius: hr * 0.36, iris: S.iris, irisDark: S.irisDark, lidMaterial: shell, restLid: S.restLid, pupilScale: 1.1 });
      eye.group.position.set(sx * hr * 0.37, hr * 0.28, hr * 0.72);
      eye.group.rotation.y = sx * 0.28;
      head.add(eye.group);
      this.eyes.push(eye);
    }
    const browL = J('browL', head, hr * 0.37, hr * 0.68, hr * 0.78);
    browL.add(makeBrow(hr * 0.32, hr * 0.06, browMat));
    const browR = J('browR', head, -hr * 0.37, hr * 0.68, hr * 0.78);
    browR.add(makeBrow(hr * 0.32, hr * 0.06, browMat));

    // antennae: spring chains with bobbles
    const segLen = 0.13 * S.antennaLen;
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      let parent: THREE.Object3D = head;
      const chain: THREE.Object3D[] = [];
      for (let i = 0; i < 4; i++) {
        const name = `ant${side}${i}` as JointName;
        const a = J(name, parent, i === 0 ? sx * hr * 0.3 : 0, i === 0 ? hr * 0.82 : segLen, i === 0 ? hr * 0.3 : 0);
        a.rotation.set(i === 0 ? -0.35 : S.antennaCurl * 0.5, 0, i === 0 ? -sx * 0.45 : -sx * S.antennaCurl * 0.35);
        mesh(new THREE.CylinderGeometry(0.012, 0.016, segLen, 8), limb, a, [0, segLen / 2, 0]);
        chain.push(a);
        parent = a;
      }
      mesh(sphere(0.035, 14, 10), joint, parent, [0, segLen, 0]);
      this.antennae.push(new SpringChain(chain, 45, 4.5, 0.035));
    }

    // arms (upper pair) + tiny middle pair
    const armL = 0.2 * S.armLen;
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const sh = J(`shoulder${side}` as JointName, chest, sx * bw * 0.85, -0.02, 0.04);
      mesh(sphere(0.045, 14, 10), joint, sh);
      mesh(capsule(0.032, armL), limb, sh, [0, -armL * 0.55, 0]);
      const el = J(`elbow${side}` as JointName, sh, 0, -armL * 1.1, 0);
      mesh(sphere(0.038, 12, 10), joint, el);
      mesh(capsule(0.03, armL * 0.9), limb, el, [0, -armL * 0.5, 0]);
      const hand = J(`hand${side}` as JointName, el, 0, -armL, 0);
      mesh(sphere(0.055, 16, 12), joint, hand, [0, -0.03, 0], [1, 0.85, 0.75]);
      for (let k = -1; k <= 1; k++) mesh(capsule(0.016, 0.04), joint, hand, [k * 0.028, -0.085, 0.01], [1, 1, 1], [0, 0, k * 0.25]);
      if (side === 'R') hand.add(this.handSocket);
      const mid = J(`mid${side}` as JointName, body, sx * bw * 0.92, bh * 0.85, 0.06);
      mid.rotation.z = sx * 0.9;
      mesh(capsule(0.022, 0.12), limb, mid, [0, -0.08, 0]);
      mesh(sphere(0.03, 10, 8), joint, mid, [0, -0.17, 0]);
    }
    this.handSocket.position.set(0, -0.08, 0.06);

    // legs (IK) with chunky shoes
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const th = J(`thigh${side}` as JointName, pelvis, sx * hipX, 0, 0);
      mesh(capsule(0.04, legL1 * 0.8), limb, th, [0, -legL1 * 0.5, 0]);
      const sh = J(`shin${side}` as JointName, th, 0, -legL1, 0);
      mesh(sphere(0.045, 12, 10), joint, sh);
      mesh(capsule(0.035, legL2 * 0.8), limb, sh, [0, -legL2 * 0.5, 0]);
      const ft = J(`foot${side}` as JointName, sh, 0, -legL2, 0);
      const s = new THREE.Mesh(capsule(0.06, 0.12), shoe);
      s.rotation.x = Math.PI / 2;
      s.scale.set(1.2, 1, 0.75);
      s.position.set(0, -0.025, 0.05);
      s.castShadow = true;
      ft.add(s);
    }

    // signature accessories
    const acc = J('acc0', chest, 0, 0, 0);
    if (S.accessory === 'goggles') {
      const strap = plainMaterial('#5a3a22', 0.7);
      const brass = new THREE.MeshStandardMaterial({ color: '#d9a441', metalness: 0.9, roughness: 0.25 });
      const glass = new THREE.MeshPhysicalMaterial({ color: '#9fe3ff', roughness: 0.05, transmission: 0.0, clearcoat: 1, opacity: 0.8, transparent: true });
      const band = new THREE.Mesh(new THREE.TorusGeometry(hr * 0.98, 0.016, 8, 48), strap);
      band.rotation.x = Math.PI / 2 - 0.75;
      band.position.set(0, hr * 0.5, -hr * 0.05);
      head.add(band);
      for (const sx of [1, -1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(hr * 0.24, 0.03, 10, 24), brass);
        ring.position.set(sx * hr * 0.33, hr * 0.78, hr * 0.62);
        ring.rotation.x = -0.75;
        head.add(ring);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(hr * 0.22, 24), glass);
        lens.position.copy(ring.position);
        lens.rotation.x = -0.75;
        head.add(lens);
      }
    } else if (S.accessory === 'bib') {
      const bibMat = plainMaterial('#ffffff', 0.85, { map: checkTexture('bib', '#ffffff', '#e04545', 6), side: THREE.DoubleSide });
      const bib = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.32, Math.PI * 0.4), bibMat);
      bib.scale.set(bw * 1.05, bh * 1.05, bd * 1.08);
      bib.position.set(0, -bh * 0.5, 0.02);
      acc.add(bib);
      // cookie in the left hand
      const cookie = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 20), plainMaterial('#c88a4a', 0.8));
      cookie.rotation.x = Math.PI / 2;
      cookie.position.set(0, -0.09, 0.05);
      this.rig.joints.handL.add(cookie);
      for (let k = 0; k < 4; k++) {
        const chip = new THREE.Mesh(sphere(0.012, 6, 5), plainMaterial('#4a2a14', 0.7));
        chip.position.set(Math.cos(k * 1.7) * 0.04, -0.09 + Math.sin(k * 1.7) * 0.04, 0.065);
        this.rig.joints.handL.add(chip);
      }
    } else {
      const knit = plainMaterial('#ffffff', 0.95, { map: stripeTexture('scarf', '#f2b33d', '#d8413a', 10, true), sheen: 1, sheenColor: new THREE.Color('#ffe8b0') });
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.05, 12, 28), knit);
      wrap.rotation.x = Math.PI / 2;
      wrap.position.set(0, 0.07, 0.01);
      acc.add(wrap);
      // trailing scarf ends (spring)
      let parent: THREE.Object3D = acc;
      const chain: THREE.Object3D[] = [];
      for (let i = 0; i < 3; i++) {
        const seg = new THREE.Group();
        seg.position.set(i === 0 ? -0.06 : 0, i === 0 ? 0.05 : -0.14, i === 0 ? -0.1 : 0);
        seg.rotation.x = i === 0 ? 2.4 : 0.15;
        parent.add(seg);
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.025), knit);
        m.position.y = -0.07;
        m.castShadow = true;
        seg.add(m);
        chain.push(seg);
        parent = seg;
      }
      this.accessory = new SpringChain(chain, 30, 3.5, 0.05);
    }

    this.rig.captureRest();
    this.root.scale.setScalar(S.scale);
  }
}
