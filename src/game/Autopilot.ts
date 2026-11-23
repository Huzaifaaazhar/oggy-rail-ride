import { Entities } from '../entities/Entities';
import { OBSTACLES } from '../entities/prefabs';
import { Track, TrackFrame } from '../track/Track';
import { Action } from './Input';
import { PlayerController } from './PlayerController';

/**
 * Simple look-ahead bot: plans toward a rail without blocks (hopping twice if
 * needed), jumps low obstacles and slides under high ones. Used by automated
 * browser tests and the `?autopilot` demo mode.
 */
export class Autopilot {
  private cooldown = 0;
  private f = new TrackFrame();

  /** Distance to the first full-height block on `rail` within range (Infinity if none). */
  private firstBlock(ents: Entities, p: PlayerController, rail: number, range: number) {
    let best = Infinity;
    for (const o of ents.obstacles) {
      if (o.hit || o.rail !== rail || OBSTACLES[o.kind].cls !== 'block') continue;
      const ds = o.s - p.s;
      if (ds >= -0.5 && ds <= range) best = Math.min(best, ds);
    }
    return best;
  }

  decide(dt: number, p: PlayerController, track: Track, ents: Entities): Action | null {
    this.cooldown -= dt;
    if (this.cooldown > 0 || p.state === 'wipeout' || p.switchT < 1) return null;
    const rail = p.toRail;
    const v = Math.max(10, p.speed);
    const f = track.frameAt(p.s, this.f);

    // 1) route around blocks: find the physically nearest rail that stays clear
    const myBlock = this.firstBlock(ents, p, rail, 36);
    if (myBlock < 36) {
      const order = [0, 1, 2].sort((a, b) => f.lanes[a * 2] - f.lanes[b * 2]);
      const idx = order.indexOf(rail);
      let bestDir = 0;
      let bestCost = Infinity;
      for (let j = 0; j < 3; j++) {
        if (j === idx) continue;
        const target = order[j];
        if (this.firstBlock(ents, p, target, 36) < 36) continue;
        const dir = j < idx ? -1 : 1;
        const step = order[idx + dir];
        if (!Track.canHop(f, rail, step)) continue;
        // the intermediate rail must be passable long enough for the second hop
        if (step !== target && this.firstBlock(ents, p, step, 36) < v * 0.5) continue;
        const cost = Math.abs(j - idx);
        if (cost < bestCost) {
          bestCost = cost;
          bestDir = dir;
        }
      }
      if (bestDir !== 0) {
        this.cooldown = 0.05;
        return bestDir < 0 ? 'left' : 'right';
      }
    }

    // 2) jump / slide whatever is on (or across) this rail
    let threat: { ds: number; cls: string } | null = null;
    for (const o of ents.obstacles) {
      if (o.hit) continue;
      const ds = o.s - p.s;
      if (ds < -0.5 || ds > 30) continue;
      const lateral = Math.hypot(p.lateral.x - f.lanes[o.rail * 2], p.lateral.y - f.lanes[o.rail * 2 + 1]);
      if (!(o.wide || lateral < 0.9)) continue;
      if (!threat || ds < threat.ds) threat = { ds, cls: OBSTACLES[o.kind].cls };
    }
    if (!threat) return null;
    if (threat.cls === 'low' && threat.ds < v * 0.2 + 1.4 && !p.airborne) {
      this.cooldown = 0.25;
      return 'jump';
    }
    if (threat.cls === 'high' && threat.ds < v * 0.14 + 1.2 && !p.sliding) {
      this.cooldown = 0.25;
      return 'slide';
    }
    return null;
  }
}
