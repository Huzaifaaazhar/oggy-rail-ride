import * as THREE from 'three';
import { RoachCharacter } from '../characters/RoachCharacter';
import { ROACHES, RoachId } from '../characters/RoachModel';
import { Entities } from '../entities/Entities';
import { makeObstacle, ObstacleKind, OBSTACLES } from '../entities/prefabs';
import { Track, TrackFrame } from '../track/Track';
import { F_NO_OBSTACLES, RAIL_TOP } from '../track/types';
import { clamp, makeRng, Rng, smootherstep } from '../util/math';
import { PlayerController } from './PlayerController';

type Show = 'look' | 'laugh' | 'tease' | 'mischief';

export type SquadEvent = { type: 'taunt'; who: RoachId; show: Show } | { type: 'throw'; who: RoachId };

interface Runner {
  id: RoachId;
  ch: RoachCharacter;
  gap: number;
  gapTarget: number;
  wander: number;
  fromRail: number;
  toRail: number;
  switchT: number;
  switchDir: number;
  height: number;
  vy: number;
  airborne: boolean;
  duckT: number;
  s: number;
  prevS: number;
  frame: TrackFrame;
  nextHop: number;
  pendingThrow: number;
}

interface Projectile {
  kind: ObstacleKind;
  obj: THREE.Object3D;
  from: THREE.Vector3;
  t: number;
  dur: number;
  s: number;
  rail: number;
  wide: boolean;
}

const PERSONALITY: Record<RoachId, { gap: number; freq: number; stride: number; bounce: number; swag: number }> = {
  skitter: { gap: 19, freq: 4.4, stride: 0.2, bounce: 0.06, swag: 1.4 },
  chomp: { gap: 27, freq: 3.0, stride: 0.17, bounce: 0.09, swag: 0.7 },
  twig: { gap: 23, freq: 2.5, stride: 0.34, bounce: 0.04, swag: 1.0 },
};

const tmpM = new THREE.Matrix4();
const tmpV = new THREE.Vector3();
const tmpX = new THREE.Vector3();

/**
 * The three pests run ahead of the player on the same rails. They keep a
 * loose gap, hop rails, jump or duck their own obstacles, and every few
 * seconds one of them puts on a show (look back, laugh, tease, scheme) or
 * lobs something onto the track.
 */
export class RoachSquad {
  root = new THREE.Group();
  runners: Runner[] = [];
  private projectiles: Projectile[] = [];
  private showT = 3;
  private throwT = 9;
  private rng: Rng;
  private landF = new TrackFrame();

  constructor(private track: Track, seed = 1) {
    this.rng = makeRng(seed ^ 0x9e3779b9);
    const rails: Record<RoachId, number> = { skitter: 1, chomp: 0, twig: 2 };
    for (const id of Object.keys(ROACHES) as RoachId[]) {
      const pers = PERSONALITY[id];
      const ch = new RoachCharacter(ROACHES[id], { freq: pers.freq, stride: pers.stride, bounce: pers.bounce, swag: pers.swag });
      this.root.add(ch.root);
      this.runners.push({
        id,
        ch,
        gap: pers.gap,
        gapTarget: pers.gap,
        wander: this.rng.range(0, 100),
        fromRail: rails[id],
        toRail: rails[id],
        switchT: 1,
        switchDir: 0,
        height: 0,
        vy: 0,
        airborne: false,
        duckT: 0,
        s: 0,
        prevS: 0,
        frame: new TrackFrame(),
        nextHop: this.rng.range(2, 6),
        pendingThrow: -1,
      });
    }
  }

  reset(track: Track, seed: number) {
    this.track = track;
    this.rng = makeRng(seed ^ 0x9e3779b9);
    for (const p of this.projectiles) this.root.remove(p.obj);
    this.projectiles = [];
    this.showT = 3;
    this.throwT = 9;
    for (const r of this.runners) {
      r.gap = r.gapTarget = PERSONALITY[r.id].gap;
      r.switchT = 1;
      r.height = 0;
      r.vy = 0;
      r.airborne = false;
      r.prevS = r.s = 0;
    }
  }

