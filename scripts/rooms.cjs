const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.goto('http://localhost:5173/?seed=14&autopilot', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game);
  await page.waitForTimeout(5000);
  for (const id of ['bedroom', 'rooftop', 'impossible']) {
    await page.evaluate((id) => {
      const g = window.__game;
      const proto = g.env.constructor.prototype;
      if (!proto.__orig) proto.__orig = proto.themeFor;
      let theme = null;
      for (let i = 1; i < 400 && !theme; i++) { const t = proto.__orig.call(g.env, i); if (t.id === id) theme = t; }
      if (!theme) { const surreal = proto.__orig; for (let i = 6; i < 400 && !theme; i++) { const t = surreal.call(g.env, i); if (t.id === id) theme = t; } }
      proto.themeFor = function () { return theme; };
      g.start(14);
      g.god = true;
      g.advance(9);
    }, id);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `/tmp/claude-0/room-${id}.png` });
  }
  // signature moments
  await page.evaluate(() => {
    const g = window.__game;
    const proto = g.env.constructor.prototype;
    proto.themeFor = proto.__orig;
    g.start(21);
    g.god = true;
    g.advance(6);
    const host = { track: g.track, player: g.player, entities: g.entities, squad: g.squad, banner: (t) => g.constructor && window.__hudToast?.(t) };
    g.director.run('lineup', host);
    g.advance(1.2);
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/claude-0/sig-lineup.png' });
  await page.evaluate(() => {
    const g = window.__game;
    g.god = false;
    const p = g.player;
    g.entities.addCoins([{ s: p.s + 12, u: Math.round(0), h: 0.8, item: 'tray' }]);
    const xs = [0, 1, 2].map((i) => p.frame.lanes[i * 2]).sort((a, b) => a - b);
    const c = g.entities.coins[g.entities.coins.length - 1];
    c.u = p.lateral.x < (xs[0] + xs[1]) / 2 ? -1 : p.lateral.x > (xs[1] + xs[2]) / 2 ? 1 : 0;
    g.advance(1.4);
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/claude-0/sig-tray.png' });
  await page.evaluate(() => {
    const g = window.__game;
    g.god = true;
    const host = { track: g.track, player: g.player, entities: g.entities, squad: g.squad, banner: () => {} };
    for (let i = 0; i < 5 && !g.director.run('giantDrop', host); i++) g.advance(2);
    const pot = g.entities.obstacles.find((o) => o.kind === 'giantPot');
    while (pot && pot.yOff > 3 && g.player.s < pot.s) g.advance(0.1);
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/claude-0/sig-pot.png' });
  await browser.close();
})();
