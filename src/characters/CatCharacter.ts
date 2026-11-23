import * as THREE from 'three';
import { clamp, damp, lerp } from '../util/math';
import { CAT_DIMS, CAT_JOINTS, CatModel } from './CatModel';
import { Animator, ClipFn, MotionProbe, Pose, solveLegIK } from './rig';

export interface CatParams {
  speed01: number;
  lean: number;
  vy: number;
  switchDir: number;
  dodgeDir: number;
  accel: number;
  lookX: number;
  lookY: number;
  tuck: number;
}

const A = CAT_DIMS.ankle;
const sin = Math.sin;
const bump = (p: number) => Math.sin(Math.PI * clamp(p, 0, 1));

const clips: Record<string, ClipFn<CatParams>> = {
  /** Balancing on the handrail, slippers in line, arms out like a tightrope walker. */
  ride: (P, t, a) => {
    const sway = sin(t * 2.2);
    const bob = sin(t * 7.2);
    const sp = a.speed01;
    P.p('pelvis', 0, -0.05 - 0.07 * sp + bob * 0.012, 0);
    P.r('pelvis', 0.06 + 0.14 * sp, 0.3, sway * 0.05);
    P.r('spine', 0.05 + 0.16 * sp, -0.12, sway * 0.06);
    P.r('chest', 0.03, -0.12, sway * 0.03);
    P.r('neck', -0.08 - 0.22 * sp, -0.03, 0);
    P.r('head', -0.04, -0.02, -sway * 0.07);
    P.r('shoulderL', -0.15 - 0.1 * sp, 0.1, 1.2 - sway * 0.18);
    P.r('elbowL', -0.35, 0, 0.15);
    P.r('handL', 0, 0, 0.2);
    P.r('shoulderR', -0.15 - 0.1 * sp, -0.1, -1.2 - sway * 0.18);
    P.r('elbowR', -0.35, 0, -0.15);
    P.r('handR', 0, 0, -0.2);
    P.feet(0.03, A, 0.2, -0.03, A, -0.15);
    P.r('tail0', 0.15 * sin(t * 1.7), 0.25 * sin(t * 1.3), 0);
    P.r('tail2', 0.1 * sin(t * 1.7 + 1), 0, 0.15 * sin(t * 1.9));
    P.r('earL', 0.08 * sin(t * 0.9), 0, 0);
    P.r('earR', 0.08 * sin(t * 1.1 + 2), 0, 0);
    P.f({ smile: 0.25, lookY: 0.08 });
  },

  /** Airborne: tuck while rising, reach down while falling. */
  air: (P, t, a) => {
    const up = clamp(a.vy / 9, -1, 1);
    const flail = sin(t * 16) * 0.2;
    P.p('pelvis', 0, 0.02, 0);
    P.r('pelvis', 0.15 - up * 0.15, 0.2, 0);
    P.r('spine', 0.1 + up * 0.1, -0.08, 0);
    P.r('neck', -0.15, 0, 0);
    P.r('shoulderL', -0.9 - up * 0.7 + flail, 0, 1.4);
    P.r('elbowL', -0.6, 0, 0);
    P.r('shoulderR', -0.9 - up * 0.7 - flail, 0, -1.4);
    P.r('elbowR', -0.6, 0, 0);
    const tuck = 0.18 + Math.max(0, up) * 0.22;
    P.feet(0.07, A + tuck, 0.18, -0.07, A + tuck * 0.8, -0.04);
    P.r('tail0', 0.6, 0, 0);
    P.r('earL', -0.3, 0, 0);
    P.r('earR', -0.3, 0, 0);
    P.f({ wide: 0.35, mouthOpen: 0.3 + Math.max(0, up) * 0.2, smile: 0.55, lookY: -0.2 });
  },

  /** Belly-slide along the banister, arms stretched ahead. */
  slide: (P, t) => {
    const w = sin(t * 18) * 0.03;
    P.p('pelvis', 0, -0.42, -0.05);
    P.r('pelvis', 1.3, 0, w);
    P.r('spine', 0.1, 0, 0);
    P.r('chest', 0.05, 0, 0);
    P.r('neck', -0.9, 0, 0);
    P.r('head', -0.45, 0, 0);
    P.r('shoulderL', -2.95, 0, 0.25);
    P.r('elbowL', -0.1, 0, 0);
    P.r('shoulderR', -2.95, 0, -0.25);
    P.r('elbowR', -0.1, 0, 0);
    P.r('thighL', -0.15, 0, 0.12);
    P.r('thighR', -0.25, 0, -0.12);
    P.r('shinL', 0.4, 0, 0);
    P.r('shinR', 0.5, 0, 0);
    P.r('tail0', 1.2, 0, 0);
    P.r('earL', -0.6, 0, -0.2);
    P.r('earR', -0.6, 0, 0.2);
    P.f({ squint: 0.4, smile: 0.45, browAngry: 0.3, lookY: 0.4 });
  },

  /** Losing balance: windmilling arms, one slipper kicked off the rail. */
  stumble: (P, t) => {
    const w = sin(t * 8.5);
    P.p('pelvis', 0, -0.04, 0);
    P.r('pelvis', -0.18, 0, w * 0.32);
    P.r('spine', -0.05, 0, w * 0.28);
    P.r('head', 0.05, 0, -w * 0.3);
    P.r('shoulderL', -t * 13, 0, 1.0);
    P.r('elbowL', -0.3, 0, 0);
    P.r('shoulderR', -t * 13 + 2.2, 0, -1.0);
    P.r('elbowR', -0.3, 0, 0);
    const lift = Math.max(0, w) * 0.3;
    P.feet(0.04, A, 0.16, -0.2 - lift * 0.5, A + lift, -0.12);
    P.r('tail0', 0.4 * sin(t * 11), 0.6 * sin(t * 9), 0);
    P.r('earL', 0.25, 0, 0.3);
    P.r('earR', 0.25, 0, -0.3);
    P.f({ wide: 0.9, browRaise: 0.8, browSad: 0.6, mouthOpen: 0.55, smile: -0.7, lookX: sin(t * 6) * 0.5 });
  },

  /** Out of lives: flat on his back, dizzy. */
  wipeout: (P, t) => {
    P.p('pelvis', 0, -0.48, -0.1);
    P.r('pelvis', -1.45, 0, sin(t * 2) * 0.05);
    P.r('neck', 0.3, 0, 0);
    P.r('head', 0.25, sin(t * 1.5) * 0.3, 0);
    P.r('shoulderL', -0.3, 0, 1.7);
    P.r('shoulderR', -0.3, 0, -1.7);
    P.r('thighL', -1.3, 0, 0.3);
    P.r('thighR', -1.1, 0, -0.3);
    P.r('shinL', 0.6, 0, 0);
    P.r('shinR', 0.9, 0, 0);
    P.f({ dizzy: 1, mouthOpen: 0.35, smile: -0.4, tongue: 0.7 });
  },

  /* ---------------------------------------------------------- one-shots */

  hop: (P, _t, a, p) => {
    const k = bump(p);
    P.r('mover', 0, 0, a.switchDir * 0.4 * k);
    P.r('spine', 0, -a.switchDir * 0.25 * k, 0);
    P.r('shoulderL', -0.5 * k, 0, 0.5 * k);
    P.r('shoulderR', -0.5 * k, 0, -0.5 * k);
    P.f({ wide: 0.3 * k, smile: 0.3 * k, mouthOpen: 0.2 * k, lookX: -a.switchDir * 0.6 * k });
  },
  launch: (P, _t, _a, p) => {
    const k = bump(p);
    P.s('mover', 0.08 * k, -0.16 * k, 0.08 * k);
    P.p('pelvis', 0, -0.1 * k, 0);
  },
  land: (P, _t, _a, p) => {
    const k = bump(p);
    P.s('mover', 0.16 * k, -0.2 * k, 0.16 * k);
    P.p('pelvis', 0, -0.14 * k, 0);
    P.r('spine', 0.2 * k, 0, 0);
    P.r('shoulderL', 0, 0, 0.4 * k);
    P.r('shoulderR', 0, 0, -0.4 * k);
  },
  hit: (P, _t, _a, p) => {
    const k = bump(p);
    P.s('mover', 0.18 * k, -0.16 * k, 0.18 * k);
    P.r('pelvis', -0.55 * k, 0, 0);
    P.r('head', -0.35 * k, 0, 0.2 * k);
    P.r('shoulderL', -2.4 * k, 0, 0.3 * k);
    P.r('shoulderR', -2.4 * k, 0, -0.3 * k);
    P.r('earL', -0.7 * k, 0, 0);
    P.r('earR', -0.7 * k, 0, 0);
    P.f({ blink: 0.95 * k, mouthOpen: 0.85 * k, teeth: 0.9 * k, browAngry: 0.6 * k, smile: -0.5 * k });
  },
  recover: (P, _t, _a, p) => {
    const k = bump(p);
    P.r('spine', -0.18 * k, 0, 0);
    P.r('chest', -0.1 * k, 0, 0);
    P.r('shoulderL', 0, 0, -0.5 * k);
    P.r('shoulderR', 0, 0, 0.5 * k);
    P.s('chest', 0.06 * k, 0.04 * k, 0.06 * k);
    P.f({ smile: 0.7 * k, squint: 0.55 * k, blink: 0.25 * k, mouthOpen: 0.15 * k });
  },
  coin: (P, _t, _a, p) => {
    const k = bump(p);
    P.r('shoulderR', -1.5 * k, -0.4 * k, 0.6 * k);
    P.r('elbowR', -0.8 * k, 0, 0);
    P.r('handR', 0.4 * k, 0, 0);
    P.r('head', 0, -0.2 * k, 0);
    P.f({ smile: 0.9 * k, squint: 0.7 * k, mouthOpen: 0.35 * k });
  },
  angry: (P, t, _a, p) => {
    const k = Math.min(1, bump(p) * 1.6);
    const shake = sin(t * 30);
    P.r('shoulderR', -2.6 * k, 0, -0.25 * k);
    P.r('elbowR', (-0.9 - 0.45 * shake) * k, 0, 0);
    P.r('handR', 0.3 * shake * k, 0, 0);
    P.r('spine', 0.2 * k, 0, 0);
    P.r('neck', 0.15 * k, 0, 0);
    P.r('head', 0.05 * k, sin(t * 14) * 0.12 * k, 0);
    P.r('earL', -0.8 * k, 0, -0.4 * k);
    P.r('earR', -0.8 * k, 0, 0.4 * k);
    P.r('tail0', 0.9 * k, 0, 0);
    P.r('tail1', -0.25 * k, 0, 0);
    P.f({ browAngry: 1.2 * k, mouthOpen: (0.45 + 0.15 * shake) * k, teeth: 1 * k, smile: -0.6 * k, flush: k, squint: 0.3 * k, lookY: 0.2 * k });
  },
  dodge: (P, _t, a, p) => {
    const k = bump(p);
    P.r('mover', 0, 0, -a.dodgeDir * 0.5 * k);
    P.r('spine', 0.2 * k, a.dodgeDir * 0.3 * k, 0);
    P.r('head', 0, a.dodgeDir * 0.6 * k, 0);
    P.r('shoulderL', -0.8 * k, 0, 0.3 * k);
    P.r('shoulderR', -0.8 * k, 0, -0.3 * k);
    P.f({ wide: 1 * k, mouthOpen: 0.4 * k, browRaise: 0.6 * k, lookX: a.dodgeDir * 0.8 * k });
  },
};

