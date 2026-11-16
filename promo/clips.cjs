// clips.cjs — graba los clips de la app que aparecen en el video promocional (en ingles).
// Necesita la app en marcha:  npm run dev   (puerto 5173)
// Uso:  node promo/clips.cjs            -> promo/clips/<clip>/f0000.jpg ...
//       SOLO=helmet node promo/clips.cjs (graba solo un clip)
//
// La app se dibuja paso a paso: cada fotograma se coloca a mano (camara, capas, casco)
// y se guarda como imagen. Asi el clip sale fluido aunque el equipo dibuje despacio.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FPS = 15;                                  // fotogramas por segundo de los clips
const DIR = path.join(__dirname, 'clips');
const URL = process.env.URL || 'http://localhost:5173/?malla=4&px=1&intro=0&lang=en';
const SOLO = process.env.SOLO || '';

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const cdp = await page.context().newCDPSession(page);
  page.on('pageerror', (e) => console.log('ERROR EN LA PAGINA:', e.message));

  // Reloj manual: la app solo avanza cuando llamamos a __paso()
  await page.addInitScript(() => {
    const cola = []; let ahora = 0; window.__manual = false;
    const real = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => (window.__manual ? cola.push(cb) : real(cb));
    window.__paso = (ms) => { ahora += ms; const q = cola.splice(0); for (const cb of q) cb(ahora); };
    window.__arrancar = () => { ahora = performance.now(); window.__manual = true; };
  });

  await page.goto(URL);
  await page.waitForFunction(() => window.APP && window.APP.tl && !document.getElementById('loading'), null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    window.__arrancar();
    const A = window.APP;
    A.controls.enableDamping = false;
    window.P2 = {
      // camara en orbita: angulo (grados), distancia horizontal, altura y punto al que mira (x, z)
      cam(az, dist, h, tx, tz) {
        const ty = A.terrain.heightAt(tx, tz), a = az * Math.PI / 180;
        A.controls.target.set(tx, ty, tz);
        A.camera.position.set(tx + Math.sin(a) * dist, ty + h, tz + Math.cos(a) * dist);
      },
      capa(nombre, on) {                         // enciende o apaga una capa por su nombre visible
        document.getElementById('more').open = true;
        const fila = [...document.querySelectorAll('.layer')].find((d) => d.querySelector('label span').textContent.startsWith(nombre));
        const c = fila.querySelector('input[type=checkbox]'); if (c.checked !== on) c.click();
      },
      sub(quien, texto) {                        // subtitulo del dialogo en el casco
        document.getElementById('hSubWho').textContent = quien;
        document.getElementById('hSubWho').className = quien === 'TARS' ? '' : 'ev1';
        document.getElementById('hSubText').textContent = texto;
        document.getElementById('hSub').hidden = !texto;
      },
    };
  });

  const ev = (f, a) => page.evaluate(f, a);
  const ease = (u) => u * u * (3 - 2 * u);

  // Un fotograma: avanza la app 1/15 s, espera a que el 3D termine y guarda la imagen
  async function foto(carpeta, i) {
    await ev(() => {
      window.__paso(1000 / 15);
      const gl = window.APP.renderer.getContext();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    });
    const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90, optimizeForSpeed: true });
    fs.writeFileSync(path.join(carpeta, `f${String(i).padStart(4, '0')}.jpg`), Buffer.from(r.data, 'base64'));
  }
  // Graba un clip de `seg` segundos; prepara(u, i, t) coloca la escena de cada fotograma
  async function clip(nombre, seg, prepara) {
    if (SOLO && SOLO !== nombre) return;
    const carpeta = path.join(DIR, nombre);
    fs.rmSync(carpeta, { recursive: true, force: true }); fs.mkdirSync(carpeta, { recursive: true });
    const N = Math.round(seg * FPS), t0 = Date.now();
    for (let i = 0; i < N; i++) { await prepara(i / (N - 1), i, i / FPS); await foto(carpeta, i); }
    console.log(`${nombre}: ${N} fotogramas en ${Math.round((Date.now() - t0) / 1000)} s`);
  }

  const info = await ev(() => {
    const A = window.APP, s4 = A.stops.find((s) => s.name === 'Boxwork 4');
    return { hx: A.habitat.x, hz: A.habitat.z, sx: s4.x, sz: s4.z };
  });

  // ---------- Clip 1: capas de datos y ruta segura (10 s) ----------
  await clip('plan', 10, async (u, i, t) => {
    if (i === 0) await ev(() => P2.capa('Slope', true));
    if (i === Math.round(3.4 * FPS)) await ev(() => { P2.capa('Slope', false); P2.capa('THEMIS thermal', true); });
    if (i === Math.round(6.8 * FPS)) await ev(() => P2.capa('THEMIS thermal', false));
    const e = ease(u);
    await ev(([e, i]) => P2.cam(-30 + e * 70, 1050 - e * 250, 820 - e * 160, i.hx * 0.4, i.hz * 0.4 + 60), [e, info]);
  });

  // ---------- Clip 2: objetivo cientifico de una parada (6 s) ----------
  await clip('science', 6, async (u, i) => {
    if (i === 0) await ev(() => {
      [...document.querySelectorAll('.nm')].find((e) => e.textContent.startsWith('Boxwork 4'))?.click();
      document.querySelector('.tabs button[data-tab=tars]').click();   // la tarjeta de la parada esta en la pestaña TARS
    });
    const e = ease(u);
    // desplaza el panel derecho hasta la tarjeta de la parada (en los 2 primeros segundos)
    await ev((k) => {
      const card = document.getElementById('stopCard');
      let p = card.parentElement; while (p && p.scrollHeight <= p.clientHeight + 2) p = p.parentElement;
      if (p) p.scrollTop = (p.scrollHeight - p.clientHeight) * k;
    }, ease(Math.min(1, u * 3)));
    await ev(([e, i]) => P2.cam(40 + e * 25, 520 - e * 200, 420 - e * 170, i.sx, i.sz), [e, info]);
  });

  // ---------- Clip 3: casco, TARS y alerta solar (13 s) ----------
  await clip('helmet', 13, async (u, i, t) => {
    if (i === 0) await ev(() => {
      document.getElementById('btnHud').click();
      const A = window.APP, H = A.H;
      A.dialog.update = () => {};                 // el dialogo lo escribimos a mano, sincronizado con el video
      H.playing = false;
      const primera = A.hudTl.pts.find((q) => q.arrive);
      H.t = A.hudTl.pts.find((q) => q.dist > primera.dist - 330).t;
      H.lookPitch = -0.08;
    });
    // decision ante la alerta solar a los 6 s; regreso a los 9,5 s
    if (i === Math.round(6 * FPS)) await ev(() => { document.getElementById('hSep').click(); window.APP.H.playing = false; });
    if (i === Math.round(9.5 * FPS)) await ev(() => { document.getElementById('dBack').click(); window.APP.H.playing = false; });
    await ev(([t]) => {
      const H = window.APP.H, hr = document.getElementById('hHr').textContent.split(' ')[0] || '118';
      if (t < 6 || t >= 9.5) H.t += 3;           // camina (se para mientras decide)
      H.o2 = Math.max(80, 97 - t * 1.4);          // oxigeno de demostracion bajando
      if (t < 3.3) P2.sub('TARS', `Your heart rate is up to ${hr} beats per minute. How are you feeling?`);
      else if (t < 5.6) P2.sub('ASTRONAUT · EV1', 'A little winded on this climb.');
      else if (t < 6) P2.sub('', '');
      else if (t < 9.5) {
        const d = document.getElementById('dBackD').textContent.match(/^(\d+)/);
        P2.sub('TARS', `Solar alert, EV1. Going back now takes ${d ? d[1] : 12} minutes. I recommend returning. Your call.`);
      } else if (t < 11) P2.sub('ASTRONAUT · EV1', 'Returning to the habitat.');
      else P2.sub('TARS', 'Copy. Follow the return line. The Boxwork 5 observation stays pending.');
    }, [t]);
  });

  // ---------- Clip 3b: casco en version corta para el video de 30 s (6,5 s) ----------
  await clip('helmet30', 6.5, async (u, i, t) => {
    if (i === 0) await ev(() => {
      document.getElementById('btnHud').click();
      const A = window.APP, H = A.H;
      A.dialog.update = () => {};
      H.playing = false;
      const primera = A.hudTl.pts.find((q) => q.arrive);
      H.t = A.hudTl.pts.find((q) => q.dist > primera.dist - 250).t;
      H.lookPitch = -0.08;
    });
    if (i === Math.round(3.2 * FPS)) await ev(() => { document.getElementById('hSep').click(); window.APP.H.playing = false; });
    if (i === Math.round(5 * FPS)) await ev(() => { document.getElementById('dBack').click(); window.APP.H.playing = false; });
    await ev(([t]) => {
      const H = window.APP.H, hr = document.getElementById('hHr').textContent.split(' ')[0] || '118';
      if (t < 3.2 || t >= 5) H.t += 1;           // paso lento: la camara gira suave, sin saltos
      H.o2 = Math.max(80, 97 - t * 2.5);
      if (t < 2) P2.sub('TARS', `Heart rate ${hr}. How are you feeling?`);
      else if (t < 3.2) P2.sub('ASTRONAUT · EV1', 'A little winded.');
      else if (t < 5) P2.sub('TARS', 'Solar alert, EV1. I recommend returning.');
      else P2.sub('ASTRONAUT · EV1', 'Returning to the habitat.');
    }, [t]);
  });

  await browser.close();
})().catch((e) => { console.error('FALLO', e); process.exit(1); });
