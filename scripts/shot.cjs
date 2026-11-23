// Usage: node scripts/shot.cjs <url-query> <outPrefix> [startGame] [times...]
const { chromium } = require('playwright');
(async () => {
  const [, , query = '', prefix = 'shot', start = '0', ...times] = process.argv;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto('http://localhost:5173/?' + query, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  if (start === '1') await page.evaluate(() => window.__game.start());
  const ts = times.length ? times.map(Number) : [2];
  let prev = 0;
  for (const t of ts) {
    await page.waitForTimeout((t - prev) * 1000);
    prev = t;
    await page.screenshot({ path: `${process.env.OUT || '/tmp/claude-0'}/${prefix}-${t}.png` });
  }
  const info = await page.evaluate(() => { const g = window.__game; return { s: g.player.s.toFixed(1), speed: g.player.speed.toFixed(1), state: g.player.state, piece: g.track.pieceAt(g.player.s)?.geom }; });
  console.log(JSON.stringify(info));
  console.log(logs.slice(0, 15).join('\n'));
  await browser.close();
})();
