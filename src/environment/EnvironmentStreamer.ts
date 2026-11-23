import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Track, TrackFrame } from '../track/Track';
import { BALUSTRADE_DEPTH, F_STAIRS, F_SUSPENDED, Feature } from '../track/types';
import { makeRng, Rng } from '../util/math';
import { canvasTexture, woodGrain } from '../util/textures';
import * as P from './props';
import { SKY, Theme, THEME_ORDER, THEMES } from './themes';

export const ZONE_LEN = 320;

interface ZoneScan {
  minY: number;
  maxY: number;
  pts: number[]; // x,y,z triples (every 2 m)
  supports: { x: number; y: number; z: number }[];
  done: boolean;
}

interface Zone {
  index: number;
  theme: Theme;
  floorY: number;
  group: THREE.Group;
  floaters: { obj: THREE.Object3D; spin: number; bob: number; baseY: number }[];
  arch?: { z: number; bottom: number };
}

const supportMat = () => P.mat('#ffffff', 0.45, { map: woodGrain('post-wood', '#9a5b2c', '#6a3a18', '#b87a44') });

/**
 * Builds the house around the track one 320 m zone at a time (zones are cut
 * along −z, the track's main direction). Each zone gets a theme, a floor at a
 * safe depth beneath the lowest track point, walls with windows, themed giant
 * furniture placed with clearance against the track, support posts, spiral
 * staircase columns and a doorway arch into the next room.
 */
export class EnvironmentStreamer {
  root = new THREE.Group();
  private scans = new Map<number, ZoneScan>();
  private zones = new Map<number, Zone>();
  private scanned = 0;
  private pending: { k: number; it: Generator<void, void, void> } | null = null;
  private f = new TrackFrame();
  private seed: number;
  private postGeo = P.supportPostGeometry();
  private newelGeo = P.newelColumnGeometry();

  constructor(private track: Track) {
    this.root.name = 'environment';
    this.seed = track.seed;
  }

  zoneIndexAt(z: number) {
    return Math.max(0, Math.floor(-z / ZONE_LEN));
  }

  themeAt(z: number): Theme {
    return this.themeFor(this.zoneIndexAt(z));
  }

  themeFor(i: number): Theme {
    if (i === 0) return THEMES.hallway;
    const r = makeRng(this.seed + i * 7919);
    const prev = THEME_ORDER[(i - 1 + this.seed) % THEME_ORDER.length];
    let id = THEME_ORDER[(i + this.seed) % THEME_ORDER.length];
    if (id === prev || r.chance(0.3)) id = THEME_ORDER[(i * 5 + this.seed + 1) % THEME_ORDER.length];
    return THEMES[id];
  }

  /** Debug/test: every built zone's arch. */
  arches() {
    return [...this.zones.values()].filter((z) => z.arch).map((z) => ({ zone: z.index, ...z.arch! }));
  }

  zoneFloor(i: number) {
    return this.zones.get(i)?.floorY;
  }

  private scan() {
    const f = this.f;
    for (; this.scanned < this.track.count; this.scanned += 4) {
      this.track.readSample(this.scanned, f);
      const zi = this.zoneIndexAt(f.pos.z);
      // mark earlier zones done once the track is safely past them
      for (const [k, sc] of this.scans) if (!sc.done && f.pos.z < -(k + 1) * ZONE_LEN - 90) sc.done = true;
      for (let k = zi - 1; k <= zi + 1; k++) {
        if (k < 0) continue;
        const z0 = -k * ZONE_LEN;
        const z1 = -(k + 1) * ZONE_LEN;
        if (f.pos.z > z0 + 60 || f.pos.z < z1 - 60) continue;
        let sc = this.scans.get(k);
        if (!sc) {
          sc = { minY: Infinity, maxY: -Infinity, pts: [], supports: [], done: false };
          this.scans.set(k, sc);
        }
        if (sc.done) continue;
        sc.minY = Math.min(sc.minY, f.pos.y - (f.flags & F_STAIRS ? 8 : 4));
        sc.maxY = Math.max(sc.maxY, f.pos.y);
        if (this.scanned % 8 === 0) sc.pts.push(f.pos.x, f.pos.y, f.pos.z);
        if (k === zi && this.scanned % 48 === 0 && !(f.flags & F_SUSPENDED) && f.up.y > 0.85 && f.bal > 0.6) {
          const depth = f.flags & F_STAIRS ? BALUSTRADE_DEPTH + 0.35 + 4.5 : BALUSTRADE_DEPTH + 0.15;
          sc.supports.push({ x: f.pos.x, y: f.pos.y - depth, z: f.pos.z });
        }
      }
    }
  }

