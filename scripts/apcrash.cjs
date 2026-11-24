// Why does the autopilot crash? Logs the obstacles around the crash.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.goto('http://localhost:5173/?autopilot&seed=' + (process.argv[2] || 21), { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const g = window.__game;
    g.start();
    const p = g.player;
    const log = [];
    const snap = () => g.entities.obstacles.filter((o) => Math.abs(o.s - p.s) < 40).map((o) => `${o.kind}(${o.spec.motion.type}${o.spec.by ? ' by ' + o.spec.by : ''}) s+${(o.s - p.s).toFixed(1)} u=${o.u.toFixed(2)} span${o.spec.span} solid=${o.solid}`);
    let hist = [];
    for (let i = 0; i < 60 * 150 && !p.crashed; i++) {
      g.advance(1 / 60);
      if (i % 15 === 0) { hist.push(`t=${(i / 60).toFixed(2)} s=${p.s.toFixed(0)} lat=${p.lateral.x.toFixed(2)} sw=${p.switchT.toFixed(2)} h=${p.height.toFixed(2)} | ` + snap().join('; ')); if (hist.length > 8) hist.shift(); }
    }
    return { crashed: p.crashed, kind: g.crashKind, d: p.distance, hist, zone: JSON.stringify(g.entities.zone(p.s - 5, p.s + 5)) };
  });
  console.log(JSON.stringify({ crashed: r.crashed, kind: r.kind, d: r.d, zone: r.zone }));
  console.log(r.hist.join('\n'));
  await browser.close();
})();