  /** Everyone laughs (e.g. when the player trips). */
  laughAll() {
    for (const r of this.runners) {
      if (!r.airborne) r.ch.animator.play('laugh', 1.5, 0.15, 0.3);
    }
  }

  private trySwitch(r: Runner, dir: number, entities: Entities) {
    if (r.switchT < 1 || r.airborne) return false;
    const n = Track.neighbour(r.frame, r.toRail, dir);
    if (n < 0 || !Track.canHop(r.frame, r.toRail, n)) return false;
    if (!entities.isFree(r.s + 4, n, 6)) return false;
    if (this.runners.some((o) => o !== r && o.toRail === n && Math.abs(o.s - r.s) < 3)) return false;
    r.fromRail = r.toRail;
    r.toRail = n;
    r.switchT = 0;
    r.switchDir = dir;
    r.ch.animator.play('hop', 0.34, 0.05, 0.12);
    return true;
  }

  private jump(r: Runner, v = 9) {
    if (r.airborne) return;
    r.airborne = true;
    r.vy = v;
  }

  update(dt: number, p: PlayerController, entities: Entities, events: SquadEvent[], active: boolean, distance: number) {
    const rng = this.rng;
    for (const r of this.runners) {
      // gap wanders; they ease back when the player slows (stumble)
      r.wander += dt * 0.35;
      r.gapTarget = PERSONALITY[r.id].gap + Math.sin(r.wander) * 3.5 + Math.sin(r.wander * 2.3) * 1.5;
      r.gap += (r.gapTarget - r.gap) * Math.min(1, dt * 0.8);
      r.prevS = r.s;
      r.s = p.s + r.gap;
      const runSpeed = dt > 0 ? (r.s - r.prevS) / dt : p.speed;
      this.track.frameAt(r.s, r.frame);

      // avoid obstacles on own rail
      const look = Math.max(6, runSpeed * 0.42);
      for (const o of entities.obstacles) {
        if (o.hit || o.flyT > 0) continue;
        const ds = o.s - r.s;
        if (ds < 0 || ds > look) continue;
        if (!(o.rail === r.toRail || o.wide)) continue;
        const cls = OBSTACLES[o.kind].cls;
        if (cls === 'block') {
          if (!this.trySwitch(r, rng.sign(), entities) && !this.trySwitch(r, -1, entities) && !this.trySwitch(r, 1, entities)) {
            if (ds < 3) this.jump(r, 13);
          }
        } else if (cls === 'low') {
          if (ds < 3.5) this.jump(r, 8.5);
        } else if (ds < 4 && r.duckT <= 0) {
          r.duckT = 0.7;
          if (!r.ch.animator.isPlaying('dodge')) r.ch.animator.play('dodge', 0.5, 0.05, 0.15);
        }
      }

      // playful rail changes
      r.nextHop -= dt;
      if (active && r.nextHop <= 0) {
        r.nextHop = rng.range(2.5, 7);
        this.trySwitch(r, rng.sign(), entities);
      }

      // hop interpolation & vertical
      if (r.switchT < 1) r.switchT = Math.min(1, r.switchT + dt / 0.32);
      if (r.airborne) {
        r.vy -= 24 * dt;
        r.height += r.vy * dt;
        if (r.height <= 0) {
          r.height = 0;
          r.vy = 0;
          r.airborne = false;
        }
      }
      if (r.duckT > 0) r.duckT -= dt;

      const f = r.frame;
      const t = smootherstep(r.switchT);
      const lx = f.lanes[r.fromRail * 2] + (f.lanes[r.toRail * 2] - f.lanes[r.fromRail * 2]) * t;
      const ly = f.lanes[r.fromRail * 2 + 1] + (f.lanes[r.toRail * 2 + 1] - f.lanes[r.fromRail * 2 + 1]) * t;
      const arc = r.switchT < 1 ? Math.sin(Math.PI * r.switchT) * 0.8 : 0;
      const root = r.ch.root;
      root.position.copy(f.pos).addScaledVector(f.right, lx).addScaledVector(f.up, ly + RAIL_TOP + r.height + arc);
      tmpX.copy(f.right).negate();
      tmpM.makeBasis(tmpX, f.up, f.fwd);
      root.quaternion.setFromRotationMatrix(tmpM);

      const anim = r.ch.animator;
      anim.setBase(r.airborne ? 'air' : r.duckT > 0 ? 'duck' : 'run', 0.12);
      r.ch.update(dt, {
        speed01: clamp((runSpeed - 15) / 25, 0, 1),
        freq: PERSONALITY[r.id].freq * clamp(runSpeed / 26, 0.5, 1.5),
        lean: r.switchT < 1 ? Math.sin(Math.PI * r.switchT) * r.switchDir : 0,
        vy: r.vy,
        tuck: arc * 0.3,
      });

      if (r.pendingThrow > 0) {
        r.pendingThrow -= dt;
        if (r.pendingThrow <= 0) this.launchProjectile(r, p, entities);
      }
    }

    if (!active) return;

    // shows: one performer at a time
    this.showT -= dt;
    if (this.showT <= 0) {
      this.showT = rng.range(3.5, 7);
      const r = rng.pick(this.runners);
      if (!r.airborne && r.duckT <= 0) {
        const show = rng.weighted<Show>([['look', 4], ['laugh', 2], ['tease', 2.5], ['mischief', 1.5]]);
        const dur = { look: 1.3, laugh: 1.5, tease: 1.7, mischief: 1.6 }[show];
        r.ch.animator.play(show, dur, 0.15, 0.3);
        events.push({ type: 'taunt', who: r.id, show });
      }
    }

    // throwing household things onto the rails (after a warm-up distance)
    this.throwT -= dt;
    if (distance > 350 && this.throwT <= 0) {
      this.throwT = rng.range(8, 14) - clamp(distance / 4000, 0, 1) * 3;
      const r = rng.pick(this.runners);
      if (!r.airborne) {
        r.ch.animator.play('throw', 0.9, 0.08, 0.2);
        r.pendingThrow = 0.45;
        events.push({ type: 'throw', who: r.id });
      }
    }

    // projectiles in flight
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.t += dt;
      const u = clamp(pr.t / pr.dur, 0, 1);
      const f = this.track.frameAt(pr.s, this.landF);
      f.railPoint(pr.rail, tmpV).addScaledVector(f.up, RAIL_TOP);
      pr.obj.position.lerpVectors(pr.from, tmpV, u).addScaledVector(f.up, Math.sin(Math.PI * u) * 4.5);
      pr.obj.rotation.x += dt * 9;
      pr.obj.rotation.z += dt * 5;
      if (u >= 1) {
        this.root.remove(pr.obj);
        this.projectiles.splice(i, 1);
        entities.addObstacle(pr.s, pr.rail, pr.kind, pr.wide);
      }
    }
  }

  private launchProjectile(r: Runner, p: PlayerController, entities: Entities) {
    const dur = 0.85;
    const s = p.s + p.speed * dur + 24;
    // choose a rail that keeps the row fair: never block the only free path
    const candidates = [0, 1, 2].filter((rail) => entities.isFree(s, rail, 10));
    if (candidates.length < 2) return;
    const f = this.track.frameAt(s, this.landF);
    if (f.flags & F_NO_OBSTACLES) return;
    const rail = candidates.includes(p.toRail) && this.rng.chance(0.6) ? p.toRail : this.rng.pick(candidates);
    const kind: ObstacleKind = this.rng.chance(0.5) ? 'yarn' : 'can';
    const merged = Track.railDistance(f, 0, 1) < 1.2 && Track.railDistance(f, 1, 2) < 1.2;
    const obj = makeObstacle(kind);
    const from = new THREE.Vector3();
    r.ch.model.handSocket.getWorldPosition(from);
    obj.position.copy(from);
    this.root.add(obj);
    this.projectiles.push({ kind, obj, from, t: 0, dur, s, rail, wide: merged });
  }
}
