const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.goto('http://localhost:5173/?seed=7&autopilot', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => {
    const g = window.__game; g.start();
    const times = [];
    for (let i = 0; i < 60 * 90; i++) { const t = performance.now(); g.advance(1 / 60); times.push(performance.now() - t); }
    times.sort((a, b) => a - b);
    const q = (p) => times[Math.floor(times.length * p)].toFixed(2);
    let tris = 0, meshes = 0;
    g.root.traverse((o) => { if (o.isMesh && o.visible) { meshes++; const geo = o.geometry; const n = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3; tris += n * (o.isInstancedMesh ? o.count : 1); } });
    return { p50: q(0.5), p95: q(0.95), p99: q(0.99), max: times[times.length - 1].toFixed(1), meshes, tris: Math.round(tris / 1000) + 'k', s: g.player.s.toFixed(0) };
  });
  console.log(JSON.stringify(r));
  await browser.close();
})();
