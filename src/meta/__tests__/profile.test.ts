import { beforeEach, describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, COSMETICS, dailyChallenge, topRuns, useProfile } from '../profile';

const run = (over: Partial<Parameters<ReturnType<typeof useProfile.getState>['finishRun']>[0]> = {}) => ({
  distance: 500, coins: 40, cause: 'test', nearMisses: 0, jumps: 3, escapes: 0, fish: 0, magnets: 0, rides: 0, loops: 0, maxLevel: 1, ...over,
});

describe('profile & progression', () => {
  beforeEach(() => useProfile.getState().reset());

  it('banks coins, records history and best distance', () => {
    const p = useProfile.getState();
    p.finishRun(run({ distance: 1200, coins: 80 }));
    p.finishRun(run({ distance: 700, coins: 20 }));
    const s = useProfile.getState();
    expect(s.best).toBe(1200);
    expect(s.history.length).toBe(2);
    expect(topRuns(s)[0].distance).toBe(1200);
    // coins + rewards for first-run and 1000 m achievements
    const reward = ACHIEVEMENTS.filter((a) => a.id === 'first-run' || a.id === 'd1000').reduce((n, a) => n + a.reward, 0);
    expect(s.bank).toBe(100 + reward);
    expect(s.achievements['d1000']).toBeTruthy();
    expect(s.stats.runs).toBe(2);
  });

  it('unlocks achievements once, from lifetime stats', () => {
    const p = useProfile.getState();
    for (let i = 0; i < 4; i++) p.finishRun(run({ nearMisses: 3 }));
    expect(useProfile.getState().achievements['near10']).toBeTruthy();
    const bank = useProfile.getState().bank;
    p.finishRun(run({ nearMisses: 3 }));
    expect(useProfile.getState().bank).toBe(bank + 40);
  });

  it('shop: cannot buy without coins; buying and equipping works', () => {
    const p = useProfile.getState();
    expect(p.buy('collar-bell')).toBe(false);
    p.finishRun(run({ coins: 400 }));
    expect(useProfile.getState().buy('collar-bell')).toBe(true);
    useProfile.getState().equip('collar-bell', 'collar');
    expect(useProfile.getState().equipped.collar).toBe('collar-bell');
    useProfile.getState().equip('trail-confetti', 'trail'); // not owned → ignored
    expect(useProfile.getState().equipped.trail).toBe(null);
    expect(COSMETICS.every((c) => c.price >= 0)).toBe(true);
  });

  it('daily challenge is deterministic per date and pays once', () => {
    expect(dailyChallenge('2026-11-23')).toEqual(dailyChallenge('2026-11-23'));
    expect(dailyChallenge('2026-11-23').text).not.toBe('');
    const dc = dailyChallenge();
    const big = run({ distance: 99999, coins: 9999, nearMisses: 99, jumps: 999, escapes: 99 });
    useProfile.getState().finishRun(big);
    expect(useProfile.getState().lastDailyDone).toBe(true);
    expect(useProfile.getState().daily.done).toBe(true);
    const bank = useProfile.getState().bank;
    useProfile.getState().finishRun(run({ coins: 0 }));
    expect(useProfile.getState().lastDailyDone).toBe(false);
    expect(useProfile.getState().bank).toBe(bank);
    void dc;
  });
});
