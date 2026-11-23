import * as THREE from 'three';
import { clamp } from '../util/math';

/** Additive per-joint transform delta written by animation clips. */
export interface JointDelta {
  rx: number;
  ry: number;
  rz: number;
  px: number;
  py: number;
  pz: number;
  sx: number;
  sy: number;
  sz: number;
}

export interface FaceState {
  /** 0 open … 1 closed (upper lids). */
  blink: number;
  /** extra lower-lid raise for happy/squint eyes. */
  squint: number;
  /** wide-eyed surprise (lids pulled back). */
  wide: number;
  browAngry: number;
  browRaise: number;
  browSad: number;
  mouthOpen: number;
  smile: number;
  teeth: number;
  tongue: number;
  /** -1..1 asymmetric smirk */
  smirk: number;
  lookX: number;
  lookY: number;
  /** anger flush 0..1 */
  flush: number;
  /** spiral/dizzy eyes 0..1 */
  dizzy: number;
}

const FACE_KEYS: (keyof FaceState)[] = [
  'blink', 'squint', 'wide', 'browAngry', 'browRaise', 'browSad', 'mouthOpen', 'smile', 'teeth', 'tongue', 'smirk', 'lookX', 'lookY', 'flush', 'dizzy',
];

export const emptyFace = (): FaceState => ({
  blink: 0, squint: 0, wide: 0, browAngry: 0, browRaise: 0, browSad: 0, mouthOpen: 0, smile: 0, teeth: 0, tongue: 0, smirk: 0, lookX: 0, lookY: 0, flush: 0, dizzy: 0,
});

const zero = (): JointDelta => ({ rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0, sx: 0, sy: 0, sz: 0 });

/** Foot IK targets in the character root's local space. */
export interface IkTargets {
  weight: number;
  l: THREE.Vector3;
  r: THREE.Vector3;
}

/**
 * Pose accumulator. Clips write deltas scaled by the current weight `w`, so
 * cross-fading and additive layers are a matter of setting weights.
 */
export class Pose {
  j: Record<string, JointDelta> = {};
  face: FaceState = emptyFace();
  ik: IkTargets = { weight: 0, l: new THREE.Vector3(), r: new THREE.Vector3() };
  w = 1;

  constructor(joints: string[]) {
    for (const n of joints) this.j[n] = zero();
  }

  reset() {
    for (const k in this.j) {
      const d = this.j[k];
      d.rx = d.ry = d.rz = d.px = d.py = d.pz = d.sx = d.sy = d.sz = 0;
    }
    const f = this.face;
    for (const k of FACE_KEYS) f[k] = 0;
    this.ik.weight = 0;
    this.ik.l.set(0, 0, 0);
    this.ik.r.set(0, 0, 0);
    this.w = 1;
  }

  r(name: string, x: number, y = 0, z = 0) {
    const d = this.j[name];
    if (!d) return this;
    d.rx += x * this.w;
    d.ry += y * this.w;
    d.rz += z * this.w;
    return this;
  }
  p(name: string, x: number, y = 0, z = 0) {
    const d = this.j[name];
    if (!d) return this;
    d.px += x * this.w;
    d.py += y * this.w;
    d.pz += z * this.w;
    return this;
  }
  s(name: string, x: number, y = x, z = x) {
    const d = this.j[name];
    if (!d) return this;
    d.sx += x * this.w;
    d.sy += y * this.w;
    d.sz += z * this.w;
    return this;
  }
  f(values: Partial<FaceState>) {
    for (const k in values) {
      const key = k as keyof FaceState;
      this.face[key] += (values[key] as number) * this.w;
    }
    return this;
  }
  feet(lx: number, ly: number, lz: number, rx: number, ry: number, rz: number) {
    this.ik.weight += this.w;
    this.ik.l.x += lx * this.w;
    this.ik.l.y += ly * this.w;
    this.ik.l.z += lz * this.w;
    this.ik.r.x += rx * this.w;
    this.ik.r.y += ry * this.w;
    this.ik.r.z += rz * this.w;
    return this;
  }
}

export type ClipFn<P> = (pose: Pose, t: number, params: P, phase: number) => void;

interface BaseLayer {
  name: string;
  t: number;
  w: number;
  target: number;
  fade: number;
}
interface ActionLayer {
  name: string;
  t: number;
  dur: number;
  fadeIn: number;
  fadeOut: number;
  w: number;
}

/**
 * Small animation state machine: one cross-faded base locomotion state,
 * any number of additive layers driven by params, and one-shot actions with
 * fade in/out. All clips are procedural functions of time.
 */
