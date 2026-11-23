import * as THREE from 'three';
import { CatCharacter } from '../characters/CatCharacter';
import { Entities, EntityEvent } from '../entities/Entities';
import { EnvironmentStreamer } from '../environment/EnvironmentStreamer';
import { RoachSquad, SquadEvent } from './RoachSquad';
import { Track } from '../track/Track';
import { CHUNK_LENGTH, GeomKind } from '../track/types';
import { clamp, wrapAngle } from '../util/math';
import { Autopilot } from './Autopilot';
import { ChaseCamera } from './ChaseCamera';
import { Input } from './Input';
import { PlayerController, PlayerEvent } from './PlayerController';
import { saveBest, useHud } from './store';
import { TrackStreamer } from './World';

export interface GameOptions {
  seed?: number;
  forced?: GeomKind[];
  autopilot?: boolean;
}

/**
 * Owns every runtime system and advances them in a fixed order each frame.
 * React only mounts `root` and forwards the frame callback.
 */
export class Game {
  root = new THREE.Group();
  track!: Track;
  streamer!: TrackStreamer;
  player = new PlayerController();
  cat = new CatCharacter();
  camera = new ChaseCamera();
  input: Input;
  entities!: Entities;
  env!: EnvironmentStreamer;
  scene?: THREE.Scene;
  hemi?: THREE.HemisphereLight;
  private fogColor = new THREE.Color('#e8c79a');
  squad!: RoachSquad;
  coins = 0;
  private entityEvents: EntityEvent[] = [];
  private squadEvents: SquadEvent[] = [];
  sun?: THREE.DirectionalLight;
  opts: GameOptions;
  private events: PlayerEvent[] = [];
  private hudTimer = 0;
  private prevHeading = 0;
  private lean = 0;
  private overTimer = 0;
  time = 0;

  constructor(opts: GameOptions = {}) {
    this.opts = opts;
    if (opts.autopilot) this.autopilot = new Autopilot();
    this.input = new Input(window);
    this.root.add(this.cat.root);
    this.newRun(opts.seed);
  }

  newRun(seed?: number) {
    if (this.streamer) {
      this.streamer.clear();
      this.root.remove(this.streamer.root);
    }
    this.track = new Track({ seed, forced: this.opts.forced });
    if (!this.entities) {
      this.entities = new Entities(this.track, this.track.seed);
      this.squad = new RoachSquad(this.track, this.track.seed);
      this.root.add(this.entities.root, this.squad.root);
    } else {
      this.entities.reset(this.track, this.track.seed);
      this.squad.reset(this.track, this.track.seed);
    }
    this.coins = 0;
    this.track.ensure(CHUNK_LENGTH * 3);
    this.streamer = new TrackStreamer(this.track);
    this.root.add(this.streamer.root);
    if (this.env) {
      this.env.clear();
      this.root.remove(this.env.root);
    }
    this.env = new EnvironmentStreamer(this.track);
    this.root.add(this.env.root);
    this.streamer.update(0, 4);
    this.player.reset();
    this.player.update(0, this.track, [], false);
    this.camera.snap();
  }

  start() {
    const hud = useHud.getState();
    if (hud.phase === 'over') {
      this.newRun();
    }
    this.camera.mode = 'chase';
    hud.set({ phase: 'playing', coins: 0, lives: 3, distance: 0 });
  }

  togglePause() {
    const hud = useHud.getState();
    if (hud.phase === 'playing') hud.set({ phase: 'paused' });
    else if (hud.phase === 'paused') hud.set({ phase: 'playing' });
  }

  private cam?: THREE.PerspectiveCamera;
  /** Debug: frame a character with the camera (used for model review). */
  inspect: { obj: THREE.Object3D; offset: [number, number, number]; height: number } | null = null;
  inspectCharacter(name: 'cat' | 'skitter' | 'chomp' | 'twig' | null, offset: [number, number, number] = [0, 0.4, 4.2], height = 1.1) {
    if (!name) {
      this.inspect = null;
      return;
    }
    const obj = name === 'cat' ? this.cat.root : this.squad.runners.find((r) => r.id === name)!.ch.root;
    this.inspect = { obj, offset, height };
  }

