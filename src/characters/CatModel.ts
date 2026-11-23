import * as THREE from 'three';
import { CartoonEye, makeBrow, MouthRig } from './face';
import { furMaterial, plainMaterial, stripeTexture, tabbyTexture } from './materials';
import { Rig, SpringChain } from './rig';

export const CAT_JOINTS = [
  'mover', 'pelvis', 'spine', 'chest', 'neck', 'head', 'earL', 'earR', 'browL', 'browR',
  'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
  'tail0', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'cap0', 'cap1', 'cap2',
] as const;

export const CAT_DIMS = { l1: 0.29, l2: 0.29, ankle: 0.1, pelvisY: 0.72, hipY: -0.12, hipX: 0.16 };

/**
 * "Biscuit" — a chubby ginger tabby in a striped nightcap and rail-grinding
 * slippers. Built from smooth lathe/sphere surfaces on a joint hierarchy so
 * every part can be posed, plus eyeballs, lids, brows and a mouth rig.
 */
export class CatModel {
  root = new THREE.Group();
  rig = new Rig();
  eyes: CartoonEye[] = [];
  mouth: MouthRig;
  tail: SpringChain;
  cap: SpringChain;
  fur: THREE.MeshPhysicalMaterial;
  headFur: THREE.MeshPhysicalMaterial;
  blushMat: THREE.MeshBasicMaterial;

  constructor() {
    const ginger = '#e9984a';
    const stripe = '#b85a22';
    const cream = '#fff0dc';

    this.headFur = furMaterial(
      tabbyTexture('cat-head', ginger, stripe, { u0: 0.1, u1: 0.4, v0: 0.04, v1: 0.3, vertical: true }, 5),
      ginger,
      '#ffd9a8',
    );
    this.fur = furMaterial(
      tabbyTexture('cat-body', ginger, stripe, { u0: 0.55, u1: 0.95, v0: 0.12, v1: 0.75 }, 6),
      ginger,
      '#ffd9a8',
    );
    const plainFur = furMaterial(null, ginger, '#ffd9a8');
    const creamFur = furMaterial(null, cream, '#ffffff');
    const pink = plainMaterial('#f08aa0', 0.45, { clearcoat: 0.4 });
    const innerEar = plainMaterial('#f7a9b8', 0.7);
    const browMat = plainMaterial('#8f3f15', 0.7);
    const whiskerMat = plainMaterial('#fff8ee', 0.4);
    const slipper = plainMaterial('#7b2d4f', 0.85, { sheen: 1, sheenColor: new THREE.Color('#d77aa0') });
    const sole = plainMaterial('#3a2a2a', 0.6);
    const fluffy = plainMaterial('#ffffff', 0.95, { sheen: 1, sheenColor: new THREE.Color('#ffffff') });
    const capMat = plainMaterial('#ffffff', 0.85, {
      map: stripeTexture('cap-stripes', '#2c8d8a', '#f6ecd8', 8),
      sheen: 0.8,
      sheenColor: new THREE.Color('#bff3ee'),
    });
    this.blushMat = new THREE.MeshBasicMaterial({ color: '#ff5a6e', transparent: true, opacity: 0, depthWrite: false });

    const J = (name: (typeof CAT_JOINTS)[number], parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
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
    const sphere = (r: number, ws = 40, hs = 30) => new THREE.SphereGeometry(r, ws, hs);
    const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 10, 20);

    const mover = J('mover', this.root);
    const pelvis = J('pelvis', mover, 0, CAT_DIMS.pelvisY, 0);

    // pear-shaped lower body
    const bodyProfile = [
      [0.0, -0.24], [0.16, -0.225], [0.28, -0.16], [0.355, -0.05], [0.37, 0.07], [0.35, 0.18], [0.3, 0.28], [0.2, 0.35], [0.0, 0.38],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const bodyGeo = new THREE.LatheGeometry(bodyProfile, 48);
    mesh(bodyGeo, this.fur, pelvis, [0, 0.02, 0], [1, 1, 0.9]);
    mesh(sphere(0.26), creamFur, pelvis, [0, 0.04, 0.17], [1.05, 1.2, 0.62]);

    const spine = J('spine', pelvis, 0, 0.2, 0);
    const chest = J('chest', spine, 0, 0.12, 0);
    mesh(sphere(0.29), this.fur, chest, [0, 0.04, -0.01], [1.02, 0.98, 0.88]);
    mesh(sphere(0.2), creamFur, chest, [0, 0.0, 0.14], [1.1, 1.1, 0.6]);

    // head
    const neck = J('neck', chest, 0, 0.26, 0.02);
    const head = J('head', neck, 0, 0.3, 0.02);
    mesh(sphere(0.46, 64, 48), this.headFur, head, [0, 0, 0], [1.1, 0.96, 0.98]);
    // cheek tufts
    for (const sx of [-1, 1]) {
      const tuft = new THREE.ConeGeometry(0.11, 0.24, 16);
      mesh(tuft, plainFur, head, [sx * 0.47, -0.12, 0.02], [1, 1, 0.7], [0, 0, sx * 1.9]);
      mesh(new THREE.ConeGeometry(0.08, 0.18, 14), plainFur, head, [sx * 0.43, -0.22, 0.04], [1, 1, 0.7], [0, 0, sx * 2.3]);
    }
    // muzzle + mouth rig
    const muzzle = new THREE.Group();
    muzzle.position.set(0, -0.14, 0.33);
    muzzle.scale.set(1.35, 0.78, 0.85);
    head.add(muzzle);
    mesh(sphere(0.2), creamFur, muzzle);
    mesh(sphere(0.12), creamFur, head, [0, -0.27, 0.3], [1.2, 0.8, 0.9]);
    this.mouth = new MouthRig(0.203, { lip: '#2a1410', inside: '#5a1420', tongue: '#f27b92', catLine: true, width: 0.95 }, { phi: 1.7, thetaStart: 0.2, theta: 1.25 });
    muzzle.add(this.mouth.mesh);
    // nose
    mesh(sphere(0.055, 24, 16), pink, head, [0, -0.04, 0.505], [1.5, 0.95, 0.9]);
    // blush (anger flush / happy cheeks)
    for (const sx of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), this.blushMat);
      b.position.set(sx * 0.29, -0.1, 0.38);
      b.rotation.y = sx * 0.6;
      head.add(b);
    }