export class Animator<P> {
  pose: Pose;
  private base: BaseLayer[] = [];
  private actions: ActionLayer[] = [];
  current = '';

  constructor(
    joints: string[],
    private clips: Record<string, ClipFn<P>>,
    private additive: ClipFn<P>[],
    public params: P,
  ) {
    this.pose = new Pose(joints);
  }

  setBase(name: string, fade = 0.2) {
    if (this.current === name) return;
    this.current = name;
    let layer = this.base.find((b) => b.name === name);
    if (!layer) {
      layer = { name, t: 0, w: this.base.length ? 0 : 1, target: 1, fade };
      this.base.push(layer);
    }
    for (const b of this.base) {
      b.target = b === layer ? 1 : 0;
      b.fade = fade;
    }
  }

  play(name: string, dur: number, fadeIn = 0.08, fadeOut = 0.15) {
    const existing = this.actions.find((a) => a.name === name);
    if (existing) {
      existing.t = 0;
      existing.dur = dur;
      return;
    }
    this.actions.push({ name, t: 0, dur, fadeIn, fadeOut, w: 0 });
  }

  isPlaying(name: string) {
    return this.actions.some((a) => a.name === name);
  }

  stop(name: string) {
    this.actions = this.actions.filter((a) => a.name !== name);
  }

  evaluate(dt: number): Pose {
    const pose = this.pose;
    pose.reset();
    // base layers
    for (const b of this.base) {
      b.t += dt;
      const step = dt / Math.max(0.001, b.fade);
      b.w = b.target > b.w ? Math.min(b.target, b.w + step) : Math.max(b.target, b.w - step);
    }
    this.base = this.base.filter((b) => b.w > 0.001 || b.target > 0);
    let total = 0;
    for (const b of this.base) total += b.w;
    for (const b of this.base) {
      const clip = this.clips[b.name];
      if (!clip || b.w <= 0) continue;
      pose.w = b.w / (total || 1);
      clip(pose, b.t, this.params, 0);
    }
    // additive layers
    for (const a of this.additive) {
      pose.w = 1;
      a(pose, 0, this.params, 0);
    }
    // actions
    for (const a of this.actions) {
      a.t += dt;
      const inW = clamp(a.t / a.fadeIn, 0, 1);
      const outW = clamp((a.dur - a.t) / a.fadeOut, 0, 1);
      a.w = Math.min(inW, outW);
      const clip = this.clips[a.name];
      if (!clip) continue;
      pose.w = a.w;
      clip(pose, a.t, this.params, clamp(a.t / a.dur, 0, 1));
    }
    this.actions = this.actions.filter((a) => a.t < a.dur);
    pose.w = 1;
    return pose;
  }
}

interface RestTransform {
  pos: THREE.Vector3;
  rot: THREE.Euler;
  scale: THREE.Vector3;
}

/** A joint hierarchy with remembered rest transforms. */
export class Rig {
  joints: Record<string, THREE.Object3D> = {};
  private rest: Record<string, RestTransform> = {};

  add(name: string, obj: THREE.Object3D) {
    obj.name = name;
    this.joints[name] = obj;
    return obj;
  }

  captureRest() {
    for (const [n, o] of Object.entries(this.joints)) {
      this.rest[n] = { pos: o.position.clone(), rot: o.rotation.clone(), scale: o.scale.clone() };
    }
  }

  names() {
    return Object.keys(this.joints);
  }

  apply(pose: Pose) {
    for (const [n, o] of Object.entries(this.joints)) {
      const r = this.rest[n];
      const d = pose.j[n];
      if (!r || !d) continue;
      o.position.set(r.pos.x + d.px, r.pos.y + d.py, r.pos.z + d.pz);
      o.rotation.set(r.rot.x + d.rx, r.rot.y + d.ry, r.rot.z + d.rz, r.rot.order);
      o.scale.set(r.scale.x * (1 + d.sx), r.scale.y * (1 + d.sy), r.scale.z * (1 + d.sz));
    }
  }
}

const _t = new THREE.Vector3();
const _h = new THREE.Vector3();
const _d = new THREE.Vector3();
const _side = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _x = new THREE.Vector3(1, 0, 0);
const FWD = new THREE.Vector3(0, 0, 1);

/**
 * Analytic two-bone leg IK. Thigh hangs along −Y in rest pose, knee bends
 * toward +Z. `targetWorld` is the ankle position; the foot is kept aligned
 * with `footAlign` (usually the character root) so soles stay flat on the rail.
 */
