import * as THREE from 'three';
import { Track, TrackFrame } from '../track/Track';
import { RAIL_TOP } from '../track/types';
import { clamp, smootherstep } from '../util/math';
import { speedFor } from './difficulty';

export type RiderState = 'ride' | 'air' | 'slide' | 'stumble' | 'crash';

export type PlayerEvent =
  | { type: 'jump' }
  | { type: 'land'; impact: number }
  | { type: 'switch'; dir: number }
  | { type: 'switchBlocked'; dir: number }
  | { type: 'slide' }
  | { type: 'stumble' }
  | { type: 'crash' };

export const JUMP_VELOCITY = 9.8;
export const GRAVITY = 26;
export const SLIDE_TIME = 0.78;
export const STAND_HEIGHT = 1.75;
export const SLIDE_HEIGHT = 0.7;
/** a second stumble within this window ends the run */
export const STUMBLE_WINDOW = 6;
/** how long a blocked switch / early jump stays buffered */
const BUFFER = 0.28;

/** Hop duration shortens with speed so switches stay responsive. */
export const switchTime = (speed: number) => clamp(0.24 - (speed - 20) * 0.0022, 0.17, 0.24);

/**
 * Rider movement in track space. The rider never "physically" sits on the
 * rail: distance s along the spline, the rail index (with an interpolated hop
 * between rails), and a height above the rail along the local up axis are the
 * whole state. That keeps the cat glued to the rail through loops and
 * corkscrews without any rigid-body simulation.
 */
export class PlayerController {
  s = 6;
  prevS = 6;
  speed = 20;
  fromRail = 1;
  toRail = 1;
  switchT = 1;
  switchDir = 0;
  switchDur = 0.24;
  height = 0;
  vy = 0;
  airborne = false;
  slideT = 0;
  stumbleT = 0;
  invulnT = 0;
  /** time since the last stumble (Infinity when clean) */
  sinceStumble = Infinity;
  state: RiderState = 'ride';
  distance = 0;
  /** tea-tray ride time left (faster, smashes obstacles) */
  rideT = 0;
  /** seconds since the crash started (failure animation clock) */
  crashT = 0;
  private queuedSwitch = 0;
  private bufferedSwitch = { dir: 0, t: 0 };
  private bufferedJump = 0;
  private fastFall = false;
  /** world-space tumble after a crash */
  private fallVel = new THREE.Vector3();
  private fallSpin = new THREE.Vector3();

  readonly frame = new TrackFrame();
  readonly position = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  /** Lateral (x,y) offset in the rolled frame, including the hop blend. */
  lateral = new THREE.Vector2(0, 0);
  hopArc = 0;
  private m = new THREE.Matrix4();
  private tx = new THREE.Vector3();
  private ahead = new TrackFrame();
  private tq = new THREE.Quaternion();
  private te = new THREE.Euler();

  reset() {
    this.s = this.prevS = 6;
    this.speed = 20;
    this.fromRail = this.toRail = 1;
    this.switchT = 1;
    this.height = 0;
    this.vy = 0;
    this.airborne = false;
    this.slideT = 0;
    this.stumbleT = 0;
    this.invulnT = 0;
    this.sinceStumble = Infinity;
    this.state = 'ride';
    this.distance = 0;
    this.crashT = 0;
    this.rideT = 0;
    this.queuedSwitch = 0;
    this.bufferedSwitch.dir = 0;
    this.bufferedJump = 0;
  }

  /** The rail used for collisions (switches flip half way). */
  get rail() {
    return this.switchT < 0.5 ? this.fromRail : this.toRail;
  }
  get sliding() {
    return this.slideT > 0;
  }
  get bodyHeight() {
    return this.sliding ? SLIDE_HEIGHT : STAND_HEIGHT;
  }
  get crashed() {
    return this.state === 'crash';
  }

  targetSpeed() {
    return speedFor(this.distance);
  }

