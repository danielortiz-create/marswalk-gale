// Prueba de humo en navegador: pantalla de entrada, plan, reserva de O2, evento solar,
// TARS simulado (respuestas locales) y vista de casco con el dialogo simulado.
const { chromium } = require('playwright');
const OUT = process.env.SHOTS || 'tests/shots';
const URL = process.env.URL || 'http://localhost:5173/?malla=4&px=1&intro=0&lang=es';
require('fs').mkdirSync(OUT, { recursive: true });
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLO ') + m); if (!c) process.exitCode = 1; };

async function open(b) {
  const p = await b.newPage({ viewport: { width: 1672, height: 941 } });
  p.errs = [];
  p.on('console', (m) => { if (m.type() === 'error' && !/api\.nasa\.gov|ERR_|Failed to load resource/.test(m.text())) p.errs.push(m.text()); });
  p.on('pageerror', (e) => p.errs.push('PAGEERROR ' + e.message));
  await p.goto(URL);
  await p.waitForFunction(() => window.APP && window.APP.tl !== undefined && !document.getElementById('loading'), null, { timeout: 180000 });
  await p.waitForTimeout(1200);
  return p;
}

(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  // ---------- 1. Planificador ----------
  let p = await open(b);
  const txt = (id) => p.evaluate((i) => document.getElementById(i).textContent, id);
  ok(/TARS simulado/.test(await txt('tarsState')), 'TARS simulado');
  ok((await txt('sStops')) === '5 de 5 paradas activas', 'franja: ' + await txt('sStops'));
  console.log('     franja:', await txt('sDist'), '|', await txt('sTime'), '|', await txt('sBack'), '|', await txt('sO2'), '|', await txt('sState'));
  const box = await p.evaluate(() => { const r = document.getElementById('right').getBoundingClientRect(); return [Math.round(r.right), innerWidth, Math.round(r.bottom), innerHeight]; });
  ok(box[0] <= box[1] && box[2] <= box[3], 'panel derecho dentro de la pantalla ' + box);
  await p.screenshot({ path: OUT + '/1-entrada.png' });

  await p.locator('#quick button', { hasText: 'Reserva O₂ 75' }).click(); await p.waitForTimeout(1500);
  const r75 = await p.evaluate(() => ({ om: window.APP.omitted.map((s) => s.name), left: Math.round(window.APP.tl.total.o2LeftPct), strip: document.getElementById('sStops').textContent, last: [...document.querySelectorAll('#chat .msg.tars .txt')].pop().textContent }));
  ok(r75.om.length > 0 && r75.left >= 75, `reserva 75 %: omite ${r75.om.join(', ')} y deja ${r75.left} %`);
  ok(/^\d de 5/.test(r75.strip) && !r75.strip.startsWith('5'), 'franja tras omitir: ' + r75.strip);
  console.log('     TARS:', r75.last);
  await p.screenshot({ path: OUT + '/2-reserva.png' });
  await p.locator('#quick button', { hasText: 'Sin reserva' }).click(); await p.waitForTimeout(1200);
  ok((await txt('sStops')) === '5 de 5 paradas activas', 'sin reserva vuelve a 5 de 5');

  await p.evaluate(() => [...document.querySelectorAll('#labels .lbl')].find((e) => /Boxwork 3/.test(e.textContent)).click());
  ok(await p.evaluate(() => window.APP.selected.name === 'Boxwork 3' && /Boxwork 3/.test(document.querySelector('#stopCard h3').textContent)), 'clic en la etiqueta selecciona Boxwork 3');
  await p.click('#btnSolar'); await p.waitForTimeout(800);
  const ev = await p.evaluate(() => ({ vis: window.APP.backLine.visible, arrows: window.APP.backArrows.children.length, state: document.getElementById('sState').textContent, info: window.APP.event.info }));
  ok(ev.vis && ev.arrows > 0 && ev.state === 'Escenario simulado', `evento solar: línea de regreso con ${ev.arrows} flechas`);
  console.log('     escenario:', JSON.stringify(ev.info));
  await p.screenshot({ path: OUT + '/3-evento-solar.png' });
  await p.click('#btnBack'); await p.waitForTimeout(800); await p.screenshot({ path: OUT + '/4-ruta-regreso.png' });
  await p.click('#btnSolar');
  ok(!(await p.evaluate(() => window.APP.backLine.visible)), 'quitar evento oculta la línea');

  await p.click('.tabs button[data-tab=stops]'); await p.waitForTimeout(300); await p.screenshot({ path: OUT + '/5-paradas.png' });
  await p.click('.tabs button[data-tab=env]'); await p.waitForTimeout(300); await p.screenshot({ path: OUT + '/6-entorno.png' });
  await p.evaluate(() => { document.getElementById('more').open = true; });
  await p.locator('#layers .layer > label > input').nth(2).check(); await p.waitForTimeout(600); await p.screenshot({ path: OUT + '/7-pendiente.png' });
  await p.fill('#tarsIn', 'reserva 75 %'); await p.press('#tarsIn', 'Enter'); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => window.APP.omitted.length > 0), 'texto libre: reserva 75 % aplicada');
  await p.locator('#quick button', { hasText: 'Sin reserva' }).click(); await p.waitForTimeout(1200);

  // ---------- 2. Casco: dialogo simulado y pregunta a TARS por texto ----------
  await p.click('#btnHud'); await p.waitForTimeout(600);
  await p.evaluate(() => { window.APP.H.playing = false; window.APP.H.t = 900; }); await p.waitForTimeout(700);
  await p.fill('#hTarsIn', '¿Cuál es el estado?'); await p.press('#hTarsIn', 'Enter');
  await p.waitForFunction(() => /Oxígeno/.test(document.getElementById('hTarsSay').textContent), null, { timeout: 10000 });
  await p.evaluate(() => { window.APP.H.playing = true; }); await p.waitForTimeout(3000);
  ok(await p.evaluate(() => !document.getElementById('hSub').hidden && /TARS/.test(document.getElementById('hSubWho').textContent)), 'el dialogo simulado empieza con TARS');
  await p.screenshot({ path: OUT + '/9-casco-tars.png' });
  await p.click('#hSep');
  await p.waitForTimeout(600);
  ok(await p.evaluate(() => window.APP.sep && window.APP.returning), 'alerta solar en casco recalcula el regreso');
  await p.screenshot({ path: OUT + '/10-casco-alerta.png' });
  await p.click('#hExit'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => document.body.dataset.mode === 'plan'), 'salir del casco vuelve al planificador');
  ok(p.errs.length === 0, 'sin errores de consola ' + p.errs.slice(0, 3));
  await b.close();
})().catch((e) => { console.error('FALLO', e); process.exit(1); });
