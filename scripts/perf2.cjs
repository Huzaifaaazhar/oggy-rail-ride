const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.goto('http://localhost:5173/?seed=7&autopilot', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => {
    const g = window.__game; g.start();
    const log = [];
    const wrap = (obj, name, label) => { const f = obj[name].bind(obj); obj[name] = (...a) => { const t = performance.now(); const res = f(...a); log.push(label + ' ' + (performance.now() - t).toFixed(1)); return res; }; };
    wrap(g.env, 'buildZone', 'zone');
    wrap(g.env, 'bake', ' bake');
    wrap(g.env, 'scan', ' scan');
    wrap(g.streamer, 'update', 'trackchunks');
    wrap(g.track, 'appendPiece', 'piece');
    for (let i = 0; i < 60 * 60; i++) g.advance(1 / 60);
    return log.filter((l) => parseFloat(l.split(' ').pop()) > 4);
  });
  console.log(r.join('\n'));
  await browser.close();
})();
