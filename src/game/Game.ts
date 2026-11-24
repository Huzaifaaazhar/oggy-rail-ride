import * as THREE from 'three';
import { CatCharacter } from '../characters/CatCharacter';
import { CATALOG, ObstacleKind } from '../entities/catalog';
import { Entities, EntityEvent } from '../entities/Entities';
import { EnvironmentStreamer, ZONE_LEN } from '../environment/EnvironmentStreamer';
import { Track } from '../track/Track';
import { CHUNK_LENGTH, GeomKind } from '../track/types';
import { clamp, wrapAngle } from '../util/math';
import { audio } from '../audio/AudioEngine';
import { teaTray } from '../entities/prefabs';
import { useProfile } from '../meta/profile';
import { Autopilot } from './Autopilot';
import { Director } from './Director';
import { SpeedFX, TrailFX } from './SpeedFX';
import { ChaseCamera } from './ChaseCamera';
import { levelFor } from './difficulty';
import { Action, Input } from './Input';
import { PlayerController, PlayerEvent } from './PlayerController';
import { RoachSquad, SquadEvent } from './RoachSquad';
import { saveBest, useHud } from './store';
import { TrackStreamer } from './World';

export interface GameOptions {
  seed?: number;
  forced?: GeomKind[];
  autopilot?: boolean;
}

