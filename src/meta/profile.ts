import { create } from 'zustand';

/* Persistent player profile: coin bank, records, achievements, cosmetics,
 * daily challenge and settings. Stored in localStorage (best effort). */

export type Quality = 'auto' | 'high' | 'low';

export interface Settings {
  music: number;
  sfx: number;
  muted: boolean;
  quality: Quality;
  /** camera follows track roll fully, or a gentler amount */
  cameraRoll: 'full' | 'gentle';
}

export interface RunRecord {
  at: number;
  distance: number;
  coins: number;
  cause: string;
}

export interface Equipped {
  coat: string;
  collar: string | null;
  trail: string | null;
}

export interface LifetimeStats {
  runs: number;
  distance: number;
  coins: number;
  nearMisses: number;
  escapes: number;
  fish: number;
  magnets: number;
  rides: number;
  loops: number;
}

export interface DailyState {
  date: string;
  done: boolean;
  progress: number;
}

export interface Profile {
  bank: number;
  best: number;
  history: RunRecord[];
  achievements: Record<string, number>;
  owned: string[];
  equipped: Equipped;
  stats: LifetimeStats;
  daily: DailyState;
  settings: Settings;
}

/* ---------------------------------------------------------------- catalogue */

export type CosmeticSlot = 'coat' | 'collar' | 'trail';
export interface Cosmetic {
  id: string;
  slot: CosmeticSlot;
  name: string;
  price: number;
  /** short description shown in the shop */
  blurb: string;
}

export const COSMETICS: Cosmetic[] = [
  { id: 'coat-navy', slot: 'coat', name: 'Deep navy', price: 0, blurb: 'The classic coat.' },
  { id: 'coat-midnight', slot: 'coat', name: 'Midnight sheen', price: 400, blurb: 'A darker coat with a silvery shine.' },
  { id: 'coat-storm', slot: 'coat', name: 'Storm navy', price: 600, blurb: 'A cooler, slate-tinted navy.' },
  { id: 'collar-bell', slot: 'collar', name: 'Bell collar', price: 150, blurb: 'Red collar with a brass bell.' },
  { id: 'collar-bandana', slot: 'collar', name: 'Teal bandana', price: 250, blurb: 'Knotted at the neck.' },
  { id: 'collar-bow', slot: 'collar', name: 'Brass bow tie', price: 350, blurb: 'For formal chases.' },
  { id: 'trail-sparkle', slot: 'trail', name: 'Gold sparkle', price: 300, blurb: 'Glitter off the slippers.' },
  { id: 'trail-bubbles', slot: 'trail', name: 'Soap bubbles', price: 450, blurb: 'Straight out of the washing machine.' },
  { id: 'trail-confetti', slot: 'trail', name: 'Confetti', price: 800, blurb: 'Every run is a party.' },
];

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  reward: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-run', name: 'Off the banister', desc: 'Finish your first run.', reward: 50 },
  { id: 'd1000', name: 'Long hallway', desc: 'Ride 1,000 m in one run.', reward: 100 },
  { id: 'd3000', name: 'Up the stairs', desc: 'Ride 3,000 m in one run.', reward: 250 },
  { id: 'd6000', name: 'Endless staircase', desc: 'Ride 6,000 m in one run.', reward: 600 },
  { id: 'c200', name: 'Pocket money', desc: 'Collect 200 coins in one run.', reward: 150 },
  { id: 'c500', name: 'Piggy bank', desc: 'Collect 500 coins in one run.', reward: 400 },
  { id: 'loop', name: 'Head over heels', desc: 'Ride through a loop-the-loop.', reward: 60 },
  { id: 'fish', name: 'Gone fishing', desc: 'Grab a golden fish.', reward: 80 },
  { id: 'magnet', name: 'Attractive', desc: 'Pick up a coin magnet.', reward: 80 },
  { id: 'ride', name: 'Tea for one', desc: 'Surf on a tea tray.', reward: 120 },
  { id: 'escape5', name: 'So close', desc: 'Watch the roaches slip away 5 times.', reward: 200 },
  { id: 'near10', name: 'Whiskers away', desc: 'Make 10 near misses in total.', reward: 150 },
  { id: 'level6', name: 'Turbo tabby', desc: 'Reach speed level 6.', reward: 300 },
  { id: 'daily', name: 'Daily chaser', desc: 'Complete a daily challenge.', reward: 100 },
];

