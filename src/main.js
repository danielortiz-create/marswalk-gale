// main.js — une todo: escena 3D, capas, planificador de ruta y vista de casco (HUD).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { loadTerrain } from './terrain.js';
import { createNav, P } from './nav.js';
import { makeAstronaut, makeHabitat, makeRover, makeCuriosity, makeBeacon } from './models.js';

const $ = (id) => document.getElementById(id);
const json = (u) => fetch(u).then((r) => r.json());
const fmtTime = (s) => { const m = Math.round(s / 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; };
const EVA_START_H = 9.0;          // la caminata empieza a las 09:00 hora solar local
const LAT = -4.81;

const A = {};                     // estado global de la app (facil de inspeccionar en la consola)
window.APP = A;

init().catch((e) => { $('loadmsg').textContent = 'Error: ' + e.message; console.error(e); });

async function init() {
  const [meta, plan, traverse, weather, radiation, donki] = await Promise.all([
    json('data/meta.json'), json('data/stops.json'), json('data/traverse.json'),
    json('data/weather.json'), json('data/radiation.json'), json('data/donki.json')]);
  Object.assign(A, { meta, weather, radiation, donki, traverse });
  const half = meta.size_m / 2;
  A.eRef = plan.habitat.elev;
  A.habitat = { x: plan.habitat.x - half, z: plan.habitat.y - half, slope: plan.habitat.mean_slope_deg };
  A.stops = plan.stops.map((s, i) => ({ id: s.id, name: `Boxwork ${i + 1}`, sub: `Curiosity estuvo aquí · sol ${s.sol}`,
    x: s.x - half, z: s.y - half, photos: s.photos, on: true }));
  A.doseRate = radiation.gcr_dose_equivalent_mSv_per_day;
  A.sep = false;

  // ---------- escena ----------
  const canvas = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 2, 20000);
  camera.position.set(-300, 1150, 1500);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0, 0); controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 30; controls.maxDistance = 5000; controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffe2c4, 0x5a3a28, 1.3));
  const sunLight = new THREE.DirectionalLight(0xfff0dd, 2.2); scene.add(sunLight);
  Object.assign(A, { renderer, scene, camera, controls, sunLight });

  $('loadmsg').textContent = 'Construyendo la malla 3D (1 048 576 puntos de elevación HiRISE)…';
  // ?malla=2 (o 4) usa una malla mas ligera para equipos sin tarjeta grafica
  const q = new URLSearchParams(location.search);
  const stride = Math.max(1, Math.min(8, +q.get('malla') || 1));
  if (q.get('px')) renderer.setPixelRatio(+q.get('px'));
  const terrain = A.terrain = await loadTerrain(meta, A.eRef, stride);
  scene.add(terrain.mesh);
  $('loadmsg').textContent = 'Calculando rejilla de navegación…';
  const nav = A.nav = await createNav(meta, terrain);

  // ---------- modelos ----------
  const ground = (obj, x, z, dy = 0) => { obj.position.set(x, terrain.heightAt(x, z) + dy, z); scene.add(obj); return obj; };
  A.habModel = ground(makeHabitat(), A.habitat.x, A.habitat.z);
  A.rover = ground(makeRover(), A.habitat.x + 16, A.habitat.z + 10); A.rover.rotation.y = 0.6;
  const last = traverse[traverse.length - 1];
  A.curiosity = ground(makeCuriosity(), last.x - half, last.y - half);
  A.curiositySol = last.sol;
  A.ev1 = makeAstronaut(0xd0342c); A.ev2 = makeAstronaut(0x2c6fd0); scene.add(A.ev1, A.ev2);
  A.beacons = new THREE.Group(); scene.add(A.beacons);

  // recorrido real de Curiosity
  const tp = [];
  for (const t of traverse) { const x = t.x - half, z = t.y - half; tp.push(x, terrain.heightAt(x, z) + 1.0, z); }
  A.traverseLine = fatLine(tp, 0xffffff, 2, 0.75); scene.add(A.traverseLine);
  A.routeLine = fatLine([0, 0, 0, 0, 0, 1], 0x4fd8ff, 4.5, 1); scene.add(A.routeLine);

  buildLayerPanel(); buildParams(); buildEnv(); wireUi();
  setSun(EVA_START_H);
  resize(); addEventListener('resize', resize);
  $('loadmsg').textContent = 'Calculando la ruta más segura…';
  await new Promise((r) => setTimeout(r, 30));
  replan();
  $('loading').remove();
  renderer.setAnimationLoop(frame);
}

function fatLine(positions, color, width, opacity) {
  const g = new LineGeometry(); g.setPositions(positions);
  const m = new LineMaterial({ color, linewidth: width, transparent: opacity < 1, opacity, depthTest: true });
  const l = new Line2(g, m); l.frustumCulled = false; return l;
}

function resize() {
  const w = innerWidth, h = innerHeight;
  A.renderer.setSize(w, h, false);
  A.camera.aspect = w / h; A.camera.updateProjectionMatrix();
  for (const l of [A.routeLine, A.traverseLine]) l.material.resolution.set(w, h);
  if (A.tl) drawProfile();
}

