import * as THREE from 'three';
import { Track, TrackFrame } from '../track/Track';
import { RAIL_TOP } from '../track/types';
import { clamp, smootherstep } from '../util/math';

export type RiderState = 'ride' | 'air' | 'slide' | 'stumble' | 'wipeout';

export type PlayerEvent =
  | { type: 'jump' }
  | { type: 'land'; impact: number }
  | { type: 'switch'; dir: number }
  | { type: 'switchBlocked'; dir: number }
  | { type: 'slide' }
  | { type: 'hit'; lives: number }
  | { type: 'wipeout' };

export const JUMP_VELOCITY = 9.8;
export const GRAVITY = 26;
export const SWITCH_TIME = 0.24;
export const SLIDE_TIME = 0.78;
export const STAND_HEIGHT = 1.75;
export const SLIDE_HEIGHT = 0.7;

/**
 * Rider movement in track space. The rider never "physically" sits on
 * the rail: distance s along the spline, the rail index (with an interpolated
 * hop between rails), and a height above the rail along the local up axis are
 * the whole state. That keeps him glued to the rail through loops and
 * corkscrews without any rigid-body simulation.
 */
export class PlayerController {
  s = 6;
  speed = 20;
  fromRail = 1;
  toRail = 1;
  switchT = 1;
  switchDir = 0;
  height = 0;
  vy = 0;
  airborne = false;
  slideT = 0;
  stumbleT = 0;
  invulnT = 0;
  lives = 3;
  state: RiderState = 'ride';
  boostT = 0;
  distance = 0;
  private queuedSwitch = 0;
  private fastFall = false;

  readonly frame = new TrackFrame();
  readonly position = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  /** Lateral (x,y) offset in the rolled frame, including the hop blend. */
  lateral = new THREE.Vector2(0, 0);
  hopArc = 0;
  private m = new THREE.Matrix4();
  private tx = new THREE.Vector3();

  reset() {
    this.s = 6;
    this.speed = 20;
    this.fromRail = this.toRail = 1;
    this.switchT = 1;
    this.height = 0;
    this.vy = 0;
    this.airborne = false;
    this.slideT = 0;
    this.stumbleT = 0;
    this.invulnT = 0;
    this.lives = 3;
    this.state = 'ride';
    this.distance = 0;
    this.queuedSwitch = 0;
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

  targetSpeed() {
    return 21 + 19 * (1 - Math.exp(-this.distance / 3200));
  }

  trySwitch(track: Track, dir: number, events: PlayerEvent[]) {
    if (this.state === 'wipeout') return;
    if (this.switchT < 1) {
      this.queuedSwitch = dir;
      return;
    }
    const n = Track.neighbour(this.frame, this.toRail, dir);
    if (n < 0) {
      events.push({ type: 'switchBlocked', dir });
      return;
    }
    // must be able to hop now and still be next to the rail a little ahead
    const ahead = track.frameAt(this.s + this.speed * SWITCH_TIME, new TrackFrame());
    if (!Track.canHop(this.frame, this.toRail, n) || !Track.canHop(ahead, this.toRail, n)) {
      events.push({ type: 'switchBlocked', dir });
      return;
    }
    this.fromRail = this.toRail;
    this.toRail = n;
    this.switchT = 0;
    this.switchDir = dir;
    events.push({ type: 'switch', dir });
  }

  jump(events: PlayerEvent[]) {
    if (this.state === 'wipeout' || this.airborne) return;
    this.slideT = 0;
    this.airborne = true;
    this.vy = JUMP_VELOCITY;
    this.fastFall = false;
    this.state = 'air';
    events.push({ type: 'jump' });
  }

  slide(events: PlayerEvent[]) {
    if (this.state === 'wipeout') return;
    if (this.airborne) {
      this.vy = Math.min(this.vy, -16);
      this.fastFall = true;
      return;
    }
    this.slideT = SLIDE_TIME;
    this.state = 'slide';
    events.push({ type: 'slide' });
  }

  hit(events: PlayerEvent[]) {
    if (this.invulnT > 0 || this.state === 'wipeout') return false;
    this.lives -= 1;
    this.speed *= 0.55;
    this.invulnT = 2.0;
    this.stumbleT = 1.15;
    this.slideT = 0;
    if (this.lives <= 0) {
      this.state = 'wipeout';
      events.push({ type: 'wipeout' });
    } else {
      this.state = 'stumble';
      events.push({ type: 'hit', lives: this.lives });
    }
    return true;
  }

  update(dt: number, track: Track, events: PlayerEvent[], playing: boolean) {
    // speed: ease toward a target that rises with distance, plus a gravity term
    if (playing && this.state !== 'wipeout') {
      const slopeAccel = -9.8 * Math.sin(this.frame.pitch) * 0.42;
      const target = this.targetSpeed() * (this.stumbleT > 0 ? 0.75 : 1);
      this.speed += (target - this.speed) * Math.min(1, 0.7 * dt) + slopeAccel * dt;
      this.speed = clamp(this.speed, 12, 58);
    } else if (this.state === 'wipeout') {
      this.speed = Math.max(0, this.speed - 30 * dt);
    } else {
      this.speed = 0;
    }
    const ds = this.speed * dt;
    this.s += ds;
    if (playing) this.distance += ds;
    track.frameAt(this.s, this.frame);

    // hop between rails
    if (this.switchT < 1) {
      this.switchT = Math.min(1, this.switchT + dt / SWITCH_TIME);
      if (this.switchT >= 1 && this.queuedSwitch) {
        const q = this.queuedSwitch;
        this.queuedSwitch = 0;
        this.trySwitch(track, q, events);
      }
    }
    const t = smootherstep(this.switchT);
    const f = this.frame;
    const ax = f.lanes[this.fromRail * 2];
    const ay = f.lanes[this.fromRail * 2 + 1];
    const bx = f.lanes[this.toRail * 2];
    const by = f.lanes[this.toRail * 2 + 1];
    this.lateral.set(ax + (bx - ax) * t, ay + (by - ay) * t);
    this.hopArc = this.switchT < 1 ? Math.sin(Math.PI * this.switchT) * 0.9 : 0;

    // vertical (along the rider's up axis, so it works upside-down too)
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
        }
      }
    }
    if (this.slideT > 0) this.slideT = Math.max(0, this.slideT - dt);
    if (this.stumbleT > 0) this.stumbleT = Math.max(0, this.stumbleT - dt);
    if (this.invulnT > 0) this.invulnT = Math.max(0, this.invulnT - dt);

    if (this.state !== 'wipeout') {
      if (this.airborne) this.state = 'air';
      else if (this.stumbleT > 0) this.state = 'stumble';
      else if (this.slideT > 0) this.state = 'slide';
      else this.state = 'ride';
    }

    // world transform: character local X = left, Y = up, Z = forward
    this.position
      .copy(f.pos)
      .addScaledVector(f.right, this.lateral.x)
      .addScaledVector(f.up, this.lateral.y + RAIL_TOP + this.height + this.hopArc);
    this.tx.copy(f.right).negate();
    this.m.makeBasis(this.tx, f.up, f.fwd);
    this.quaternion.setFromRotationMatrix(this.m);
  }
}
