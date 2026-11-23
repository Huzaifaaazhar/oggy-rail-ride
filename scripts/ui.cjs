const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];
  const run = async (ctxOpts, name, fn) => {
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(name + ': ' + e.message));
    page.on('console', (m) => m.type() === 'error' && errs.push(name + ': ' + m.text()));
    await page.goto('http://localhost:5173/?seed=3&autopilot', { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    await fn(page);
    await ctx.close();
  };
  await run({ viewport: { width: 1280, height: 760 } }, 'desktop', async (page) => {
    await page.screenshot({ path: '/tmp/claude-0/ui-title.png' });
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.__game.advance(14));
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/claude-0/ui-play.png' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.screenshot({ path: '/tmp/claude-0/ui-pause.png' });
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const g = window.__game; g.autopilot = null; g.player.lives = 1; g.player.invulnT = 0; });
    await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 40 && g.player.state !== 'wipeout'; i++) g.advance(0.5); g.advance(2.5); });
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/tmp/claude-0/ui-over.png' });
  });
  await run({ ...devices['iPhone 13'] }, 'mobile', async (page) => {
    await page.screenshot({ path: '/tmp/claude-0/ui-mobile-title.png' });
    await page.evaluate(() => { window.__game.start(); window.__game.advance(8); });
    await page.waitForTimeout(400);
    await page.screenshot({ path: '/tmp/claude-0/ui-mobile-play.png' });
  });
  console.log(errs.join('\n'));
  await browser.close();
})();