const additive: ClipFn<CatParams>[] = [
  // lean into curves and hops
  (P, _t, a) => {
    const l = a.lean;
    P.r('mover', 0, 0, l * 0.32);
    P.r('spine', 0, 0, l * 0.14);
    P.r('head', 0, 0, -l * 0.22);
    P.r('shoulderL', 0, 0, -l * 0.35);
    P.r('shoulderR', 0, 0, -l * 0.35);
    P.r('tail0', 0, 0, -l * 0.4);
  },
  // accelerating: tuck lower, ears back, determined face
  (P, _t, a) => {
    const k = a.accel;
    if (k <= 0.01) return;
    P.p('pelvis', 0, -0.08 * k, 0);
    P.r('spine', 0.22 * k, 0, 0);
    P.r('neck', -0.18 * k, 0, 0);
    P.r('earL', -0.7 * k, 0, -0.2 * k);
    P.r('earR', -0.7 * k, 0, 0.2 * k);
    P.r('shoulderL', 0.5 * k, 0, -0.35 * k);
    P.r('shoulderR', 0.5 * k, 0, 0.35 * k);
    P.f({ browAngry: 0.35 * k, smile: 0.2 * k, squint: 0.2 * k });
  },
  // gaze
  (P, _t, a) => {
    P.r('head', 0, a.lookX * 0.35, 0);
    P.f({ lookX: a.lookX, lookY: a.lookY });
  },
];