// ---------- Sol: posicion real segun la hora solar local y la estacion (Ls de REMS) ----------
function setSun(hour) {
  const ls = (A.weather.latest.ls || 0) * Math.PI / 180;
  const dec = Math.asin(Math.sin(25.19 * Math.PI / 180) * Math.sin(ls));
  const lat = LAT * Math.PI / 180, h = (hour - 12) * 15 * Math.PI / 180;
  const up = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h);
  const east = -Math.cos(dec) * Math.sin(h);
  const north = Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(h);
  const v = new THREE.Vector3(east, Math.max(up, 0.08), -north).normalize();
  A.terrain.uniforms.uSun.value.copy(v);
  A.sunLight.position.copy(v).multiplyScalar(1000);
  A.sunElev = Math.asin(up) * 180 / Math.PI;
}
// Temperatura del aire estimada entre el minimo y el maximo que midio REMS (modelo sencillo)
function airTemp(hour) {
  const w = A.weather.latest, f = 0.5 * (1 + Math.cos(((hour - 14) / 24) * 2 * Math.PI));
  return w.min_temp + (w.max_temp - w.min_temp) * f;
}

// =====================================================================
//  PLANIFICADOR
// =====================================================================
const LAYERS = [
  { key: 'oOrtho', name: 'Óptica — ortofoto HiRISE', src: 'MRO HiRISE · 25 cm/píxel (mostrada a 50 cm). Color aproximado.', on: 1, real: true },
  { key: 'oElev', name: 'Topografía — elevación', src: 'MRO HiRISE DEM 1 m (USGS)', real: true,
    legend: () => bar('linear-gradient(90deg,#21338c,#2699a6,#8cc759,#edbf40,#f2f2eb)', `${A.meta.elev_min.toFixed(0)} m`, `${A.meta.elev_max.toFixed(0)} m`) },
  { key: 'oSlope', name: 'Pendiente — peligro', src: 'Derivada del DEM HiRISE (escala de ~2 m)', real: true,
    legend: () => `<i class="sw" style="background:#33b859"></i>&lt;10°<i class="sw" style="background:#f2d933"></i>10–20°<i class="sw" style="background:#f5851f"></i>20–25°<i class="sw" style="background:#d91f26"></i>&gt;25°` },
  { key: 'oTherm', name: 'Térmica — infrarrojo THEMIS', src: 'Mars Odyssey THEMIS · 100 m/píxel (solo 25×25 píxeles en esta zona). Brillo relativo: de noche, más brillante = roca firme; más oscuro = arena o polvo suelto.', real: true,
    legend: () => bar('linear-gradient(90deg,#050333,#6b0f73,#cc404d,#fa9926,#fcfab3)', 'frío', 'cálido') +
      `<label style="display:block;margin-top:3px"><input type="checkbox" id="thDay"> usar imagen diurna</label>` },
  { key: 'oRough', name: 'Rugosidad del suelo', src: 'Derivada del DEM HiRISE (relieve en ventanas de 5 m)', real: true,
    legend: () => bar('linear-gradient(90deg,#450054,#3b528c,#21918c,#5ec961,#fde824)', 'liso', '≥ 0.5 m') },
  { key: 'oBack', name: 'Regreso a pie al hábitat', src: 'Minutos caminando hasta el hábitat desde cada punto; líneas cada 10 min. Morado = inalcanzable.', real: false,
    legend: () => bar('linear-gradient(90deg,#26bf66,#bfd940,#f7b326,#eb5926,#b31a33)', '0 min', '≥ 60 min') },
];
const bar = (grad, a, b) => `<div class="bar" style="background:${grad}"></div><div class="ends"><span>${a}</span><span>${b}</span></div>`;

function buildLayerPanel() {
  const box = $('layers'), u = A.terrain.uniforms;
  for (const L of LAYERS) {
    const d = document.createElement('div'); d.className = 'layer';
    d.innerHTML = `<label><input type="checkbox" ${L.on ? 'checked' : ''}> <span>${L.name}</span> <em class="${L.real ? 'real' : ''}">${L.real ? 'dato NASA' : 'modelo'}</em></label>
      <div class="src">${L.src}</div><input type="range" min="0" max="1" step="0.05" value="${L.on ? 1 : 0.7}">
      ${L.legend ? `<div class="legend">${L.legend()}</div>` : ''}`;
    const [chk, rng] = [d.querySelector('input[type=checkbox]'), d.querySelector('input[type=range]')];
    const upd = () => { u[L.key].value = chk.checked ? +rng.value : 0; };
    chk.onchange = upd; rng.oninput = upd; upd();
    L.chk = chk; L.upd = upd;
    box.appendChild(d);
  }
  $('thDay').onchange = (e) => { u.uThermDay.value = e.target.checked ? 1 : 0; };
  const extra = document.createElement('div'); extra.className = 'layer';
  extra.innerHTML = `<label><input type="checkbox" id="chkCont"> Curvas de nivel (10 m / 50 m)</label>
    <label><input type="checkbox" id="chkTrav" checked> Recorrido real de Curiosity <em class="real">dato NASA</em></label>
    <label><input type="checkbox" id="chkRoute" checked> Ruta de la caminata</label>`;
  box.appendChild(extra);
  $('chkCont').onchange = (e) => { u.uContours.value = e.target.checked ? 1 : 0; };
  $('chkTrav').onchange = (e) => { A.traverseLine.visible = e.target.checked; };
  $('chkRoute').onchange = (e) => { A.routeLine.visible = e.target.checked; };
}