export function solveLegIK(
  thigh: THREE.Object3D,
  shin: THREE.Object3D,
  foot: THREE.Object3D,
  l1: number,
  l2: number,
  targetWorld: THREE.Vector3,
  weight: number,
  footAlign: THREE.Object3D,
) {
  if (weight <= 0.001) return;
  const parent = thigh.parent!;
  parent.updateWorldMatrix(true, false);
  _t.copy(targetWorld);
  parent.worldToLocal(_t);
  _h.copy(thigh.position);
  _d.subVectors(_t, _h);
  const maxLen = (l1 + l2) * 0.999;
  let d = _d.length();
  if (d < 1e-4) return;
  _d.divideScalar(d);
  d = clamp(d, Math.abs(l1 - l2) + 0.01, maxLen);
  const cosHip = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const cosKnee = clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1);
  const hipA = Math.acos(cosHip);
  const kneeBend = Math.PI - Math.acos(cosKnee);

  // basis: X = side, Y = −down, Z = forward-ish
  _side.crossVectors(FWD, _d);
  if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
  _side.normalize();
  _up.copy(_d).negate();
  _fwd.crossVectors(_side, _up).normalize();
  _m.makeBasis(_side, _up, _fwd);
  _q.setFromRotationMatrix(_m);
  _q2.setFromAxisAngle(_x, -hipA);
  _q.multiply(_q2);

  if (weight < 1) thigh.quaternion.slerp(_q, weight);
  else thigh.quaternion.copy(_q);
  _q2.setFromAxisAngle(_x, kneeBend);
  if (weight < 1) shin.quaternion.slerp(_q2, weight);
  else shin.quaternion.copy(_q2);

  // keep sole parallel to the align object
  thigh.updateWorldMatrix(false, true);
  footAlign.getWorldQuaternion(_q);
  foot.parent!.getWorldQuaternion(_qp).invert();
  _q.premultiply(_qp);
  if (weight < 1) foot.quaternion.slerp(_q, weight);
  else foot.quaternion.copy(_q);
}

/**
 * Damped angular springs along a chain (tail, nightcap, antennae). The chain
 * lags behind the body's acceleration and swings back, giving overlapping
 * follow-through without any physics engine.
 */
export class SpringChain {
  private ax: number[];
  private az: number[];
  private vx: number[];
  private vz: number[];
  constructor(
    public joints: THREE.Object3D[],
    public stiffness = 60,
    public damping = 8,
    public gain = 0.04,
  ) {
    const n = joints.length;
    this.ax = new Array(n).fill(0);
    this.az = new Array(n).fill(0);
    this.vx = new Array(n).fill(0);
    this.vz = new Array(n).fill(0);
  }

  /** accLocal: body acceleration in the chain root's local space. */
  update(dt: number, accLocal: THREE.Vector3) {
    const n = this.joints.length;
    const h = Math.min(dt, 1 / 30);
    for (let i = 0; i < n; i++) {
      const k = (i + 1) / n;
      const tx = clamp(accLocal.z * this.gain * k, -0.9, 0.9);
      const tz = clamp(-accLocal.x * this.gain * k, -0.9, 0.9);
      this.vx[i] += ((tx - this.ax[i]) * this.stiffness - this.vx[i] * this.damping) * h;
      this.vz[i] += ((tz - this.az[i]) * this.stiffness - this.vz[i] * this.damping) * h;
      this.ax[i] += this.vx[i] * h;
      this.az[i] += this.vz[i] * h;
      const j = this.joints[i];
      j.rotation.x += this.ax[i];
      j.rotation.z += this.az[i];
    }
  }
}

/** Tracks a root's world motion and reports acceleration in its local frame. */
export class MotionProbe {
  private prevPos = new THREE.Vector3();
  private prevVel = new THREE.Vector3();
  private vel = new THREE.Vector3();
  acc = new THREE.Vector3();
  private init = false;
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();

  update(dt: number, obj: THREE.Object3D) {
    obj.getWorldPosition(this.p);
    if (!this.init || dt <= 0) {
      this.prevPos.copy(this.p);
      this.prevVel.set(0, 0, 0);
      this.init = true;
      this.acc.set(0, 0, 0);
      return this.acc;
    }
    this.vel.subVectors(this.p, this.prevPos).divideScalar(dt);
    const a = this.p.copy(this.vel).sub(this.prevVel).divideScalar(dt);
    a.y -= 9.8; // gravity sags chains
    obj.getWorldQuaternion(this.q).invert();
    a.applyQuaternion(this.q);
    this.acc.lerp(a, 0.25);
    this.prevVel.copy(this.vel);
    obj.getWorldPosition(this.prevPos);
    return this.acc;
  }
}
