const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 680 } });
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.goto('http://localhost:5173/?seed=12&autopilot', { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const g = window.__game; g.start(); g.player.distance = 2600; });
  const shots = [6, 10, 14, 18, 22, 26];
  let prev = 0;
  for (const t of shots) {
    await page.evaluate((d) => window.__game.advance(d), t - prev);
    prev = t;
    await page.waitForTimeout(600);
    await page.screenshot({ path: `/tmp/claude-0/gp-${t}.png` });
  }
  // failure sequence
  await page.evaluate(() => { const g = window.__game; g.autopilot = null; const p = g.player; for (const o of g.entities.obstacles) g.entities.root.remove(o.obj); g.entities.obstacles.length = 0; g.entities.spawn({ s: p.s + 30, kind: 'teapot', u: Math.round(window.__game.entities ? 0 : 0), span: 1, motion: { type: 'static' }, warn: false }); });
  await page.evaluate(() => { const g = window.__game; const p = g.player; const f = p.frame; const xs=[0,1,2].map(i=>f.lanes[i*2]).sort((a,b)=>a-b); const lat=p.lateral.x; const rank = lat < (xs[0]+xs[1])/2 ? -1 : lat > (xs[1]+xs[2])/2 ? 1 : 0; const o = g.entities.obstacles[0]; o.u = rank; o.spec.u = rank; });
  await page.evaluate(() => window.__game.advance(1.1));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/claude-0/gp-crash1.png' });
  await page.evaluate(() => window.__game.advance(0.8));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/claude-0/gp-crash2.png' });
  await page.evaluate(() => window.__game.advance(1.5));
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/claude-0/gp-over.png' });
  await browser.close();
})();