function buildParams() {
  const bind = (id, out, key, fmt) => {
    const el = $(id); el.value = P[key]; $(out).textContent = fmt(P[key]);
    el.oninput = () => { P[key] = +el.value; $(out).textContent = fmt(P[key]); };
    el.onchange = () => replan();
  };
  bind('pSlope', 'oSlopeMax', 'maxCellSlope', (v) => v + '°');
  bind('pRisk', 'oRisk', 'risk', (v) => v.toFixed(1));
  bind('pStop', 'oStop', 'stopMinutes', (v) => v + ' min');
  $('pSlope').addEventListener('input', () => { P.maxDirSlope = P.maxCellSlope; });
}

// Recalcula todo: campo de regreso, mejor orden de paradas, ruta y presupuesto
function replan() {
  const { nav, terrain } = A;
  const t0 = performance.now();
  A.backField = nav.dijkstra(nav.cellOf(A.habitat.x, A.habitat.z), true);
  const mins = new Float32Array(nav.n * nav.n);
  for (let i = 0; i < mins.length; i++) mins[i] = A.backField.time[i] === Infinity ? -1 : A.backField.time[i] / 60;
  terrain.setBackTexture(mins, nav.n);

  const active = A.stops.filter((s) => s.on);
  const reachable = active.filter((s) => A.backField.time[nav.cellOf(s.x, s.z)] !== Infinity);
  A.unreachable = active.filter((s) => !reachable.includes(s));
  const plan = reachable.length ? nav.planRoute(A.habitat, reachable) : null;
  A.plan = plan;
  A.tl = plan ? nav.buildTimeline(plan.legs, A.doseRate, A.backField) : null;
  A.planMs = performance.now() - t0;
  if (plan) plan.order.forEach((s, i) => { s.order = i + 1; });
  A.stops.forEach((s) => { if (!plan || !plan.order.includes(s)) s.order = null; });
  drawRoute(); drawBeacons(); drawBudget(); drawStops(); drawProfile();
}

// Puntos suavizados de la ruta (la rejilla da zigzag; aqui se promedia para dibujar)
function smoothPts(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    let x = 0, z = 0, c = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(pts.length - 1, i + 2); k++) { x += pts[k].x; z += pts[k].z; c++; }
    out.push({ x: x / c, z: z / c });
  }
  return out;
}
function drawRoute() {
  const pos = [];
  if (A.tl) for (const p of smoothPts(A.tl.pts)) pos.push(p.x, A.terrain.heightAt(p.x, p.z) + 1.2, p.z);
  else pos.push(0, -999, 0, 0, -999, 1);
  A.routeLine.geometry.dispose();
  A.routeLine.geometry = new LineGeometry(); A.routeLine.geometry.setPositions(pos);
  const start = A.tl ? A.tl.pts[0] : A.habitat;
  A.ev1.position.set(start.x + 9, A.terrain.heightAt(start.x + 9, start.z + 2), start.z + 2);
  A.ev2.position.set(start.x + 10.5, A.terrain.heightAt(start.x + 10.5, start.z + 3), start.z + 3);
}
function drawBeacons() {
  A.beacons.clear();
  for (const s of A.stops) {
    if (!s.on) continue;
    const b = makeBeacon(s.order ? 0x39d0ff : 0xef4b4b);
    b.position.set(s.x, A.terrain.heightAt(s.x, s.z), s.z); A.beacons.add(b);
  }
}

function drawBudget() {
  const st = $('status'), b = $('budget');
  if (!A.tl) {
    st.className = 'nogo'; st.innerHTML = 'SIN RUTA<small>No hay camino transitable con estos límites. Sube la pendiente máxima o quita paradas.</small>';
    b.innerHTML = ''; return;
  }
  const T = A.tl.total, pct = (T.o2 / P.o2TankKg) * 100;
  const go = T.minMargin >= 0 && !A.unreachable.length;
  st.className = go ? 'go' : 'nogo';
  st.innerHTML = go
    ? `GO — caminata viable<small>En todo momento queda oxígeno para volver a pie al hábitat con ${P.o2ReserveMin} min de reserva.</small>`
    : A.unreachable.length
      ? `NO-GO — parada inalcanzable<small>${A.unreachable.map((s) => s.name).join(', ')} queda fuera del terreno transitable con estos límites.</small>`
      : `NO-GO — oxígeno insuficiente<small>A los ${fmtTime(T.noReturn.t)} ya no se podría volver a pie con la reserva exigida. Quita paradas o reduce los minutos por parada.</small>`;
  const cell = (k, v) => `<div class="cell"><span>${k}</span><b>${v}</b></div>`;
  b.innerHTML =
    cell('Distancia', (T.dist / 1000).toFixed(2) + ' km') + cell('Duración', fmtTime(T.time)) +
    cell('Subida / bajada', `${T.up.toFixed(0)} / ${T.down.toFixed(0)} m`) + cell('Energía metabólica', (T.energy / 1e6).toFixed(1) + ' MJ') +
    cell('Oxígeno usado', `${T.o2.toFixed(2)} kg · ${pct.toFixed(0)} %`) + cell('Margen mínimo de O₂', (T.minMargin * 1000).toFixed(0) + ' g') +
    cell('Dosis de radiación', (T.dose * 1000).toFixed(0) + ' µSv') + cell('Regreso a pie máximo', fmtTime(T.maxBack));
}

