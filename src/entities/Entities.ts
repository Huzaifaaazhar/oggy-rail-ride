import * as THREE from 'three';
import { PlayerController } from '../game/PlayerController';
import { difficultyFor, speedFor } from '../game/difficulty';
import { Track, TrackFrame } from '../track/Track';
import { F_CROSSING, F_NO_OBSTACLES, RAIL_TOP } from '../track/types';
import { clamp, makeRng, Rng, smootherstep } from '../util/math';
import { canvasTexture } from '../util/textures';
import { CATALOG, CoinSpec, ObstacleInfo, ObstacleKind, ObstacleSpec } from './catalog';
import { PatternPlanner, rowIsFair, TrackQuery, ZoneInfo } from './patterns';
import { bonusItem, coinEmblemGeometry, coinGeometry, hazardMarker, makeObstacle } from './prefabs';

export interface Obstacle {
  spec: ObstacleSpec;
  info: ObstacleInfo;
  kind: ObstacleKind;
  /** live position along the track and across it (rank units) */
  s: number;
  u: number;
  /** extra height (falling objects) */
  yOff: number;
  /** 0..1 progress of the triggered motion */
  prog: number;
  triggered: boolean;
  t: number;
  obj: THREE.Object3D;
  marker: THREE.Object3D | null;
  hit: boolean;
  passed: boolean;
  warned: boolean;
  flyT: number;
  flyVel: THREE.Vector3;
  spin: THREE.Vector3;
  /** collision currently active (doors half shut, tables landed…) */
  solid: boolean;
}

interface Coin extends CoinSpec {
  taken: boolean;
  t: number;
  pos: THREE.Vector3;
  mesh: THREE.Object3D | null;
}

export type EntityEvent =
  | { type: 'coin'; pos: THREE.Vector3 }
  | { type: 'bonus'; item: 'fish' | 'magnet' }
  | { type: 'hit'; kind: ObstacleKind; severity: 'crash' | 'stumble' }
  | { type: 'nearMiss'; dir: number }
  | { type: 'warn'; text: string };

const MAX_COINS = 600;
const RANKS = [-1, 0, 1];
const _order = [0, 1, 2];

/** Physical rank → lateral offset in the rolled rider plane (u = −1 left … +1 right, fractions between). */
export function rankLateral(f: TrackFrame, u: number, out: { x: number; y: number }) {
  _order[0] = 0;
  _order[1] = 1;
  _order[2] = 2;
  _order.sort((a, b) => f.lanes[a * 2] - f.lanes[b * 2]);
  const uu = clamp(u, -1.6, 1.6);
  const i0 = uu <= 0 ? 0 : 1;
  const t = uu <= 0 ? uu + 1 : uu;
  const a = _order[i0];
  const b = _order[i0 + 1];
  out.x = f.lanes[a * 2] + (f.lanes[b * 2] - f.lanes[a * 2]) * t;
  out.y = f.lanes[a * 2 + 1] + (f.lanes[b * 2 + 1] - f.lanes[a * 2 + 1]) * t;
  return out;
}

/** Rail index sitting at a physical rank. */
export function railAtRank(f: TrackFrame, rank: number) {
  const o = [0, 1, 2].sort((a, b) => f.lanes[a * 2] - f.lanes[b * 2]);
  return o[clamp(Math.round(rank), -1, 1) + 1];
}

/** Physical rank (−1..1) of a lateral offset. */
export function rankOf(f: TrackFrame, x: number) {
  const xs = [0, 1, 2].map((i) => f.lanes[i * 2]).sort((a, b) => a - b);
  if (x <= xs[1]) return -1 + clamp((x - xs[0]) / Math.max(0.01, xs[1] - xs[0]), -1, 1);
  return clamp((x - xs[1]) / Math.max(0.01, xs[2] - xs[1]), 0, 2);
}

const WARN_TEXT: Partial<Record<string, string>> = {
  drop: 'Falling furniture ahead',
  door: 'Door about to swing open',
  roll: 'Something is rolling your way',
  slide: 'Furniture on the move',
  cross: 'Runaway vacuum cleaner',
};