const tmpL = new THREE.Vector3();
const tmpR = new THREE.Vector3();

export type CatState = 'ride' | 'air' | 'slide' | 'stumble' | 'wipeout';

/** Drives a CatModel from gameplay state: state machine, IK, face, secondary motion. */
export class CatCharacter {
  model = new CatModel();
  animator: Animator<CatParams>;
  private probe = new MotionProbe();
  private time = 0;
  private blinkT = 2;
  private blinkPhase = 0;
  private flush = 0;
  private angryCooldown = 0;

  constructor() {
    this.animator = new Animator<CatParams>([...CAT_JOINTS], clips, additive, {
      speed01: 0,
      lean: 0,
      vy: 0,
      switchDir: 0,
      dodgeDir: 0,
      accel: 0,
      lookX: 0,
      lookY: 0,
      tuck: 0,
    });
    this.animator.setBase('ride', 0);
  }

  get root() {
    return this.model.root;
  }

  setState(s: CatState) {
    const fades: Record<CatState, number> = { ride: 0.18, air: 0.1, slide: 0.12, stumble: 0.1, wipeout: 0.3 };
    this.animator.setBase(s, fades[s]);
  }

  react(kind: 'hop' | 'launch' | 'land' | 'hit' | 'recover' | 'coin' | 'angry' | 'dodge', arg = 0) {
    const a = this.animator;
    switch (kind) {
      case 'hop':
        a.params.switchDir = arg;
        a.play('hop', 0.3, 0.05, 0.1);
        break;
      case 'launch':
        a.play('launch', 0.16, 0.02, 0.08);
        break;
      case 'land':
        a.play('land', clamp(0.16 + arg * 0.012, 0.16, 0.3), 0.02, 0.1);
        break;
      case 'hit':
        a.play('hit', 0.5, 0.03, 0.2);
        break;
      case 'recover':
        a.play('recover', 0.7, 0.1, 0.25);
        break;
      case 'coin':
        if (!a.isPlaying('angry')) a.play('coin', 0.32, 0.04, 0.12);
        break;
      case 'angry':
        if (this.angryCooldown > 0) return;
        this.angryCooldown = 2.5;
        a.play('angry', 1.25, 0.12, 0.3);
        break;
      case 'dodge':
        a.params.dodgeDir = arg;
        a.play('dodge', 0.42, 0.05, 0.15);
        break;
    }
  }

