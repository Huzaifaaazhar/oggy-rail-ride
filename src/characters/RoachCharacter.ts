import * as THREE from 'three';
import { clamp } from '../util/math';
import { RoachModel, RoachSpec, ROACH_JOINTS } from './RoachModel';
import { Animator, ClipFn, MotionProbe, solveLegIK } from './rig';

export interface RoachParams {
  freq: number;
  stride: number;
  bounce: number;
  lean: number;
  vy: number;
  speed01: number;
  lookX: number;
  ankle: number;
  tuck: number;
  swag: number;
  /** 0 Skitter (cocky), 1 Chomp (heavy), 2 Twig (elegant) */
  style: number;
  runPhase: number;
}

const sin = Math.sin;
const cos = Math.cos;
const bump = (p: number) => Math.sin(Math.PI * clamp(p, 0, 1));
const ease = (p: number, a: number, b: number) => clamp((p - a) / (b - a), 0, 1);

const clips: Record<string, ClipFn<RoachParams>> = {
  /** Scurrying run: quick feet, pumping arms, bobbing head, antennae trailing. */
  run: (P, t, a) => {
    const ph = t * a.freq * Math.PI * 2;
    const st = a.stride * (0.6 + a.speed01 * 0.5);
    P.p('pelvis', 0, Math.abs(sin(ph)) * a.bounce - a.bounce * 0.5, 0);
    P.r('pelvis', 0.12 + 0.12 * a.speed01, sin(ph) * 0.12 * a.swag, 0);
    P.r('body', 0.1, -sin(ph) * 0.18 * a.swag, sin(ph) * 0.05);
    P.r('neck', -0.18, sin(ph) * 0.1, 0);
    P.r('head', -0.05 + cos(ph * 2) * 0.04, 0, 0);
    P.r('shoulderL', -sin(ph) * 0.95, 0, 0.35);
    P.r('elbowL', -1.2, 0, 0);
    P.r('shoulderR', sin(ph) * 0.95, 0, -0.35);
    P.r('elbowR', -1.2, 0, 0);
    P.r('midL', sin(ph * 2) * 0.4, 0, 0);
    P.r('midR', -sin(ph * 2) * 0.4, 0, 0);
    P.r('wingL', 0, 0.04 * sin(ph * 2), 0);
    P.r('wingR', 0, -0.04 * sin(ph * 2), 0);
    const lift = 0.16 + a.speed01 * 0.06;
    P.feet(
      0.06, a.ankle + Math.max(0, cos(ph)) * lift, sin(ph) * st,
      -0.06, a.ankle + Math.max(0, -cos(ph)) * lift, -sin(ph) * st,
    );
    P.f({ smile: 0.35, smirk: 0.2 });
  },
  /** Airborne hop: wings flick open for a cartoon glide. */
  air: (P, t, a) => {
    const up = clamp(a.vy / 9, -1, 1);
    P.r('pelvis', 0.2, 0, 0);
    P.r('body', 0.15 - up * 0.2, 0, 0);
    P.r('wingL', -0.3, 0.9 + sin(t * 40) * 0.25, 0.2);
    P.r('wingR', -0.3, -0.9 - sin(t * 40) * 0.25, -0.2);
    P.r('shoulderL', -2.4, 0, 0.6);
    P.r('shoulderR', -2.4, 0, -0.6);
    P.r('elbowL', -0.4, 0, 0);
    P.r('elbowR', -0.4, 0, 0);
    P.feet(0.07, a.ankle + 0.25, 0.08, -0.07, a.ankle + 0.18, -0.08);
    P.f({ mouthOpen: 0.5, smile: 0.6, wide: 0.4 });
  },
  /** Ducking under something while still scurrying. */
  duck: (P, t, a) => {
    const ph = t * a.freq * Math.PI * 2;
    P.p('pelvis', 0, -0.16, 0);
    P.r('pelvis', 0.6, 0, 0);
    P.r('body', 0.4, 0, 0);
    P.r('neck', -0.3, 0, 0);
    P.r('shoulderL', -2.6, 0, 0.9);
    P.r('shoulderR', -2.6, 0, -0.9);
    P.r('elbowL', -1.5, 0, 0);
    P.r('elbowR', -1.5, 0, 0);
    P.feet(0.08, a.ankle + Math.max(0, cos(ph)) * 0.1, sin(ph) * 0.15, -0.08, a.ankle + Math.max(0, -cos(ph)) * 0.1, -sin(ph) * 0.15);
    P.f({ wide: 0.6, mouthOpen: 0.3 });
  },

  /** Victory dance when the cat crashes: hopping, arms pumping, wings buzzing. */
  celebrate: (P, t, a) => {
    const hop = Math.abs(Math.sin(t * 7));
    P.p('pelvis', 0, hop * 0.12, 0);
    P.r('body', -0.15, Math.sin(t * 3.5) * 0.6, 0);
    P.r('head', -0.3, 0, Math.sin(t * 7) * 0.15);
    P.r('shoulderL', -2.8 + Math.sin(t * 14) * 0.3, 0, 0.5);
    P.r('shoulderR', -2.8 - Math.sin(t * 14) * 0.3, 0, -0.5);
    P.r('elbowL', -0.5, 0, 0);
    P.r('elbowR', -0.5, 0, 0);
    P.r('wingL', 0, 0.5 + Math.sin(t * 40) * 0.2, 0);
    P.r('wingR', 0, -0.5 - Math.sin(t * 40) * 0.2, 0);
    P.feet(0.08, a.ankle + hop * 0.1, 0, -0.08, a.ankle + (1 - hop) * 0.1, 0);
    P.f({ mouthOpen: 0.85, smile: 1, squint: 0.8, teeth: 0.7, browRaise: 0.6 });
  },

  /* ----------------------------------------------------------- one-shots */
  look: (P, _t, _a, p) => {
    const k = bump(p) > 0.5 ? 1 : bump(p) * 2;
    P.r('body', 0, 0.9 * k, 0);
    P.r('chest', 0, 0.4 * k, 0);
    P.r('head', 0.1 * k, 1.25 * k, 0);
    P.f({ smirk: 0.8 * k, smile: 0.4 * k, browAngry: 0.45 * k, squint: 0.3 * k, lookX: 0.7 * k });
  },
  laugh: (P, t, _a, p) => {
    const k = Math.min(1, bump(p) * 1.8);
    const shake = sin(t * 34);
    P.r('body', -0.2 * k, 0.6 * k, shake * 0.09 * k);
    P.r('neck', -0.25 * k, 0.3 * k, 0);
    P.r('head', -0.35 * k + shake * 0.05 * k, 0.5 * k, shake * 0.08 * k);
    P.r('shoulderL', -0.5 * k, 0, -0.45 * k);
    P.r('shoulderR', -0.5 * k, 0, 0.45 * k);
    P.r('elbowL', -1.2 * k, 0, 0);
    P.r('elbowR', -1.2 * k, 0, 0);
    P.r('wingL', 0, 0.35 * k * (0.5 + 0.5 * sin(t * 25)), 0);
    P.r('wingR', 0, -0.35 * k * (0.5 + 0.5 * sin(t * 25)), 0);
    P.s('body', 0.04 * shake * k, -0.04 * shake * k, 0.04 * shake * k);
    P.f({ mouthOpen: (0.8 + 0.15 * shake) * k, smile: 1 * k, squint: 1 * k, teeth: 0.7 * k, browRaise: 0.4 * k, lookX: 0.6 * k });
  },
  tease: (P, t, _a, p) => {
    const k = Math.min(1, bump(p) * 1.8);
    const wig = sin(t * 22);
    P.r('body', 0, 1.25 * k, 0);
    P.r('chest', 0, 0.4 * k, 0);
    P.r('head', 0, 0.5 * k, wig * 0.12 * k);
    P.r('shoulderL', -2.7 * k, 0, 0.45 * k);
    P.r('shoulderR', -2.7 * k, 0, -0.45 * k);
    P.r('elbowL', -1.7 * k, 0, 0);
    P.r('elbowR', -1.7 * k, 0, 0);
    P.r('handL', 0, 0, wig * 0.6 * k);
    P.r('handR', 0, 0, -wig * 0.6 * k);
    P.r('pelvis', 0, 0, wig * 0.12 * k);
    P.f({ tongue: 1 * k, mouthOpen: 0.45 * k, squint: 0.55 * k, smirk: 0.4 * k, smile: 0.4 * k, lookX: 0.8 * k });
  },
  mischief: (P, t, _a, p) => {
    const k = Math.min(1, bump(p) * 1.6);
    const rub = sin(t * 18);
    P.r('body', 0.2 * k, 0.55 * k, 0);
    P.r('head', 0.1 * k, 0.6 * k, 0);
    P.r('shoulderL', -1.1 * k, 0, -0.55 * k);
    P.r('shoulderR', -1.1 * k, 0, 0.55 * k);
    P.r('elbowL', (-1.25 + rub * 0.12) * k, 0, 0);
    P.r('elbowR', (-1.25 - rub * 0.12) * k, 0, 0);
    P.f({ browAngry: 1 * k, smile: 1 * k, teeth: 1 * k, mouthOpen: 0.15 * k, squint: 0.5 * k, smirk: 0.3 * k, lookX: 0.6 * k });
  },
  throw: (P, _t, _a, p) => {
    const wind = ease(p, 0, 0.45);
    const fling = ease(p, 0.45, 0.62);
    const k = bump(p);
    P.r('body', 0, 1.4 * k, 0);
    P.r('chest', 0, 0.3 * k, 0);
    P.r('head', 0, 0.4 * k, 0);
    P.r('shoulderR', (2.4 * wind - 4.4 * fling) * k, 0, -0.3 * k);
    P.r('elbowR', -1.0 * wind * (1 - fling) * k, 0, 0);
    P.r('shoulderL', -0.8 * k, 0, 0.8 * k);
    P.f({ browAngry: 0.8 * k, smile: 0.8 * k, teeth: fling * k, mouthOpen: 0.3 * fling * k, squint: 0.4 * k, lookX: 0.7 * k });
  },
  dodge: (P, _t, _a, p) => {
    const k = bump(p);
    P.p('pelvis', 0, -0.1 * k, 0);
    P.r('body', 0.5 * k, 0, 0.3 * k);
    P.r('shoulderL', -2.5 * k, 0, 0.8 * k);
    P.r('shoulderR', -2.5 * k, 0, -0.8 * k);
    P.f({ wide: 1 * k, mouthOpen: 0.6 * k, browRaise: 0.8 * k });
  },
  hop: (P, _t, a, p) => {
    const k = bump(p);
    P.r('mover', 0, 0, a.lean * 0.4 * k);
    P.r('wingL', 0, 0.6 * k, 0);
    P.r('wingR', 0, -0.6 * k, 0);
    P.r('shoulderL', -1.2 * k, 0, 0.5 * k);
    P.r('shoulderR', -1.2 * k, 0, -0.5 * k);
    P.f({ mouthOpen: 0.4 * k, smile: 0.7 * k });
  },
};