/**
 * Obstacles, coins and bonus items. Everything lives in track space
 * (distance s, rank u, height) and collision is swept over the distance the
 * rider covered this frame, so nothing is skipped at top speed.
 */
export class Entities {
  root = new THREE.Group();
  obstacles: Obstacle[] = [];
  coins: Coin[] = [];
  magnetT = 0;
  private cursor = 140;
  private rng: Rng;
  private planner: PatternPlanner;
  private f = new TrackFrame();
  private coinMesh: THREE.InstancedMesh;
  private emblemMesh: THREE.InstancedMesh;
  private sparks: THREE.Points;
  private sparkData: { pos: THREE.Vector3; vel: THREE.Vector3; life: number }[] = [];
  private nearMissCooldown = 0;
  private time = 0;
  private lat = { x: 0, y: 0 };
  query: TrackQuery;

  constructor(private track: Track, seed = 1) {
    this.rng = makeRng(seed ^ 0x5bd1e995);
    this.planner = new PatternPlanner(seed);
    this.query = { zone: (s0, s1) => this.zone(s0, s1) };
    const gold = new THREE.MeshPhysicalMaterial({ color: '#f5c542', metalness: 1, roughness: 0.22, emissive: '#7a4a00', emissiveIntensity: 0.35, clearcoat: 0.6 });
    const emblem = new THREE.MeshPhysicalMaterial({ color: '#ffe38a', metalness: 1, roughness: 0.15, emissive: '#8a5a00', emissiveIntensity: 0.4 });
    this.coinMesh = new THREE.InstancedMesh(coinGeometry(), gold, MAX_COINS);
    this.emblemMesh = new THREE.InstancedMesh(coinEmblemGeometry(), emblem, MAX_COINS);
    for (const m of [this.coinMesh, this.emblemMesh]) {
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      this.root.add(m);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 3), 3));
    const dot = canvasTexture('spark', 64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,230,150,0.9)');
      g.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ map: dot, color: '#ffffff', size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparks.frustumCulled = false;
    this.root.add(this.sparks);
  }

  reset(track: Track, seed: number) {
    this.track = track;
    this.rng = makeRng(seed ^ 0x5bd1e995);
    this.planner = new PatternPlanner(seed);
    for (const o of this.obstacles) {
      this.root.remove(o.obj);
      if (o.marker) this.root.remove(o.marker);
    }
    for (const c of this.coins) if (c.mesh) this.root.remove(c.mesh);
    this.obstacles = [];
    this.coins = [];
    this.cursor = 140;
    this.magnetT = 0;
  }

  /* ------------------------------------------------------------ context */

  zone(s0: number, s1: number): ZoneInfo {
    const z: ZoneInfo = { blocked: false, merged: false, hop: true, flat: true };
    const f = this.f;
    for (let s = s0; s <= s1 + 0.01; s += 3) {
      this.track.frameAt(s, f);
      if (f.flags & (F_NO_OBSTACLES | F_CROSSING)) z.blocked = true;
      const o = [0, 1, 2].sort((a, b) => f.lanes[a * 2] - f.lanes[b * 2]);
      if (Track.railDistance(f, o[0], o[1]) < 1.2 && Track.railDistance(f, o[1], o[2]) < 1.2) z.merged = true;
      if (!Track.canHop(f, o[0], o[1]) || !Track.canHop(f, o[1], o[2])) z.hop = false;
      if (Math.abs(f.lanes[1]) > 0.05 || Math.abs(f.lanes[3]) > 0.05 || Math.abs(f.lanes[5]) > 0.05) z.flat = false;
      if (Track.railDistance(f, o[0], o[1]) > 3.2) z.flat = false;
    }
    return z;
  }

  /** Lateral half-width an obstacle covers at s. */
  private halfWidth(spec: ObstacleSpec, f: TrackFrame) {
    const info = CATALOG[spec.kind];
    if (spec.span === 1) return info.halfW;
    const xs = [0, 1, 2].map((i) => f.lanes[i * 2]).sort((a, b) => a - b);
    const spacing = (xs[2] - xs[0]) / 2;
    return ((spec.span - 1) / 2) * spacing + info.halfW;
  }

  /** Obstacles near s as specs (for fairness checks). */
  private nearby(s: number, range = 8): ObstacleSpec[] {
    return this.obstacles.filter((o) => !o.hit && Math.abs(o.s - s) < range).map((o) => ({ ...o.spec, s: o.s, u: o.u }));
  }

  /** True when nothing (block or otherwise) occupies rank u near s. */
  isFree(s: number, rank: number, gap = 8) {
    return !this.obstacles.some((o) => !o.hit && Math.abs(o.s - s) < gap && Math.abs(o.u - rank) < (o.spec.span + 1) / 2);
  }

  /**
   * Place obstacles only if the track allows it and every affected row keeps
   * a passable rail. Used by the roaches' tricks.
   */
  tryPlace(specs: ObstacleSpec[]): boolean {
    for (const sp of specs) {
      const z = this.zone(sp.s - 20, sp.s + 4);
      if (z.blocked || z.merged) return false;
      if ((sp.span > 1 || CATALOG[sp.kind].cls === 'block') && (!z.hop || !z.flat)) return false;
      if (!rowIsFair([...this.nearby(sp.s), ...specs.filter((x) => Math.abs(x.s - sp.s) < 8)])) return false;
    }
    for (const sp of specs) this.spawn(sp);
    return true;
  }

  spawn(spec: ObstacleSpec): Obstacle {
    const f = this.track.frameAt(spec.s, this.f);
    const halfW = this.halfWidth(spec, f);
    const obj = makeObstacle(spec.kind, halfW);
    obj.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    if (['books', 'teapot', 'vase', 'plant', 'pots', 'box'].includes(spec.kind)) obj.userData.yaw = this.rng.range(-0.5, 0.5);
    this.root.add(obj);
    const o: Obstacle = {
      spec,
      info: CATALOG[spec.kind],
      kind: spec.kind,
      s: spec.s,
      u: spec.u,
      yOff: spec.motion.type === 'drop' ? spec.motion.height : 0,
      prog: 0,
      triggered: false,
      t: 0,
      obj,
      marker: null,
      hit: false,
      passed: false,
      warned: false,
      flyT: 0,
      flyVel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      solid: !['drop', 'door'].includes(spec.motion.type),
    };
    if (spec.warn) {
      o.marker = hazardMarker();
      this.root.add(o.marker);
    }
    this.obstacles.push(o);
    this.place(o);
    return o;
  }

  private addCoin(c: CoinSpec) {
    if (this.coins.length >= MAX_COINS - 1) return;
    const coin: Coin = { ...c, taken: false, t: 0, pos: new THREE.Vector3(), mesh: null };
    if (c.item) {
      coin.mesh = bonusItem(c.item);
      this.root.add(coin.mesh);
    }
    this.coins.push(coin);
  }

  private spawnAhead(until: number) {
    while (this.cursor < until) {
      const s = this.cursor;
      const d = difficultyFor(s);
      const row = this.planner.next(s, d, speedFor(s), this.query);
      for (const o of row.obstacles) this.spawn(o);
      for (const c of row.coins) this.addCoin(c);
      this.cursor += row.advance;
    }
  }

  /* ------------------------------------------------------------ motion */

  private tmpM = new THREE.Matrix4();
  private tmpX = new THREE.Vector3();
  private tmpV = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();
  private spinQ = new THREE.Quaternion();
  private yAxis = new THREE.Vector3(0, 1, 0);

  /** Position/orient an obstacle's mesh from its track-space state. */
  private place(o: Obstacle) {
    const f = this.track.frameAt(o.s, this.f);
    const sp = o.spec;
    rankLateral(f, o.u, this.lat);
    let x = this.lat.x;
    if (sp.motion.type === 'door') {
      // hinge stands beside the rail, on the side the door swings from
      x += sp.motion.side * (CATALOG.door.halfW + 0.15) * -1;
    }
    o.obj.position.copy(f.pos).addScaledVector(f.right, x).addScaledVector(f.up, this.lat.y + RAIL_TOP - 0.02 + o.yOff);
    this.tmpX.copy(f.right).negate();
    this.tmpM.makeBasis(this.tmpX, f.up, f.fwd);
    o.obj.quaternion.setFromRotationMatrix(this.tmpM);
    if (o.obj.userData.yaw) o.obj.rotateY(o.obj.userData.yaw as number);
    if (o.marker) {
      const mh = sp.motion.type === 'drop' ? 2.6 : (CATALOG[sp.kind].y1 + 0.9);
      o.marker.position.copy(f.pos).addScaledVector(f.right, this.lat.x).addScaledVector(f.up, this.lat.y + RAIL_TOP + Math.min(mh, 3.6));
    }
  }

  private animate(o: Obstacle, dt: number, p: PlayerController, events: EntityEvent[]) {
    const m = o.spec.motion;
    o.t += dt;
    const ahead = o.s - p.s;
    if (!o.triggered && 'trigger' in m && ahead < m.trigger) o.triggered = true;
    if (o.spec.warn && !o.warned && ahead < 80 && ahead > 0) {
      o.warned = true;
      const text = WARN_TEXT[m.type];
      if (text) events.push({ type: 'warn', text });
    }
    switch (m.type) {
      case 'roll':
        if (o.triggered) {
          o.s -= m.speed * dt;
          if (o.obj.userData.roll) o.obj.rotateX(-m.speed * dt / 0.44);
        }
        break;
      case 'slide':
        if (o.triggered) {
          o.prog = Math.min(1, o.prog + dt / m.dur);
          o.u = o.spec.u + (m.u1 - o.spec.u) * smootherstep(o.prog);
        }
        break;
      case 'drop':
        if (o.triggered && o.yOff > 0) {
          o.prog += dt;
          o.yOff = Math.max(0, m.height - 0.5 * 26 * o.prog * o.prog);
          if (o.yOff === 0) o.solid = true;
        }
        break;
      case 'door': {
        if (o.triggered) o.prog = Math.min(1, o.prog + dt / 0.45);
        o.solid = o.prog > 0.55;
        const panel = o.obj.userData.panel as THREE.Object3D | undefined;
        if (panel) {
          const closed = m.side > 0 ? 0 : Math.PI;
          panel.rotation.y = closed + (1 - smootherstep(o.prog)) * (Math.PI / 2) * (m.side > 0 ? -1 : 1);
        }
        break;
      }
      case 'swing': {
        const a = Math.sin((o.t * Math.PI * 2) / m.period);
        o.u = o.spec.u + m.amp * a;
        const pivot = o.obj.userData.swing as THREE.Object3D | undefined;
        if (pivot) pivot.rotation.z = -Math.asin(clamp((m.amp * 2.4 * a) / 7.6, -0.9, 0.9));
        break;
      }
      case 'cross': {
        const span = 2.6;
        const ph = (o.t * m.speed) % (span * 2);
        o.u = -1.3 + (ph < span ? ph : span * 2 - ph);
        break;
      }
      case 'spin': {
        const hub = o.obj.userData.spin as THREE.Object3D | undefined;
        if (hub) hub.rotation.y += dt * 7;
        break;
      }
    }
    if (m.type !== 'static' && m.type !== 'spin') this.place(o);
    else if (m.type === 'spin' && !o.obj.userData.placed) {
      o.obj.userData.placed = true;
      this.place(o);
    }
    if (o.marker) {
      const done = (m.type === 'drop' && o.yOff === 0) || (m.type === 'door' && o.prog >= 1) || (m.type === 'slide' && o.prog >= 1);
      o.marker.visible = !done && ahead > 2 && ahead < 110;
      const k = 1 + 0.15 * Math.sin(this.time * 10);
      o.marker.scale.set(1.1 * k, 1.1 * k, 1);
      if (m.type === 'drop' && !done) this.place(o);
    }
  }

  /* ------------------------------------------------------------ frame */

  update(dt: number, p: PlayerController, events: EntityEvent[], collide: boolean) {
    this.time += dt;
    this.nearMissCooldown -= dt;
    this.magnetT = Math.max(0, this.magnetT - dt);
    this.spawnAhead(p.s + 340);

    const behind = p.s - 30;
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      if (o.s < behind && o.flyT <= 0) {
        this.root.remove(o.obj);
        if (o.marker) this.root.remove(o.marker);
        this.obstacles.splice(i, 1);
      }
    }
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (c.s < behind || (c.taken && c.t > 0.4)) {
        if (c.mesh) this.root.remove(c.mesh);
        this.coins.splice(i, 1);
      }
    }

    const s0 = Math.min(p.prevS, p.s);
    const s1 = Math.max(p.prevS, p.s);
    for (const o of this.obstacles) {
      if (o.flyT > 0) {
        o.flyT -= dt;
        o.flyVel.y -= 20 * dt;
        o.obj.position.addScaledVector(o.flyVel, dt);
        o.obj.rotation.x += o.spin.x * dt;
        o.obj.rotation.z += o.spin.z * dt;
        if (o.flyT <= 0) o.obj.visible = false;
        continue;
      }
      this.animate(o, dt, p, events);
      if (!collide || o.hit || !o.solid) continue;
      const info = o.info;
      const r = info.halfLen + 0.35;
      if (o.s + r < s0 || o.s - r > s1) {
        // near-miss feedback when zipping past a block on the next rail
        if (!o.passed && o.s < p.s && info.cls === 'block' && this.nearMissCooldown <= 0 && p.speed > 24) {
          const f = this.track.frameAt(o.s, this.f);
          rankLateral(f, o.u, this.lat);
          const dx = this.lat.x - p.lateral.x;
          if (Math.abs(dx) < 3.4) {
            this.nearMissCooldown = 2;
            events.push({ type: 'nearMiss', dir: Math.sign(dx) || 1 });
          }
          o.passed = true;
        }
        continue;
      }
      const f = this.track.frameAt(o.s, this.f);
      rankLateral(f, o.u, this.lat);
      const halfW = this.halfWidth(o.spec, f);
      const dx = Math.abs(p.lateral.x - this.lat.x);
      const dy = Math.abs(p.lateral.y - this.lat.y);
      if (dx > halfW + 0.28 || dy > 0.9) continue;
      const bottom = p.height + p.hopArc;
      const top = bottom + p.bodyHeight;
      const y0 = info.y0 + o.yOff;
      const y1 = info.y1 + o.yOff;
      if (!(top > y0 + 0.05 && bottom < y1 - 0.08)) continue;
      if (p.invulnT > 0) continue;
      const head = dx < halfW - 0.12 && p.switchT >= 0.92;
      o.hit = true;
      events.push({ type: 'hit', kind: o.kind, severity: head ? 'crash' : 'stumble' });
      o.flyT = 1.2;
      o.flyVel.copy(p.frame.fwd).multiplyScalar(p.speed * 0.6).addScaledVector(p.frame.up, 7).addScaledVector(p.frame.right, this.rng.range(-4, 4));
      o.spin.set(this.rng.range(-8, 8), 0, this.rng.range(-8, 8));
      if (o.marker) o.marker.visible = false;
    }

    // coins and bonus items
    let n = 0;
    const midH = p.height + p.hopArc + p.bodyHeight * 0.5;
    for (const c of this.coins) {
      if (c.s > p.s + 200) continue;
      const f = this.track.frameAt(c.s, this.f);
      if (!c.taken) {
        rankLateral(f, c.u, this.lat);
        c.pos.copy(f.pos).addScaledVector(f.right, this.lat.x).addScaledVector(f.up, this.lat.y + RAIL_TOP + c.h);
        if (collide) {
          const inSweep = c.s >= s0 - 1.1 && c.s <= s1 + 1.1;
          const magnet = this.magnetT > 0 && c.s > p.s - 2 && c.s < p.s + 16 && Math.abs(p.lateral.x - this.lat.x) < 7 && !c.item;
          if (magnet || (inSweep && Math.abs(p.lateral.x - this.lat.x) < 0.95 && Math.abs(c.h - midH) < 1.35)) {
            c.taken = true;
            c.t = 0;
            if (c.item) {
              events.push({ type: 'bonus', item: c.item });
              if (c.item === 'magnet') this.magnetT = 10;
            } else events.push({ type: 'coin', pos: c.pos.clone() });
            this.emitSparks(c.pos, c.item ? 26 : 9);
          }
        }
      } else {
        c.t += dt;
        c.pos.lerp(this.tmpV.copy(p.position).addScaledVector(p.frame.up, 1.6), Math.min(1, dt * 14));
      }
      const scale = c.taken ? Math.max(0.01, 1 - c.t * 2.5) * 1.3 : 1;
      if (c.mesh) {
        c.mesh.position.copy(c.pos).addScaledVector(f.up, 0.2 * Math.sin(this.time * 3));
        c.mesh.quaternion.setFromRotationMatrix(this.tmpM.makeBasis(this.tmpX.copy(f.right).negate(), f.up, f.fwd));
        c.mesh.rotateY(this.time * 2.5);
        c.mesh.scale.setScalar(scale * 1.3);
        continue;
      }
      if (n >= MAX_COINS) continue;
      this.spinQ.setFromAxisAngle(this.yAxis, this.time * 3.2 + c.s * 0.3);
      this.tmpM.makeBasis(this.tmpX.copy(f.right).negate(), f.up, f.fwd);
      this.tmpQ.setFromRotationMatrix(this.tmpM).multiply(this.spinQ);
      this.tmpS.setScalar(scale);
      this.tmpM.compose(c.pos, this.tmpQ, this.tmpS);
      this.coinMesh.setMatrixAt(n, this.tmpM);
      this.emblemMesh.setMatrixAt(n, this.tmpM);
      n++;
    }
    this.coinMesh.count = n;
    this.emblemMesh.count = n;
    this.coinMesh.instanceMatrix.needsUpdate = true;
    this.emblemMesh.instanceMatrix.needsUpdate = true;
    this.updateSparks(dt);
  }

  emitSparks(p: THREE.Vector3, n = 9) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(this.rng.range(-1, 1), this.rng.range(0.2, 1.4), this.rng.range(-1, 1)).multiplyScalar(2.6);
      if (this.sparkData.length < 400) this.sparkData.push({ pos: p.clone(), vel: v, life: 0.5 + this.rng.range(0, 0.3) });
    }
  }

  private updateSparks(dt: number) {
    const attr = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = this.sparkData.length - 1; i >= 0; i--) {
      const sp = this.sparkData[i];
      sp.life -= dt;
      if (sp.life <= 0) {
        this.sparkData.splice(i, 1);
        continue;
      }
      sp.vel.y -= 9 * dt;
      sp.pos.addScaledVector(sp.vel, dt);
    }
    let k = 0;
    for (const sp of this.sparkData) attr.setXYZ(k++, sp.pos.x, sp.pos.y, sp.pos.z);
    this.sparks.geometry.setDrawRange(0, k);
    attr.needsUpdate = true;
  }

  /** Obstacle classes ahead on a physical rank (autopilot / roach avoidance). */
  threatsOnRank(fromS: number, toS: number, rank: number) {
    return this.obstacles.filter((o) => {
      if (o.hit || o.s < fromS || o.s > toS) return false;
      const half = (o.spec.span - 1) / 2 + 0.45;
      const uEnd = o.spec.motion.type === 'slide' ? o.spec.motion.u1 : o.u;
      return Math.abs(o.u - rank) < half || Math.abs(uEnd - rank) < half || o.spec.motion.type === 'cross';
    });
  }
}

export { RANKS };
