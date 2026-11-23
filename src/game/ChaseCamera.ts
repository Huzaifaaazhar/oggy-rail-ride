import * as THREE from 'three';
import { Track, TrackFrame } from '../track/Track';
import { clamp, damp, lerp, smootherstep } from '../util/math';
import { PlayerController } from './PlayerController';

/**
 * Third-person chase camera that rides the spline behind the player.
 * Position and look target are both taken from the track itself (not from
 * world-space offsets), so the camera follows the rail through loops and
 * helices and never cuts across the inside of a turn into scenery.
 */
export class ChaseCamera {
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private fb = new TrackFrame();
  private fl = new TrackFrame();
  private dPos = new THREE.Vector3();
  private dLook = new THREE.Vector3();
  private dUp = new THREE.Vector3();
  private shake = 0;
  private fovKick = 0;
  private initialised = false;
  mode: 'chase' | 'showcase' | 'crash' = 'showcase';
  private showT = 0;
  private blend = 0; // 0 = showcase, 1 = chase
  private crashY: number | null = null;

  kick(amount: number) {
    this.shake = Math.max(this.shake, amount);
  }
  boost(amount: number) {
    this.fovKick = Math.max(this.fovKick, amount);
  }
  snap() {
    this.initialised = false;
  }

  private laneAt(f: TrackFrame, p: PlayerController, out: THREE.Vector2) {
    const t = smootherstep(p.switchT);
    const ax = f.lanes[p.fromRail * 2];
    const ay = f.lanes[p.fromRail * 2 + 1];
    const bx = f.lanes[p.toRail * 2];
    const by = f.lanes[p.toRail * 2 + 1];
    return out.set(lerp(ax, bx, t), lerp(ay, by, t));
  }

  private lane = new THREE.Vector2();
  private tmp = new THREE.Vector3();
  private side = new THREE.Vector3();

  update(dt: number, cam: THREE.PerspectiveCamera, track: Track, p: PlayerController) {
    if (this.mode === 'crash') {
      // stay put (no clipping through scenery) and tilt to follow the tumble, capped
      if (this.crashY === null) this.crashY = p.position.y;
      this.tmp.copy(p.position);
      this.tmp.y = Math.max(this.tmp.y, this.crashY - 4.5);
      this.look.lerp(this.tmp, damp(5, dt));
      cam.position.copy(this.pos);
      if (this.shake > 0.001) {
        cam.position.x += (Math.random() - 0.5) * this.shake;
        cam.position.y += (Math.random() - 0.5) * this.shake;
        this.shake *= Math.exp(-dt * 6);
      }
      cam.up.copy(this.up);
      cam.lookAt(this.look);
      return;
    }
    this.crashY = null;
    this.blend = clamp(this.blend + (this.mode === 'chase' ? dt * 1.1 : -dt * 1.5), 0, 1);
    const bl = smootherstep(this.blend);

    // --- chase rig
    const back = 6.6 + p.speed * 0.07;
    const height = 3.25 + p.speed * 0.014;
    track.frameAt(p.s - back, this.fb);
    this.laneAt(this.fb, p, this.lane);
    // camera up keeps the base orientation (so loops invert it) but only follows
    // part of the roll, which keeps corkscrews readable
    const rollFollow = 0.62;
    const ang = Math.atan2(this.fb.rollSin, this.fb.rollCos) * rollFollow;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const camUp = this.tmp.copy(this.fb.baseUp).multiplyScalar(c).addScaledVector(this.fb.baseRight, -s);
    // never sit the camera inside a rail that passes overhead (rail crossings)
    let camH = height + p.height * 0.35;
    for (const f of [this.fb, p.frame]) {
      for (let i = 0; i < 3; i++) {
        const dx = f.lanes[i * 2] - this.lane.x;
        const dy = f.lanes[i * 2 + 1] - this.lane.y;
        if (Math.abs(dx) < 1.6 && dy > 0.5) camH = Math.min(camH, dy - 1.5);
      }
    }
    camH = Math.max(1.6, camH);
    this.dPos
      .copy(this.fb.pos)
      .addScaledVector(this.fb.right, this.lane.x * 0.85)
      .addScaledVector(this.fb.up, this.lane.y)
      .addScaledVector(camUp, camH);
    this.dUp.copy(camUp);

    // adaptive look-ahead: stop where the track has turned more than ~32°,
    // so loops, helices and hairpins keep the rider in frame
    const maxAhead = 12 + p.speed * 0.14;
    let ahead = 4;
    while (ahead < maxAhead) {
      track.frameAt(p.s + ahead + 2, this.fl);
      if (this.fl.fwd.dot(p.frame.fwd) < 0.85) break;
      ahead += 2;
    }
    const tight = 1 - Math.min(1, (ahead - 4) / Math.max(1, maxAhead - 4));
    track.frameAt(p.s + ahead, this.fl);
    this.laneAt(this.fl, p, this.lane);
    this.dLook
      .copy(this.fl.pos)
      .addScaledVector(this.fl.right, this.lane.x * 0.7)
      .addScaledVector(this.fl.up, this.lane.y + 0.5);
    // keep the rider in the lower third: aim between rider and track ahead
    this.dLook.lerp(this.side.copy(p.position).addScaledVector(p.frame.up, 1.0), 0.22 + 0.4 * tight);

    // --- showcase rig (title / game over): slow orbit around the rider
    if (bl < 1) {
      this.showT += dt * 0.35;
      const f = p.frame;
      const a = this.showT;
      const sx = Math.sin(a) * 4.6;
      const sz = Math.cos(a) * 4.6 + 1.2;
      this.side
        .copy(p.position)
        .addScaledVector(f.right, sx)
        .addScaledVector(f.fwd, sz)
        .addScaledVector(f.up, 1.4 + Math.sin(a * 0.7) * 0.4);
      this.dPos.lerpVectors(this.side, this.dPos, bl);
      this.side.copy(p.position).addScaledVector(f.up, 1.05);
      this.dLook.lerpVectors(this.side, this.dLook, bl);
      this.dUp.lerpVectors(f.up, this.dUp, bl).normalize();
    }

    if (!this.initialised) {
      this.pos.copy(this.dPos);
      this.look.copy(this.dLook);
      this.up.copy(this.dUp);
      this.initialised = true;
    } else {
      this.pos.lerp(this.dPos, damp(bl > 0.5 ? 11 : 6, dt));
      this.look.lerp(this.dLook, damp(16, dt));
      this.up.lerp(this.dUp, damp(6, dt)).normalize();
    }

    cam.position.copy(this.pos);
    if (this.shake > 0.001) {
      cam.position.x += (Math.random() - 0.5) * this.shake;
      cam.position.y += (Math.random() - 0.5) * this.shake;
      cam.position.z += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-dt * 7);
    }
    cam.up.copy(this.up);
    cam.lookAt(this.look);

    this.fovKick *= Math.exp(-dt * 2.5);
    const fov = lerp(48, clamp(60 + (p.speed - 20) * 0.55 + this.fovKick * 10, 58, 84), bl);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * damp(4, dt);
      cam.updateProjectionMatrix();
    }
  }
}
