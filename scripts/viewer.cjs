// Neutral-background renders: node scripts/viewer.cjs "cat:ride:;cat:ride:angry" [az,el,dist,h]
const { chromium } = require('playwright');
(async () => {
  const shots = (process.argv[2] || 'cat:ride:').split(';');
  const view = (process.argv[3] || '0.35,0.12,4.6,0.95').split(',').map(Number);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !m.text().includes('GPU stall') && errs.push(m.text()));
  await page.goto('http://localhost:5173/?viewer', { waitUntil: 'load' });
  await page.waitForTimeout(9000); // sculpting in the worker
  for (const s of shots) {
    const [who, base, action, v] = s.split(':');
    const vv = v ? v.split(',').map(Number) : view;
    await page.evaluate(([w, b]) => window.__viewer.select(w, b), [who, base]);
    await page.waitForTimeout(400);
    await page.evaluate((vv) => window.__viewer.view(...vv), vv);
    if (action) { await page.evaluate((a) => window.__viewer.play(a), action); await page.waitForTimeout(550); }
    else await page.waitForTimeout(500);
    await page.screenshot({ path: `/tmp/claude-0/v-${who}-${base}${action ? '-' + action : ''}-${vv.join('_')}.png` });
  }
  console.log(errs.slice(0, 10).join('\n'));
  await browser.close();
})();