const additive: ClipFn<RoachParams>[] = [
  // personality layer on top of every state
  (P, t, a) => {
    if (a.style === 0) {
      // Skitter: cocky head bob and loose swinging arms
      P.r('head', 0.08 * Math.sin(t * 9), 0.12 * Math.sin(t * 2.3), 0.06 * Math.sin(t * 4.5));
      P.r('chest', 0, 0.1 * Math.sin(t * 4.5), 0);
      P.r('antL0', 0.15 * Math.sin(t * 7), 0, 0);
      P.r('antR0', 0.15 * Math.sin(t * 7 + 1), 0, 0);
    } else if (a.style === 1) {
      // Chomp: heavy side-to-side waddle with a belly jiggle
      P.r('pelvis', 0, 0, 0.09 * Math.sin(t * 6));
      P.r('body', 0, 0, -0.05 * Math.sin(t * 6));
      P.s('body', 0.025 * Math.sin(t * 12), -0.03 * Math.sin(t * 12), 0.025 * Math.sin(t * 12));
      P.r('head', -0.06, 0, 0.05 * Math.sin(t * 6 + 0.5));
      P.r('antL0', 0.25, 0, -0.1);
      P.r('antR0', 0.25, 0, 0.1);
    } else {
      // Twig: tall, upright stalk with a chin-up attitude
      P.r('body', -0.12, 0, 0);
      P.r('neck', -0.1, 0, 0);
      P.r('head', -0.1, 0.08 * Math.sin(t * 1.3), 0);
      P.r('antL1', 0.1 * Math.sin(t * 2), 0, 0);
      P.r('antR1', 0.1 * Math.sin(t * 2 + 0.7), 0, 0);
    }
  },
  (P, _t, a) => {
    P.r('mover', 0, 0, a.lean * 0.25);
    P.r('head', 0, 0, -a.lean * 0.2);
  },
];