  update(dt: number, params: Partial<CatParams>) {
    this.time += dt;
    this.angryCooldown = Math.max(0, this.angryCooldown - dt);
    const a = this.animator;
    Object.assign(a.params, params);
    const pose = a.evaluate(dt);

    // auto blink
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinkPhase = 0.13;
      this.blinkT = 1.8 + Math.random() * 3.2;
    }
    if (this.blinkPhase > 0) {
      this.blinkPhase -= dt;
      pose.face.blink += Math.sin((1 - this.blinkPhase / 0.13) * Math.PI);
    }
    this.applyFaceToJoints(pose);
    const m = this.model;
    m.rig.apply(pose);

    // legs: IK to feet targets in root space
    const ik = pose.ik;
    if (ik.weight > 0.01) {
      const w = Math.min(1, ik.weight);
      tmpL.copy(ik.l).divideScalar(ik.weight);
      tmpR.copy(ik.r).divideScalar(ik.weight);
      tmpL.y += a.params.tuck;
      tmpR.y += a.params.tuck * 0.85;
      m.root.updateWorldMatrix(true, false);
      m.root.localToWorld(tmpL);
      m.root.localToWorld(tmpR);
      const J = m.rig.joints;
      solveLegIK(J.thighL, J.shinL, J.footL, CAT_DIMS.l1, CAT_DIMS.l2, tmpL, w, m.root);
      solveLegIK(J.thighR, J.shinR, J.footR, CAT_DIMS.l1, CAT_DIMS.l2, tmpR, w, m.root);
    }