const CRASH_WORDS = ['BONK!', 'SPLAT!', 'THWACK!', 'KER-RASH!', 'BOINNG!', 'CLANG!'];

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
  squad!: RoachSquad;
  scene?: THREE.Scene;
  hemi?: THREE.HemisphereLight;
  sun?: THREE.DirectionalLight;
  opts: GameOptions;
  coins = 0;
  time = 0;
  autopilot: Autopilot | null = null;
  /** Test hook: ignore obstacle hits. */
  god = false;
  /** what ended the last run */
  crashKind: ObstacleKind | null = null;
  private fogColor = new THREE.Color('#e8c79a');
  private events: PlayerEvent[] = [];
  private entityEvents: EntityEvent[] = [];
  private squadEvents: SquadEvent[] = [];
  private hudTimer = 0;
  private prevHeading = 0;
  private lean = 0;
  private lookAtRoachT = 0;
  private lastPiece = -1;
  private level = 1;
  private stars: THREE.Group;
  private cam?: THREE.PerspectiveCamera;
  director = new Director(1);
  fx = new SpeedFX();
  trail = new TrailFX();
  private tray: THREE.Object3D;
  private coinPitch = 0;
  private coinPitchT = 0;
  private lastGeom = '';
  /** per-run tallies for achievements and the daily challenge */
  run = { nearMisses: 0, jumps: 0, escapes: 0, fish: 0, magnets: 0, rides: 0, loops: 0, maxLevel: 1 };
  /** Debug: frame a character with the camera (used for model review). */
  inspect: { obj: THREE.Object3D; offset: [number, number, number]; height: number } | null = null;

  constructor(opts: GameOptions = {}) {
    this.opts = opts;
    if (opts.autopilot) this.autopilot = new Autopilot();
    this.input = new Input(window);
    this.root.add(this.cat.root);
    this.stars = this.makeStars();
    this.root.add(this.stars);
    this.root.add(this.fx.root, this.trail.root);
    this.tray = teaTray();
    this.tray.scale.setScalar(1.5);
    this.tray.position.y = 0.02;
    this.tray.visible = false;
    this.cat.root.add(this.tray);
    this.applySettings();
    useProfile.subscribe((st, prev) => {
      if (st.settings !== prev.settings) this.applySettings();
      if (st.equipped !== prev.equipped) this.cat.model.applyCosmetics(st.equipped);
    });
    this.cat.model.applyCosmetics(useProfile.getState().equipped);
    this.newRun(opts.seed);
  }

  /** Settings → audio volumes, camera roll and graphics level of detail. */
  applySettings() {
    const st = useProfile.getState().settings;
    audio.setSettings(st);
    this.camera.rollFollow = st.cameraRoll === 'full' ? 0.88 : 0.5;
    this.cat.model.furEnabled = this.quality() === 'high';
  }

  quality(): 'high' | 'low' {
    const q = useProfile.getState().settings.quality;
    if (q !== 'auto') return q;
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    return coarse || (navigator.hardwareConcurrency ?? 8) <= 4 ? 'low' : 'high';
  }

  /** Cartoon stars that circle the cat's head after a crash. */
  private makeStars() {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 0.07 : 0.16;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
    const mat = new THREE.MeshBasicMaterial({ color: '#ffd23f' });
    for (let i = 0; i < 5; i++) g.add(new THREE.Mesh(geo, mat));
    g.visible = false;
    return g;
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
    this.level = 1;
    this.run = { nearMisses: 0, jumps: 0, escapes: 0, fish: 0, magnets: 0, rides: 0, loops: 0, maxLevel: 1 };
    this.director?.reset(this.track?.seed ?? 1);
    this.lastGeom = '';
    this.crashKind = null;
    this.lastPiece = -1;
    this.stars.visible = false;
    this.director.reset(this.track.seed);
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
    this.track.ensure(CHUNK_LENGTH * 3);
    while (this.track.endZ() > -2 * ZONE_LEN - 100 && this.track.length < 2500) this.track.ensure(this.track.length + 60);
    this.env.update(0, Infinity);
    this.player.reset();
    this.player.update(0, this.track, [], false);
    this.cat.setState('ride');
    this.camera.snap();
  }

  /** Start (or instantly restart) a run. */
  start(seed?: number) {
    const hud = useHud.getState();
    audio.unlock();
    audio.setLevel(1);
    audio.setMusic('chase');
    if (seed !== undefined) {
      this.newRun(seed);
      hud.set({ phase: 'playing', coins: 0, distance: 0, speedLevel: 1, stumbled: false, magnet: 0, popup: null, warn: null });
      this.camera.mode = 'chase';
      return;
    }
    if (hud.phase === 'over' || this.player.crashed) this.newRun();
    this.camera.mode = 'chase';
    hud.set({ phase: 'playing', coins: 0, distance: 0, speedLevel: 1, stumbled: false, magnet: 0, popup: null, warn: null });
  }

  /** Back to the main menu (fresh attract-mode run in the background). */
  toMenu() {
    const hud = useHud.getState();
    this.newRun();
    this.camera.mode = 'showcase';
    this.camera.showcaseTarget = null;
    hud.set({ phase: 'title', popup: null, warn: null });
    audio.setMusic('menu');
  }

  /** Menu character preview: orbit the camera around one of the cast. */
  previewCharacter(name: 'cat' | 'skitter' | 'chomp' | 'twig') {
    this.camera.showcaseTarget = name === 'cat' ? null : this.squad.get(name).ch.root;
  }

  togglePause() {
    const hud = useHud.getState();
    if (hud.phase === 'playing') {
      hud.set({ phase: 'paused' });
      audio.setMusic('menu');
    } else if (hud.phase === 'paused') {
      hud.set({ phase: 'playing' });
      audio.setMusic('chase');
    }
  }

  inspectCharacter(name: 'cat' | 'skitter' | 'chomp' | 'twig' | null, offset: [number, number, number] = [0, 0.4, 4.2], height = 1.1) {
    if (!name) {
      this.inspect = null;
      return;
    }
    const obj = name === 'cat' ? this.cat.root : this.squad.get(name).ch.root;
    this.inspect = { obj, offset, height };
  }

  /** Test hook: advance the simulation by `seconds` at a fixed 60 Hz step. */
  advance(seconds: number, step = 1 / 60) {
    if (!this.cam) return;
    const n = Math.round(seconds / step);
    for (let i = 0; i < n; i++) this.update(step, this.cam);
  }

  update(dt: number, cam: THREE.PerspectiveCamera) {
    this.cam = cam;
    dt = Math.min(dt, 1 / 20);
    const realDt = dt;
    if (this.director.slowT > 0) dt *= 0.45;
    const hud = useHud.getState();
    for (const a of this.input.consume()) {
      if (a === 'pause') this.togglePause();
      else if (hud.phase === 'title' || hud.phase === 'over') {
        if (a === 'start' || a === 'jump') this.start();
      } else if (hud.phase === 'playing') this.handleAction(a);
    }
    if (hud.phase === 'paused') return;
    const playing = hud.phase === 'playing';
    const p = this.player;
    if (this.autopilot && playing && !p.crashed) {
      const a = this.autopilot.decide(dt, p, this.track, this.entities);
      if (a) this.handleAction(a);
    }
    this.time += dt;
    const ev = this.events;
    ev.length = 0;
    // title screen: ride slowly in the background
    if (!playing && !p.crashed) p.speed = 9;
    p.update(dt, this.track, ev, playing && !p.crashed);
    if (!playing && !p.crashed) p.s += 9 * dt;
    this.track.ensure(p.s + CHUNK_LENGTH * 2.5);
    const needZ = -(this.env.zoneIndexAt(p.frame.pos.z) + 2) * ZONE_LEN - 100;
    while (this.track.endZ() > needZ && this.track.length < p.s + 2500) this.track.ensure(this.track.length + 60);
    this.streamer.update(p.s);
    this.env.update(p.frame.pos.z);
    this.env.animate(this.time);
    this.track.prune(p.s - CHUNK_LENGTH * 1.5);
    this.updateAtmosphere(dt);

    for (const e of ev) this.onPlayerEvent(e);

    const live = playing && !p.crashed;
    const ee = this.entityEvents;
    ee.length = 0;
    this.entities.update(dt, p, ee, live);
    for (const e of ee) this.onEntityEvent(e);
    const se = this.squadEvents;
    se.length = 0;
    this.squad.update(dt, p, this.entities, se, live);
    for (const e of se) this.onSquadEvent(e);

    if (live) this.director.update(dt, { track: this.track, player: p, entities: this.entities, squad: this.squad, banner: (t) => hud.showToast(t, 'good') });

    this.animateCat(dt);
    this.camera.mode = p.crashed ? 'crash' : playing ? 'chase' : 'showcase';
    this.camera.update(dt, cam, this.track, p);
    this.applyInspect(cam);
    this.updateSun();
    this.updateStars();
    const boost = (p.rideT > 0 ? 0.5 : 0) + (p.frame.pitch < -0.4 ? 0.35 : 0);
    this.fx.update(realDt, cam, playing ? p.speed : 4, boost, playing && !p.crashed);
    this.trail.update(dt, this.cat.root, useProfile.getState().equipped.trail, playing && !p.crashed && p.speed > 5);
    this.tray.visible = p.rideT > 0;
    audio.update(realDt, { speed: playing ? p.speed : 0, grinding: playing && !p.airborne && !p.crashed && p.rideT <= 0, sliding: p.sliding, playing: playing && !p.crashed, theme: this.env.themeAt(p.frame.pos.z).id });

    if (live) {
      const lvl = levelFor(p.distance);
      if (lvl > this.level) {
        this.level = lvl;
        this.camera.boost(1.4);
        hud.set({ speedLevel: lvl });
        hud.popupText(`Speed level ${lvl}`, 'level');
        this.run.maxLevel = lvl;
        audio.setLevel(lvl);
        audio.levelUp();
      }
      const piece = this.track.pieceAt(p.s);
      if (piece && piece.index !== this.lastPiece) {
        this.lastPiece = piece.index;
        if (this.lastGeom === 'loop' || this.lastGeom === 'giantLoop') this.run.loops++;
        this.lastGeom = piece.geom;
        if (['loop', 'corkscrew', 'helix', 'circle', 'drop', 'sharpTurn', 'twist', 'dip'].includes(piece.geom) || piece.label === 'Steep climb') hud.showToast(piece.label, 'good');
        else if (piece.lane === 'cross') hud.showToast('Rails crossing', 'good');
        else if (piece.lane === 'merge') hud.showToast('Rails merging', 'info');
        else if (piece.lane === 'split') hud.showToast('Rails splitting', 'info');
        else if (piece.lane === 'widePulse') hud.showToast('Rails spreading wide', 'info');
      }
    }

    // failure: let the tumble play, then show the results
    if (p.crashed && hud.phase === 'playing' && p.crashT > 1.9) {
      const best = Math.max(hud.best, p.distance);
      saveBest(best);
      const blame = this.crashKind ? CATALOG[this.crashKind].blame : 'took a tumble';
      useProfile.getState().finishRun({ distance: p.distance, coins: this.coins, cause: blame, ...this.run });
      hud.set({ phase: 'over', best, newBest: p.distance >= best && p.distance > 0, blame });
      audio.setMusic('menu');
    }

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      const gap = Math.min(...this.squad.runners.map((r) => r.s - p.s));
      hud.set({ distance: p.distance, speed: p.speed, coins: this.coins, gap, tension: this.squad.tension, magnet: this.entities.magnetT, section: this.track.pieceAt(p.s)?.label ?? '' });
    }
  }

  private handleAction(a: Action) {
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
        audio.hop(e.dir);
        break;
      case 'switchBlocked':
        hud.showToast('No rail to hop to here', 'warn');
        break;
      case 'jump':
        this.cat.react('launch');
        this.run.jumps++;
        audio.jump();
        break;
      case 'land':
        this.cat.react('land', e.impact);
        if (e.impact > 6) audio.land();
        break;
      case 'stumble':
        this.cat.react('hit');
        audio.impact(this.crashKind ?? 'box', false);
        audio.stumble();
        audio.yowl();
        this.camera.kick(0.5);
        this.squad.onStumble();
        hud.set({ stumbled: true });
        hud.popupText('Ouch! Careful…', 'stumble');
        setTimeout(() => this.cat.react('recover'), 1000);
        break;
      case 'crash':
        this.camera.kick(1.1);
        audio.setMusic('off');
        audio.crash(this.crashKind ?? 'box');
        setTimeout(() => audio.yowl(), 250);
        this.squad.onCrash();
        this.stars.visible = true;
        hud.popupText(CRASH_WORDS[Math.floor(Math.random() * CRASH_WORDS.length)], 'crash');
        break;
    }
  }

  private onEntityEvent(e: EntityEvent) {
    const hud = useHud.getState();
    switch (e.type) {
      case 'coin':
        this.coins++;
        this.cat.react('coin');
        // consecutive coins climb in pitch
        this.coinPitch = this.coinPitchT > 0 ? Math.min(this.coinPitch + 1, 12) : 0;
        this.coinPitchT = 0.6;
        audio.coin(this.coinPitch);
        break;
      case 'bonus':
        this.cat.react('coin');
        audio.bonus();
        if (e.item === 'fish') {
          this.coins += 25;
          this.run.fish++;
          hud.popupText('Golden fish +25', 'bonus');
        } else if (e.item === 'magnet') {
          this.run.magnets++;
          hud.popupText('Coin magnet!', 'bonus');
        } else {
          this.run.rides++;
          this.player.rideT = 7;
          this.camera.boost(1.6);
          hud.popupText('Tea tray ride!', 'bonus');
        }
        break;
      case 'hit':
        if (this.god) break;
        if (e.severity === 'crash' || this.player.sinceStumble < 6) {
          this.crashKind = e.kind;
          this.player.crash(this.events);
        } else {
          this.crashKind = e.kind;
          this.player.stumble(this.events);
        }
        for (const pe of this.events) this.onPlayerEvent(pe);
        this.events.length = 0;
        break;
      case 'smash':
        audio.impact(e.kind, false);
        this.camera.kick(0.25);
        break;
      case 'landed':
        if (e.ahead < 90 && e.ahead > -5) {
          audio.impact(e.kind, true);
          this.camera.kick(e.kind === 'giantPot' ? 0.9 : 0.4);
        }
        break;
      case 'nearMiss':
        this.cat.react('dodge', e.dir);
        this.run.nearMisses++;
        audio.whoosh();
        break;
      case 'warn':
        hud.set({ warn: { id: Date.now(), text: e.text } });
        audio.warn();
        break;
    }
  }

  private onSquadEvent(e: SquadEvent) {
    const hud = useHud.getState();
    if (e.type === 'taunt' && (e.show === 'tease' || e.show === 'laugh')) {
      setTimeout(() => {
        if (this.player.state === 'ride') {
          this.cat.react('angry');
          audio.yowl(true);
        }
      }, 380);
    }
    if (e.type === 'taunt') {
      if (e.show === 'laugh') audio.laugh(e.who);
      if (e.show === 'tease') audio.raspberry();
    }
    if (e.type === 'throw') {
      this.lookAtRoachT = 1.2;
      audio.whoosh();
    }
    if (e.type === 'trick') hud.showToast(e.text, 'warn');
    if (e.type === 'ambush') {
      hud.showToast(e.text, 'warn');
      this.cat.react('angry');
    }
    if (e.type === 'escape') {
      this.run.escapes++;
      this.director.slowT = Math.max(this.director.slowT, 0.7);
      audio.escape();
      hud.popupText('So close! They slipped away', 'bonus');
      setTimeout(() => this.cat.react('angry'), 300);
    }
  }

  private applyInspect(cam: THREE.PerspectiveCamera) {
    if (!this.inspect) return;
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

  private animateCat(dt: number) {
    const p = this.player;
    const f = p.frame;
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
      lean: p.crashed ? 0 : this.lean,
      vy: p.vy,
      accel: p.crashed ? 0 : clamp(accel, 0, 1),
      lookX: 0,
      lookY: this.lookAtRoachT > 0 ? 0.25 : 0,
      tuck: p.hopArc * 0.35,
      ground: p.airborne || p.crashed ? 0 : p.speed,
    });
    const r = this.cat.root;
    r.position.copy(p.position);
    r.quaternion.copy(p.quaternion);
    r.visible = p.crashed || p.invulnT <= 0 || Math.floor(p.invulnT * 12) % 2 === 0;
  }

  private updateStarsTimer(dt: number) {
    this.coinPitchT = Math.max(0, this.coinPitchT - dt);
  }

  private updateStars() {
    this.updateStarsTimer(1 / 60);
    if (!this.stars.visible) return;
    const head = this.cat.model.sk.byName.head.getWorldPosition(new THREE.Vector3());
    this.stars.children.forEach((s, i) => {
      const a = this.time * 5 + (i / 5) * Math.PI * 2;
      s.position.set(head.x + Math.cos(a) * 0.55, head.y + 0.75 + Math.sin(a * 2) * 0.06, head.z + Math.sin(a) * 0.55);
      s.rotation.y = a;
    });
  }

  private updateAtmosphere(dt: number) {
    const scene = this.scene;
    if (!scene) return;
    const theme = this.env.themeAt(this.player.frame.pos.z);
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
    const p = this.player.frame.pos;
    s.position.set(p.x + 40, p.y + 80, p.z + 30);
    s.target.position.copy(p);
    s.target.updateMatrixWorld();
  }

  dispose() {
    this.input.dispose();
    this.streamer.clear();
  }
}