    // eyes
    for (const sx of [1, -1]) {
      const eye = new CartoonEye({ radius: 0.125, iris: '#8fd14f', irisDark: '#2f6a16', lidMaterial: this.headFur, pupilScale: 1.05 });
      eye.group.position.set(sx * 0.17, 0.07, 0.355);
      eye.group.rotation.y = sx * 0.22;
      head.add(eye.group);
      this.eyes.push(eye);
    }
    const browL = J('browL', head, 0.17, 0.235, 0.41);
    browL.add(makeBrow(0.11, 0.024, browMat));
    browL.rotation.z = -0.12;
    const browR = J('browR', head, -0.17, 0.235, 0.41);
    browR.add(makeBrow(0.11, 0.024, browMat));
    browR.rotation.z = 0.12;

    // ears
    const earGeo = new THREE.LatheGeometry(
      [[0.0, 0.3], [0.03, 0.27], [0.08, 0.18], [0.13, 0.07], [0.15, 0.0], [0.0, 0.0]].map(([r, y]) => new THREE.Vector2(r, y)),
      24,
    );
    const innerGeo = new THREE.LatheGeometry(
      [[0.0, 0.24], [0.05, 0.15], [0.09, 0.04], [0.0, 0.03]].map(([r, y]) => new THREE.Vector2(r, y)),
      20,
    );
    for (const [name, sx] of [['earL', 1], ['earR', -1]] as const) {
      const ear = J(name, head, sx * 0.27, 0.31, -0.03);
      ear.rotation.set(-0.12, 0, -sx * 0.42);
      mesh(earGeo, plainFur, ear, [0, 0, 0], [1, 1, 0.55]);
      mesh(innerGeo, innerEar, ear, [0, 0.01, 0.045], [1, 1, 0.3]);
    }

    // whiskers
    const wGeo = new THREE.CylinderGeometry(0.005, 0.0025, 0.36, 5);
    wGeo.translate(0, 0.18, 0);
    for (const sx of [-1, 1])
      for (let k = 0; k < 3; k++) {
        const w = new THREE.Mesh(wGeo, whiskerMat);
        w.position.set(sx * 0.2, -0.12 - k * 0.025, 0.42);
        w.rotation.set(0, 0, -sx * (1.38 + (k - 1) * 0.17));
        w.rotation.y = sx * 0.35;
        head.add(w);
      }

