// Jump the rider to the middle of the first piece of a given kind and screenshot a sequence.
// node scripts/feature.cjs <pieces> <kind> <lane|-> <prefix> <fractions>
const { chromium } = require('playwright');
(async () => {
  const [, , pieces, kind, lane, prefix, fr = '0.1,0.3,0.5,0.7,0.9'] = process.argv;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:5173/?autopilot&seed=5${pieces ? '&pieces=' + pieces : ''}`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const info = await page.evaluate(([kind, lane]) => {
    const g = window.__game;
    g.start();
    g.god = true;
    g.track.ensure(6000);
    const pc = g.track.pieces.find((p) => p.index > 3 && (kind === '-' || p.geom === kind) && (lane === '-' || p.lane === lane));
    if (!pc) return null;
    window.__pc = pc;
    return { s0: pc.s0, s1: pc.s1, geom: pc.geom, lane: pc.lane };
  }, [kind, lane]);
  if (!info) { console.log('no piece'); await browser.close(); return; }
  console.log(JSON.stringify(info));
  for (const f of fr.split(',').map(Number)) {
    await page.evaluate((f) => {
      const g = window.__game;
      const pc = window.__pc;
      const target = pc.s0 + (pc.s1 - pc.s0) * f;
      // fast-forward to just before the target so the camera settles
      if (g.player.s < target - 40) { g.player.s = target - 40; g.player.distance = g.player.s; }
      g.god = true;
      while (g.player.s < target) g.advance(1 / 60);
    }, f);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `/tmp/claude-0/${prefix}-${f}.png` });
  }
  console.log(errs.join('\n'));
  await browser.close();
})();
