const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.goto('http://localhost:5173/?autopilot&seed=5&pieces=loop,straight', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const g = window.__game; g.start(); g.god = true;
    const res = [];
    for (let i = 0; i < 40; i++) {
      g.advance(1);
      for (const a of g.env.arches()) {
        let worst = Infinity;
        const F = new g.player.frame.constructor();
        for (let gi = 0; gi < g.track.count; gi += 2) {
          try { g.track.readSample(gi, F); } catch { continue; }
          if (Math.abs(F.pos.z - a.z) < 8) worst = Math.min(worst, a.bottom - (F.pos.y + 3));
        }
        res.push(`zone ${a.zone} clearance ${worst.toFixed(1)}`);
      }
    }
    return [...new Set(res)];
  });
  console.log(r.join('\n'));
  await browser.close();
})();