    // face
    const f = pose.face;
    for (let i = 0; i < m.eyes.length; i++) m.eyes[i].update(f, this.time, i === 0 ? 1 : -1);
    this.flush = lerp(this.flush, clamp(f.flush, 0, 1), damp(6, dt));
    m.blushMat.opacity = clamp(this.flush * 0.85 + Math.max(0, f.smile - 0.6) * 0.5, 0, 0.85);
    m.fur.emissive.setRGB(this.flush * 0.05, 0, 0);

    // secondary motion
    m.root.updateWorldMatrix(true, true);
    const acc = this.probe.update(dt, m.root);
    m.tail.update(dt, acc);
    m.updateLod();
  }

  private applyFaceToJoints(pose: Pose) {
    const f = pose.face;
    // sculpted mouth: hinge the jaw, pull the lip corners, push the tongue
    const open = clamp(f.mouthOpen, 0, 1);
    const smile = clamp(f.smile, -1, 1);
    const smirk = clamp(f.smirk, -1, 1);
    pose.j.jaw.rx += open * 0.42 + clamp(f.teeth, 0, 1) * 0.05;
    pose.j.mouthL.py += smile * 0.017 + smirk * 0.01 - open * 0.006;
    pose.j.mouthR.py += smile * 0.017 - smirk * 0.01 - open * 0.006;
    pose.j.mouthL.px += smile * 0.009 - open * 0.006;
    pose.j.mouthR.px -= smile * 0.009 - open * 0.006;
    pose.j.mouthL.pz -= Math.max(0, smile) * 0.006;
    pose.j.mouthR.pz -= Math.max(0, smile) * 0.006;
    pose.j.tongue.pz += clamp(f.tongue, 0, 1) * 0.075;
    pose.j.tongue.py -= clamp(f.tongue, 0, 1) * 0.01;
    const angry = clamp(f.browAngry, 0, 1.3);
    const sad = clamp(f.browSad, 0, 1);
    const raise = clamp(f.browRaise, 0, 1);
    pose.j.browL.rz += angry * 0.5 - sad * 0.45;
    pose.j.browR.rz -= angry * 0.5 - sad * 0.45;
    pose.j.browL.py += raise * 0.05 - angry * 0.025;
    pose.j.browR.py += raise * 0.05 - angry * 0.025;
  }
}
