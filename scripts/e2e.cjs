// Browser end-to-end checks for the gameplay loop. Needs `npm run dev`.
// node scripts/e2e.cjs  → exits 1 on any failed check
const { chromium } = require('playwright');
const OUT = process.env.OUT || '/tmp/claude-0';
const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok, info });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const open = async (query) => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('http://localhost:5173/?' + query, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game, null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    return page;
  };

  // 1) long autopilot run: invariants over ~2.5 km
  {
    const page = await open('seed=21&autopilot');
    const r = await page.evaluate(() => {
      const g = window.__game;
      g.start();
      const out = { detached: 0, minAhead: Infinity, levels: new Set(), shots: [], crashed: false, warnings: 0, tricks: 0 };
      const F = new g.player.frame.constructor();
      const V = g.player.position.clone();
      for (let sec = 0; sec < 110; sec++) {
        g.advance(1);
        const p = g.player;
        if (p.crashed) { out.crashed = true; out.crashKind = g.crashKind; out.crashAt = p.distance; break; }
        // attached: rider sits on a rail (or between two while hopping)
        g.track.frameAt(p.s, F);
        if (p.switchT >= 1) {
          F.railPoint(p.toRail, V).addScaledVector(F.up, 0.2 + p.height);
          if (V.distanceTo(p.position) > 0.05) out.detached++;
        }
        for (const rr of g.squad.runners) out.minAhead = Math.min(out.minAhead, rr.s - p.s);
        out.levels.add(Math.round(p.speed));
        out.maxSpeed = Math.max(out.maxSpeed || 0, p.speed);
      }
      const st = g.squad.stats;
      return { ...out, levels: [...out.levels].length, dist: g.player.distance, coins: g.coins, speed: g.player.speed, stats: st, minGapSeen: g.squad.minGapSeen, hudLevel: window.__hud?.getState?.().speedLevel };
    });
    check('rider stays attached to the rails', r.detached === 0, `${r.detached} detached samples`);
    check('roaches always ahead of the cat', r.minAhead >= 6.4 && r.minGapSeen >= 6.4, `closest ${r.minGapSeen.toFixed(1)} m`);
    check('distance covered', r.dist > 1500, `${Math.round(r.dist)} m${r.crashed ? ` (autopilot crashed at ${Math.round(r.crashAt)} m into ${r.crashKind})` : ''}`);
    check('coins collected', r.coins > 30, `${r.coins} coins`);
    check('speed increased with distance', r.maxSpeed > 26, `peak ${r.maxSpeed.toFixed(1)} m/s`);
    check('roach interference happened', r.stats.throws + r.stats.traps + r.stats.twigTricks + r.stats.drops > 4, JSON.stringify(r.stats));
    await page.screenshot({ path: `${OUT}/e2e-run.png` });
    await page.close();
  }

  // 2) head-on crash → failure → instant restart
  {
    const page = await open('seed=4');
    const r = await page.evaluate(() => {
      const g = window.__game;
      g.start();
      g.advance(2);
      const p = g.player;
      const rank = 0; // middle rail
      g.entities.spawn({ s: p.s + 25, kind: 'fridge', u: rank, span: 1, motion: { type: 'static' }, warn: false });
      g.advance(1.4);
      const crashed = p.crashed;
      g.advance(2.4);
      return { crashed, kind: g.crashKind };
    });
    check('head-on hit crashes the run', r.crashed && r.kind === 'fridge', JSON.stringify(r));
    await page.screenshot({ path: `${OUT}/e2e-over.png` });
    const over = await page.locator('#over-title').isVisible();
    const text = await page.locator('.card .lede').innerText().catch(() => '');
    check('game-over card shows distance, coins and best', over && (await page.locator('.results dd').count()) === 3, text);
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => !window.__game.player.crashed, null, { timeout: 15000 }).catch(() => {});
    const after = await page.evaluate(() => ({ crashed: window.__game.player.crashed, d: window.__game.player.distance }));
    check('R restarts instantly', !after.crashed && after.d < 5, JSON.stringify(after));
    await page.close();
  }

  // 3) side clip → stumble, second clip soon after → crash
  {
    const page = await open('seed=4');
    const r = await page.evaluate(() => {
      const g = window.__game;
      g.start();
      g.advance(2);
      const p = g.player;
      g.entities.spawn({ s: p.s + 22, kind: 'chair', u: 0.27, span: 1, motion: { type: 'static' }, warn: false });
      g.advance(1.3);
      const first = { state: p.state, crashed: p.crashed };
      g.advance(1.0);
      g.entities.spawn({ s: p.s + 22, kind: 'chair', u: 0.27, span: 1, motion: { type: 'static' }, warn: false });
      g.advance(1.3);
      return { first, crashed: p.crashed };
    });
    check('side clip is a stumble', r.first.state === 'stumble' && !r.first.crashed, JSON.stringify(r.first));
    check('second clip within 6 s ends the run', r.crashed);
    await page.close();
  }

  // 4) jump clears a low obstacle, slide clears a high one, at top speed (no tunnelling)
  {
    const page = await open('seed=4');
    const r = await page.evaluate(() => {
      const g = window.__game;
      g.start();
      g.advance(1);
      const p = g.player;
      p.distance = 9000; // top speed tier
      // isolate the test: no regular rows, no roach tricks
      g.squad.update = () => {};
      const clear = () => { for (const o of g.entities.obstacles) g.entities.root.remove(o.obj); g.entities.obstacles.length = 0; g.entities.cursor = p.s + 1e5; };
      clear();
      g.advance(3);
      clear();
      const speed = p.speed;
      g.entities.spawn({ s: p.s + 40, kind: 'books', u: 0, span: 3, motion: { type: 'static' }, warn: false });
      let jumped = false;
      for (let i = 0; i < 120 && !p.crashed; i++) {
        const o = g.entities.obstacles.find((x) => x.kind === 'books');
        if (!jumped && o && o.s - p.s < speed * 0.2 + 1.2) { p.jump([]); jumped = true; }
        g.advance(1 / 60);
      }
      const lowOk = !p.crashed;
      g.entities.spawn({ s: p.s + 40, kind: 'laundry', u: 0, span: 3, motion: { type: 'static' }, warn: false });
      let slid = false;
      for (let i = 0; i < 120 && !p.crashed; i++) {
        const o = g.entities.obstacles.find((x) => x.kind === 'laundry');
        if (!slid && o && o.s - p.s < speed * 0.14 + 1.2) { p.slide([]); slid = true; }
        g.advance(1 / 60);
      }
      const highOk = !p.crashed;
      // without reacting, a thin obstacle at top speed must still be hit (swept collision, 20 fps steps)
      g.entities.spawn({ s: p.s + 30, kind: 'laundry', u: 0, span: 3, motion: { type: 'static' }, warn: false });
      for (let i = 0; i < 40 && !p.crashed; i++) g.advance(1 / 20, 1 / 20);
      return { speed, lowOk, highOk, tunnelHit: p.crashed || p.state === 'stumble' };
    });
    check('jump clears a low obstacle at top speed', r.lowOk, `${r.speed.toFixed(1)} m/s`);
    check('slide clears a high obstacle at top speed', r.highOk);
    check('no tunnelling at top speed with 20 fps steps', r.tunnelHit);
    await page.close();
  }

  // 5) coins, magnet and golden fish
  {
    const page = await open('seed=4');
    const r = await page.evaluate(() => {
      const g = window.__game;
      g.start();
      g.advance(1);
      const p = g.player;
      const c0 = g.coins;
      const base = { u: 0, h: 0.75 };
      g.entities.coins.push(...[0, 1, 2, 3, 4].map((k) => ({ ...base, s: p.s + 30 + k * 2.5, taken: false, t: 0, pos: p.position.clone(), mesh: null })));
      g.advance(3);
      const lineCollected = g.coins - c0;
      g.entities.magnetT = 10;
      const c1 = g.coins;
      g.entities.coins.push(...[-1, 1].map((u) => ({ u, h: 0.75, s: p.s + 12, taken: false, t: 0, pos: p.position.clone(), mesh: null })));
      g.advance(1);
      return { lineCollected, magnet: g.coins - c1 };
    });
    check('coins on the rail are collected', r.lineCollected === 5, JSON.stringify(r));
    check('magnet pulls in coins from other rails', r.magnet === 2);
    await page.close();
  }

  // 6) loops and corkscrews in the browser, with screenshots
  for (const kind of ['loop', 'corkscrew']) {
    const page = await open(`seed=8&autopilot&pieces=${kind},straight`);
    const r = await page.evaluate((kind) => {
      const g = window.__game;
      g.start();
      g.god = true;
      const pc = g.track.pieces.find((x) => x.geom === kind);
      while (g.player.s < pc.s0 + (pc.s1 - pc.s0) * 0.5) g.advance(0.25);
      return { up: g.player.frame.up.y };
    }, kind);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/e2e-${kind}.png` });
    check(`${kind}: rider inverted mid-way and still riding`, r.up < 0.2, `up.y=${r.up.toFixed(2)}`);
    await page.close();
  }

  // 7) roach trick + ambush placement keep rows fair
  {
    const page = await open('seed=33&autopilot');
    const r = await page.evaluate(() => {
      const g = window.__game;
      g.start();
      g.player.distance = 3000;
      g.squad.ambushT = 0.1;
      g.advance(25);
      const st = g.squad.stats;
      return { st, crashed: g.player.crashed };
    });
    check('ambushes and tricks fire at higher difficulty', r.st.ambushes + r.st.traps > 0, JSON.stringify(r.st));
    await page.screenshot({ path: `${OUT}/e2e-ambush.png` });
    await page.close();
  }

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
