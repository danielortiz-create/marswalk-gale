// Prueba de humo: carga la app, comprueba la ruta, activa capas y entra al HUD.
const { chromium } = require('playwright');
const OUT = process.env.SHOTS || 'tests/shots';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' && !/api\.nasa\.gov|ERR_/.test(m.text())) errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await p.goto(process.env.URL || 'http://localhost:5173/?malla=4&px=1');
  await p.waitForFunction(() => window.APP && window.APP.tl !== undefined && !document.getElementById('loading'), null, { timeout: 180000 });
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => { const A = window.APP, T = A.tl && A.tl.total; return T && {
    planMs: Math.round(A.planMs), km: +(T.dist / 1000).toFixed(2), hours: +(T.time / 3600).toFixed(2), o2: +T.o2.toFixed(3),
    marginG: Math.round(T.minMargin * 1000), doseUSv: Math.round(T.dose * 1000), up: Math.round(T.up),
    maxCellSlope: +Math.max(...A.tl.pts.map((q) => q.slope)).toFixed(1), order: A.plan.order.map((s) => s.id).join('>'),
    unreachable: A.unreachable.length, status: document.getElementById('status').textContent.slice(0, 40) }; });
  console.log('RUTA', JSON.stringify(info));
  await p.screenshot({ path: OUT + '/1-plan-optica.png' });
  const layer = async (i, name) => {
    const boxes = p.locator('#layers .layer > label > input[type=checkbox]');
    await boxes.nth(i).check(); await p.waitForTimeout(700);
    await p.screenshot({ path: `${OUT}/${name}.png` }); await boxes.nth(i).uncheck();
  };
  await layer(1, '2-elevacion'); await layer(2, '3-pendiente'); await layer(3, '4-termica'); await layer(4, '5-rugosidad'); await layer(5, '6-regreso');
  // quitar una parada cambia el presupuesto
  await p.evaluate(() => document.querySelector('#stops .stop input').click()); await p.waitForTimeout(500);
  const km2 = await p.evaluate(() => +(window.APP.tl.total.dist / 1000).toFixed(2));
  console.log('SIN UNA PARADA km', km2);
  await p.evaluate(() => [...document.querySelectorAll('#stops .stop input')].pop().click()); await p.waitForTimeout(500);
  await p.locator('#stops .ph').first().click(); await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/7-fotos.png' }); await p.click('#photoClose');
  // exportar GLB
  const dl = p.waitForEvent('download', { timeout: 120000 });
  await p.click('#btnGlb'); const file = await dl;
  console.log('GLB', file.suggestedFilename(), await p.evaluate(() => (window.APP.lastGlbBytes / 1e6).toFixed(1) + ' MB'));
  // HUD
  await p.click('#btnHud'); await p.waitForTimeout(600);
  await p.evaluate(() => { window.APP.H.playing = false; window.APP.H.t = 600; }); await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '/8-hud-marcha.png' });
  const tStop = await p.evaluate(() => { const q = window.APP.hudTl.pts.find((k) => k.arrive); return q.t + 120; });
  await p.evaluate((t) => { window.APP.H.t = t; }, tStop); await p.waitForTimeout(1200);
  await p.screenshot({ path: OUT + '/9-hud-parada.png' });
  await p.evaluate((t) => { window.APP.H.t = t + 2400; }, tStop); await p.waitForTimeout(500);
  await p.click('#hSep'); await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '/10-hud-alerta-solar.png' });
  console.log('SEP', await p.evaluate(() => ({ sep: window.APP.sep, backMin: Math.round((window.APP.hudTl.total.time - window.APP.sepAt) / 60) })));
  await p.click('#hExit'); await p.waitForTimeout(500);
  console.log('ERRORES', errs.length, errs.slice(0, 6));
  await b.close();
})().catch((e) => { console.error('FALLO', e); process.exit(1); });