  /** Test hook: advance the simulation by `seconds` at a fixed 60 Hz step. */
  advance(seconds: number) {
    if (!this.cam) return;
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) this.update(1 / 60, this.cam);
  }

  update(dt: number, cam: THREE.PerspectiveCamera) {
    this.cam = cam;
    dt = Math.min(dt, 1 / 20);
    const hud = useHud.getState();
    for (const a of this.input.consume()) {
      if (a === 'pause') this.togglePause();
      else if (hud.phase === 'title' || hud.phase === 'over') {
        if (a === 'start' || a === 'jump') this.start();
      } else if (hud.phase === 'playing') this.handleAction(a);
    }
    if (hud.phase === 'paused') return;
    if (this.autopilot && hud.phase === 'playing') {
      const a = this.autopilot.decide(dt, this.player, this.track, this.entities);
      if (a) this.handleAction(a);
    }
    this.time += dt;
    const playing = hud.phase === 'playing';
    const p = this.player;
    const ev = this.events;
    ev.length = 0;
    // title screen: ride slowly in the background
    if (!playing && p.state !== 'wipeout') p.speed = 9;
    p.update(dt, this.track, ev, playing || p.state === 'wipeout');
    if (!playing && p.state !== 'wipeout') p.s += 9 * dt;
    this.track.ensure(p.s + CHUNK_LENGTH * 2.5);
    this.streamer.update(p.s);
    this.env.update(p.position.z);
    this.env.animate(this.time);
    this.track.prune(p.s - CHUNK_LENGTH * 1.5);
    this.updateAtmosphere(dt);

    for (const e of ev) this.onPlayerEvent(e);

    const ee = this.entityEvents;
    ee.length = 0;
    this.entities.update(dt, p, ee, playing && p.state !== 'wipeout');
    for (const e of ee) this.onEntityEvent(e);
    const se = this.squadEvents;
    se.length = 0;
    this.squad.update(dt, p, this.entities, se, playing && p.state !== 'wipeout', p.distance);
    for (const e of se) this.onSquadEvent(e);

    this.animateCat(dt);
    this.camera.update(dt, cam, this.track, p);
    if (this.inspect) {
      const o = this.inspect.obj;
      o.updateWorldMatrix(true, false);
      const q = o.getWorldQuaternion(new THREE.Quaternion());
      const off = new THREE.Vector3(...this.inspect.offset).applyQuaternion(q);
      const target = new THREE.Vector3(0, this.inspect.height, 0).applyMatrix4(o.matrixWorld);
      cam.position.copy(target).add(off);
      cam.up.set(0, 1, 0).applyQuaternion(q);
      cam.lookAt(target);
      cam.fov = 35;
      cam.updateProjectionMatrix();
    }
    this.updateSun();

    if (p.state === 'wipeout' && hud.phase === 'playing') {
      this.overTimer += dt;
      if (this.overTimer > 1.6) {
        this.camera.mode = 'showcase';
        const best = Math.max(hud.best, p.distance);
        saveBest(best);
        hud.set({ phase: 'over', best });
      }
    }

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      const piece = this.track.pieceAt(p.s);
      hud.set({ distance: p.distance, speed: p.speed, lives: p.lives, coins: this.coins, section: piece?.label ?? '' });
    }
  }

  private handleAction(a: string) {
    const p = this.player;
    if (a === 'left') p.trySwitch(this.track, -1, this.events);
    if (a === 'right') p.trySwitch(this.track, 1, this.events);
    if (a === 'jump') p.jump(this.events);
    if (a === 'slide') p.slide(this.events);
    for (const e of this.events) this.onPlayerEvent(e);
    this.events.length = 0;
  }

  private onPlayerEvent(e: PlayerEvent) {
    const hud = useHud.getState();
    switch (e.type) {
      case 'switch':
        this.cat.react('hop', e.dir);
        break;
      case 'switchBlocked':
        hud.showToast('Too far to hop here', 'warn');
        this.cat.react('dodge', -e.dir);
        break;
      case 'jump':
        this.cat.react('launch');
        break;
      case 'land':
        this.cat.react('land', e.impact);
        break;
      case 'hit':
        this.cat.react('hit');
        this.camera.kick(0.6);
        setTimeout(() => this.cat.react('recover'), 1150);
        break;
      case 'wipeout':
        this.cat.react('hit');
        this.camera.kick(1);
        this.overTimer = 0;
        break;
    }
  }

  private onEntityEvent(e: EntityEvent) {
    switch (e.type) {
      case 'coin':
        this.coins++;
        this.cat.react('coin');
        break;
      case 'hit':
        if (this.god) break;
        this.player.hit(this.events);
        for (const pe of this.events) this.onPlayerEvent(pe);
        this.events.length = 0;
        this.squad.laughAll();
        break;
      case 'nearMiss':
        this.cat.react('dodge', e.dir);
        break;
    }
  }

  private onSquadEvent(e: SquadEvent) {
    if (e.type === 'taunt' && (e.show === 'tease' || e.show === 'laugh')) {
      setTimeout(() => {
        if (this.player.state === 'ride') this.cat.react('angry');
      }, 380);
    }
    if (e.type === 'throw') this.lookAtRoachT = 1.2;
  }

  private lookAtRoachT = 0;
  autopilot: Autopilot | null = null;
  /** Test hook: ignore obstacle hits. */
  god = false;

  private animateCat(dt: number) {
    const p = this.player;
    const f = p.frame;
    // lean from heading rate (centripetal) + hop direction
    const dh = wrapAngle(f.heading - this.prevHeading);
    this.prevHeading = f.heading;
    const turnRate = dt > 0 ? dh / dt : 0;
    const hopLean = p.switchT < 1 ? Math.sin(Math.PI * p.switchT) * p.switchDir * 0.6 : 0;
    const target = clamp(-turnRate * 0.9, -0.8, 0.8) * Math.cos(Math.atan2(f.rollSin, f.rollCos)) + hopLean;
    this.lean += (target - this.lean) * Math.min(1, dt * 6);

    this.lookAtRoachT = Math.max(0, this.lookAtRoachT - dt);
    this.cat.setState(p.state);
    const accel = clamp((p.speed - p.targetSpeed()) / 8, 0, 1) + (f.pitch < -0.4 ? 0.6 : 0);
    this.cat.update(dt, {
      speed01: clamp((p.speed - 18) / 25, 0, 1),
      lean: this.lean,
      vy: p.vy,
      accel: clamp(accel, 0, 1),
      lookX: 0,
      lookY: this.lookAtRoachT > 0 ? 0.25 : 0,
      tuck: p.hopArc * 0.35,
    });
    const r = this.cat.root;
    r.position.copy(p.position);
    r.quaternion.copy(p.quaternion);
    // blink while invulnerable
    r.visible = p.invulnT <= 0 || Math.floor(p.invulnT * 12) % 2 === 0 || p.state === 'wipeout';
  }

  private updateAtmosphere(dt: number) {
    const scene = this.scene;
    if (!scene) return;
    const theme = this.env.themeAt(this.player.position.z);
    this.fogColor.lerp(new THREE.Color(theme.fog), Math.min(1, dt * 0.8));
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(this.fogColor);
    if (scene.background instanceof THREE.Color) scene.background.copy(this.fogColor);
    if (this.hemi) this.hemi.color.lerp(new THREE.Color(theme.sky), Math.min(1, dt * 0.8));
    const hud = useHud.getState();
    if (hud.room !== theme.name) hud.set({ room: theme.name });
  }

  private updateSun() {
    const s = this.sun;
    if (!s) return;
    const p = this.player.position;
    s.position.set(p.x + 40, p.y + 80, p.z + 30);
    s.target.position.copy(p);
    s.target.updateMatrixWorld();
  }

  dispose() {
    this.input.dispose();
    this.streamer.clear();
  }
}