function drawStops() {
  const box = $('stops'); box.innerHTML = '';
  const sorted = [...A.stops].sort((a, b) => (a.order || 99) - (b.order || 99));
  for (const s of sorted) {
    const d = document.createElement('div'); d.className = 'stop';
    d.innerHTML = `<input type="checkbox" ${s.on ? 'checked' : ''}><span class="badge" style="${s.order ? '' : 'background:#555;color:#ccc'}">${s.order || '–'}</span>
      <span class="nm">${s.name}<small>${s.sub}</small></span>
      ${s.photos && s.photos.length ? '<button class="ph">Fotos</button>' : ''}${s.custom ? '<button class="rm">✕</button>' : ''}`;
    d.querySelector('input').onchange = (e) => { s.on = e.target.checked; replan(); };
    const ph = d.querySelector('.ph'); if (ph) ph.onclick = () => showPhotos(s);
    const rm = d.querySelector('.rm'); if (rm) rm.onclick = () => { A.stops.splice(A.stops.indexOf(s), 1); replan(); };
    d.querySelector('.nm').onclick = () => { A.controls.target.set(s.x, A.terrain.heightAt(s.x, s.z), s.z); A.camera.position.set(s.x - 60, A.terrain.heightAt(s.x, s.z) + 90, s.z + 130); };
    d.querySelector('.nm').style.cursor = 'pointer';
    box.appendChild(d);
  }
}

function showPhotos(s) {
  $('photoImgs').innerHTML = s.photos.map((p) => `<img src="data/${p.file}" alt="Foto de Curiosity, sol ${p.sol}">`).join('');
  $('photoCap').innerHTML = `<b>${s.name}</b> — lo que verás al llegar. Imágenes reales tomadas por Curiosity en este lugar: ` +
    s.photos.map((p) => `${p.instrument.startsWith('MAST') ? 'Mastcam' : 'Navcam'}, sol ${p.sol} (${p.date.slice(0, 10)}), ${p.credit}`).join(' · ');
  $('photo').hidden = false;
}

// Perfil de elevacion con color de pendiente y linea de oxigeno
function drawProfile() {
  const c = $('profile'), dpr = Math.min(devicePixelRatio, 2);
  const W = c.clientWidth, Hh = c.clientHeight; if (!W) return;
  c.width = W * dpr; c.height = Hh * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, W, Hh);
  if (!A.tl) return;
  const pts = A.tl.pts, D = A.tl.total.dist, pad = { l: 44, r: 40, t: 8, b: 18 };
  const ys = pts.map((p) => p.y + A.eRef), y0 = Math.min(...ys) - 2, y1 = Math.max(...ys) + 2;
  const X = (d) => pad.l + (d / D) * (W - pad.l - pad.r), Y = (e) => Hh - pad.b - ((e - y0) / (y1 - y0)) * (Hh - pad.t - pad.b);
  g.font = '10px system-ui'; g.fillStyle = '#9c968c'; g.strokeStyle = 'rgba(255,255,255,.08)';
  for (let i = 0; i <= 3; i++) {
    const e = y0 + ((y1 - y0) * i) / 3; g.beginPath(); g.moveTo(pad.l, Y(e)); g.lineTo(W - pad.r, Y(e)); g.stroke();
    g.textAlign = 'right'; g.fillText(e.toFixed(0) + ' m', pad.l - 4, Y(e) + 3);
  }
  g.textAlign = 'center';
  for (let km = 0; km <= D / 1000; km += 0.5) g.fillText(km.toFixed(1) + ' km', X(km * 1000), Hh - 4);
  g.lineWidth = 2.5;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], run = Math.hypot(b.x - a.x, b.z - a.z);
    if (run === 0) continue;
    const s = Math.abs(Math.atan2(b.y - a.y, run)) * 57.3;
    g.strokeStyle = s < 10 ? '#3ecf7a' : s < 20 ? '#f2d933' : s < 25 ? '#f5851f' : '#ef4b4b';
    g.beginPath(); g.moveTo(X(a.dist), Y(a.y + A.eRef)); g.lineTo(X(b.dist), Y(b.y + A.eRef)); g.stroke();
  }
  // oxigeno restante (eje derecho, 0-100 %)
  const Yo = (f) => Hh - pad.b - f * (Hh - pad.t - pad.b);
  g.strokeStyle = '#4fd8ff'; g.lineWidth = 1.5; g.setLineDash([4, 3]); g.beginPath();
  pts.forEach((p, i) => { const f = Math.max(0, 1 - p.o2 / P.o2TankKg); i ? g.lineTo(X(p.dist), Yo(f)) : g.moveTo(X(p.dist), Yo(f)); });
  g.stroke(); g.setLineDash([]);
  g.fillStyle = '#4fd8ff'; g.textAlign = 'left'; g.fillText('O₂ 100%', W - pad.r + 3, Yo(1) + 8); g.fillText('0%', W - pad.r + 3, Yo(0));
  for (const p of pts) if (p.arrive) {
    g.fillStyle = '#4fd8ff'; g.beginPath(); g.arc(X(p.dist), Y(p.y + A.eRef), 7, 0, 7); g.fill();
    g.fillStyle = '#04222c'; g.textAlign = 'center'; g.font = 'bold 10px system-ui'; g.fillText(p.arrive.order, X(p.dist), Y(p.y + A.eRef) + 3.5); g.font = '10px system-ui';
  }
}

