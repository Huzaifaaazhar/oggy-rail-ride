import * as THREE from 'three';
import { PlayerController } from '../game/PlayerController';
import { Track, TrackFrame } from '../track/Track';
import { F_NO_OBSTACLES, RAIL_TOP } from '../track/types';
import { clamp, makeRng, Rng } from '../util/math';
import { canvasTexture } from '../util/textures';
import { coinEmblemGeometry, coinGeometry, makeObstacle, ObstacleKind, OBSTACLES } from './prefabs';

export interface Obstacle {
  s: number;
  rail: number;
  kind: ObstacleKind;
  obj: THREE.Object3D;
  hit: boolean;
  flyT: number;
  flyVel: THREE.Vector3;
  spin: THREE.Vector3;
  /** spans every rail (merged sections) */
  wide: boolean;
  passed: boolean;
}

interface Coin {
  s: number;
  rail: number;
  h: number;
  taken: boolean;
  t: number;
  pos: THREE.Vector3;
  up: THREE.Vector3;
}

export type EntityEvent =
  | { type: 'coin'; pos: THREE.Vector3 }
  | { type: 'hit'; kind: ObstacleKind }
  | { type: 'nearMiss'; dir: number };

const MAX_COINS = 500;
const LOW: ObstacleKind[] = ['books', 'yarn', 'can'];
const BLOCK: ObstacleKind[] = ['teapot', 'vase'];

/**
 * Obstacles and coins live in track space (s, rail, height). Collision is a
 * cheap interval test in that space — the same coordinates the rider moves in —
 * so it is exact through loops and corkscrews.
 */
export class Entities {
  root = new THREE.Group();
  obstacles: Obstacle[] = [];
  coins: Coin[] = [];
  private cursor = 140;
  private rng: Rng;
  private f = new TrackFrame();
  private coinMesh: THREE.InstancedMesh;
  private emblemMesh: THREE.InstancedMesh;
  private sparks: THREE.Points;
  private sparkData: { pos: THREE.Vector3; vel: THREE.Vector3; life: number }[] = [];
  private nearMissCooldown = 0;
  private time = 0;