  /** Can we hop from the current rail toward dir right now (and shortly after)? */
  private hopTarget(track: Track, dir: number): number {
    const n = Track.neighbour(this.frame, this.toRail, dir);
    if (n < 0) return -1;
    const dur = switchTime(this.speed);
    track.frameAt(this.s + this.speed * dur, this.ahead);
    if (!Track.canHop(this.frame, this.toRail, n) || !Track.canHop(this.ahead, this.toRail, n)) return -1;
    // the destination must still be our neighbour on the far side of the hop
    if (Track.neighbour(this.ahead, this.toRail, dir) !== n) return -1;
    return n;
  }

  trySwitch(track: Track, dir: number, events: PlayerEvent[], fromBuffer = false) {
    if (this.crashed) return;
    if (this.switchT < 1) {
      this.queuedSwitch = dir;
      return;
    }
    const n = this.hopTarget(track, dir);
    if (n < 0) {
      // forgiving input: keep the request alive briefly in case a hop zone opens
      if (!fromBuffer) {
        this.bufferedSwitch.dir = dir;
        this.bufferedSwitch.t = BUFFER;
      }
      return;
    }
    this.bufferedSwitch.dir = 0;
    this.fromRail = this.toRail;
    this.toRail = n;
    this.switchT = 0;
    this.switchDir = dir;
    this.switchDur = switchTime(this.speed);
    events.push({ type: 'switch', dir });
  }

  jump(events: PlayerEvent[]) {
    if (this.crashed) return;
    if (this.airborne) {
      // pressed just before landing: jump again on touchdown
      if (this.vy < 0 && this.height < 0.9) this.bufferedJump = BUFFER;
      return;
    }
    this.slideT = 0;
    this.airborne = true;
    this.vy = JUMP_VELOCITY;
    this.fastFall = false;
    this.state = 'air';
    events.push({ type: 'jump' });
  }

  slide(events: PlayerEvent[]) {
    if (this.crashed) return;
    if (this.airborne) {
      this.vy = Math.min(this.vy, -16);
      this.fastFall = true;
      return;
    }
    this.slideT = SLIDE_TIME;
    this.state = 'slide';
    events.push({ type: 'slide' });
  }

  /** Side clip: slow down and wobble; a second one soon after ends the run. */
  stumble(events: PlayerEvent[]) {
    if (this.invulnT > 0 || this.crashed) return;
    if (this.sinceStumble < STUMBLE_WINDOW) {
      this.crash(events);
      return;
    }
    this.sinceStumble = 0;
    this.speed *= 0.7;
    this.invulnT = 1.2;
    this.stumbleT = 1.0;
    this.slideT = 0;
    this.state = 'stumble';
    events.push({ type: 'stumble' });
  }

  /** Head-on hit: splat, then tumble off the banister. */
  crash(events: PlayerEvent[]) {
    if (this.crashed) return;
    this.state = 'crash';
    this.crashT = 0;
    const f = this.frame;
    this.fallVel.copy(f.fwd).multiplyScalar(-this.speed * 0.12).addScaledVector(f.up, 7.5).addScaledVector(f.right, (Math.random() < 0.5 ? -1 : 1) * 3.2);
    this.fallSpin.set(Math.random() * 6 - 3, Math.random() * 4 - 2, 5 + Math.random() * 3);
    this.speed = 0;
    events.push({ type: 'crash' });
  }