// Panel de entorno: clima REMS, radiacion RAD, clima espacial DONKI
function buildEnv() {
  const w = A.weather.latest, r = A.radiation;
  const eva = (r.gcr_dose_equivalent_mSv_per_day / 24) * 1000;
  $('env').innerHTML = `
    <div class="card"><h3>Clima en Gale <em class="real">REMS · Curiosity</em></h3>
      <p>Última medición: <b>sol ${w.sol}</b> (${w.terrestrial_date})</p>
      <p>Aire <b>${w.min_temp} a ${w.max_temp} °C</b> · suelo <b>${w.min_gts_temp} a ${w.max_gts_temp} °C</b></p>
      <p>Presión <b>${w.pressure} Pa</b> · cielo <b>${w.atmo_opacity === 'Sunny' ? 'despejado' : w.atmo_opacity}</b> · UV <b>${({ Low: 'bajo', Moderate: 'moderado', High: 'alto', Very_High: 'muy alto' })[w.local_uv_irradiance_index] || w.local_uv_irradiance_index}</b></p>
      <p>Amanecer ${w.sunrise} · atardecer ${w.sunset} · Ls ${w.ls}°</p></div>
    <div class="card"><h3>Radiación en superficie <em class="real">RAD · Curiosity</em></h3>
      <p>Rayos cósmicos: <b>${r.gcr_dose_equivalent_mSv_per_day} ± ${r.gcr_dose_equivalent_uncertainty} mSv/día</b> (≈ ${eva.toFixed(0)} µSv por hora de caminata)</p>
      <p>${r.sep_event_note}</p>
      <p>Referencia: ${r.career_limit_source}</p><p style="font-size:10.5px">Fuente: Hassler et al. 2014, <i>Science</i>.</p></div>
    <div class="card"><h3>Clima espacial <em class="real">DONKI · NASA CCMC</em></h3><p id="donkiState"></p><div class="donki" id="donkiList"></div>
      <p style="font-size:10.5px">DONKI vigila el Sol desde el entorno de la Tierra; las eyecciones dirigidas a Marte se resaltan.</p></div>`;
  showDonki(A.donki.notifications, `Copia guardada (${(A.donki.fetched || '').slice(0, 10)})`);
  // intento en vivo desde el navegador
  const start = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  fetch(`https://api.nasa.gov/DONKI/notifications?startDate=${start}&type=all&api_key=DEMO_KEY`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((list) => {
      const rows = list.map((n) => ({ type: n.messageType, id: n.messageID, time: n.messageIssueTime, url: n.messageURL,
        summary: (n.messageBody.split('## Summary:')[1] || '').trim().split('\n\n').slice(0, 2).join(' ').replace(/\s+/g, ' ').slice(0, 320) }));
      rows.sort((a, b) => (a.time < b.time ? 1 : -1));
      if (rows.length) showDonki(rows, 'En vivo · últimos 14 días');
    }).catch(() => {});
}
function showDonki(rows, state) {
  const names = { CME: 'Eyección de masa coronal', FLR: 'Fulguración', SEP: 'Partículas energéticas', GST: 'Tormenta geomagnética', RBE: 'Cinturón de radiación', IPS: 'Choque interplanetario', Report: 'Informe semanal' };
  const mars = rows.filter((r) => /Mars/.test(r.summary)).length;
  $('donkiState').innerHTML = `<b>${rows.length}</b> avisos · <b>${mars}</b> mencionan Marte · ${state}`;
  $('donkiList').innerHTML = rows.slice(0, 12).map((r) =>
    `<div class="${/Mars/.test(r.summary) ? 'mars' : ''}"><a href="${r.url}" target="_blank" rel="noopener">${r.time.slice(0, 10)} · ${names[r.type] || r.type}</a></div>`).join('');
}

// Punto del terreno bajo el cursor (se avanza por el rayo hasta tocar el suelo)
function pickGround(ev) {
  const r = A.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, A.camera);
  const o = ray.ray.origin, d = ray.ray.direction, h = A.terrain.half;
  for (let t = 0; t < 8000; t += 2) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (Math.abs(x) < h && Math.abs(z) < h && y <= A.terrain.heightAt(x, z)) return { x, z };
  }
  return null;
}