const tmpL = new THREE.Vector3();
const tmpR = new THREE.Vector3();

export class RoachCharacter {
  model: RoachModel;
  animator: Animator<RoachParams>;
  private probe = new MotionProbe();
  private time = Math.random() * 10;
  private blinkT = 1 + Math.random() * 3;
  private blinkPhase = 0;

  constructor(spec: RoachSpec, personality: Partial<RoachParams>) {
    this.model = new RoachModel(spec);
    this.animator = new Animator<RoachParams>([...ROACH_JOINTS], clips, additive, {
      freq: 3.2,
      stride: 0.22,
      bounce: 0.05,
      lean: 0,
      vy: 0,
      speed01: 0.5,
      lookX: 0,
      ankle: this.model.dims.ankle,
      tuck: 0,
      swag: 1,
      style: spec.id === 'skitter' ? 0 : spec.id === 'chomp' ? 1 : 2,
      runPhase: 0,
      ...personality,
    });
    this.animator.setBase('run', 0);
  }

  get root() {
    return this.model.root;
  }

  update(dt: number, params: Partial<RoachParams>) {
    this.time += dt;
    const a = this.animator;
    Object.assign(a.params, params);
    const pose = a.evaluate(dt);
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinkPhase = 0.12;
      this.blinkT = 1.5 + Math.random() * 3.5;
    }
    if (this.blinkPhase > 0) {
      this.blinkPhase -= dt;
      pose.face.blink += Math.sin((1 - this.blinkPhase / 0.12) * Math.PI);
    }
    const f = pose.face;
    // sculpted mouth: jaw hinge, lip corners, tongue
    const open = clamp(f.mouthOpen, 0, 1);
    const smile = clamp(f.smile, -1, 1);
    const smirk = clamp(f.smirk, -1, 1);
    pose.j.jaw.rx += open * 0.5 + clamp(f.teeth, 0, 1) * 0.06;
    pose.j.mouthL.py += smile * 0.012 + smirk * 0.008 - open * 0.004;
    pose.j.mouthR.py += smile * 0.012 - smirk * 0.008 - open * 0.004;
    pose.j.mouthL.px += smile * 0.006;
    pose.j.mouthR.px -= smile * 0.006;
    pose.j.tongue.pz += clamp(f.tongue, 0, 1) * 0.06;
    const angry = clamp(f.browAngry, 0, 1.2);
    const sad = clamp(f.browSad, 0, 1);
    pose.j.browL.rz += angry * 0.5 - sad * 0.4;
    pose.j.browR.rz -= angry * 0.5 - sad * 0.4;
    pose.j.browL.py += clamp(f.browRaise, 0, 1) * 0.04;
    pose.j.browR.py += clamp(f.browRaise, 0, 1) * 0.04;

    const m = this.model;
    m.rig.apply(pose);
    const ik = pose.ik;
    if (ik.weight > 0.01) {
      const w = Math.min(1, ik.weight);
      tmpL.copy(ik.l).divideScalar(ik.weight);
      tmpR.copy(ik.r).divideScalar(ik.weight);
      tmpL.y += a.params.tuck;
      tmpR.y += a.params.tuck;
      m.root.updateWorldMatrix(true, false);
      m.root.localToWorld(tmpL);
      m.root.localToWorld(tmpR);
      const J = m.rig.joints;
      const d = m.dims;
      solveLegIK(J.thighL, J.shinL, J.footL, d.l1, d.l2, tmpL, w, m.root);
      solveLegIK(J.thighR, J.shinR, J.footR, d.l1, d.l2, tmpR, w, m.root);
    }
    for (let i = 0; i < m.eyes.length; i++) m.eyes[i].update(f, this.time, i === 0 ? 1 : -1);
    m.root.updateWorldMatrix(true, true);
    const acc = this.probe.update(dt, m.root);
    for (const c of m.antennae) c.update(dt, acc);
  }
}