  update(dt: number, track: Track, events: PlayerEvent[], playing: boolean) {
    this.prevS = this.s;
    if (this.crashed) {
      this.updateCrash(dt);
      return;
    }
    if (playing) {
      const slopeAccel = -9.8 * Math.sin(this.frame.pitch) * 0.42;
      const target = this.targetSpeed() * (this.stumbleT > 0 ? 0.8 : 1) * (this.rideT > 0 ? 1.3 : 1);
      this.speed += (target - this.speed) * Math.min(1, 0.8 * dt) + slopeAccel * dt;
      this.speed = clamp(this.speed, 12, 62);
    } else {
      this.speed = 0;
    }
    const ds = this.speed * dt;
    this.s += ds;
    if (playing) this.distance += ds;
    track.frameAt(this.s, this.frame);
    this.sinceStumble += dt;
    if (this.rideT > 0) this.rideT = Math.max(0, this.rideT - dt);

    // buffered inputs
    if (this.bufferedSwitch.dir && this.switchT >= 1) {
      this.bufferedSwitch.t -= dt;
      if (this.bufferedSwitch.t <= 0) this.bufferedSwitch.dir = 0;
      else this.trySwitch(track, this.bufferedSwitch.dir, events, true);
    }
    if (this.bufferedJump > 0) this.bufferedJump -= dt;

    // hop between rails (always along rails that are connected right now)
    if (this.switchT < 1) {
      this.switchT = Math.min(1, this.switchT + dt / this.switchDur);
      if (this.switchT >= 1 && this.queuedSwitch) {
        const q = this.queuedSwitch;
        this.queuedSwitch = 0;
        this.trySwitch(track, q, events);
      }
    }
    // a hop that would end across a crossing/wide gap snaps back gracefully
    const t = smootherstep(this.switchT);
    const f = this.frame;
    const ax = f.lanes[this.fromRail * 2];
    const ay = f.lanes[this.fromRail * 2 + 1];
    const bx = f.lanes[this.toRail * 2];
    const by = f.lanes[this.toRail * 2 + 1];
    this.lateral.set(ax + (bx - ax) * t, ay + (by - ay) * t);
    this.hopArc = this.switchT < 1 ? Math.sin(Math.PI * this.switchT) * 0.9 : 0;

    // vertical, along the rider's up axis (works upside-down too)
    if (this.airborne) {
      this.vy -= GRAVITY * (this.fastFall ? 1.6 : 1) * dt;
      this.height += this.vy * dt;
      if (this.height <= 0) {
        const impact = -this.vy;
        this.height = 0;
        this.vy = 0;
        this.airborne = false;
        events.push({ type: 'land', impact });
        if (this.fastFall) {
          this.fastFall = false;
          this.slideT = SLIDE_TIME * 0.8;
          events.push({ type: 'slide' });
        } else if (this.bufferedJump > 0) {
          this.bufferedJump = 0;
          this.jump(events);
        }
      }
    }
    if (this.slideT > 0) this.slideT = Math.max(0, this.slideT - dt);
    if (this.stumbleT > 0) this.stumbleT = Math.max(0, this.stumbleT - dt);
    if (this.invulnT > 0) this.invulnT = Math.max(0, this.invulnT - dt);

    if (this.airborne) this.state = 'air';
    else if (this.stumbleT > 0) this.state = 'stumble';
    else if (this.slideT > 0) this.state = 'slide';
    else this.state = 'ride';

    // world transform: character local X = left, Y = up, Z = forward
    this.position
      .copy(f.pos)
      .addScaledVector(f.right, this.lateral.x)
      .addScaledVector(f.up, this.lateral.y + RAIL_TOP + this.height + this.hopArc);
    this.tx.copy(f.right).negate();
    this.m.makeBasis(this.tx, f.up, f.fwd);
    this.quaternion.setFromRotationMatrix(this.m);
  }

  /** Cartoon failure: a short splat freeze, then a ballistic tumble off the rail. */
  private updateCrash(dt: number) {
    this.crashT += dt;
    if (this.crashT < 0.35) return; // flattened against the obstacle
    this.fallVel.y -= 22 * dt;
    this.position.addScaledVector(this.fallVel, dt);
    this.te.set(this.fallSpin.x * dt, this.fallSpin.y * dt, this.fallSpin.z * dt);
    this.tq.setFromEuler(this.te);
    this.quaternion.multiply(this.tq);
  }
}
