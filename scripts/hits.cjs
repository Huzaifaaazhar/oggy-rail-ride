const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  await page.goto('http://localhost:5173/?autopilot&seed=' + (process.argv[2] || 3), { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const out = await page.evaluate(() => {
    const g = window.__game;
    g.start();
    const log = [];
    const orig = g.player.hit.bind(g.player);
    g.player.hit = (ev) => {
      const p = g.player;
      const near = g.entities.obstacles.filter((o) => Math.abs(o.s - p.s) < 3).map((o) => `${o.kind}@r${o.rail}${o.wide ? 'W' : ''} ds=${(o.s - p.s).toFixed(1)}`);
      const pc = g.track.pieceAt(p.s);
      log.push(`s=${p.s.toFixed(0)} rail=${p.fromRail}->${p.toRail} t=${p.switchT.toFixed(2)} h=${p.height.toFixed(2)} slide=${p.slideT.toFixed(2)} v=${p.speed.toFixed(0)} piece=${pc.geom}/${pc.lane} lanes=${Array.from(p.frame.lanes).map((x) => x.toFixed(1)).join(',')} | ${near.join(' ')}`);
      return orig(ev);
    };
    for (let i = 0; i < 150; i++) { g.advance(1); if (g.player.lives <= 0) break; g.player.lives = 3; }
    return { log, s: g.player.s, coins: g.coins };
  });
  console.log(out.log.join('\n'));
  console.log('reached', out.s.toFixed(0), 'coins', out.coins);
  await browser.close();
})();
