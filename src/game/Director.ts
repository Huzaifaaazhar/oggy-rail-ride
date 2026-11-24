import { audio } from '../audio/AudioEngine';
import { ObstacleSpec } from '../entities/catalog';
import { Entities, rankOf } from '../entities/Entities';
import { Track, TrackFrame } from '../track/Track';
import { makeRng, Rng } from '../util/math';
import { difficultyFor } from './difficulty';
import { PlayerController } from './PlayerController';
import { RoachSquad } from './RoachSquad';

export type Moment = 'lineup' | 'lever' | 'giantDrop' | 'rolling' | 'conga' | 'tray' | 'nearCatch';

export interface DirectorHost {
  track: Track;
  player: PlayerController;
  entities: Entities;
  squad: RoachSquad;
  banner: (text: string) => void;
}

const LEVER_TEXT: Record<string, string> = {
  widePulse: 'Skitter pulled a lever: the rails are splitting apart!',
  split: 'Skitter pulled a lever: the rails are separating!',
  merge: 'Skitter pulled a lever: the rails are bunching up!',
  cross: 'Skitter pulled a lever: the rails are crossing!',
  stackPulse: 'Skitter pulled a lever: the rails are stacking up!',
};

/**
 * Stages short signature chase moments at random intervals. None of them
 * take control away; they reuse the fairness-checked placement and the squad's
 * never-caught gap rules.
 */
export class Director {
  private rng: Rng;
  private wait = 28;
  private lever: { piece: number; text: string } | null = null;
  private announced = new Set<number>();
  /** time-scale request for slow-motion beats */
  slowT = 0;
  stats: Record<Moment, number> = { lineup: 0, lever: 0, giantDrop: 0, rolling: 0, conga: 0, tray: 0, nearCatch: 0 };

  constructor(seed: number) {
    this.rng = makeRng(seed ^ 0x51ed27);
  }

  reset(seed: number) {
    this.rng = makeRng(seed ^ 0x51ed27);
    this.wait = 28;
    this.lever = null;
    this.announced.clear();
    this.slowT = 0;
    for (const k of Object.keys(this.stats) as Moment[]) this.stats[k] = 0;
  }

  update(dt: number, h: DirectorHost) {
    const p = h.player;
    if (p.crashed) return;
    this.slowT = Math.max(0, this.slowT - dt);

    // heads-up for giant structures coming up
    for (const pc of h.track.pieces) {
      if (this.announced.has(pc.index) || pc.s0 < p.s + 60 || pc.s0 > p.s + 160) continue;
      const text = { giantLoop: 'Giant loop ahead — hold on!', giantSpiral: 'Giant spiral ahead!', helix: 'Spiral staircase ahead!', loop: 'Loop-the-loop ahead!' }[pc.geom as string];
      if (text) {
        this.announced.add(pc.index);
        h.banner(text);
        for (const id of ['skitter', 'chomp', 'twig'] as const) h.squad.act(id, 'look', 1.2);
      }
    }

    // pending lever: fire just before the rails change
    if (this.lever) {
      const pc = h.track.pieces.find((x) => x.index === this.lever!.piece);
      if (!pc) this.lever = null;
      else if (pc.s0 - p.s < p.speed * 1.4) {
        h.squad.act('skitter', 'mischief', 1.3);
        audio.creak();
        h.banner(this.lever.text);
        this.lever = null;
      }
    }

    if (p.distance < 500) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    const d = difficultyFor(p.distance);
    this.wait = 35 - d * 10 + this.rng.range(0, 20);
    const pick = this.rng.weighted<Moment>([
      ['lineup', 2],
      ['lever', 2],
      ['giantDrop', 1.5 + d],
      ['rolling', 1.2 + d],
      ['conga', 1.5],
      ['tray', 1.2],
      ['nearCatch', 1],
    ]);
    if (this.run(pick, h)) this.stats[pick]++;
    else this.wait = 4; // try something else shortly
  }

  run(m: Moment, h: DirectorHost): boolean {
    const p = h.player;
    const r = this.rng;
    switch (m) {
      case 'lineup':
        h.squad.lineUp(h.entities);
        h.banner('The roaches are showing off!');
        setTimeout(() => {
          audio.laugh('skitter');
          audio.laugh('chomp');
          setTimeout(() => audio.laugh('twig'), 180);
        }, 450);
        return true;
      case 'lever': {
        const pc = h.track.pieces.find((x) => x.s0 > p.s + 60 && x.s0 < p.s + 260 && LEVER_TEXT[x.lane]);
        if (!pc) return false;
        this.lever = { piece: pc.index, text: LEVER_TEXT[pc.lane] };
        return true;
      }
      case 'giantDrop': {
        const s = p.s + Math.max(85, p.speed * 2.8);
        const spec: ObstacleSpec = { s, kind: 'giantPot', u: r.pick([-0.5, 0.5]), span: 2, motion: { type: 'drop', trigger: 60, height: 14 }, warn: true, by: 'chomp' };
        if (!h.entities.tryPlace([spec], 80)) return false;
        h.squad.act('chomp', 'throw', 1.0);
        h.banner('Chomp dropped the biggest pot in the kitchen!');
        return true;
      }
      case 'rolling': {
        const s = p.s + 150;
        const spec: ObstacleSpec = { s, kind: 'bigYarn', u: r.pick([-1, 0, 1]), span: 1, motion: { type: 'roll', speed: 11, trigger: 999 }, warn: true, by: 'twig' };
        if (!h.entities.tryPlace([spec], 60)) return false;
        h.squad.act('twig', 'mischief', 1.2);
        h.banner('Twig sent something rolling down the stairs!');
        return true;
      }
      case 'conga': {
        h.squad.conga(h.entities);
        // a coin trail that zig-zags with them: follow the leader
        const f = h.track.frameAt(p.s + 40, new TrackFrame());
        let u = Math.round(rankOf(f, f.lanes[2]));
        const coins = [];
        for (let k = 0; k < 4; k++) {
          const next = u === 0 ? r.pick([-1, 1]) : 0;
          for (let j = 0; j < 6; j++) coins.push({ s: p.s + 40 + k * 16 + j * 2.6, u: j < 3 ? u : u + (next - u) * ((j - 2) / 3), h: 0.75 });
          u = next;
        }
        const z = h.entities.zone(p.s + 30, p.s + 110);
        if (z.hop && !z.blocked) h.entities.addCoins(coins);
        h.banner('Follow the leader!');
        return true;
      }
      case 'tray': {
        const f = p.frame;
        const u = Math.round(rankOf(f, p.lateral.x));
        const s = p.s + Math.max(90, p.speed * 3);
        const z = h.entities.zone(s - 10, s + 5);
        if (z.blocked || !h.entities.isFree(s, u, 10)) return false;
        h.entities.addCoins([{ s, u, h: 0.8, item: 'tray' }]);
        h.banner('A tea tray! Grab it and surf!');
        return true;
      }
      case 'nearCatch':
        h.squad.nearCatch();
        this.slowT = 0.9;
        return true;
    }
  }
}
