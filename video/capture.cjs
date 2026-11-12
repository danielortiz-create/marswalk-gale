// capture.cjs — graba el video de presentacion fotograma a fotograma.
// Necesita el servidor en el puerto 5173:  npx vite --port 5173 --strictPort
// Uso:  node video/capture.cjs          (todas las tomas)
//       PRUEBA=1 node video/capture.cjs (1 de cada 15 fotogramas, para revisar rapido)
//
// En vez de grabar la pantalla en tiempo real, se coloca la camara y el estado de la app
// para cada fotograma y se guarda una imagen. Asi el video sale fluido aunque el equipo
// dibuje despacio. Los subtitulos (en ingles) se dibujan en la propia pagina.
const { chromium } = require('playwright');
const fs = require('fs');

const FPS = 15;                                   // fotogramas capturados por segundo de video
const OUT = __dirname + '/frames';
const URL = process.env.URL || 'http://localhost:5173/?malla=4&px=1';
const PRUEBA = Boolean(process.env.PRUEBA);
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

// ---------- Guion: subtitulos por tiempo (segundos) ----------
const SUBS = [
  [6.5, 14, "Global Mars maps don't help an astronaut on foot.\nThis one covers the two kilometres they will actually walk."],
  [14.5, 26, 'Three NASA missions in one view:\nMRO, Mars Odyssey and Curiosity.'],
  [26.5, 38, 'It picks the stop order and the safest path,\nand shows distance, time and oxygen at a glance.'],
  [38.5, 48, 'Solar event? The fastest way back to the habitat, instantly.'],
  [48.5, 58, 'TARS, the mission agent, answers questions\nand replans on request.'],
  [58.5, 72, 'In the helmet: heading, oxygen, return margin,\nand what Curiosity saw from this very spot.'],
];
const NOTES = [                                    // rotulo pequeno arriba: que se esta viendo
  [14.5, 18, 'Slope · derived from MRO HiRISE elevation'],
  [18, 22, 'Night-time thermal · Mars Odyssey THEMIS'],
  [22, 26, 'Walk-back time to the habitat · model'],
  [30, 34, 'One stop switched off: the plan updates at once'],
  [66, 72, 'Real Curiosity Navcam photo'],
];

// ---------- Respuestas de TARS para el video ----------
// Aqui no hay clave de la API, asi que el servidor se simula. La herramienta SI se ejecuta
// de verdad en la app, y la frase se arma con el resultado real que devuelve.
let posts = 0;
async function mockTars(route) {
  if (route.request().method() === 'GET') return route.fulfill({ json: { ok: true, model: 'claude-opus-5-5' } });
  const body = JSON.parse(route.request().postData()); posts++;
  const last = body.messages[body.messages.length - 1];
  if (typeof last.content === 'string') {
    return route.fulfill({ json: { model: 'claude-opus-5-5', stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'toolu_video', name: 'fijar_reserva_o2', input: { porcentaje: /75/.test(last.content) ? 75 : 0 } }] } });
  }
  const r = JSON.parse(last.content[0].content);
  const text = (r.omitidas.length ? `Omito ${r.omitidas.join(' y ')}. ` : 'No hace falta omitir paradas. ') +
    `La reserva estimada al llegar queda en ${r.o2_al_llegar_pct} %.`;
  return route.fulfill({ json: { model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text }] } });
}

