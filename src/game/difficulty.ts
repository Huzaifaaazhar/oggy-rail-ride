/** Speed milestones: distance (m) at which each level starts, and its cruise speed (m/s). */
export const MILESTONES = [
  { at: 0, speed: 20 },
  { at: 300, speed: 24 },
  { at: 800, speed: 28 },
  { at: 1500, speed: 32 },
  { at: 2500, speed: 36 },
  { at: 4000, speed: 40 },
  { at: 6000, speed: 44 },
  { at: 8500, speed: 48 },
  { at: 12000, speed: 52 },
];

/** 1-based speed level for a run distance. */
export function levelFor(distance: number) {
  let l = 1;
  for (let i = 1; i < MILESTONES.length; i++) if (distance >= MILESTONES[i].at) l = i + 1;
  return l;
}

/** Cruise speed: steps up at each milestone with a smooth 150 m ramp. */
export function speedFor(distance: number) {
  let v = MILESTONES[0].speed;
  for (let i = 1; i < MILESTONES.length; i++) {
    const m = MILESTONES[i];
    const t = Math.min(1, Math.max(0, (distance - m.at) / 150));
    const e = t * t * (3 - 2 * t);
    v += (m.speed - MILESTONES[i - 1].speed) * e;
  }
  return v;
}

/** 0..1 difficulty used by the obstacle planner and the roaches. */
export function difficultyFor(distance: number) {
  return Math.min(1, Math.max(0, distance / 6000));
}