function wireUi() {
  let adding = false, downAt = null, nCustom = 0;
  $('btnAdd').onclick = () => { adding = !adding; $('btnAdd').classList.toggle('on', adding); $('btnAdd').textContent = adding ? 'Haz clic en el terreno…' : '＋ Añadir parada'; };
  const cv = A.renderer.domElement;
  cv.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  cv.addEventListener('pointerup', (e) => {
    if (document.body.dataset.mode !== 'plan' || !adding || !downAt) return;
    if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;   // fue un arrastre de camara
    const p = pickGround(e); if (!p) return;
    nCustom++;
    A.stops.push({ id: 'C' + nCustom, name: `Parada propia ${nCustom}`, sub: 'Elegida por la tripulación', x: p.x, z: p.z, photos: [], on: true, custom: true });
    adding = false; $('btnAdd').classList.remove('on'); $('btnAdd').textContent = '＋ Añadir parada';
    replan();
  });
  $('photoClose').onclick = () => { $('photo').hidden = true; };
  $('btnHud').onclick = enterHud;
  $('btnGlb').onclick = exportGlb;
  $('hExit').onclick = exitHud;
  $('hPlay').onclick = () => { H.playing = !H.playing; $('hPlay').textContent = H.playing ? '⏸' : '▶'; };
  $('hSpeed').onchange = (e) => { H.speed = +e.target.value; };
  $('hScrub').oninput = (e) => { H.t = (e.target.value / 1000) * A.hudTl.total.time; };
  $('hSep').onclick = triggerSep;
  // mirar alrededor en la vista de casco
  let drag = null;
  cv.addEventListener('pointerdown', (e) => { if (document.body.dataset.mode === 'hud') drag = [e.clientX, e.clientY, H.lookYaw, H.lookPitch]; });
  addEventListener('pointermove', (e) => {
    if (!drag) return;
    H.lookYaw = drag[2] - (e.clientX - drag[0]) * 0.004;
    H.lookPitch = Math.max(-1.2, Math.min(1.2, drag[3] - (e.clientY - drag[1]) * 0.004));
  });
  addEventListener('pointerup', () => { drag = null; });
}

// =====================================================================
//  VISTA DE CASCO (HUD)
// =====================================================================
const H = { t: 0, playing: true, speed: 30, lookYaw: 0, lookPitch: 0, heading: 0, phase: 0 };
A.H = H;

function enterHud() {
  if (!A.tl) return;
  A.hudTl = A.tl; A.sep = false; H.t = 0; H.playing = true; H.lookYaw = 0; H.lookPitch = -0.05;
  $('hPlay').textContent = '⏸'; $('hSep').disabled = false;
  document.body.dataset.mode = 'hud';
  A.controls.enabled = false;
  A.savedCam = { p: A.camera.position.clone(), t: A.controls.target.clone() };
  A.camera.near = 0.3; A.camera.far = 8000; A.camera.fov = 70; A.camera.updateProjectionMatrix();
  A.scene.background = new THREE.Color(0xd9b48a);
  A.terrain.uniforms.uFogDensity.value = 0.00055;
  A.routeLine.material.linewidth = 6;
  $('labels').innerHTML = '';
}
function exitHud() {
  document.body.dataset.mode = 'plan';
  A.controls.enabled = true;
  A.camera.near = 2; A.camera.far = 20000; A.camera.fov = 45; A.camera.rotation.set(0, 0, 0); A.camera.updateProjectionMatrix();
  A.camera.position.copy(A.savedCam.p); A.controls.target.copy(A.savedCam.t);
  A.scene.background = null; A.terrain.uniforms.uFogDensity.value = 0;
  A.routeLine.material.linewidth = 4.5;
  $('hudPhoto').hidden = true; $('labels').innerHTML = '';
  setSun(EVA_START_H);
  drawRoute(); requestAnimationFrame(drawProfile);
}

// Alerta solar simulada: la dosis se duplica (como midio RAD en sept. 2017) y se
// recalcula la ruta mas rapida de regreso al habitat desde donde este el astronauta.
function triggerSep() {
  if (A.sep) return;
  const s = A.nav.sample(A.hudTl, H.t);
  const cells = A.nav.pathBack(A.backField, A.nav.cellOf(s.x, s.z));
  if (!cells || cells.length < 2) return;
  A.sep = true; $('hSep').disabled = true;
  const back = A.nav.buildTimeline([{ cells, toStop: null }], A.doseRate * 2, A.backField);
  for (const p of back.pts) { p.t += s.t; p.dist += s.dist; p.o2 += s.o2; p.energy += s.energy; p.dose += s.dose; p.margin -= s.o2; }
  const before = A.hudTl.pts.filter((p) => p.t < s.t);
  A.hudTl = { pts: [...before, ...back.pts], total: { ...back.total, time: back.pts[back.pts.length - 1].t } };
  A.sepAt = s.t;
  const pos = [];
  for (const p of smoothPts(back.pts)) pos.push(p.x, A.terrain.heightAt(p.x, p.z) + 1.2, p.z);
  A.routeLine.geometry.dispose(); A.routeLine.geometry = new LineGeometry(); A.routeLine.geometry.setPositions(pos);
}

function smoothPos(tl, t) {       // posicion suavizada para que la camara no zigzaguee
  let x = 0, z = 0; const ks = [-6, -3, 0, 3, 6];
  for (const k of ks) { const s = A.nav.sample(tl, t + k); x += s.x; z += s.z; }
  return { x: x / ks.length, z: z / ks.length };
}

