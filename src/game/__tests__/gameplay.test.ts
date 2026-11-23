import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Track, TrackFrame } from '../../track/Track';
import { RAIL_TOP } from '../../track/types';
import { levelFor, MILESTONES, speedFor } from '../difficulty';
import { PlayerController, PlayerEvent } from '../PlayerController';

const ride = (p: PlayerController, t: Track, seconds: number, ev: PlayerEvent[] = []) => {
  for (let i = 0; i < seconds * 60; i++) p.update(1 / 60, t, ev, true);
};

describe('speed progression', () => {
  it('is monotonic and steps up at each milestone', () => {
    let prev = 0;
    for (let d = 0; d < 14000; d += 25) {
      const v = speedFor(d);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
    expect(speedFor(0)).toBe(20);
    expect(speedFor(13000)).toBeCloseTo(MILESTONES[MILESTONES.length - 1].speed, 3);
    expect(levelFor(0)).toBe(1);
    expect(levelFor(MILESTONES[3].at + 1)).toBe(4);
  });
});

describe('rider on the rails', () => {
  it('reaches all three rails and stays on the chosen one', () => {
    const t = new Track({ seed: 3 });
    t.ensure(1000);
    const p = new PlayerController();
    p.update(0, t, [], true);
    const ev: PlayerEvent[] = [];
    p.trySwitch(t, -1, ev);
    ride(p, t, 0.5, ev);
    const left = p.toRail;
    p.trySwitch(t, 1, ev);
    ride(p, t, 0.5, ev);
    p.trySwitch(t, 1, ev);
    ride(p, t, 0.5, ev);
    const right = p.toRail;
    expect(new Set([left, 1, right]).size).toBe(3);
    // physically left → right
    expect(p.frame.lanes[left * 2]).toBeLessThan(p.frame.lanes[right * 2]);
    // can't go further right than the right-most rail
    p.trySwitch(t, 1, ev);
    ride(p, t, 0.5, ev);
    expect(p.toRail).toBe(right);
  });

  it('never hops between rails that are not connected (wide splits / crossings)', () => {
    const t = new Track({ seed: 5, forced: ['straight'] });
    t.ensure(20000);
    const p = new PlayerController();
    const ev: PlayerEvent[] = [];
    let attempted = 0;
    let refused = 0;
    for (let i = 0; i < 60 * 300; i++) {
      p.update(1 / 60, t, ev, true);
      if (i % 20 === 0 && p.switchT >= 1) {
        const before = p.toRail;
        const f = new TrackFrame();
        t.frameAt(p.s, f);
        const dir = i % 40 === 0 ? 1 : -1;
        const n = Track.neighbour(f, before, dir);
        const ok = n >= 0 && Track.canHop(f, before, n);
        attempted++;
        p.trySwitch(t, dir, ev);
        if (!ok) {
          expect(p.toRail).toBe(before);
          refused++;
        }
      }
      // whatever happens, the rider is on (or between two hoppable) rails
      if (p.switchT >= 1) {
        const rp = p.frame.railPoint(p.toRail, new THREE.Vector3()).addScaledVector(p.frame.up, RAIL_TOP);
        expect(rp.distanceTo(p.position)).toBeLessThan(0.05);
      }
    }
    expect(attempted).toBeGreaterThan(100);
    expect(refused).toBeGreaterThan(0);
  });

  it('stays glued to the rail through loops and corkscrews', () => {
    for (const kind of ['loop', 'corkscrew', 'helix', 'drop', 'dip'] as const) {
      const t = new Track({ seed: 7, forced: [kind, 'straight'] });
      t.ensure(4000);
      const p = new PlayerController();
      let upsideDown = 0;
      for (let i = 0; i < 60 * 70; i++) {
        p.update(1 / 60, t, [], true);
        const rp = p.frame.railPoint(p.rail, new THREE.Vector3()).addScaledVector(p.frame.up, RAIL_TOP + p.height + p.hopArc);
        expect(rp.distanceTo(p.position)).toBeLessThan(0.05);
        if (p.frame.up.y < -0.5) upsideDown++;
      }
      if (kind === 'loop' || kind === 'corkscrew') expect(upsideDown, kind).toBeGreaterThan(10);
    }
  });

  it('jump and slide clear the right heights; buffered jump fires on landing', () => {
    const t = new Track({ seed: 3 });
    t.ensure(1000);
    const p = new PlayerController();
    const ev: PlayerEvent[] = [];
    p.update(1 / 60, t, ev, true);
    p.jump(ev);
    let apex = 0;
    for (let i = 0; i < 50; i++) {
      p.update(1 / 60, t, ev, true);
      apex = Math.max(apex, p.height);
      if (p.vy < 0 && p.height < 0.5) p.jump(ev); // pressed early
    }
    expect(apex).toBeGreaterThan(1.5);
    expect(ev.filter((e) => e.type === 'jump').length).toBe(2);
    ride(p, t, 2, ev);
    p.slide(ev);
    p.update(1 / 60, t, ev, true);
    expect(p.bodyHeight).toBeLessThan(0.9);
  });

  it('two stumbles close together end the run; a crash tumbles off the rail', () => {
    const t = new Track({ seed: 3 });
    t.ensure(1000);
    const p = new PlayerController();
    const ev: PlayerEvent[] = [];
    ride(p, t, 1, ev);
    p.stumble(ev);
    expect(p.state).toBe('stumble');
    ride(p, t, 2, ev);
    p.stumble(ev);
    expect(p.crashed).toBe(true);
    const y0 = p.position.y;
    ride(p, t, 2, ev);
    expect(p.position.y).toBeLessThan(y0 - 5);
  });
});
