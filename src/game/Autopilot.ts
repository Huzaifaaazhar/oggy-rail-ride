import { CATALOG } from '../entities/catalog';
import { Entities, rankOf } from '../entities/Entities';
import { Track, TrackFrame } from '../track/Track';
import { Action } from './Input';
import { PlayerController } from './PlayerController';

const RANKS = [-1, 0, 1];

/**
 * Look-ahead bot used by automated browser tests and the `?autopilot` demo:
 * routes around blocks (planning double hops), jumps lows, slides under highs.
 */
export class Autopilot {
  private cooldown = 0;
  private f = new TrackFrame();

  private blockAhead(ents: Entities, p: PlayerController, rank: number, range: number) {
    let best = Infinity;
    for (const o of ents.threatsOnRank(p.s - 0.5, p.s + range, rank)) if (CATALOG[o.kind].cls === 'block') best = Math.min(best, o.s - p.s);
    return best;
  }

  decide(dt: number, p: PlayerController, track: Track, ents: Entities): Action | null {
    this.cooldown -= dt;
    if (this.cooldown > 0 || p.crashed || p.switchT < 1) return null;
    const v = Math.max(10, p.speed);
    const f = track.frameAt(p.s, this.f);
    const my = Math.round(rankOf(f, p.lateral.x));
    const look = Math.max(36, v * 1.4);

    const mine = this.blockAhead(ents, p, my, look);
    if (mine < look) {
      let bestDir = 0;
      let bestCost = Infinity;
      for (const target of RANKS) {
        if (target === my) continue;
        if (this.blockAhead(ents, p, target, look) < look) continue;
        const dir = target < my ? -1 : 1;
        const step = my + dir;
        if (step !== target && this.blockAhead(ents, p, step, look) < v * 0.5) continue;
        const cost = Math.abs(target - my);
        if (cost < bestCost) {
          bestCost = cost;
          bestDir = dir;
        }
      }
      if (bestDir) {
        this.cooldown = 0.05;
        return bestDir < 0 ? 'left' : 'right';
      }
    }

    // nearest jumpable / slidable thing in our lane
    let threat: { ds: number; cls: string } | null = null;
    for (const o of ents.threatsOnRank(p.s - 0.5, p.s + 30, my)) {
      if (o.yOff > 1.5) continue;
      const cls = CATALOG[o.kind].cls;
      const ds = o.s - p.s;
      if (cls === 'block') continue;
      if (!threat || ds < threat.ds) threat = { ds, cls };
    }
    if (!threat) return null;
    if (threat.cls === 'low' && threat.ds < v * 0.2 + 1.4 && !p.airborne) {
      this.cooldown = 0.25;
      return 'jump';
    }
    if (threat.cls === 'high' && threat.ds < v * 0.14 + 1.6 && !p.sliding) {
      this.cooldown = 0.25;
      return 'slide';
    }
    void Track;
    return null;
  }
}