function updateHud(dt) {
  const tl = A.hudTl, nav = A.nav, T = tl.total.time;
  if (H.playing) H.t = Math.min(T, H.t + dt * H.speed);
  const s = nav.sample(tl, H.t);
  const p = smoothPos(tl, H.t), ahead = smoothPos(tl, H.t + 10);
  const moving = Math.hypot(ahead.x - p.x, ahead.z - p.z) > 0.5 && !s.dwell;
  if (moving) {
    const target = Math.atan2(ahead.x - p.x, -(ahead.z - p.z));
    let d = target - H.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    H.heading += d * Math.min(1, dt * 3 + (H.speed > 10 ? 0.25 : 0));
    if (H.playing) H.phase += dt * 6;
  }
  const y = A.terrain.heightAt(p.x, p.z);
  const bob = moving && H.playing && H.speed <= 10 ? Math.abs(Math.sin(H.phase)) * 0.04 : 0;
  A.camera.position.set(p.x, y + 1.75 + bob, p.z);
  A.camera.rotation.order = 'YXZ';
  A.camera.rotation.set(H.lookPitch, -(H.heading) + H.lookYaw, 0);

  // companero EV2 unos metros por delante; EV1 (tu) no se dibuja en primera persona
  const q = smoothPos(tl, Math.min(T, H.t + 13));
  const side = { x: Math.cos(H.heading) * 1.6, z: Math.sin(H.heading) * 1.6 };
  const ex = (s.dwell ? p.x + Math.sin(H.heading) * 4 : q.x) + side.x, ez = (s.dwell ? p.z - Math.cos(H.heading) * 4 : q.z) + side.z;
  A.ev2.position.set(ex, A.terrain.heightAt(ex, ez), ez);
  A.ev2.rotation.y = -H.heading + (s.dwell ? 2.2 : 0);
  A.ev2.userData.animate(moving && H.playing ? H.phase : 0);
  A.ev1.visible = false;

  // hora local, Sol y temperatura
  const hour = EVA_START_H + H.t / 3699;          // 1 hora marciana = 3699 s
  setSun(hour);
  const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);

  // lecturas
  const left = Math.max(0, 1 - s.o2 / P.o2TankKg);
  $('hO2').textContent = (left * 100).toFixed(0) + ' %';
  $('hO2bar').style.width = left * 100 + '%';
  $('hO2bar').style.background = left > 0.4 ? 'var(--ok)' : left > 0.2 ? 'var(--warn)' : 'var(--bad)';
  $('hMargin').textContent = (s.margin * 1000).toFixed(0) + ' g O₂';
  $('hMargin').style.color = s.margin < 0 ? 'var(--bad)' : s.margin < 0.05 ? 'var(--warn)' : '';
  $('hTime').textContent = fmtTime(s.t);
  $('hClock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} LMST`;
  $('hDose').textContent = (s.dose * 1000).toFixed(1) + ' µSv';
  $('hTemp').textContent = airTemp(hour).toFixed(0) + ' °C (est.)';
  $('hSlope').textContent = (moving ? s.stepSlope : 0).toFixed(0) + '°';
  $('hElev').textContent = (y + A.eRef).toFixed(0) + ' m';
  $('hDist').textContent = (s.dist / 1000).toFixed(2) + ' km';
  $('hBack').textContent = fmtTime(s.back);

  // siguiente objetivo
  let next = null;
  for (let i = s.i + 1; i < tl.pts.length; i++) if (tl.pts[i].arrive) { next = tl.pts[i]; break; }
  const end = tl.pts[tl.pts.length - 1];
  $('hNext').textContent = s.dwell ? `EN ${s.dwell.name.toUpperCase()}` : next ? next.arrive.name.toUpperCase() : 'HÁBITAT';
  $('hNextD').textContent = s.dwell ? 'ciencia en curso' : (((next || end).dist - s.dist)).toFixed(0) + ' m';

  // alertas
  const al = [];
  if (A.sep) al.push(['bad', 'ALERTA SOLAR — REGRESO INMEDIATO AL HÁBITAT · DOSIS ×2']);
  if (s.margin < 0) al.push(['bad', 'OXÍGENO INSUFICIENTE PARA VOLVER A PIE CON RESERVA']);
  if (moving && Math.abs(s.stepSlope) >= 15) al.push(['warn', `PENDIENTE ${Math.abs(s.stepSlope).toFixed(0)}° — PASO CORTO`]);
  if (s.dwell) al.push(['info', `PARADA CIENTÍFICA: ${s.dwell.name} — ${P.stopMinutes} min de muestreo`]);
  if (H.t >= T) al.push(['info', 'DE VUELTA EN EL HÁBITAT — CAMINATA COMPLETADA']);
  const html = al.map(([c, t]) => `<div class="${c}">${t}</div>`).join('');
  if ($('hudAlert').innerHTML !== html) $('hudAlert').innerHTML = html;

  // foto real de Curiosity al llegar a una parada
  const ph = s.dwell && s.dwell.photos && s.dwell.photos[0];
  if (ph) {
    if ($('hudPhotoImg').dataset.f !== ph.file) { $('hudPhotoImg').src = 'data/' + ph.file; $('hudPhotoImg').dataset.f = ph.file; }
    $('hudPhotoCap').textContent = `Vista real desde aquí · Curiosity, sol ${ph.sol} · ${ph.credit}`;
  }
  $('hudPhoto').hidden = !ph;
  if (document.activeElement !== $('hScrub')) $('hScrub').value = (H.t / T) * 1000;

  drawCompass();
  // marcadores de realidad aumentada
  const marks = A.stops.filter((k) => k.order && !A.sep).map((k) => ({ x: k.x, z: k.z, text: k.name, cls: '' }));
  marks.push({ x: A.habitat.x, z: A.habitat.z, text: 'HÁBITAT', cls: 'hab' });
  placeLabels(marks.map((m) => ({ ...m, y: A.terrain.heightAt(m.x, m.z) + 4,
    html: `${m.text}<br>${Math.hypot(m.x - p.x, m.z - p.z).toFixed(0)} m`, cls: 'ar ' + m.cls })));
}

