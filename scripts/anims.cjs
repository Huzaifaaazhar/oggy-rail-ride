const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 520, height: 520 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:5173/?seed=11', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  const shots0 = [
    ['ride', 'g.advance(0.6)'],
    ['jump', 'g.player.jump([]); g.cat.react("launch"); g.advance(0.22)'],
    ['slide', 'g.player.slide([]); g.advance(0.3)'],
    ['hop', 'g.cat.react("hop", 1); g.player.switchT = 0.5; g.player.switchDir = 1; g.advance(0.12)'],
    ['hit', 'g.god = false; g.player.invulnT = 0; g.player.hit([]); g.cat.react("hit"); g.advance(0.2)'],
    ['wobble', 'g.player.invulnT = 0; g.player.hit([]); g.advance(0.55); g.player.invulnT = 0; g.advance(1/60)'],
    ['angry', 'g.player.invulnT = 0; g.player.stumbleT = 0; g.advance(0.3); g.cat.react("angry"); g.advance(0.45)'],
    ['coin', 'g.cat.react("coin"); g.advance(0.15)'],
    ['dodge', 'g.cat.react("dodge", 1); g.advance(0.2)'],
    ['wipeout', 'g.player.lives = 1; g.player.invulnT = 0; g.player.hit([]); g.advance(1.2)'],
  ];
  const shots = only ? shots0.filter(([n]) => only.includes(n)) : shots0;
  for (const [name, code] of shots) {
    await page.evaluate((code) => {
      const g = window.__game;
      if (!window.__started) { g.start(); window.__started = true; }
      if (g.player.state === 'wipeout') { g.player.reset(); }
      g.autopilot = null; g.god = true; g.player.lives = 3; g.player.stumbleT = 0; g.player.slideT = 0;
      g.inspectCharacter('cat', [2.6, 0.6, 3.4], 1.0);
      // freeze forward motion for a clean close-up
      g.player.speed = 0;
      new Function('g', code)(g);
    }, code);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `/tmp/claude-0/anim-${name}.png` });
  }
  console.log(errs.join('\n'));
  await browser.close();
})();