  /**
   * @param budgetMs time slice for incremental zone construction this frame
   *                 (Infinity builds synchronously, used at run start)
   */
  update(playerZ: number, budgetMs = 4) {
    this.scan();
    const cur = this.zoneIndexAt(playerZ);
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      if (!this.pending) {
        let next = -1;
        for (let k = Math.max(0, cur - 1); k <= cur + 2; k++) {
          const sc = this.scans.get(k);
          if (!this.zones.has(k) && sc && sc.done) {
            next = k;
            break;
          }
        }
        if (next < 0) break;
        this.pending = { k: next, it: this.buildZone(next, this.scans.get(next)!) };
      }
      if (this.pending.it.next().done) this.pending = null;
    }
    for (const [k, z] of this.zones) {
      if (k < cur - 1) {
        this.root.remove(z.group);
        z.group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.geometry && !(m.geometry.userData as { shared?: boolean }).shared) m.geometry.dispose();
        });
        this.zones.delete(k);
        this.scans.delete(k);
      }
    }
  }

  animate(t: number) {
    for (const z of this.zones.values())
      for (const fl of z.floaters) {
        fl.obj.rotation.y += fl.spin * 0.004;
        fl.obj.position.y = fl.baseY + Math.sin(t * 0.6 + fl.bob) * 1.5;
      }
  }

  clear() {
    for (const z of this.zones.values()) this.root.remove(z.group);
    this.zones.clear();
    this.scans.clear();
    this.scanned = 0;
  }

  /* ------------------------------------------------------------ building */

  private *buildZone(k: number, sc: ZoneScan): Generator<void, void, void> {
    const theme = this.themeFor(k);
    const rng = makeRng(this.seed * 31 + k * 977);
    const prevFloor = this.zones.get(k - 1)?.floorY;
    let floorY = sc.minY - 22;
    if (prevFloor !== undefined && Math.abs(prevFloor - floorY) < 6) floorY = prevFloor; // avoid tiny steps
    const z0 = -k * ZONE_LEN;
    const z1 = -(k + 1) * ZONE_LEN;
    const zc = (z0 + z1) / 2;
    const W = theme.wallHalf;
    const group = new THREE.Group();
    group.name = `zone-${k}-${theme.id}`;
    const statics = new THREE.Group();
    const zone: Zone = { index: k, theme, floorY, group, floaters: [] };
    const absurd = Math.min(1, k / 6);

    const clearOf = (x: number, z: number, yTop: number, radius: number, yBottom = floorY) => {
      for (let i = 0; i < sc.pts.length; i += 3) {
        const dx = sc.pts[i] - x;
        const dz = sc.pts[i + 2] - z;
        if (Math.abs(dx) > radius + 14 || Math.abs(dz) > radius + 14) continue;
        const ty = sc.pts[i + 1];
        if (Math.hypot(dx, dz) < radius + 11 && ty - 12 < yTop && ty + 14 > yBottom) return false;
      }
      return true;
    };
    const place = (obj: THREE.Object3D, x: number, z: number, ry: number, y = floorY) => {
      obj.position.set(x, y, z);
      obj.rotation.y = ry;
      statics.add(obj);
      return obj;
    };

    // floor slab
    const floorMat = theme.floor();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 8, 10, ZONE_LEN + 2), [P.mat(theme.ground, 0.9), P.mat(theme.ground, 0.9), floorMat, P.mat(theme.ground, 0.9), P.mat(theme.ground, 0.9), P.mat(theme.ground, 0.9)]);
    slab.position.set(0, floorY - 5, zc);
    slab.receiveShadow = true;
    group.add(slab);

    // walls
    const wallH = 260;
    const wallMat = theme.wall();
    for (const sx of [-1, 1]) {
      if (theme.id === 'balcony' && sx === 1) continue;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(4, wallH, ZONE_LEN + 2), wallMat);
      wall.position.set(sx * (W + 2), floorY + wallH / 2, zc);
      group.add(wall);
      P.box(statics, 1.2, 12, ZONE_LEN + 2, P.mat(theme.wainscot, 0.55), sx * (W - 0.4), floorY, zc);
      P.box(statics, 2, 1.2, ZONE_LEN + 2, P.mat('#fbf6ec', 0.5), sx * (W - 0.8), floorY + 12, zc);
      // windows + light shafts
      for (let wz = z0 - 40; wz > z1 + 30; wz -= 80 + rng.range(0, 30)) {
        const win = P.windowUnit(24, 40, SKY(), theme.curtain);
        place(win, sx * (W - 1.5), wz, -sx * Math.PI / 2, floorY + 22);
        this.addShaft(group, sx * (W - 2), floorY + 42, wz, sx);
        yield;
      }
    }
    if (theme.id === 'balcony') {
      const rail = P.stoneRailing(ZONE_LEN);
      place(rail, W - 2, zc, Math.PI / 2);
      for (let i = 0; i < 5; i++) {
        const c = P.cloud(k * 10 + i);
        c.position.set(W + 120 + rng.range(0, 160), floorY + rng.range(-10, 120), zc + rng.range(-150, 150));
        group.add(c);
      }
      const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1400, 600), new THREE.MeshBasicMaterial({ map: SKY(), fog: false }));
      backdrop.position.set(W + 500, floorY + 120, zc);
      backdrop.rotation.y = -Math.PI / 2;
      group.add(backdrop);
    }

    // wall decorations + furniture along both sides
    const sides = theme.id === 'balcony' ? [-1] : [-1, 1];
    for (const sx of sides) {
      let z = z0 - rng.range(8, 30);
      while (z > z1 + 20) {
        const used = this.furnish(theme, rng, statics, sx, W, z, floorY, place, clearOf);
        z -= used + rng.range(6, 18);
        yield;
      }
      // portraits high on the wall
      for (let pz = z0 - 20; pz > z1 + 20; pz -= rng.range(45, 70)) {
        if (theme.id === 'garden') break;
        const pf = P.pictureFrame(rng.range(12, 18), rng.range(14, 22), Math.floor(rng.range(0, 100)));
        place(pf, sx * (W - 1), pz, -sx * Math.PI / 2, floorY + 58 + rng.range(0, 20));
      }
    }

    // centre-floor props underneath the track where there is room
    for (let i = 0; i < 10; i++) {
      const x = rng.range(-W + 30, W - 30);
      const z = rng.range(z1 + 20, z0 - 20);
      const prop = this.centerProp(theme, rng);
      if (!prop) continue;
      const bb = new THREE.Box3().setFromObject(prop);
      const r = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2;
      if (!clearOf(x, z, floorY + bb.max.y, r)) continue;
      place(prop, x, z, rng.range(0, Math.PI * 2));
      yield;
    }

    // chandeliers hanging out of the fog
    for (let i = 0; i < 4; i++) {
      const x = rng.sign() * rng.range(W - 30, W - 14);
      const z = rng.range(z1 + 20, z0 - 20);
      const y = Math.max(floorY + 60, sc.maxY + 10 + rng.range(0, 30));
      if (!clearOf(x, z, y + 40, 8, y - 2)) continue;
      const ch = P.chandelier();
      ch.position.set(x, y, z);
      group.add(ch);
    }

    // the house gets sillier the higher you climb: floating furniture
    const floaters = Math.round(absurd * 7);
    for (let i = 0; i < floaters; i++) {
      const prop = rng.pick([() => P.armchair(rng.pick(['#e76f51', '#2a9d8f', '#e9c46a'])), () => P.chair(), () => P.grandfatherClock(), () => P.sideTable(true), () => P.pottedPlant(i, 1.4), () => P.globe()])();
      const x = rng.range(-W + 20, W - 20);
      const z = rng.range(z1 + 20, z0 - 20);
      const y = rng.range(sc.minY, sc.maxY + 40);
      if (!clearOf(x, z, y + 25, 12, y - 12)) continue;
      prop.position.set(x, y, z);
      prop.rotation.set(rng.range(-0.6, 0.6), rng.range(0, 6), rng.range(-0.6, 0.6));
      group.add(prop);
      zone.floaters.push({ obj: prop, spin: rng.range(-1, 1), bob: rng.range(0, 6), baseY: y });
      yield;
    }

    // track support posts
    if (sc.supports.length) {
      const inst = new THREE.InstancedMesh(this.postGeo, supportMat(), sc.supports.length);
      const m = new THREE.Matrix4();
      let n = 0;
      for (const s of sc.supports) {
        const h = s.y - floorY;
        if (h < 2) continue;
        // never pass a post through another (lower) part of the track
        let blocked = false;
        for (let i = 0; i < sc.pts.length && !blocked; i += 3) {
          const ty = sc.pts[i + 1];
          if (ty > s.y - 4 || ty < floorY) continue;
          if (Math.hypot(sc.pts[i] - s.x, sc.pts[i + 2] - s.z) < 9) blocked = true;
        }
        if (blocked) continue;
        m.makeScale(1, h, 1).setPosition(s.x, floorY, s.z);
        inst.setMatrixAt(n++, m);
      }
      inst.count = n;
      inst.computeBoundingSphere();
      inst.receiveShadow = true;
      group.add(inst);
    }

    // spiral-staircase newel columns
    for (const feat of this.track.features) this.addColumn(group, feat, z0, z1, floorY, sc);

    // doorway arch into the next room
    zone.arch = this.addArch(statics, sc, z1, floorY, W, rng);

    yield* this.bake(statics, group);
    this.root.add(group);
    this.zones.set(k, zone);
  }

  private furnish(
    theme: Theme,
    rng: Rng,
    parent: THREE.Group,
    sx: number,
    W: number,
    z: number,
    floorY: number,
    place: (o: THREE.Object3D, x: number, z: number, ry: number, y?: number) => THREE.Object3D,
    clearOf: (x: number, z: number, yTop: number, r: number) => boolean,
  ): number {
    const face = -sx * Math.PI / 2; // facing into the room
    const x = (off: number) => sx * (W - off);
    const ok = (off: number, depth: number, h: number) => clearOf(x(off), z, floorY + h, depth);
    void parent;
    switch (theme.id) {
      case 'hallway': {
        const pick = rng.int(0, 3);
        if (pick === 0 && ok(4, 6, 26)) place(P.grandfatherClock(), x(4), z, face);
        else if (pick === 1) place(P.door(14, 30, rng.pick(['#7b3f2a', '#2f5d50', '#3b4f7a'])), x(0.6), z, face);
        else if (ok(5, 6, 12)) place(P.sideTable(rng.chance(0.5)), x(5), z, face);
        return 20;
      }
      case 'living': {
        const pick = rng.int(0, 4);
        if (pick === 0 && ok(6, 10, 8)) place(P.sofa(rng.pick(['#c75146', '#3d7ea6', '#6a994e', '#d4a373'])), x(6), z, face);
        else if (pick === 1 && ok(3, 10, 16)) place(P.fireplace(), x(2), z, face);
        else if (pick === 2 && ok(4, 8, 40)) place(P.bookshelf(16, 40, rng.int(0, 999)), x(2.5), z, face);
        else if (pick === 3 && ok(5, 4, 20)) place(P.floorLamp(), x(5), z, 0);
        else if (ok(6, 6, 8)) place(P.armchair(rng.pick(['#e76f51', '#2a9d8f', '#e9c46a'])), x(6), z, face + rng.range(-0.4, 0.4));
        return 22;
      }
      case 'kitchen': {
        const pick = rng.int(0, 3);
        if (pick === 0 && ok(5, 10, 8)) place(P.counter(rng.range(18, 28)), x(3), z, face);
        else if (pick === 1 && ok(4, 6, 18)) place(P.fridge(), x(4), z, face);
        else if (pick === 2 && ok(4, 6, 10)) place(P.stove(), x(3.5), z, face);
        else if (ok(14, 14, 10)) place(P.diningTable(true), x(14), z, rng.range(0, 3));
        return 24;
      }
      case 'garden': {
        const pick = rng.int(0, 3);
        if (pick === 0 && ok(10, 10, 36)) place(P.tree(rng.int(0, 999)), x(10), z, 0);
        else if (pick === 1 && ok(8, 10, 8)) place(P.flowerBed(10, 18, rng.int(0, 999)), x(8), z, 0);
        else if (ok(5, 4, 14)) place(P.pottedPlant(rng.int(0, 999), rng.range(1, 1.6)), x(5), z, 0);
        return 20;
      }
      case 'library': {
        if (ok(4, 10, 60)) place(P.bookshelf(26, rng.range(44, 70), rng.int(0, 999)), x(2.5), z, face);
        return 28;
      }
      case 'balcony': {
        if (rng.chance(0.6) && ok(5, 6, 16)) place(P.pottedPlant(rng.int(0, 999), 1.5), x(5), z, 0);
        else if (ok(8, 8, 10)) place(P.armchair('#3d7ea6'), x(8), z, face);
        return 24;
      }
    }
  }

  private centerProp(theme: Theme, rng: Rng): THREE.Object3D | null {
    switch (theme.id) {
      case 'hallway':
        return P.rug(rng.range(30, 50), rng.range(40, 90), rng.int(0, 2));
      case 'living':
        return rng.pick([() => P.rug(50, 40, rng.int(0, 2)), () => P.coffeeTable(), () => P.armchair('#e9c46a'), () => P.sofa('#3d7ea6')])();
      case 'kitchen':
        return rng.pick([() => P.diningTable(true), () => P.chair()])();
      case 'garden':
        return rng.pick([() => P.fountain(), () => P.tree(rng.int(0, 99)), () => P.flowerBed(14, 14, rng.int(0, 99)), () => P.pottedPlant(rng.int(0, 99), 1.8)])();
      case 'library':
        return rng.pick([() => P.globe(), () => P.armchair('#8e3b46'), () => P.rug(40, 40, 2)])();
      case 'balcony':
        return rng.pick([() => P.pottedPlant(rng.int(0, 99), 1.6), () => P.fountain()])();
    }
  }

  private addShaft(group: THREE.Group, x: number, y: number, z: number, sx: number) {
    const tex = canvasTexture('shaft', 64, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,240,200,0.9)');
      g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(22, 110), mat);
    plane.position.set(x - sx * 30, y - 30, z);
    plane.rotation.set(0, Math.PI / 2, sx * 0.95);
    group.add(plane);
  }

  private addColumn(group: THREE.Group, f: Feature, z0: number, z1: number, floorY: number, sc: ZoneScan) {
    if (f.z > z0 || f.z <= z1) return;
    // stop below any other stretch of track that passes over the column
    let top = f.yTop - 8;
    for (let i = 0; i < sc.pts.length; i += 3) {
      if (Math.hypot(sc.pts[i] - f.x, sc.pts[i + 2] - f.z) < f.radius + 5) top = Math.min(top, sc.pts[i + 1] - 12);
    }
    const h = top - floorY;
    if (h < 10) return;
    const col = new THREE.Mesh(this.newelGeo, P.mat('#ffffff', 0.5, { map: woodGrain('newel', '#a0612f', '#6a3a18', '#c48348') }));
    col.scale.set(f.radius, h, f.radius);
    col.position.set(f.x, floorY, f.z);
    col.receiveShadow = true;
    group.add(col);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(f.radius * 0.55, 32, 24), P.mat('#d4a24c', 0.25, { metalness: 0.9 }));
    ball.position.set(f.x, top + f.radius * 0.5, f.z);
    group.add(ball);
  }

  private addArch(parent: THREE.Group, sc: ZoneScan, z: number, floorY: number, W: number, rng: Rng) {
    let maxY = -Infinity;
    for (let i = 0; i < sc.pts.length; i += 3) if (Math.abs(sc.pts[i + 2] - z) < 40) maxY = Math.max(maxY, sc.pts[i + 1]);
    if (!isFinite(maxY)) return undefined;
    const top = maxY + 22 + rng.range(0, 10);
    const stone = P.mat('#f3ead8', 0.6);
    const trim = P.mat('#c9a24a', 0.35, { metalness: 0.6 });
    for (const sx of [-1, 1]) {
      P.box(parent, 12, top - floorY, 12, stone, sx * (W - 8), floorY, z);
      P.box(parent, 15, 3, 15, trim, sx * (W - 8), floorY, z);
      P.box(parent, 15, 3, 15, trim, sx * (W - 8), top - 3, z);
    }
    P.box(parent, W * 2, 10, 10, stone, 0, top, z);
    P.box(parent, W * 2 + 4, 2, 12, trim, 0, top + 10, z);
    // keystone
    P.box(parent, 8, 12, 12, trim, 0, top - 2, z);
    return { z, bottom: top - 2 };
  }

  /** Merge static meshes per material: hundreds of props → a few draw calls. */
  private *bake(statics: THREE.Group, into: THREE.Group): Generator<void, void, void> {
    statics.updateMatrixWorld(true);
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const meshes: THREE.Mesh[] = [];
    statics.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !Array.isArray(m.material)) meshes.push(m);
    });
    let n = 0;
    for (const m of meshes) {
      if (++n % 40 === 0) yield;
      let g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      if (!g.index) {
        const n = g.getAttribute('position').count;
        const idx = new Uint32Array(n);
        for (let i = 0; i < n; i++) idx[i] = i;
        g.setIndex(new THREE.BufferAttribute(idx, 1));
      }
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      g = g.index && g.index.array instanceof Uint16Array ? (g.setIndex(new THREE.BufferAttribute(new Uint32Array(g.index.array), 1)), g) : g;
      const list = buckets.get(m.material as THREE.Material) ?? [];
      list.push(g);
      buckets.set(m.material as THREE.Material, list);
    }
    for (const [material, geos] of buckets) {
      yield;
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.receiveShadow = true;
      into.add(mesh);
    }
  }
}