  constructor(private track: Track, seed = 1) {
    this.rng = makeRng(seed ^ 0x5bd1e995);
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
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(300 * 3), 3));
    const dot = canvasTexture('spark', 64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,230,150,0.9)');
      g.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ map: dot, color: '#ffffff', size: 0.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparks.frustumCulled = false;
    this.root.add(this.sparks);
  }

  reset(track: Track, seed: number) {
    this.track = track;
    this.rng = makeRng(seed ^ 0x5bd1e995);
    for (const o of this.obstacles) this.root.remove(o.obj);
    this.obstacles = [];
    this.coins = [];
    this.cursor = 140;
  }

  private difficulty(s: number) {
    return clamp(s / 3000, 0, 1);
  }

  /** Can a rider hop between every pair of neighbouring rails over [s0, s1]? */
  private hopZone(s0: number, s1: number) {
    const order = [0, 1, 2];
    for (let s = s0; s <= s1; s += 4) {
      const f = this.track.frameAt(s, this.f);
      if (f.flags & F_NO_OBSTACLES) return false;
      order.sort((a, b) => f.lanes[a * 2] - f.lanes[b * 2]);
      if (!Track.canHop(f, order[0], order[1]) || !Track.canHop(f, order[1], order[2])) return false;
    }
    return true;
  }

  private clear(s0: number, s1: number) {
    for (let s = s0; s <= s1; s += 3) {
      this.track.frameAt(s, this.f);
      if (this.f.flags & F_NO_OBSTACLES) return false;
    }
    return true;
  }

  /** Is the rail at s free of obstacles within ±gap? */
  isFree(s: number, rail: number, gap = 8) {
    return !this.obstacles.some((o) => Math.abs(o.s - s) < gap && (o.rail === rail || o.wide));
  }

  addObstacle(s: number, rail: number, kind: ObstacleKind, wide = false): Obstacle {
    const f = this.track.frameAt(s, this.f);
    let width = 1.1;
    let px = f.lanes[rail * 2];
    let py = f.lanes[rail * 2 + 1];
    if (wide) {
      let minX = Infinity;
      let maxX = -Infinity;
      for (let i = 0; i < 3; i++) {
        minX = Math.min(minX, f.lanes[i * 2]);
        maxX = Math.max(maxX, f.lanes[i * 2]);
      }
      width = (maxX - minX) / 2 + 0.9;
      px = (minX + maxX) / 2;
      py = 0;
    }
    const obj = makeObstacle(kind, width);
    const pos = f.offsetPoint(px, py + RAIL_TOP - 0.02, new THREE.Vector3());
    const m = new THREE.Matrix4().makeBasis(f.right.clone().negate(), f.up, f.fwd);
    obj.quaternion.setFromRotationMatrix(m);
    if (kind === 'books' || kind === 'teapot' || kind === 'vase') obj.rotateY(this.rng.range(-0.6, 0.6) + (kind === 'teapot' ? Math.PI / 2 : 0));
    obj.position.copy(pos);
    this.root.add(obj);
    const o: Obstacle = { s, rail, kind, obj, hit: false, flyT: 0, flyVel: new THREE.Vector3(), spin: new THREE.Vector3(), wide, passed: false };
    this.obstacles.push(o);
    return o;
  }

  private addCoin(s: number, rail: number, h: number) {
    if (this.coins.length >= MAX_COINS - 1) return;
    this.coins.push({ s, rail, h, taken: false, t: 0, pos: new THREE.Vector3(), up: new THREE.Vector3() });
  }

  private coinLine(s0: number, rail: number, n: number, spacing = 2.6, arc?: { s: number; h: number }) {
    for (let k = 0; k < n; k++) {
      const s = s0 + k * spacing;
      let h = 0.75;
      if (arc) {
        const u = (s - arc.s) / 7;
        h += Math.max(0, arc.h * (1 - u * u));
      }
      this.addCoin(s, rail, h);
    }
  }

  /** Lay out obstacle rows and coin trails ahead of the player. */
  private spawnAhead(until: number) {
    const r = this.rng;
    while (this.cursor < until) {
      const s = this.cursor;
      const d = this.difficulty(s);
      this.track.frameAt(s, this.f);
      const f = this.f;
      const piece = this.track.pieceAt(s);
      if (f.flags & F_NO_OBSTACLES || !this.clear(s - 6, s + 6)) {
        // free-ride section: a golden trail along the physically middle rail
        const mid = [0, 1, 2].sort((a, b) => f.lanes[a * 2] - f.lanes[b * 2])[1];
        if (r.chance(0.5)) this.coinLine(s, mid, 6, 3.2);
        this.cursor += 22;
        continue;
      }
      const light = piece?.obstacles === 'light';
      if (light && r.chance(0.45)) {
        this.coinLine(s, r.int(0, 2), 7, 2.6);
        this.cursor += 30;
        continue;
      }
      const merged = Track.railDistance(f, 0, 1) < 1.2;
      const hop = !merged && this.hopZone(s - 24, s + 4);
      const kinds: (ObstacleKind | null)[] = [null, null, null];
      if (merged) {
        const k: ObstacleKind = r.chance(0.55) ? r.pick(LOW) : 'laundry';
        this.addObstacle(s, 1, k, true);
        if (k !== 'laundry') this.coinLine(s - 7, 1, 6, 2.4, { s, h: 1.5 });
        else this.coinLine(s - 8, 1, 5, 2.4);
      } else if (hop) {
        const blocked = r.chance(0.35 + d * 0.35) ? 2 : 1;
        const rails = [0, 1, 2].sort(() => r.next() - 0.5).slice(0, blocked);
        for (const rail of rails) {
          const roll = r.next();
          kinds[rail] = roll < 0.45 ? r.pick(BLOCK) : roll < 0.75 ? r.pick(LOW) : 'laundry';
        }
        // guarantee at least one rail without a full block
        if (kinds.every((k) => k && OBSTACLES[k].cls === 'block')) kinds[rails[0]] = r.pick(LOW);
        kinds.forEach((k, rail) => k && this.addObstacle(s, rail, k));
        const freeRail = kinds.findIndex((k) => !k);
        if (freeRail >= 0 && r.chance(0.75)) this.coinLine(s - 10, freeRail, 8, 2.5);
        else {
          const lowRail = kinds.findIndex((k) => k && OBSTACLES[k].cls === 'low');
          if (lowRail >= 0) this.coinLine(s - 7, lowRail, 6, 2.4, { s, h: 1.6 });
        }
      } else {
        // rails too far apart to hop: only jumpable/slidable things
        for (let rail = 0; rail < 3; rail++) {
          if (r.chance(0.55)) kinds[rail] = r.chance(0.6) ? r.pick(LOW) : 'laundry';
        }
        kinds.forEach((k, rail) => k && this.addObstacle(s, rail, k));
        const rail = r.int(0, 2);
        if (!kinds[rail]) this.coinLine(s - 8, rail, 6, 2.6);
      }
      this.cursor += 52 - d * 20 + r.range(0, 14);
    }
  }

  private emitSparks(p: THREE.Vector3, n = 9) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(this.rng.range(-1, 1), this.rng.range(0.2, 1.4), this.rng.range(-1, 1)).multiplyScalar(2.6);
      if (this.sparkData.length < 300) this.sparkData.push({ pos: p.clone(), vel: v, life: 0.5 + this.rng.range(0, 0.3) });
    }
  }

  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();
  private tmpV = new THREE.Vector3();
  private spinQ = new THREE.Quaternion();
  private yAxis = new THREE.Vector3(0, 1, 0);

  update(dt: number, p: PlayerController, events: EntityEvent[], collide: boolean) {
    this.time += dt;
    this.nearMissCooldown -= dt;
    this.spawnAhead(p.s + 320);

    // despawn behind
    const behind = p.s - 30;
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      if (o.s < behind && o.flyT <= 0) {
        this.root.remove(o.obj);
        this.obstacles.splice(i, 1);
      }
    }
    this.coins = this.coins.filter((c) => c.s > behind && !(c.taken && c.t > 0.4));

    // obstacles: collision + knocked-away animation
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
      const ds = o.s - p.s;
      const info = OBSTACLES[o.kind];
      if (!collide || o.hit) continue;
      if (Math.abs(ds) < info.halfLen + 0.35) {
        const lateral = Math.hypot(
          p.lateral.x - p.frame.lanes[o.rail * 2],
          p.lateral.y - p.frame.lanes[o.rail * 2 + 1],
        );
        const sameRail = o.wide || lateral < 0.85;
        const bottom = p.height + p.hopArc;
        const top = bottom + p.bodyHeight;
        if (sameRail && top > info.y0 + 0.05 && bottom < info.y1 - 0.08) {
          if (p.invulnT <= 0) {
            o.hit = true;
            events.push({ type: 'hit', kind: o.kind });
            o.flyT = 1.2;
            o.flyVel.copy(p.frame.fwd).multiplyScalar(p.speed * 0.6).addScaledVector(p.frame.up, 7).addScaledVector(p.frame.right, this.rng.range(-4, 4));
            o.spin.set(this.rng.range(-8, 8), 0, this.rng.range(-8, 8));
          }
        } else if (!o.passed && ds < 0 && !sameRail && lateral < 3.2 && this.nearMissCooldown <= 0 && p.speed > 24 && info.cls === 'block') {
          o.passed = true;
          this.nearMissCooldown = 2;
          const dir = Math.sign(p.frame.lanes[o.rail * 2] - p.lateral.x) || 1;
          events.push({ type: 'nearMiss', dir });
        }
      }
    }

    // coins
    let n = 0;
    const camQ = this.tmpQ;
    for (const c of this.coins) {
      if (c.s > p.s + 200) continue;
      const f = this.track.frameAt(c.s, this.f);
      if (!c.taken) {
        f.railPoint(c.rail, c.pos).addScaledVector(f.up, RAIL_TOP + c.h);
        c.up.copy(f.up);
        if (collide && Math.abs(c.s - p.s) < 1.1) {
          const lateral = Math.hypot(p.lateral.x - f.lanes[c.rail * 2], p.lateral.y - f.lanes[c.rail * 2 + 1]);
          const mid = p.height + p.hopArc + p.bodyHeight * 0.5;
          if (lateral < 0.95 && Math.abs(c.h - mid) < 1.35) {
            c.taken = true;
            c.t = 0;
            events.push({ type: 'coin', pos: c.pos.clone() });
            this.emitSparks(c.pos);
          }
        }
      } else {
        c.t += dt;
        // pop toward the rider then vanish
        c.pos.lerp(this.tmpV.copy(p.position).addScaledVector(p.frame.up, 1.6), Math.min(1, dt * 14));
      }
      if (n >= MAX_COINS) break;
      const scale = c.taken ? Math.max(0.01, 1 - c.t * 2.5) * 1.3 : 1;
      this.spinQ.setFromAxisAngle(this.yAxis, this.time * 3.2 + c.s * 0.3);
      // orient: coin face along forward, spinning about local up
      this.tmpM.makeBasis(f.right.clone().negate(), f.up, f.fwd);
      camQ.setFromRotationMatrix(this.tmpM).multiply(this.spinQ);
      this.tmpS.setScalar(scale);
      this.tmpM.compose(c.pos, camQ, this.tmpS);
      this.coinMesh.setMatrixAt(n, this.tmpM);
      this.emblemMesh.setMatrixAt(n, this.tmpM);
      n++;
    }
    this.coinMesh.count = n;
    this.emblemMesh.count = n;
    this.coinMesh.instanceMatrix.needsUpdate = true;
    this.emblemMesh.instanceMatrix.needsUpdate = true;

    // sparks
    const attr = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
    let k = 0;
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
    for (const sp of this.sparkData) attr.setXYZ(k++, sp.pos.x, sp.pos.y, sp.pos.z);
    this.sparks.geometry.setDrawRange(0, k);
    attr.needsUpdate = true;
  }
}