/* ---------------------------------------------------------------- daily challenge */

export type DailyKind = 'distance' | 'coins' | 'nearMiss' | 'jumps' | 'escapes';
export interface DailyChallenge {
  date: string;
  kind: DailyKind;
  target: number;
  reward: number;
  text: string;
  seed: number;
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dailyChallenge(date = todayKey()): DailyChallenge {
  let h = 2166136261;
  for (const c of date) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const kinds: DailyKind[] = ['distance', 'coins', 'nearMiss', 'jumps', 'escapes'];
  const kind = kinds[h % kinds.length];
  const lvl = (h >>> 8) % 4;
  const target = { distance: 1500 + lvl * 750, coins: 120 + lvl * 60, nearMiss: 4 + lvl * 2, jumps: 25 + lvl * 10, escapes: 1 + lvl }[kind];
  const text = {
    distance: `Ride ${target.toLocaleString()} m in one run`,
    coins: `Collect ${target} coins in one run`,
    nearMiss: `Make ${target} near misses in one run`,
    jumps: `Jump ${target} times in one run`,
    escapes: `Make the roaches escape ${target} times in one run`,
  }[kind];
  return { date, kind, target, reward: 250 + lvl * 100, text, seed: h };
}

/* ---------------------------------------------------------------- store */

const KEY = 'bb-profile-v1';

const defaults = (): Profile => ({
  bank: 0,
  best: 0,
  history: [],
  achievements: {},
  owned: ['coat-navy'],
  equipped: { coat: 'coat-navy', collar: null, trail: null },
  stats: { runs: 0, distance: 0, coins: 0, nearMisses: 0, escapes: 0, fish: 0, magnets: 0, rides: 0, loops: 0 },
  daily: { date: '', done: false, progress: 0 },
  settings: { music: 0.7, sfx: 0.85, muted: false, quality: 'auto', cameraRoll: 'full' },
});

function load(): Profile {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      // carry over the Part 1/2 best distance
      const legacy = Number(localStorage.getItem('bb-best') ?? 0) || 0;
      d.best = legacy;
      return d;
    }
    const p = JSON.parse(raw) as Partial<Profile>;
    return {
      ...d,
      ...p,
      equipped: { ...d.equipped, ...p.equipped },
      stats: { ...d.stats, ...p.stats },
      daily: { ...d.daily, ...p.daily },
      settings: { ...d.settings, ...p.settings },
    };
  } catch {
    return d;
  }
}

function save(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable (private mode) — play on without saving */
  }
}

export interface RunSummary {
  distance: number;
  coins: number;
  cause: string;
  nearMisses: number;
  jumps: number;
  escapes: number;
  fish: number;
  magnets: number;
  rides: number;
  loops: number;
  maxLevel: number;
}

export interface ProfileStore extends Profile {
  /** achievements unlocked by the last finished run (for the results card) */
  lastUnlocked: string[];
  lastDailyDone: boolean;
  setSettings: (s: Partial<Settings>) => void;
  buy: (id: string) => boolean;
  equip: (id: string | null, slot: CosmeticSlot) => void;
  finishRun: (r: RunSummary) => void;
  /** live check during a run (for in-run unlock toasts) */
  unlock: (id: string) => boolean;
  reset: () => void;
}

