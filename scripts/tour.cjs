// Fast-forward tour: node scripts/tour.cjs <query> <prefix> <t1,t2,...> (sim seconds)
const { chromium } = require('playwright');
(async () => {
  const [, , query = 'seed=3', prefix = 'tour', times = '2,6,12'] = process.argv;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message + ' ' + e.stack));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto('http://localhost:5173/?' + query, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__game.start());
  let prev = 0;
  for (const t of times.split(',').map(Number)) {
    const t0 = Date.now();
    await page.evaluate((d) => { const g = window.__game; if (window.__god) g.player.invulnT = 99; g.advance(d); }, t - prev);
    prev = t;
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => { const g = window.__game; const p = g.player; return { s: p.s.toFixed(0), y: p.position.y.toFixed(0), speed: p.speed.toFixed(1), state: p.state, lives: p.lives, coins: g.coins, piece: g.track.pieceAt(p.s)?.geom + '/' + g.track.pieceAt(p.s)?.lane, room: g.env.themeAt(p.position.z).id }; });
    await page.screenshot({ path: `/tmp/claude-0/${prefix}-${t}.png` });
    console.log(t, JSON.stringify(info), (Date.now() - t0) + 'ms');
  }
  console.log(errs.slice(0, 8).join('\n'));
  await browser.close();
})();
