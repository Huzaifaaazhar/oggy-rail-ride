// Character close-ups: node scripts/inspect.cjs
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto('http://localhost:5173/?seed=3', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const shots = (process.argv[2] || 'cat:0,0.3,4:1.1;skitter:0,0.3,3:0.8;chomp:0,0.3,3.2:0.8;twig:0,0.3,3.6:1.0').split(';');
  for (const s of shots) {
    const [name, off, h, action] = s.split(':');
    await page.evaluate(([n, o, hh, act]) => {
      const g = window.__game;
      if (!window.__st) { g.start(); g.god = true; window.__st = true; }
      g.inspectCharacter(n, o.split(',').map(Number), Number(hh));
      if (act) {
        const ch = n === 'cat' ? g.cat : g.squad.runners.find((r) => r.id === n).ch;
        if (n === 'cat') ch.react(act); else ch.animator.play(act, 1.6, 0.1, 0.3);
      }
    }, [name, off, h, action]);
    await page.waitForTimeout(action ? 700 : 1200);
    await page.screenshot({ path: `/tmp/claude-0/inspect-${name}${action ? '-' + action : ''}${off.replace(/,/g, '_')}.png` });
  }
  console.log(errs.slice(0, 10).join('\n'));
  await browser.close();
})();