(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const cdp = await p.context().newCDPSession(p);
  p.on('pageerror', (e) => console.log('ERROR DE PAGINA', e.message));
  // el navegador de grabacion no tiene microfono: se declara para que el boton de voz se vea normal
  await p.addInitScript(() => {
    window.webkitSpeechRecognition = class { start() {} stop() {} };
    // Reloj de animacion manual: la app solo dibuja cuando el guion llama a __tick().
    // Sin esto el dibujo por software se acumula y cada imagen tarda mucho mas.
    const real = window.requestAnimationFrame.bind(window); let cola = [];
    window.__manual = false; window.__now = 0;
    window.requestAnimationFrame = (cb) => (window.__manual ? cola.push(cb) : real(cb));
    window.__tick = (ms) => { window.__now += ms; const q = cola; cola = []; for (const cb of q) cb(window.__now); };
    // sin suavizado de bordes por hardware: reduce a la mitad el tiempo de dibujo
    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (tipo, at) { return gc.call(this, tipo, at && tipo.startsWith('webgl') ? { ...at, antialias: false } : at); };
  });
  await p.route('**/api/tars', mockTars);
  await p.goto(URL);
  await p.waitForFunction(() => window.APP && window.APP.tl !== undefined && !document.getElementById('loading'), null, { timeout: 300000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__now = performance.now(); window.__manual = true; });
  await p.waitForTimeout(300);

  // ---------- Capa de textos del video (solo existe durante la grabacion) ----------
  await p.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = `
      #vSub{position:fixed;left:50%;bottom:54px;transform:translateX(-50%);z-index:9999;width:max-content;max-width:1600px;padding:16px 34px;
        background:rgba(8,10,14,.86);border:1px solid rgba(255,255,255,.14);border-radius:14px;color:#fff;
        font:600 34px/1.3 system-ui,"DejaVu Sans",sans-serif;text-align:center;white-space:pre-line;box-shadow:0 10px 40px rgba(0,0,0,.5)}
      #vNote{position:fixed;left:50%;top:150px;transform:translateX(-50%);z-index:9999;padding:9px 22px;border-radius:999px;
        background:rgba(255,138,61,.95);color:#1a0d04;font:700 22px system-ui,"DejaVu Sans",sans-serif;white-space:nowrap}
      #vCard{position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;
        background:radial-gradient(ellipse at center,rgba(10,8,8,.72),rgba(5,4,6,.93));color:#fff;text-align:center;font-family:system-ui,"DejaVu Sans",sans-serif}
      #vCard .k{font:700 22px system-ui;letter-spacing:.34em;color:#ff8a3d}
      #vCard h1{font:800 118px/1 system-ui;letter-spacing:.04em;margin:0}
      #vCard p{font:500 38px/1.35 system-ui;margin:0;color:#e8dccf;max-width:1300px}
      #vCard .tags{display:flex;gap:16px;margin-top:8px}
      #vCard .tags span{font:700 24px system-ui;padding:8px 20px;border-radius:999px;border:2px solid #4fd8ff;color:#4fd8ff}
      #vCard .url{font:600 28px ui-monospace,"DejaVu Sans Mono",monospace;color:#9fb2c4;margin-top:14px}
      .vGlow{outline:3px solid #ff8a3d !important;outline-offset:-3px;box-shadow:0 0 34px rgba(255,138,61,.55) !important}`;
    document.head.appendChild(st);
    for (const id of ['vCard', 'vSub', 'vNote']) { const d = document.createElement('div'); d.id = id; d.style.opacity = 0; document.body.appendChild(d); }
    const A = window.APP;
    A.controls.enableDamping = false;
    window.V = {
      // camara en orbita: angulo (grados), distancia horizontal, altura y punto al que mira
      cam(az, dist, h, tx, tz) {
        const ty = A.terrain.heightAt(tx, tz), a = az * Math.PI / 180;
        A.controls.target.set(tx, ty, tz);
        A.camera.position.set(tx + Math.sin(a) * dist, ty + h, tz + Math.cos(a) * dist);
      },
      text(id, html, op) { const e = document.getElementById(id); if (e.dataset.h !== html) { e.innerHTML = html; e.dataset.h = html; } e.style.opacity = op; },
      frames(n) { for (let i = 0; i < n; i++) window.__tick(1000 / 15); },
      layer(name, on) {                                // enciende o apaga una capa por su nombre
        document.getElementById('more').open = true;
        const row = [...document.querySelectorAll('.layer')].find((d) => d.querySelector('label span').textContent.startsWith(name));
        const c = row.querySelector('input[type=checkbox]'); if (c.checked !== on) c.click();
      },
      // incluye o excluye una parada y recalcula (el evento 'change' del control de pendiente llama a replan)
      stop(name, on) { A.stops.find((k) => k.name === name).on = on; document.getElementById('pSlope').dispatchEvent(new Event('change')); },
      label(name) { [...document.querySelectorAll('#labels .lbl')].find((e) => e.textContent.includes(name)).click(); },
      glow(sel, on) { document.querySelector(sel).classList.toggle('vGlow', on); },
    };
  });

  // ---------- Motor de tomas ----------
  let n = 0;                                          // fotograma global
  const fade = (t, a, z, d = 0.5) => Math.max(0, Math.min(1, (t - a) / d, (z - t) / d));
  const ease = (u) => u * u * (3 - 2 * u);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
  let card = null;                                    // tarjeta a pantalla completa: {a, z, html}

  async function snap() {
    const t = n / FPS;
    const sub = SUBS.find((s) => t >= s[0] && t < s[1]), note = NOTES.find((s) => t >= s[0] && t < s[1]);
    await p.evaluate(([sub, note, card]) => {
      V.text('vSub', sub ? sub.h : '', sub ? sub.o : 0);
      V.text('vNote', note ? note.h : '', note ? note.o : 0);
      V.text('vCard', card ? card.h : '', card ? card.o : 0);
      V.frames(1);
      const gl = window.APP.renderer.getContext();           // esperar a que el dibujo 3D termine de verdad
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    }, [sub && { h: esc(sub[2]), o: fade(t, sub[0], sub[1]) }, note && { h: esc(note[2]), o: fade(t, note[0], note[1], 0.3) },
      card && { h: card.html, o: fade(t, card.a, card.z, 0.9) }]);
    if (!PRUEBA || n % 15 === 7) {                   // captura directa (mas rapida que page.screenshot)
      const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93, optimizeForSpeed: true });
      fs.writeFileSync(`${OUT}/f${String(n).padStart(5, '0')}.jpg`, Buffer.from(r.data, 'base64'));
    }
    n++;
  }
  // toma de `secs` segundos; fn(u, i) prepara cada fotograma (u va de 0 a 1)
  async function shot(name, secs, fn, once) {
    const N = Math.round(secs * FPS), t0 = Date.now();
    if (once) await once();
    for (let i = 0; i < N; i++) { await fn(i / (N - 1), i); await snap(); }
    console.log(`${name}: ${N} fotogramas en ${((Date.now() - t0) / 1000).toFixed(0)} s (video ${(n / FPS).toFixed(1)} s)`);
  }
  const ev = (f, a) => p.evaluate(f, a);
  const lerp = (a, b, u) => a + (b - a) * u;

  // datos de la app para encuadrar
  const info = await ev(() => { const A = window.APP; const s3 = A.stops.find((s) => s.name === 'Boxwork 3');
    return { hx: A.habitat.x, hz: A.habitat.z, sx: s3.x, sz: s3.z }; });

  // ---------- 1. Titulo (0–6 s) ----------
  card = { a: -1, z: 6, html: '<div class="k">NASA MARS DATA · GALE CRATER</div><h1>MARSWALK GALE</h1><p>Plan and walk a Marswalk on Mount Sharp</p>' };
  await shot('titulo', 6, (u) => ev((u) => V.cam(-20 + u * 14, 1500, 1150, 0, 100), u));
  card = null;

  // ---------- 2. El terreno y el recorrido de Curiosity (6–14 s) ----------
  await shot('terreno', 8, (u) => ev(([u, e]) => V.cam(-6 + u * 30, 1500 - e * 550, 1150 - e * 520, 0, 80), [u, ease(u)]));

  // ---------- 3. Capas (14–26 s) ----------
  const capas = ['Pendiente', 'Térmica', 'Regreso a pie'];
  await shot('capas', 12, async (u, i) => {
    const k = Math.min(2, Math.floor(i / (4 * FPS)));
    if (i % (4 * FPS) === 0) await ev(([on, off]) => { if (off) V.layer(off, false); V.layer(on, true); }, [capas[k], capas[k - 1]]);
    await ev((u) => V.cam(24 + u * 34, 950, 630, 0, 80), u);
  });
  await ev(() => V.layer('Regreso a pie', false));

  // ---------- 4. Ruta y franja de resumen (26–38 s) ----------
  await shot('ruta', 12, async (u, i) => {
    if (i === 0) await ev(() => V.glow('#strip', true));
    if (i === 4 * FPS) await ev(() => V.stop('Boxwork 2', false));
    if (i === 8 * FPS) await ev(() => V.stop('Boxwork 2', true));
    await ev(([u, i]) => V.cam(58 - u * 40, 820 - u * 120, 760, i.hx * 0.5, i.hz * 0.5 + 60), [u, info]);
  });
  await ev(() => V.glow('#strip', false));

  // ---------- 5. Evento solar (38–48 s) ----------
  await shot('evento', 10, async (u, i) => {
    if (i === Math.round(1.2 * FPS)) await ev(() => V.label('Boxwork 3'));
    if (i === Math.round(2.4 * FPS)) await ev(() => document.getElementById('btnSolar').click());
    const mx = (info.sx + info.hx) / 2, mz = (info.sz + info.hz) / 2;
    await ev(([u, e, mx, mz]) => V.cam(18 - u * 22, 700 - e * 180, 700 - e * 150, mx * e, mz * e + 60 * (1 - e)), [u, ease(Math.min(1, u * 2.2)), mx, mz]);
  });
  await ev(() => document.getElementById('btnSolar').click());      // quitar el escenario

  // ---------- 6. TARS (48–58 s) ----------
  const orden = 'Replanifica con una reserva mínima de 75 % de O₂.';
  await shot('tars', 10, async (u, i) => {
    if (i === 0) await ev(() => { V.glow('#right', true); document.getElementById('chat').scrollTop = 1e9; });
    const t = i / FPS;
    if (t >= 1 && t <= 3.6) await ev((s) => { document.getElementById('tarsIn').value = s; }, orden.slice(0, Math.ceil(((t - 1) / 2.4) * orden.length)));
    if (i === Math.round(4 * FPS)) await ev((s) => { document.getElementById('tarsIn').value = ''; window.APP.chatAsk(s); }, orden);
    if (i === Math.round(5.2 * FPS)) await p.waitForFunction(() => !window.APP.busy, null, { timeout: 30000, polling: 100 });
    await ev(([u, i]) => V.cam(-4 + u * 16, 720, 740, i.hx * 0.5, i.hz * 0.5 + 60), [u, info]);
  });
  await ev(() => V.glow('#right', false));
  // volver al plan completo (5 paradas) antes de salir a caminar
  await ev(() => [...document.querySelectorAll('#quick button')].find((b) => b.textContent.includes('Sin reserva')).click());
  await p.waitForFunction(() => !window.APP.busy && window.APP.omitted.length === 0, null, { timeout: 30000, polling: 100 });

  // ---------- 7. Vista de casco (58–72 s) ----------
  await ev(() => { document.getElementById('btnHud').click(); window.APP.H.playing = false; });
  const tArr = await ev(() => window.APP.tl.pts.find((q) => q.arrive).t);     // llegada a la primera parada
  const WALK = 8, PASO = 1.0;                         // 8 s caminando; cada fotograma avanza 1 s de caminata
  await ev((t) => { window.APP.H.t = t; return V.frames(40); }, tArr - WALK * FPS * PASO);   // dejar que el rumbo se asiente
  await shot('casco', 14, (u, i) => {
    const k = i - WALK * FPS;                        // fotogramas desde la llegada a la parada
    const giro = k < 0 ? 0 : -0.45 * ease(Math.min(1, k / (2 * FPS)));   // al llegar, mirar un poco a la derecha
    return ev(([t, g]) => { const H = window.APP.H; H.t = t; H.phase += 0.9; H.lookYaw = g; }, [k < 0 ? tArr + k * PASO : tArr + 20 + k * 2, giro]);
  });
  await ev(() => document.getElementById('hExit').click());

  // ---------- 8. Cierre (72–80 s) ----------
  card = { a: 72, z: 81, html: '<div class="k">REAL DATA, LABELLED · TRANSPARENT MODELS</div><h1>MARSWALK GALE</h1>' +
    '<p>One integrated map to plan and carry out a Marswalk,<br>built on data from MRO, Mars Odyssey and Curiosity.</p>' +
    '<div class="tags"><span>Observation</span><span>Derived</span><span>Model</span></div><div class="url">github.com/danielortiz-create/marswalk-gale</div>' };
  await shot('cierre', 8, (u) => ev((u) => V.cam(30 + u * 16, 1400, 1000, 0, 100), u));

  console.log(`Total: ${n} fotogramas = ${(n / FPS).toFixed(1)} s · peticiones a TARS simuladas: ${posts}`);
  await b.close();
})().catch((e) => { console.error('FALLO', e); process.exit(1); });