    // nightcap with floppy tip
    const capBase = new THREE.Group();
    capBase.position.set(0.02, 0.3, -0.06);
    capBase.rotation.set(-0.42, 0, -0.18);
    head.add(capBase);
    mesh(new THREE.TorusGeometry(0.33, 0.06, 14, 40), fluffy, capBase, [0, 0, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    const capSeg = (r0: number, r1: number, h: number) =>
      new THREE.LatheGeometry([[0, 0], [r0, 0], [(r0 + r1) / 2 + 0.01, h * 0.5], [r1, h], [0, h]].map(([r, y]) => new THREE.Vector2(r, y)), 32);
    const cap0 = J('cap0', capBase, 0, 0.02, 0);
    mesh(capSeg(0.32, 0.2, 0.26), capMat, cap0);
    const cap1 = J('cap1', cap0, 0, 0.26, 0);
    cap1.rotation.set(-0.5, 0, 0);
    mesh(capSeg(0.2, 0.11, 0.24), capMat, cap1);
    const cap2 = J('cap2', cap1, 0, 0.24, 0);
    cap2.rotation.set(-0.7, 0, 0);
    mesh(capSeg(0.11, 0.035, 0.22), capMat, cap2);
    mesh(sphere(0.085, 20, 16), fluffy, cap2, [0, 0.24, 0]);

    // arms
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const sh = J(`shoulder${side}` as const, chest, sx * 0.29, 0.1, 0.0);
      mesh(sphere(0.095, 24, 18), this.fur, sh);
      mesh(capsule(0.078, 0.2), this.fur, sh, [0, -0.15, 0]);
      const el = J(`elbow${side}` as const, sh, 0, -0.3, 0);
      mesh(capsule(0.072, 0.18), plainFur, el, [0, -0.12, 0]);
      const hand = J(`hand${side}` as const, el, 0, -0.27, 0);
      mesh(sphere(0.1, 28, 20), creamFur, hand, [0, -0.04, 0], [1, 0.9, 0.85]);
      mesh(sphere(0.045, 16, 12), creamFur, hand, [sx * -0.03, -0.02, 0.08]);
      for (let k = -1; k <= 1; k++) mesh(sphere(0.035, 12, 10), creamFur, hand, [k * 0.045, -0.12, 0.02]);
    }

    // legs (IK driven) with slippers
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const th = J(`thigh${side}` as const, pelvis, sx * CAT_DIMS.hipX, CAT_DIMS.hipY, 0.02);
      mesh(capsule(0.1, 0.14), this.fur, th, [0, -0.14, 0]);
      const sh = J(`shin${side}` as const, th, 0, -CAT_DIMS.l1, 0);
      mesh(capsule(0.082, 0.16), plainFur, sh, [0, -0.14, 0]);
      const ft = J(`foot${side}` as const, sh, 0, -CAT_DIMS.l2, 0);
      const sl = new THREE.Mesh(capsule(0.1, 0.2), slipper);
      sl.rotation.x = Math.PI / 2;
      sl.scale.set(1.15, 1, 0.72);
      sl.position.set(0, -0.03, 0.06);
      sl.castShadow = true;
      ft.add(sl);
      mesh(new THREE.BoxGeometry(0.2, 0.025, 0.42), sole, ft, [0, -0.1, 0.06]);
      mesh(sphere(0.07, 16, 12), fluffy, ft, [0, 0.04, 0.2]);
    }

    // tail
    let parent: THREE.Object3D = pelvis;
    const tailJoints: THREE.Object3D[] = [];
    for (let i = 0; i < 6; i++) {
      const t = J(`tail${i}` as (typeof CAT_JOINTS)[number], parent, 0, i === 0 ? -0.08 : 0.115, i === 0 ? -0.3 : 0);
      t.rotation.x = i === 0 ? -1.95 : 0.3;
      const r = 0.075 - i * 0.006;
      mesh(capsule(r, 0.09), i === 5 ? creamFur : this.fur, t, [0, 0.06, 0]);
      tailJoints.push(t);
      parent = t;
    }

    this.tail = new SpringChain(tailJoints.slice(1), 55, 7, 0.025);
    this.cap = new SpringChain([cap1, cap2], 70, 6, 0.04);
    this.rig.captureRest();
    this.root.scale.setScalar(1.12);
  }
}
