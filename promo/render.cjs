// render.cjs — dibuja el video fotograma a fotograma desde promo/index.html.
// Uso:  node promo/render.cjs                 -> promo/frames/f00000.jpg ... (60 s x 30 fps)
//       STILLS=2,8,12 node promo/render.cjs   -> solo esos segundos, para revisar (promo/frames/still_2.jpg ...)
// Antes hay que grabar los clips de la app con promo/clips.cjs.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FPS = 30, DUR = +(process.env.DUR || 60);          // DUR=30 -> version corta
const OUT = path.join(__dirname, DUR === 30 ? 'frames30' : 'frames');
const STILLS = process.env.STILLS ? process.env.STILLS.split(',').map(Number) : null;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.log('ERROR EN LA PAGINA:', e.message));
  const cdp = await page.context().newCDPSession(page);
  await page.goto('file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/') + (DUR === 30 ? '?d=30' : ''));
  await page.evaluate(() => window.READY);

  async function shot(t, file) {
    await page.evaluate((t) => window.seek(t), t);
    const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true });
    fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, 'base64'));
  }

  const t0 = Date.now();
  if (STILLS) for (const s of STILLS) await shot(s, `still_${s}.jpg`);
  else {
    const N = FPS * DUR;
    for (let i = 0; i < N; i++) {
      await shot(i / FPS, `f${String(i).padStart(5, '0')}.jpg`);
      if (i % 150 === 0) console.log(`fotograma ${i}/${N} · ${Math.round((Date.now() - t0) / 1000)} s`);
    }
  }
  console.log('listo en', Math.round((Date.now() - t0) / 1000), 's');
  await browser.close();
})().catch((e) => { console.error('FALLO', e); process.exit(1); });