function drawCompass() {
  const c = $('compass'), g = c.getContext('2d'), W = c.width, Hh = c.height;
  const deg = (((H.heading - H.lookYaw) * 180 / Math.PI) % 360 + 360) % 360;
  g.clearRect(0, 0, W, Hh); g.strokeStyle = g.fillStyle = '#4fd8ff'; g.textAlign = 'center'; g.font = 'bold 13px ui-monospace, monospace';
  const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
  for (let d = -60; d <= 60; d++) {
    const a = Math.round(deg) + d, x = W / 2 + (a - deg) * (W / 120), m = ((a % 360) + 360) % 360;
    if (m % 5) continue;
    g.globalAlpha = 1 - Math.abs(a - deg) / 70;
    g.beginPath(); g.moveTo(x, Hh - 2); g.lineTo(x, Hh - (m % 15 ? 8 : 14)); g.stroke();
    if (m % 15 === 0) g.fillText(names[m] || m, x, 16);
  }
  g.globalAlpha = 1; g.fillStyle = '#ff8a3d'; g.beginPath(); g.moveTo(W / 2, Hh - 16); g.lineTo(W / 2 - 6, Hh - 28); g.lineTo(W / 2 + 6, Hh - 28); g.fill();
}

// Etiquetas HTML pegadas a puntos del mundo 3D
const v3 = new THREE.Vector3();
function placeLabels(items) {
  const box = $('labels'), w = innerWidth, h = innerHeight;
  while (box.children.length < items.length) box.appendChild(document.createElement('div'));
  while (box.children.length > items.length) box.lastChild.remove();
  items.forEach((it, i) => {
    const el = box.children[i];
    v3.set(it.x, it.y, it.z).project(A.camera);
    const vis = v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05;
    el.style.display = vis ? '' : 'none';
    if (!vis) return;
    if (el.className !== it.cls) el.className = it.cls;
    if (el.innerHTML !== it.html) el.innerHTML = it.html;
    el.style.left = ((v3.x + 1) / 2) * w + 'px'; el.style.top = ((1 - v3.y) / 2) * h + 'px';
  });
}

function updatePlan() {
  A.controls.update();
  A.ev1.visible = true; A.ev1.userData.animate(0); A.ev2.userData.animate(0);
  const items = A.stops.filter((s) => s.on).map((s) => ({ x: s.x, z: s.z, y: A.terrain.heightAt(s.x, s.z) + 5,
    html: `${s.order || '✕'} <small>${s.name}</small>`, cls: 'lbl' }));
  items.push({ x: A.habitat.x, z: A.habitat.z, y: A.terrain.heightAt(A.habitat.x, A.habitat.z) + 14, html: 'HÁBITAT', cls: 'lbl hab' });
  const c = A.curiosity.position;
  items.push({ x: c.x, z: c.z, y: c.y + 5, html: `Curiosity <small>sol ${A.curiositySol}</small>`, cls: 'lbl rov' });
  placeLabels(items);
}

let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  if (document.body.dataset.mode === 'hud') updateHud(dt); else updatePlan();
  A.renderer.render(A.scene, A.camera);
}

// =====================================================================
//  EXPORTAR MODELO 3D (GLB): terreno real + ruta + habitat y balizas
// =====================================================================
function exportGlb() {
  const n = 256, T = A.terrain, step = T.size / (n - 1);
  const geo = new THREE.PlaneGeometry(T.size, T.size, n - 1, n - 1); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, T.heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const cv = document.createElement('canvas'); cv.width = cv.height = 2048;
  cv.getContext('2d').drawImage(T.tOrtho.image, 0, 0, 2048, 2048);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const root = new THREE.Group(); root.name = 'Marswalk_Gale_boxwork';
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })); ground.name = 'Terreno_HiRISE_2km'; root.add(ground);
  if (A.tl) {
    const pts = smoothPts(A.tl.pts).filter((_, i) => i % 3 === 0).map((p) => new THREE.Vector3(p.x, T.heightAt(p.x, p.z) + 1.5, p.z));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 1.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x39d0ff, emissive: 0x115566 })); tube.name = 'Ruta_caminata'; root.add(tube);
  }
  const hab = A.habModel.clone(); hab.name = 'Habitat'; root.add(hab);
  const b = A.beacons.clone(); b.name = 'Paradas'; root.add(b);
  void step;
  new GLTFExporter().parse(root, (buf) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
    a.download = 'marswalk-gale.glb'; a.click(); A.lastGlbBytes = buf.byteLength;
  }, (e) => console.error(e), { binary: true });
}
