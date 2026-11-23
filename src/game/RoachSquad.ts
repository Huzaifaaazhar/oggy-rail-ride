import * as THREE from 'three';
import { RoachCharacter } from '../characters/RoachCharacter';
import { ROACHES, RoachId } from '../characters/RoachModel';
import { CATALOG, ObstacleKind, ObstacleSpec } from '../entities/catalog';
import { Entities, rankOf, railAtRank } from '../entities/Entities';
import { makeObstacle } from '../entities/prefabs';
import { Track, TrackFrame } from '../track/Track';
import { RAIL_TOP } from '../track/types';
import { clamp, lerp, makeRng, Rng, smootherstep } from '../util/math';
import { difficultyFor } from './difficulty';
import { PlayerController } from './PlayerController';

type Show = 'look' | 'laugh' | 'tease' | 'mischief';

export type SquadEvent =
  | { type: 'taunt'; who: RoachId; show: Show }
  | { type: 'throw'; who: RoachId }
  | { type: 'trick'; who: RoachId; text: string }
  | { type: 'ambush'; text: string }
  | { type: 'escape' };

/** They can come close, but never closer than this. */
export const MIN_GAP = 6.5;

interface Runner {
  id: RoachId;
  ch: RoachCharacter;
  baseGap: number;
  gap: number;
  /** extra gap from escapes/tricks (eases back to 0) */
  bonus: number;
  /** temporary override of the gap target (Twig's close taunt) */
  closeT: number;
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
  /** role-specific trick cooldown */
  trickT: number;
  /** Twig's vanish: >0 while hidden */
  hiddenT: number;
  pending: { at: number; run: () => void }[];
}

interface Projectile {
  kind: ObstacleKind;
  obj: THREE.Object3D;
  from: THREE.Vector3;
  t: number;
  dur: number;
  spec: ObstacleSpec;
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
 * The three pests run ahead of the cat on the same rails and make his life
 * difficult. Each has a role; together they stage ambushes. Their distance is
 * always the player's distance plus a gap clamped above MIN_GAP, so they can
 * be chased forever but never caught.
 */
export class RoachSquad {
  root = new THREE.Group();
  runners: Runner[] = [];
  /** 0 relaxed … 1 the cat is right on their tails */
  tension = 0;
  minGapSeen = Infinity;
  private projectiles: Projectile[] = [];
  private showT = 3;
  private ambushT = 40;
  private rng: Rng;
  private landF = new TrackFrame();
  private time = 0;
  stats = { traps: 0, throws: 0, drops: 0, twigTricks: 0, ambushes: 0, escapes: 0 };

  constructor(private track: Track, seed = 1) {
    this.rng = makeRng(seed ^ 0x9e3779b9);
    const rails: Record<RoachId, number> = { skitter: 1, chomp: 0, twig: 2 };
    for (const id of Object.keys(ROACHES) as RoachId[]) {
      const pers = PERSONALITY[id];
      const ch = new RoachCharacter(ROACHES[id], { freq: pers.freq, stride: pers.stride, bounce: pers.bounce, swag: pers.swag });
      this.root.add(ch.root);
      this.runners.push({
        id, ch, baseGap: pers.gap, gap: pers.gap, bonus: 0, closeT: 0, wander: this.rng.range(0, 100),
        fromRail: rails[id], toRail: rails[id], switchT: 1, switchDir: 0, height: 0, vy: 0, airborne: false, duckT: 0,
        s: 0, prevS: 0, frame: new TrackFrame(), nextHop: this.rng.range(2, 6), trickT: this.rng.range(8, 14), hiddenT: 0, pending: [],
      });
    }
  }

  reset(track: Track, seed: number) {
    this.track = track;
    this.rng = makeRng(seed ^ 0x9e3779b9);
    for (const p of this.projectiles) this.root.remove(p.obj);
    this.projectiles = [];
    this.showT = 3;
    this.ambushT = 40;
    this.tension = 0;
    this.minGapSeen = Infinity;
    this.stats = { traps: 0, throws: 0, drops: 0, twigTricks: 0, ambushes: 0, escapes: 0 };
    for (const r of this.runners) {
      r.gap = r.baseGap;
      r.bonus = 0;
      r.closeT = 0;
      r.switchT = 1;
      r.height = 0;
      r.vy = 0;
      r.airborne = false;
      r.hiddenT = 0;
      r.pending = [];
      r.trickT = this.rng.range(8, 14);
      r.prevS = r.s = 0;
      r.ch.root.visible = true;
      r.ch.root.scale.setScalar(1);
    }
  }

