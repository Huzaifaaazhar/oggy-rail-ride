// Part 3 browser checks: menus, settings, audio, signature moments, tray ride, mobile swipes, perf & memory.
const { chromium, devices } = require('playwright');
const OUT = process.env.OUT || '/tmp/claude-0';
const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const open = async (query, ctxOpts = { viewport: { width: 1000, height: 640 } }) => {
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('http://localhost:5173/?' + query, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game, null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    return page;
  };

  // 1) full flow through the real UI
  {
    const page = await open('seed=5');
    const phase = () => page.evaluate(() => (document.querySelector('#over-title') ? 'over' : document.querySelector('#pause-title') ? 'paused' : document.querySelector('.menu-card') ? 'menu' : 'other'));
    check('opens on the main menu', (await phase()) === 'menu');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.locator('#vol-music').fill('0.3');
    await page.getByRole('button', { name: 'Gentle' }).click();
    await page.getByRole('button', { name: 'Back' }).click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bb-profile-v1')).settings);
    check('settings persist', Math.abs(saved.music - 0.3) < 0.01 && saved.cameraRoll === 'gentle', JSON.stringify(saved));
    check('camera roll setting applied', await page.evaluate(() => window.__game.camera.rollFollow === 0.5));
    await page.getByRole('button', { name: 'Start the chase' }).click();
    await page.waitForTimeout(400);
    const a = await page.evaluate(() => ({ ctx: !!window.__audio.ctx, state: window.__audio.ctx?.state }));
    check('audio starts after the Start click', a.ctx, JSON.stringify(a));
    await page.evaluate(() => window.__game.advance(3));
    check('playing after start', await page.evaluate(() => window.__game.player.distance > 10));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('pause menu opens', (await phase()) === 'paused');
    await page.getByRole('button', { name: 'Quit to menu' }).click();
    await page.waitForTimeout(800);
    check('quit returns to the main menu', (await phase()) === 'menu');
    await page.getByRole('button', { name: 'Start the chase' }).click();
    await page.evaluate(() => { const g = window.__game; g.advance(2); g.entities.spawn({ s: g.player.s + 25, kind: 'fridge', u: 0, span: 1, motion: { type: 'static' }, warn: false }); g.advance(4); });
    await page.waitForTimeout(600);
    check('crash leads to the results card', (await phase()) === 'over');
    const prof = await page.evaluate(() => JSON.parse(localStorage.getItem('bb-profile-v1')));
    check('run saved to history, coins banked, achievement unlocked', prof.history.length === 1 && prof.achievements['first-run'] > 0, `bank ${prof.bank}`);
    await page.getByRole('button', { name: 'Main menu' }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'High scores' }).click();
    check('high-score table lists the run', (await page.locator('.scores li').count()) === 1);
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: /Daily challenge/ }).click();
    await page.getByRole('button', { name: "Ride today's staircase" }).click();
    await page.waitForTimeout(500);
    check('daily challenge starts a seeded run', await page.evaluate(() => window.__game.player.distance >= 0 && !window.__game.player.crashed && !!document.querySelector('.plaque')));
    // every visible button does something: no dead buttons on the menu
    await page.evaluate(() => window.__game.toMenu());
    await page.waitForTimeout(500);
    const names = await page.locator('.menu-card button').allInnerTexts();
    check('menu buttons present', names.length >= 6, names.join(' | '));
    await page.context().close();
  }

  // 2) signature moments, each forced
  {
    const page = await open('seed=7&autopilot');
    const r = await page.evaluate(() => {
      const g = window.__game;
      g.start();
      g.player.distance = 2000;
      g.advance(3);
      const host = { track: g.track, player: g.player, entities: g.entities, squad: g.squad, banner: () => {} };
      const res = {};
      for (const m of ['lineup', 'giantDrop', 'rolling', 'conga', 'tray', 'nearCatch', 'lever']) {
        let ok = false;
        for (let tries = 0; tries < 6 && !ok; tries++) {
          ok = g.director.run(m, host);
          if (!ok) g.advance(2);
        }
        res[m] = ok;
        if (m === 'giantDrop') res.giant = g.entities.obstacles.some((o) => o.kind === 'giantPot');
        if (m === 'rolling') res.yarn = g.entities.obstacles.some((o) => o.kind === 'bigYarn');
        if (m === 'tray') res.tray = g.entities.coins.some((c) => c.item === 'tray');
        g.advance(1);
      }
      g.advance(4);
      res.minGap = g.squad.minGapSeen;
      return res;
    });
    for (const m of ['lineup', 'giantDrop', 'rolling', 'conga', 'tray', 'nearCatch']) check(`moment: ${m}`, r[m]);
    check('moment: lever (needs an upcoming split)', r.lever, r.lever ? '' : 'no split/merge/cross within 260 m in this seed');
    check('giant pot / rolling yarn / tray placed', r.giant && r.yarn && r.tray);
    check('roaches still ahead after the moments', r.minGap >= 6.4, r.minGap.toFixed(1));
    await page.screenshot({ path: `${OUT}/e3-moments.png` });
    await page.context().close();
  }

  // 3) tea-tray ride: faster, smashes obstacles
  {
    const page = await open('seed=4');
    const r = await page.evaluate(() => {
      const g = window.__game;
      g.start();
      g.advance(2);
      const p = g.player;
      g.squad.update = () => {};
      const v0 = p.speed;
      g.entities.addCoins([{ s: p.s + 20, u: 0, h: 0.8, item: 'tray' }]);
      g.advance(1.5);
      const riding = p.rideT > 0;
      g.entities.spawn({ s: p.s + 30, kind: 'teapot', u: 0, span: 1, motion: { type: 'static' }, warn: false });
      g.advance(2);
      return { riding, crashed: p.crashed, faster: p.speed > v0 * 1.15 };
    });
    check('tray ride starts on pickup', r.riding);
    check('tray ride smashes through obstacles', !r.crashed);
    check('tray ride is faster', r.faster);
    await page.context().close();
  }

  // 4) mobile: swipes drive the cat
  {
    const page = await open('seed=4', { ...devices['Pixel 7'] });
    await page.getByRole('button', { name: 'Start the chase' }).tap();
    await page.evaluate(() => window.__game.advance(1));
    const swipe = async (dx, dy) => {
      await page.evaluate(([dx, dy]) => {
        const el = document.querySelector('canvas');
        const mk = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
        const x0 = 200, y0 = 400;
        el.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(x0, y0)], changedTouches: [mk(x0, y0)], bubbles: true }));
        for (let i = 1; i <= 4; i++) el.dispatchEvent(new TouchEvent('touchmove', { touches: [mk(x0 + (dx * i) / 4, y0 + (dy * i) / 4)], changedTouches: [mk(x0 + (dx * i) / 4, y0 + (dy * i) / 4)], bubbles: true, cancelable: true }));
        el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(x0 + dx, y0 + dy)], bubbles: true }));
      }, [dx, dy]);
      await page.evaluate(() => window.__game.advance(0.05));
    };
    const rail0 = await page.evaluate(() => window.__game.player.toRail);
    await swipe(-90, 0);
    const rail1 = await page.evaluate(() => window.__game.player.toRail);
    check('swipe left switches rail', rail1 !== rail0, `${rail0} → ${rail1}`);
    await page.evaluate(() => window.__game.advance(0.4));
    await swipe(0, -90);
    check('swipe up jumps', await page.evaluate(() => window.__game.player.airborne));
    await page.evaluate(() => window.__game.advance(1));
    await swipe(0, 90);
    check('swipe down slides', await page.evaluate(() => window.__game.player.sliding));
    check('low graphics picked on a phone', await page.evaluate(() => window.__game.quality() === 'low'));
    await page.screenshot({ path: `${OUT}/e3-mobile.png` });
    await page.context().close();
  }

  // 5) extreme speed: still never caught; performance & memory over a long run
  {
    const page = await open('seed=11&autopilot');
    const r = await page.evaluate(() => {
      const g = window.__game;
      g.start();
      g.god = true;
      g.player.distance = 14000;
      const heap = () => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0);
      const count = () => { let n = 0; g.root.traverse(() => n++); return n; };
      const times = [];
      let minAhead = Infinity;
      g.advance(20);
      const h1 = heap();
      const n1 = count();
      for (let i = 0; i < 60 * 120; i++) {
        const t = performance.now();
        g.advance(1 / 60);
        times.push(performance.now() - t);
        if (i % 30 === 0) { g.squad.nearCatch(); }
        for (const rr of g.squad.runners) minAhead = Math.min(minAhead, rr.s - g.player.s);
      }
      const h2 = heap();
      const n2 = count();
      times.sort((a, b) => a - b);
      return { speed: g.player.speed, minAhead, p50: times[Math.floor(times.length / 2)], p99: times[Math.floor(times.length * 0.99)], h1, h2, n1, n2, dist: g.player.distance };
    });
    check('top speed reached', r.speed > 50, `${r.speed.toFixed(1)} m/s`);
    check('never caught at top speed with forced near-catches', r.minAhead >= 6.4, `closest ${r.minAhead.toFixed(1)} m`);
    check('frame CPU budget', r.p50 < 2 && r.p99 < 16, `p50 ${r.p50.toFixed(2)} ms, p99 ${r.p99.toFixed(2)} ms`);
    check('memory stable over 2 minutes (~6 km)', r.h2 < r.h1 * 1.5 + 40, `heap ${r.h1.toFixed(0)} → ${r.h2.toFixed(0)} MB`);
    check('scene object count bounded', r.n2 < r.n1 * 1.6, `${r.n1} → ${r.n2}`);
    await page.context().close();
  }

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