export const useProfile = create<ProfileStore>((set, get) => {
  const commit = (patch: Partial<Profile>) => {
    set(patch);
    const s = get();
    save({ bank: s.bank, best: s.best, history: s.history, achievements: s.achievements, owned: s.owned, equipped: s.equipped, stats: s.stats, daily: s.daily, settings: s.settings });
  };
  return {
    ...load(),
    lastUnlocked: [],
    lastDailyDone: false,
    setSettings: (s) => commit({ settings: { ...get().settings, ...s } }),
    buy: (id) => {
      const c = COSMETICS.find((x) => x.id === id);
      const st = get();
      if (!c || st.owned.includes(id) || st.bank < c.price) return false;
      commit({ bank: st.bank - c.price, owned: [...st.owned, id] });
      return true;
    },
    equip: (id, slot) => {
      const st = get();
      if (id && !st.owned.includes(id)) return;
      const eq = { ...st.equipped };
      if (slot === 'coat') eq.coat = id ?? 'coat-navy';
      else eq[slot] = id;
      commit({ equipped: eq });
    },
    unlock: (id) => {
      const st = get();
      if (st.achievements[id]) return false;
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      commit({ achievements: { ...st.achievements, [id]: Date.now() }, bank: st.bank + (a?.reward ?? 0) });
      return true;
    },
    finishRun: (r) => {
      const st = get();
      const unlocked: string[] = [];
      const achievements = { ...st.achievements };
      let bank = st.bank + r.coins;
      const stats: LifetimeStats = {
        runs: st.stats.runs + 1,
        distance: st.stats.distance + r.distance,
        coins: st.stats.coins + r.coins,
        nearMisses: st.stats.nearMisses + r.nearMisses,
        escapes: st.stats.escapes + r.escapes,
        fish: st.stats.fish + r.fish,
        magnets: st.stats.magnets + r.magnets,
        rides: st.stats.rides + r.rides,
        loops: st.stats.loops + r.loops,
      };
      const earn = (id: string, ok: boolean) => {
        if (!ok || achievements[id]) return;
        achievements[id] = Date.now();
        bank += ACHIEVEMENTS.find((a) => a.id === id)?.reward ?? 0;
        unlocked.push(id);
      };
      earn('first-run', true);
      earn('d1000', r.distance >= 1000);
      earn('d3000', r.distance >= 3000);
      earn('d6000', r.distance >= 6000);
      earn('c200', r.coins >= 200);
      earn('c500', r.coins >= 500);
      earn('loop', stats.loops > 0);
      earn('fish', stats.fish > 0);
      earn('magnet', stats.magnets > 0);
      earn('ride', stats.rides > 0);
      earn('escape5', stats.escapes >= 5);
      earn('near10', stats.nearMisses >= 10);
      earn('level6', r.maxLevel >= 6);
      // daily challenge
      const dc = dailyChallenge();
      const daily = st.daily.date === dc.date ? { ...st.daily } : { date: dc.date, done: false, progress: 0 };
      const value = { distance: r.distance, coins: r.coins, nearMiss: r.nearMisses, jumps: r.jumps, escapes: r.escapes }[dc.kind];
      daily.progress = Math.max(daily.progress, value);
      let dailyDone = false;
      if (!daily.done && value >= dc.target) {
        daily.done = true;
        dailyDone = true;
        bank += dc.reward;
        earn('daily', true);
      }
      const history = [{ at: Date.now(), distance: Math.round(r.distance), coins: r.coins, cause: r.cause }, ...st.history].slice(0, 25);
      commit({ bank, best: Math.max(st.best, r.distance), history, achievements, stats, daily });
      set({ lastUnlocked: unlocked, lastDailyDone: dailyDone });
    },
    reset: () => {
      const d = defaults();
      d.settings = get().settings;
      commit(d);
    },
  };
});

/** Top runs by distance (high-score table). */
export function topRuns(p: Pick<Profile, 'history'>, n = 10) {
  return [...p.history].sort((a, b) => b.distance - a.distance).slice(0, n);
}