  get(id: RoachId) {
    return this.runners.find((r) => r.id === id)!;
  }

  /** The cat tripped: everyone laughs and they gain some distance. */
  onStumble() {
    this.tension = Math.max(0, this.tension - 0.5);
    for (const r of this.runners) {
      r.bonus += 6;
      if (!r.airborne) r.ch.animator.play('laugh', 1.5, 0.15, 0.3);
    }
  }

  onCrash() {
    for (const r of this.runners) r.ch.animator.setBase('celebrate', 0.25);
  }

  private later(r: Runner, delay: number, run: () => void) {
    r.pending.push({ at: this.time + delay, run });
  }

  private trySwitch(r: Runner, dir: number, entities: Entities) {
    if (r.switchT < 1 || r.airborne || r.hiddenT > 0) return false;
    const n = Track.neighbour(r.frame, r.toRail, dir);
    if (n < 0 || !Track.canHop(r.frame, r.toRail, n)) return false;
    const rank = Math.round(rankOf(r.frame, r.frame.lanes[n * 2]));
    if (entities.threatsOnRank(r.s - 1, r.s + 8, rank).some((o) => CATALOG[o.kind].cls === 'block')) return false;
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

  private rankOfRunner(r: Runner) {
    return Math.round(rankOf(r.frame, r.frame.lanes[r.toRail * 2]));
  }

  update(dt: number, p: PlayerController, entities: Entities, events: SquadEvent[], active: boolean) {
    this.time += dt;
    const rng = this.rng;
    const d = difficultyFor(p.distance);

    // chase tension: clean riding at speed closes the gap; tricks and trips open it
    if (active && p.state === 'ride') this.tension = clamp(this.tension + dt * (0.012 + p.speed * 0.0006), 0, 1);

    for (const r of this.runners) {
      for (let i = r.pending.length - 1; i >= 0; i--) {
        if (r.pending[i].at <= this.time) {
          const job = r.pending[i];
          r.pending.splice(i, 1);
          if (active) job.run();
        }
      }
      r.wander += dt * 0.35;
      r.bonus = Math.max(0, r.bonus - dt * 2.2);
      r.closeT = Math.max(0, r.closeT - dt);
      const wobble = Math.sin(r.wander) * 3.5 + Math.sin(r.wander * 2.3) * 1.5;
      let target = r.baseGap * lerp(1, 0.42, this.tension) + wobble + r.bonus;
      if (r.closeT > 0) target = 7;
      r.gap += (target - r.gap) * Math.min(1, dt * (r.closeT > 0 ? 2.5 : 0.9));
      r.gap = Math.max(MIN_GAP, r.gap);
      r.prevS = r.s;
      r.s = p.s + r.gap;
      this.minGapSeen = Math.min(this.minGapSeen, r.s - p.s);
      const runSpeed = dt > 0 ? (r.s - r.prevS) / dt : p.speed;
      this.track.frameAt(r.s, r.frame);

      // dodge whatever is on their own rank
      const look = Math.max(6, runSpeed * 0.42);
      const rank = this.rankOfRunner(r);
      for (const o of entities.threatsOnRank(r.s, r.s + look, rank)) {
        const ds = o.s - r.s;
        const cls = CATALOG[o.kind].cls;
        if (cls === 'block') {
          if (!this.trySwitch(r, rng.sign(), entities) && !this.trySwitch(r, -1, entities) && !this.trySwitch(r, 1, entities) && ds < 3) this.jump(r, 13);
        } else if (cls === 'low') {
          if (ds < 3.5) this.jump(r, 8.5);
        } else if (ds < 4 && r.duckT <= 0) {
          r.duckT = 0.7;
        }
      }

      r.nextHop -= dt;
      if (active && r.nextHop <= 0) {
        r.nextHop = rng.range(2.5, 7) * (r.id === 'twig' ? 0.7 : 1);
        this.trySwitch(r, rng.sign(), entities);
      }

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

      // Twig's vanishing act
      if (r.hiddenT > 0) {
        r.hiddenT -= dt;
        const k = r.hiddenT > 0 ? 0 : 1;
        r.ch.root.scale.setScalar(Math.max(0.001, k));
      }

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
      if (anim.current !== 'celebrate' || active) anim.setBase(r.airborne ? 'air' : r.duckT > 0 ? 'duck' : 'run', 0.12);
      if (!active && p.crashed) anim.setBase('celebrate', 0.25);
      r.ch.update(dt, {
        speed01: clamp((runSpeed - 15) / 25, 0, 1),
        freq: PERSONALITY[r.id].freq * clamp(runSpeed / 26, 0.5, 1.6),
        lean: r.switchT < 1 ? Math.sin(Math.PI * r.switchT) * r.switchDir : 0,
        vy: r.vy,
        tuck: arc * 0.3,
      });
    }

    this.updateProjectiles(dt, entities);
    if (!active) return;

    // near-capture → they always slip away
    const lead = Math.min(...this.runners.map((r) => r.gap));
    if (lead < 8.5 && this.tension > 0.8) {
      this.tension = 0.25;
      for (const r of this.runners) {
        r.bonus += 16;
        r.ch.animator.play('tease', 1.4, 0.1, 0.3);
      }
      this.stats.escapes++;
      events.push({ type: 'escape' });
    }

    // idle showboating
    this.showT -= dt;
    if (this.showT <= 0) {
      this.showT = rng.range(3.5, 7) * lerp(1, 0.7, d);
      const r = rng.pick(this.runners);
      if (!r.airborne && r.duckT <= 0 && r.hiddenT <= 0) {
        const show = rng.weighted<Show>([['look', 4], ['laugh', 2], ['tease', 2.5], ['mischief', 1.5]]);
        r.ch.animator.play(show, { look: 1.3, laugh: 1.5, tease: 1.7, mischief: 1.6 }[show], 0.15, 0.3);
        events.push({ type: 'taunt', who: r.id, show });
      }
    }

    if (p.distance < 250) return;

    // individual roles
    for (const r of this.runners) {
      r.trickT -= dt;
      if (r.trickT > 0 || r.airborne || r.hiddenT > 0) continue;
      if (r.id === 'skitter') {
        r.trickT = lerp(18, 8, d) + rng.range(0, 4);
        this.skitterTrap(r, p, entities, events);
      } else if (r.id === 'chomp') {
        r.trickT = lerp(12, 5.5, d) + rng.range(0, 3);
        if (rng.chance(0.65)) this.chompVolley(r, p, d, events);
        else this.chompDrop(r, p, entities, events);
      } else {
        r.trickT = lerp(14, 7, d) + rng.range(0, 3);
        this.twigTrick(r, p, d, entities, events);
      }
    }

    // team ambush
    if (p.distance > 900) {
      this.ambushT -= dt;
      if (this.ambushT <= 0) {
        this.ambushT = lerp(55, 30, d) + rng.range(0, 10);
        this.ambush(p, d, entities, events);
      }
    }
  }

  /* ---------------------------------------------------------- tricks */

  private aheadS(p: PlayerController, extra = 0) {
    return p.s + Math.max(60, p.speed * 2.3) + extra;
  }

  /** Skitter plans a trap and sets it off just ahead of the cat. */
  private skitterTrap(r: Runner, p: PlayerController, entities: Entities, events: SquadEvent[]) {
    r.ch.animator.play('mischief', 1.2, 0.12, 0.3);
    this.later(r, 0.8, () => {
      const s = this.aheadS(p);
      const u = this.rng.pick([-1, 0, 1]);
      const pick = this.rng.weighted<string>([['door', 3], ['dropTable', 2.5], ['slider', 2], ['lamp', 1.5]]);
      let spec: ObstacleSpec;
      if (pick === 'door') spec = { s, kind: 'door', u, span: 1, motion: { type: 'door', trigger: 34, side: u === 0 ? this.rng.sign() : -u }, warn: true, by: 'skitter' };
      else if (pick === 'dropTable') spec = { s, kind: 'table', u: this.rng.pick([-0.5, 0.5]), span: 2, motion: { type: 'drop', trigger: 42, height: 7 }, warn: true, by: 'skitter' };
      else if (pick === 'slider') spec = { s, kind: this.rng.pick(['sofa', 'washer'] as ObstacleKind[]), u, span: 1, motion: { type: 'slide', u1: u === 0 ? this.rng.pick([-1, 1]) : 0, trigger: 36, dur: 0.9 }, warn: true, by: 'skitter' };
      else spec = { s, kind: 'lamp', u, span: 1, motion: { type: 'swing', amp: 0.35, period: 1.6 }, warn: false, by: 'skitter' };
      if (entities.tryPlace([spec])) {
        this.stats.traps++;
        events.push({ type: 'trick', who: 'skitter', text: { door: 'Skitter rigged a door', dropTable: 'Skitter cut a table loose', slider: 'Skitter shoved the furniture', lamp: 'Skitter set a lamp swinging' }[pick]! });
      }
    });
  }

  /** Chomp lobs household items onto the rails. */
  private chompVolley(r: Runner, p: PlayerController, d: number, events: SquadEvent[]) {
    r.ch.animator.play('throw', 0.9, 0.08, 0.2);
    const count = 1 + (d > 0.35 ? 1 : 0) + (d > 0.7 ? 1 : 0);
    const ranks = [-1, 0, 1].sort(() => this.rng.next() - 0.5).slice(0, count);
    events.push({ type: 'throw', who: 'chomp' });
    this.stats.throws++;
    ranks.forEach((u, i) => {
      this.later(r, 0.45 + i * 0.18, () => {
        const dur = 0.85;
        const s = p.s + p.speed * dur + 24 + i * 6;
        const kind = this.rng.pick(['cushion', 'can', 'yarn', 'pots'] as ObstacleKind[]);
        this.launch(r, { s, kind, u, span: 1, motion: { type: 'static' }, warn: false, by: 'chomp' }, dur);
      });
    });
  }

  /** Chomp drops something that rolls back down the rail toward the cat. */
  private chompDrop(r: Runner, p: PlayerController, entities: Entities, events: SquadEvent[]) {
    r.ch.animator.play('mischief', 0.9, 0.1, 0.25);
    this.later(r, 0.5, () => {
      const u = this.rankOfRunner(r);
      const kind: ObstacleKind = this.rng.chance(0.5) ? 'barrel' : 'bucket';
      const spec: ObstacleSpec = { s: r.s - 2, kind, u, span: 1, motion: kind === 'barrel' ? { type: 'roll', speed: 7, trigger: 999 } : { type: 'static' }, warn: true, by: 'chomp' };
      if (spec.s - p.s > 12 && entities.tryPlace([spec])) {
        this.stats.drops++;
        events.push({ type: 'trick', who: 'chomp', text: kind === 'barrel' ? 'Chomp rolled a barrel back at you' : 'Chomp dropped a bucket' });
      }
    });
  }

  /** Twig is unpredictable: route changes, close taunts, vanishing, mechanisms. */
  private twigTrick(r: Runner, p: PlayerController, d: number, entities: Entities, events: SquadEvent[]) {
    const pick = this.rng.weighted<string>([['route', 3], ['close', 2.5], ['vanish', 2], ['fan', d > 0.35 ? 1.5 : 0]]);
    this.stats.twigTricks++;
    if (pick === 'route') {
      const dir = this.rng.sign();
      this.trySwitch(r, dir, entities);
      this.later(r, 0.4, () => this.trySwitch(r, dir, entities));
      events.push({ type: 'trick', who: 'twig', text: 'Twig switched routes' });
    } else if (pick === 'close') {
      r.closeT = 2.4;
      r.ch.animator.play('tease', 2.2, 0.15, 0.3);
      events.push({ type: 'trick', who: 'twig', text: 'Twig is right in front of you' });
    } else if (pick === 'vanish') {
      entities.emitSparks(r.ch.root.position.clone().add(tmpV.set(0, 1, 0)), 30);
      r.hiddenT = 1.1;
      this.later(r, 1.05, () => {
        // reappear somewhere unexpected: another rail, much further ahead
        const options = [0, 1, 2].filter((i) => i !== r.toRail);
        r.fromRail = r.toRail = this.rng.pick(options);
        r.bonus += 10;
        r.ch.animator.play('laugh', 1.2, 0.1, 0.3);
        this.later(r, 0.05, () => entities.emitSparks(r.ch.root.position.clone().add(tmpV.set(0, 1, 0)), 30));
      });
      events.push({ type: 'trick', who: 'twig', text: 'Twig vanished…' });
    } else {
      r.ch.animator.play('mischief', 1.1, 0.12, 0.3);
      this.later(r, 0.7, () => {
        const spec: ObstacleSpec = { s: this.aheadS(p), kind: 'fan', u: 0, span: 3, motion: { type: 'spin' }, warn: true, by: 'twig' };
        if (entities.tryPlace([spec])) events.push({ type: 'trick', who: 'twig', text: 'Twig switched on the ceiling fan' });
      });
    }
  }

  /** All three together: scripted combinations that always leave a way through. */
  private ambush(p: PlayerController, d: number, entities: Entities, events: SquadEvent[]) {
    const [sk, ch, tw] = [this.get('skitter'), this.get('chomp'), this.get('twig')];
    for (const r of this.runners) r.ch.animator.play('look', 1.0, 0.1, 0.25);
    const plan = this.rng.weighted<string>([['pincer', 1], ['conga', d > 0.3 ? 1 : 0.3], ['fanfare', d > 0.4 ? 1 : 0.2]]);
    const s = this.aheadS(p, 10);
    let specs: ObstacleSpec[] = [];
    let text = '';
    if (plan === 'pincer') {
      text = 'Roach ambush: the pincer';
      const mid: ObstacleSpec = { s, kind: 'door', u: 0, span: 1, motion: { type: 'door', trigger: 36, side: this.rng.sign() }, warn: true, by: 'skitter' };
      specs = [mid, { s: s + 1, kind: 'cushion', u: -1, span: 1, motion: { type: 'static' }, warn: false, by: 'chomp' }, { s: s + 1, kind: 'cushion', u: 1, span: 1, motion: { type: 'static' }, warn: false, by: 'chomp' }];
      sk.ch.animator.play('mischief', 1.2, 0.1, 0.3);
      ch.ch.animator.play('throw', 0.9, 0.1, 0.2);
    } else if (plan === 'conga') {
      text = 'Roach ambush: the conga line';
      const step = Math.max(14, p.speed * 0.62);
      let free = this.rng.pick([-1, 0, 1]);
      for (let i = 0; i < 3; i++) {
        for (const u of [-1, 0, 1]) if (u !== free) specs.push({ s: s + i * step, kind: this.rng.pick(['washer', 'cupboard', 'chair'] as ObstacleKind[]), u, span: 1, motion: { type: 'static' }, warn: false, by: 'twig' });
        free = this.rng.pick([-1, 0, 1].filter((u) => Math.abs(u - free) === 1));
      }
      for (const r of this.runners) this.later(r, this.rng.range(0, 0.6), () => this.trySwitch(r, this.rng.sign(), entities));
    } else {
      text = 'Roach ambush: fan-fare';
      const u = this.rng.pick([-1, 0, 1]);
      specs = [
        { s, kind: 'fan', u: 0, span: 3, motion: { type: 'spin' }, warn: true, by: 'twig' },
        { s: s + Math.max(12, p.speed * 0.5), kind: 'pots', u, span: 1, motion: { type: 'static' }, warn: false, by: 'chomp' },
      ];
      tw.ch.animator.play('mischief', 1.2, 0.1, 0.3);
    }
    if (entities.tryPlace(specs)) {
      this.stats.ambushes++;
      events.push({ type: 'ambush', text });
    }
  }

  /* ---------------------------------------------------------- projectiles */

  private launch(r: Runner, spec: ObstacleSpec, dur: number) {
    const obj = makeObstacle(spec.kind);
    const from = new THREE.Vector3();
    r.ch.model.handSocket.getWorldPosition(from);
    obj.position.copy(from);
    this.root.add(obj);
    this.projectiles.push({ kind: spec.kind, obj, from, t: 0, dur, spec });
  }

  private updateProjectiles(dt: number, entities: Entities) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.t += dt;
      const u = clamp(pr.t / pr.dur, 0, 1);
      const f = this.track.frameAt(pr.spec.s, this.landF);
      const rail = railAtRank(f, pr.spec.u);
      f.railPoint(rail, tmpV).addScaledVector(f.up, RAIL_TOP);
      pr.obj.position.lerpVectors(pr.from, tmpV, u).addScaledVector(f.up, Math.sin(Math.PI * u) * 4.5);
      pr.obj.rotation.x += dt * 9;
      pr.obj.rotation.z += dt * 5;
      if (u >= 1) {
        this.root.remove(pr.obj);
        this.projectiles.splice(i, 1);
        // only becomes an obstacle if that keeps the row fair; otherwise it bounces away
        if (!entities.tryPlace([pr.spec])) entities.emitSparks(tmpV.clone(), 12);
      }
    }
  }
}
