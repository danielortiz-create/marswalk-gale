// main.js — une todo: escena 3D, capas, planificador, agente TARS y vista de casco (HUD).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { loadTerrain } from './terrain.js';
import { createNav, P } from './nav.js';
import { makeAstronaut, makeHabitat, makeRover, makeCuriosity, makeBeacon } from './models.js';
import { createVoice, localReply } from './tars.js';
import { createDialog } from './tars-dialog.js';
import { createIntro } from './intro.js';
import { vitals, guidance } from './health.js';
import { scienceFor, PREGUNTA } from './science.js';
import { t, lang, dec, applyStatic } from './i18n.js';

const $ = (id) => document.getElementById(id);
const json = (u) => fetch(u).then((r) => r.json());
const fmtTime = (s) => { const m = Math.round(s / 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; };
const num = (n, d = 0) => dec(n.toFixed(d));     // numeros con coma decimal (español) o punto (ingles)
// Preferencias guardadas en el navegador (si no se puede guardar, la app funciona igual)
const recall = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
const EVA_START_H = 9.0;          // la caminata empieza a las 09:00 hora solar local
const LAT = -4.81;

const A = {};                     // estado global de la app (facil de inspeccionar en la consola)
window.APP = A;

applyStatic();                    // idioma: rellena los textos fijos del HTML antes de construir la interfaz
init().catch((e) => { $('loadmsg').textContent = 'Error: ' + e.message; console.error(e); });

async function init() {
  const [meta, plan, traverse, weather, radiation, donki] = await Promise.all([
    json('data/meta.json'), json('data/stops.json'), json('data/traverse.json'),
    json('data/weather.json'), json('data/radiation.json'), json('data/donki.json')]);
  Object.assign(A, { meta, weather, radiation, donki, traverse });
  const half = meta.size_m / 2;
  A.eRef = plan.habitat.elev;
  A.habitat = { x: plan.habitat.x - half, z: plan.habitat.y - half, slope: plan.habitat.mean_slope_deg };
  A.stops = plan.stops.map((s, i) => ({ id: s.id, name: `Boxwork ${i + 1}`, sub: t('stop.sub', { sol: s.sol }),
    x: s.x - half, z: s.y - half, photos: s.photos, on: true }));
  A.doseRate = radiation.gcr_dose_equivalent_mSv_per_day;
  A.sep = false; A.event = null; A.omitted = []; A.unreachable = [];

  // ---------- escena ----------
  const canvas = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 2, 20000);
  camera.position.set(-250, 1250, 1650);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0, 120); controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 30; controls.maxDistance = 5000; controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffe2c4, 0x5a3a28, 1.3));
  const sunLight = new THREE.DirectionalLight(0xfff0dd, 2.2); scene.add(sunLight);
  Object.assign(A, { renderer, scene, camera, controls, sunLight });

  $('loadmsg').textContent = t('load.mesh');
  // ?malla=2 (o 4) usa una malla mas ligera para equipos sin tarjeta grafica
  const q = new URLSearchParams(location.search);
  const stride = Math.max(1, Math.min(8, +q.get('malla') || 1));
  if (q.get('px')) renderer.setPixelRatio(+q.get('px'));
  const terrain = A.terrain = await loadTerrain(meta, A.eRef, stride);
  scene.add(terrain.mesh);
  $('loadmsg').textContent = t('load.nav');
  A.nav = await createNav(meta, terrain);
  for (const s of A.stops) s.sci = scienceFor(terrain, s.x, s.z);      // objetivo cientifico de cada parada

  // ---------- modelos ----------
  const ground = (obj, x, z, dy = 0) => { obj.position.set(x, terrain.heightAt(x, z) + dy, z); scene.add(obj); return obj; };
  A.habModel = ground(makeHabitat(), A.habitat.x, A.habitat.z);
  A.rover = ground(makeRover(), A.habitat.x + 16, A.habitat.z + 10); A.rover.rotation.y = 0.6;
  const last = traverse[traverse.length - 1];
  A.curiosity = ground(makeCuriosity(), last.x - half, last.y - half);
  A.curiositySol = last.sol;
  A.ev1 = makeAstronaut(0xd0342c); A.ev2 = makeAstronaut(0x2c6fd0); scene.add(A.ev1, A.ev2);
  A.beacons = new THREE.Group(); scene.add(A.beacons);

  // lineas: recorrido real de Curiosity, ruta de la caminata y ruta de regreso (discontinua)
  const tp = [];
  for (const t of traverse) { const x = t.x - half, z = t.y - half; tp.push(x, terrain.heightAt(x, z) + 1.0, z); }
  A.traverseLine = fatLine(tp, 0xffffff, 2, 0.75); scene.add(A.traverseLine);
  A.routeLine = fatLine([0, 0, 0, 0, 0, 1], 0x4fd8ff, 4.5, 1); scene.add(A.routeLine);
  A.backLine = fatLine([0, 0, 0, 0, 0, 1], 0xffa53d, 4.5, 1, true); A.backLine.visible = false; scene.add(A.backLine);
  A.backArrows = new THREE.Group(); scene.add(A.backArrows);

  buildLayerPanel(); buildParams(); buildEnv(); wireUi(); setupTars();
  setSun(EVA_START_H);
  layout(); addEventListener('resize', layout);
  $('loadmsg').textContent = t('load.route');
  await new Promise((r) => setTimeout(r, 30));
  replan();
  // Introduccion: la primera vez que se abre la app (o con ?intro=1). ?intro=0 la omite.
  A.intro = createIntro(A, { layout, recall, store });
  $('btnIntro').onclick = () => A.intro.start();
  const qi = q.get('intro');
  if (qi !== '0' && (qi === '1' || !recall('mw_intro'))) A.intro.start();
  $('loading').remove();
  renderer.setAnimationLoop(frame);
}

function fatLine(positions, color, width, opacity, dashed = false) {
  const g = new LineGeometry(); g.setPositions(positions);
  const m = new LineMaterial({ color, linewidth: width, transparent: opacity < 1, opacity, depthTest: true,
    dashed, dashSize: 16, gapSize: 11 });
  const l = new Line2(g, m); l.frustumCulled = false; return l;
}
function setLine(line, pos) {
  line.geometry.dispose();
  line.geometry = new LineGeometry(); line.geometry.setPositions(pos);
  if (line.material.dashed) line.computeLineDistances();
}

// El lienzo 3D ocupa la columna central en el planificador y toda la pantalla en el casco y la introduccion
function layout() {
  const hud = document.body.dataset.mode !== 'plan';
  const r = hud ? { left: 0, top: 0, width: innerWidth, height: innerHeight } : $('mapCell').getBoundingClientRect();
  const w = Math.max(50, Math.round(r.width)), h = Math.max(50, Math.round(r.height));
  for (const el of [A.renderer.domElement, $('labels')]) {
    el.style.left = r.left + 'px'; el.style.top = r.top + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px';
  }
  A.vw = w; A.vh = h;
  A.renderer.setSize(w, h, false);
  A.camera.aspect = w / h; A.camera.updateProjectionMatrix();
  for (const l of [A.routeLine, A.traverseLine, A.backLine]) l.material.resolution.set(w, h);
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
}
// Temperatura del aire estimada entre el minimo y el maximo que midio REMS (modelo sencillo)
function airTemp(hour) {
  const w = A.weather.latest, f = 0.5 * (1 + Math.cos(((hour - 14) / 24) * 2 * Math.PI));
  return w.min_temp + (w.max_temp - w.min_temp) * f;
}

// =====================================================================
//  CAPAS
// =====================================================================
// tag: obs = Observacion (medido) · der = Derivado (calculado de una medicion) · mod = Modelo (estimacion)
const TAGS = { obs: ['', t('tag.obs')], der: ['der', t('tag.der')], mod: ['mod', t('tag.model')] };
const LAYERS = [
  { id: 'ortofoto', key: 'oOrtho', name: t('layer.ortofoto.name'), tag: 'obs', on: 1, src: t('layer.ortofoto.src'),
    grad: 'linear-gradient(90deg,#3a2012,#ffcc99)' },
  { id: 'elevacion', key: 'oElev', name: t('layer.elevacion.name'), tag: 'der', src: t('layer.elevacion.src'),
    grad: 'linear-gradient(90deg,#21338c,#2699a6,#8cc759,#edbf40,#f2f2eb)', ends: () => [`${A.meta.elev_min.toFixed(0)} m`, `${A.meta.elev_max.toFixed(0)} m`] },
  { id: 'pendiente', key: 'oSlope', name: t('layer.pendiente.name'), tag: 'der', src: t('layer.pendiente.src'),
    grad: 'linear-gradient(90deg,#33b859 0 30%,#f2d933 30% 62%,#f5851f 62% 80%,#d91f26 80%)', ends: () => ['<10°', '10–20°', '20–25°', '>25°'] },
  { id: 'termica', key: 'oTherm', name: t('layer.termica.name'), tag: 'obs', src: t('layer.termica.src'),
    grad: 'linear-gradient(90deg,#050333,#6b0f73,#cc404d,#fa9926,#fcfab3)', ends: () => [t('layer.termica.cold'), t('layer.termica.warm')],
    extra: `<label class="sub"><input type="checkbox" id="thDay"> ${t('layer.termica.day')}</label>` },
  { id: 'recorrido_curiosity', line: 'traverseLine', name: t('layer.curiosity.name'), tag: 'obs', on: 1,
    src: () => t('layer.curiosity.src', { a: A.traverse[0].sol, b: A.traverse[A.traverse.length - 1].sol }) },
  // --- en "Mas capas" ---
  { id: 'rugosidad', key: 'oRough', name: t('layer.rugosidad.name'), tag: 'der', more: true, src: t('layer.rugosidad.src'),
    grad: 'linear-gradient(90deg,#450054,#3b528c,#21918c,#5ec961,#fde824)', ends: () => [t('layer.rugosidad.lo'), t('layer.rugosidad.hi')] },
  { id: 'regreso', key: 'oBack', name: t('layer.regreso.name'), tag: 'mod', more: true, src: t('layer.regreso.src'),
    grad: 'linear-gradient(90deg,#26bf66,#bfd940,#f7b326,#eb5926,#b31a33)', ends: () => ['0 min', '≥ 60 min'] },
  { id: 'curvas', uni: 'uContours', name: t('layer.curvas.name'), tag: 'der', more: true },
  { id: 'ruta', line: 'routeLine', name: t('layer.ruta.name'), tag: 'mod', more: true, on: 1 },
];

function buildLayerPanel() {
  const u = A.terrain.uniforms;
  for (const L of LAYERS) {
    const d = document.createElement('div'); d.className = 'layer';
    const [cls, tag] = TAGS[L.tag];
    const src = typeof L.src === 'function' ? L.src() : L.src;
    const ends = L.ends ? L.ends() : null;
    d.innerHTML = `<label><input type="checkbox" ${L.on ? 'checked' : ''}><span>${L.name}</span><em class="${cls}">${tag}</em></label>
      ${src ? `<div class="src">${src}</div>` : ''}
      ${L.key ? `<input type="range" min="0" max="1" step="0.05" value="${L.on ? 1 : 0.75}" style="--grad:${L.grad}" title="${t('layer.opacity')}">` : ''}
      ${ends ? `<div class="ends">${ends.map((e) => `<span>${e}</span>`).join('')}</div>` : ''}${L.extra || ''}`;
    const chk = d.querySelector('input[type=checkbox]'), rng = d.querySelector('input[type=range]');
    L.set = (on) => { chk.checked = on; L.upd(); };
    L.upd = () => {
      if (L.key) u[L.key].value = chk.checked ? +rng.value : 0;
      else if (L.uni) u[L.uni].value = chk.checked ? 1 : 0;
      else if (L.line) A[L.line].visible = chk.checked;
    };
    chk.onchange = L.upd; if (rng) rng.oninput = L.upd; L.upd();
    $(L.more ? 'layersMore' : 'layers').appendChild(d);
  }
  $('thDay').onchange = (e) => { u.uThermDay.value = e.target.checked ? 1 : 0; };
}

function buildParams() {
  const bind = (id, out, key, fmt) => {
    const el = $(id); el.value = P[key]; $(out).textContent = fmt(P[key]);
    el.oninput = () => { P[key] = +el.value; $(out).textContent = fmt(P[key]); };
    el.onchange = () => replan();
    return () => { el.value = P[key]; $(out).textContent = fmt(P[key]); };
  };
  bind('pSlope', 'oSlopeMax', 'maxCellSlope', (v) => v + '°');
  bind('pRisk', 'oRisk', 'risk', (v) => num(v, 1));
  bind('pStop', 'oStop', 'stopMinutes', (v) => v + ' min');
  A.syncReserve = bind('pRes', 'oRes', 'o2ReservePct', (v) => v + ' %');
  $('pSlope').addEventListener('input', () => { P.maxDirSlope = P.maxCellSlope; });
}

// =====================================================================
//  PLAN: ruta, presupuesto y escenario de evento solar
// =====================================================================
function replan() {
  const { nav, terrain } = A;
  const t0 = performance.now();
  // El campo de regreso al habitat solo depende de los parametros de marcha: se reutiliza si no cambiaron
  const sig = [P.vFlat, P.maxCellSlope, P.maxDirSlope, P.risk].join('|');
  if (sig !== A.backSig) {
    A.backSig = sig;
    A.backField = nav.dijkstra(nav.cellOf(A.habitat.x, A.habitat.z), true);
    const mins = new Float32Array(nav.n * nav.n);
    for (let i = 0; i < mins.length; i++) mins[i] = A.backField.time[i] === Infinity ? -1 : A.backField.time[i] / 60;
    terrain.setBackTexture(mins, nav.n);
  }

  const active = A.stops.filter((s) => s.on);
  const reachable = active.filter((s) => A.backField.time[nav.cellOf(s.x, s.z)] !== Infinity);
  A.unreachable = active.filter((s) => !reachable.includes(s));
  const r = nav.planWithReserve(A.habitat, reachable, A.doseRate, A.backField);
  A.plan = r.plan; A.tl = r.tl; A.omitted = r.omitted;      // omitted: paradas quitadas para cumplir la reserva de O2
  A.planMs = performance.now() - t0;
  A.stops.forEach((s) => { s.order = null; });
  if (A.plan) A.plan.order.forEach((s, i) => { s.order = i + 1; });
  if (!A.selected || !A.stops.includes(A.selected)) A.selected = (A.plan && A.plan.order[0]) || A.stops[0] || null;
  if (A.event) { const e = A.event; A.event = null; if (e.stop.order) setEvent(e.stop, e.solar, true); }
  drawRoute(); drawBack(); drawBeacons(); drawBudget(); drawStops(); drawStrip(); drawStopCard(); drawProfile();
}

const inRoute = () => A.stops.filter((s) => s.order).length;
const isGo = () => A.tl && A.tl.total.minMargin >= 0 && !A.unreachable.length && A.tl.total.o2LeftPct >= P.o2ReservePct;

// Escenario: algo obliga a volver al habitat desde una parada (solar = dosis duplicada)
function setEvent(stop, solar = true, quiet = false) {
  const p = A.tl && A.tl.pts.find((k) => k.arrive === stop);
  if (!p) return null;
  const cells = A.nav.pathBack(A.backField, p.cell);
  if (!cells || cells.length < 2) return null;
  const back = A.nav.buildTimeline([{ cells, toStop: null }], A.doseRate * (solar ? 2 : 1), A.backField);
  const info = { desde: stop.name, regreso_min: Math.round(back.total.time / 60), distancia_regreso_m: Math.round(back.total.dist),
    o2_al_llegar_pct: Math.round((1 - (p.o2 + back.total.o2) / P.o2TankKg) * 100),
    dosis_total_uSv: Math.round((p.dose + back.total.dose) * 1000), dosis_duplicada: solar,
    nota: 'Tiempos y oxígeno son estimaciones del modelo.' };
  A.event = { stop, solar, back, info };
  if (!quiet) { drawBack(); drawStrip(); }
  return info;
}
function clearEvent() { A.event = null; drawBack(); drawStrip(); }

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
const linePos = (pts, dy) => { const pos = []; for (const p of smoothPts(pts)) pos.push(p.x, A.terrain.heightAt(p.x, p.z) + dy, p.z); return pos; };

function drawRoute() {
  setLine(A.routeLine, A.tl ? linePos(A.tl.pts, 1.2) : [0, -999, 0, 0, -999, 1]);
  const start = A.tl ? A.tl.pts[0] : A.habitat;
  A.ev1.position.set(start.x + 9, A.terrain.heightAt(start.x + 9, start.z + 2), start.z + 2);
  A.ev2.position.set(start.x + 10.5, A.terrain.heightAt(start.x + 10.5, start.z + 3), start.z + 3);
}
// Ruta de regreso: linea discontinua naranja con flechas hacia el habitat
function drawBack() {
  const ev = A.event;
  A.backLine.visible = Boolean(ev); A.backArrows.clear();
  $('legBack').hidden = !ev; $('btnBack').hidden = !ev; $('evChip').hidden = !(ev && ev.solar);
  $('btnSolar').textContent = ev ? t('btn.solarOff') : t('btn.solar');
  if (!ev) return;
  const pts = smoothPts(ev.back.pts);
  setLine(A.backLine, linePos(ev.back.pts, 2.0));
  const cone = new THREE.ConeGeometry(7, 20, 10), mat = new THREE.MeshBasicMaterial({ color: 0xffa53d });
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 18; i < pts.length - 6; i += 18) {
    const a = pts[i], b = pts[i + 3];
    const dir = new THREE.Vector3(b.x - a.x, A.terrain.heightAt(b.x, b.z) - A.terrain.heightAt(a.x, a.z), b.z - a.z).normalize();
    const m = new THREE.Mesh(cone, mat);
    m.position.set(a.x, A.terrain.heightAt(a.x, a.z) + 5, a.z); m.quaternion.setFromUnitVectors(up, dir);
    A.backArrows.add(m);
  }
}
function drawBeacons() {
  A.beacons.clear();
  for (const s of A.stops) {
    if (!s.on) continue;
    const b = makeBeacon(s.order ? 0x39d0ff : 0x888888);
    b.position.set(s.x, A.terrain.heightAt(s.x, s.z), s.z); A.beacons.add(b);
  }
}

// Franja de resumen sobre el mapa
function drawStrip() {
  $('sStops').textContent = t('strip.stops', { n: inRoute(), total: A.stops.length });
  const st = $('sState');
  if (!A.tl) {
    for (const id of ['sDist', 'sTime', 'sBack', 'sO2']) $(id).textContent = '–';
    st.className = 'chip nogo'; st.textContent = t('strip.none'); return;
  }
  const T = A.tl.total, ev = A.event;
  $('sDist').textContent = num(T.dist / 1000, 1) + ' km';
  $('sTime').textContent = fmtTime(T.time);
  $('sBackLbl').textContent = ev ? t('strip.back') : t('strip.backMax');
  $('sBack').textContent = (ev ? ev.info.regreso_min : Math.round(T.maxBack / 60)) + ' min';
  $('sO2').textContent = (ev ? ev.info.o2_al_llegar_pct : Math.round(T.o2LeftPct)) + ' %';
  if (ev) { st.className = 'chip sim'; st.textContent = t('strip.sim'); }
  else { st.className = 'chip ' + (isGo() ? 'go' : 'nogo'); st.textContent = isGo() ? t('strip.go') : t('strip.nogo'); }
}

function drawBudget() {
  const st = $('status'), b = $('budget');
  if (!A.tl) {
    st.className = 'nogo'; st.innerHTML = `${t('bud.noRoute')}<small>${t('bud.noRoute.d')}</small>`;
    b.innerHTML = ''; return;
  }
  const T = A.tl.total;
  st.className = isGo() ? 'go' : 'nogo';
  st.innerHTML = isGo()
    ? `${t('bud.go')}<small>${t('bud.go.d', { min: P.o2ReserveMin })}${A.omitted.length ? t('bud.go.omit', { list: A.omitted.map((s) => s.name).join(', ') }) : ''}</small>`
    : A.unreachable.length
      ? `${t('bud.unreach')}<small>${t('bud.unreach.d', { list: A.unreachable.map((s) => s.name).join(', ') })}</small>`
      : T.o2LeftPct < P.o2ReservePct
        ? `${t('bud.noRes')}<small>${t('bud.noRes.d', { pct: P.o2ReservePct })}</small>`
        : `${t('bud.noO2')}<small>${t('bud.noO2.d', { time: fmtTime(T.noReturn.t) })}</small>`;
  const cell = (k, v) => `<div class="cell"><span>${k}</span><b>${v}</b></div>`;
  b.innerHTML =
    cell(t('k.dist'), num(T.dist / 1000, 2) + ' km') + cell(t('k.time'), fmtTime(T.time)) +
    cell(t('bud.updown'), `${T.up.toFixed(0)} / ${T.down.toFixed(0)} m`) + cell(t('bud.energy'), num(T.energy / 1e6, 1) + ' MJ') +
    cell(t('bud.o2used'), `${num(T.o2, 2)} kg · ${(100 - T.o2LeftPct).toFixed(0)} %`) + cell(t('bud.o2margin'), (T.minMargin * 1000).toFixed(0) + ' g') +
    cell(t('bud.dose'), (T.dose * 1000).toFixed(0) + ' µSv') + cell(t('bud.maxback'), fmtTime(T.maxBack));
}

function selectStop(s, focus = false) {
  A.selected = s; drawStops(); drawStopCard();
  if (focus) {
    const y = A.terrain.heightAt(s.x, s.z);
    A.controls.target.set(s.x, y, s.z); A.camera.position.set(s.x - 80, y + 130, s.z + 190);
  }
}

function drawStops() {
  const box = $('stops'); box.innerHTML = '';
  const sorted = [...A.stops].sort((a, b) => (a.order || 99) - (b.order || 99));
  for (const s of sorted) {
    const why = !s.on ? t('stop.off') : A.omitted.includes(s) ? t('stop.omitted') : A.unreachable.includes(s) ? t('stop.unreach') : s.sub;
    const d = document.createElement('div'); d.className = 'stop' + (s === A.selected ? ' sel' : '');
    d.innerHTML = `<input type="checkbox" ${s.on ? 'checked' : ''}><span class="badge ${s.order ? '' : 'off'}">${s.order || '–'}</span>
      <span class="nm">${s.name}<small>${why}</small></span>
      ${s.photos && s.photos.length ? `<button class="ph">${t('stop.photos')}</button>` : ''}${s.custom ? '<button class="rm">✕</button>' : ''}`;
    d.querySelector('input').onchange = (e) => { s.on = e.target.checked; replan(); };
    const ph = d.querySelector('.ph'); if (ph) ph.onclick = () => showPhotos(s);
    const rm = d.querySelector('.rm'); if (rm) rm.onclick = () => { A.stops.splice(A.stops.indexOf(s), 1); replan(); };
    d.querySelector('.nm').onclick = () => selectStop(s, true);
    box.appendChild(d);
  }
}

// Tarjeta de la parada seleccionada, con la foto real de Curiosity
function drawStopCard() {
  const s = A.selected, box = $('stopCard');
  if (!s) { box.innerHTML = ''; return; }
  const ph = s.photos && s.photos[0];
  const rel = t('card.rel', { v: `${s.sci.relieve_m > 0 ? '+' : ''}${num(s.sci.relieve_m, 1)}` });
  box.innerHTML = `<h3>${s.name}</h3><p>${s.sub}</p>
    <div class="sci"><b>${t('card.obj')}</b> <em class="prop">${t('tag.prop')}</em>
      <p>${s.sci.objetivo}</p><p class="task">▸ ${s.sci.tarea}</p>
      <p class="rel">${t('card.point', { lugar: s.sci.lugar, rel })} <em class="der">${t('tag.der')}</em></p></div>` + (ph
    ? `<div class="ph"><img src="data/${ph.file}" alt="${t('card.alt', { name: s.name })}"><span class="cap">${t('card.cap', { sol: ph.sol })}</span></div>`
    : `<p>${t('card.nophoto')}</p>`);
  const el = box.querySelector('.ph'); if (el) el.onclick = () => showPhotos(s);
}

function showPhotos(s) {
  $('photoImgs').innerHTML = s.photos.map((p) => `<img src="data/${p.file}" alt="${t('photo.alt', { sol: p.sol })}">`).join('');
  $('photoCap').innerHTML = `<b>${s.name}</b>${t('photo.cap')}` +
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
  const pts = A.tl.pts, D = A.tl.total.dist, pad = { l: 46, r: 44, t: 8, b: 18 };
  const ys = pts.map((p) => p.y + A.eRef), y0 = Math.min(...ys) - 2, y1 = Math.max(...ys) + 2;
  const X = (d) => pad.l + (d / D) * (W - pad.l - pad.r), Y = (e) => Hh - pad.b - ((e - y0) / (y1 - y0)) * (Hh - pad.t - pad.b);
  g.font = '10px system-ui'; g.fillStyle = '#9c968c'; g.strokeStyle = 'rgba(255,255,255,.08)';
  for (let i = 0; i <= 3; i++) {
    const e = y0 + ((y1 - y0) * i) / 3; g.beginPath(); g.moveTo(pad.l, Y(e)); g.lineTo(W - pad.r, Y(e)); g.stroke();
    g.textAlign = 'right'; g.fillText(e.toFixed(0) + ' m', pad.l - 4, Y(e) + 3);
  }
  g.textAlign = 'center';
  for (let km = 0; km <= D / 1000; km += 0.5) g.fillText(num(km, 1) + ' km', X(km * 1000), Hh - 4);
  g.lineWidth = 2.5;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], run = Math.hypot(b.x - a.x, b.z - a.z);
    if (run === 0) continue;
    const s = Math.abs(Math.atan2(b.y - a.y, run)) * 57.3;
    g.strokeStyle = s < 10 ? '#3ecf7a' : s < 20 ? '#f2d933' : s < 25 ? '#f5851f' : '#ef4b4b';
    g.beginPath(); g.moveTo(X(a.dist), Y(a.y + A.eRef)); g.lineTo(X(b.dist), Y(b.y + A.eRef)); g.stroke();
  }
  const Yo = (f) => Hh - pad.b - f * (Hh - pad.t - pad.b);      // oxigeno restante (eje derecho)
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
  const w = A.weather.latest, r = A.radiation, es = lang === 'es';      // los textos de radiation.json vienen en español
  const eva = (r.gcr_dose_equivalent_mSv_per_day / 24) * 1000;
  $('env').innerHTML = `
    <div class="card"><h3>${t('env.weather')} <em>${t('tag.obs')} · REMS</em></h3>
      <p>${t('env.last')} <b>sol ${w.sol}</b> (${w.terrestrial_date})</p>
      <p>${t('env.air')} <b>${w.min_temp} ${t('env.to')} ${w.max_temp} °C</b> · ${t('env.ground')} <b>${w.min_gts_temp} ${t('env.to')} ${w.max_gts_temp} °C</b></p>
      <p>${t('env.pressure')} <b>${w.pressure} Pa</b> · ${t('env.sky')} <b>${w.atmo_opacity === 'Sunny' ? t('env.sunny') : w.atmo_opacity}</b> · UV <b>${({ Low: t('uv.Low'), Moderate: t('uv.Moderate'), High: t('uv.High'), Very_High: t('uv.Very_High') })[w.local_uv_irradiance_index] || w.local_uv_irradiance_index}</b></p>
      <p>${t('env.sunrise')} ${w.sunrise} · ${t('env.sunset')} ${w.sunset} · Ls ${w.ls}°</p></div>
    <div class="card"><h3>${t('env.rad')} <em>${t('tag.obs')} · RAD</em></h3>
      <p>${t('env.gcr')} <b>${num(r.gcr_dose_equivalent_mSv_per_day, 2)} ± ${num(r.gcr_dose_equivalent_uncertainty, 2)} ${t('env.perDay')}</b> ${t('env.perHour', { n: eva.toFixed(0) })}</p>
      <p>${es ? r.sep_event_note : t('env.sepNote')}</p>
      <p>${t('env.reference')} ${es ? r.career_limit_source : t('env.career')}</p><p style="font-size:10.5px">${t('env.source')}</p></div>
    <div class="card"><h3>${t('env.space')} <em>${t('tag.obs')} · DONKI</em></h3><p id="donkiState"></p><div class="donki" id="donkiList"></div>
      <p style="font-size:10.5px">${t('env.donkiNote')}</p></div>`;
  showDonki(A.donki.notifications, t('env.saved', { date: (A.donki.fetched || '').slice(0, 10) }));
  const start = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);     // intento en vivo desde el navegador
  fetch(`https://api.nasa.gov/DONKI/notifications?startDate=${start}&type=all&api_key=DEMO_KEY`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((list) => {
      const rows = list.map((n) => ({ type: n.messageType, id: n.messageID, time: n.messageIssueTime, url: n.messageURL,
        summary: (n.messageBody.split('## Summary:')[1] || '').trim().split('\n\n').slice(0, 2).join(' ').replace(/\s+/g, ' ').slice(0, 320) }));
      rows.sort((a, b) => (a.time < b.time ? 1 : -1));
      if (rows.length) showDonki(rows, t('env.live'));
    }).catch(() => {});
}
const DONKI_NAMES = Object.fromEntries(['CME', 'FLR', 'SEP', 'GST', 'RBE', 'IPS', 'Report'].map((k) => [k, t('donki.' + k)]));      // (los resumenes de los avisos ya vienen en ingles de NASA)
function showDonki(rows, state) {
  A.donkiRows = rows; A.donkiState = state;
  const mars = rows.filter((r) => /Mars/.test(r.summary)).length;
  $('donkiState').innerHTML = `<b>${rows.length}</b> ${t('env.notices')} · <b>${mars}</b> ${t('env.mention')} · ${state}`;
  $('donkiList').innerHTML = rows.slice(0, 12).map((r) =>
    `<div class="${/Mars/.test(r.summary) ? 'mars' : ''}"><a href="${r.url}" target="_blank" rel="noopener">${r.time.slice(0, 10)} · ${DONKI_NAMES[r.type] || r.type}</a></div>`).join('');
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
  $('btnAdd').onclick = () => { adding = !adding; $('btnAdd').classList.toggle('on', adding); $('btnAdd').textContent = adding ? t('btn.adding') : t('btn.add'); };
  const cv = A.renderer.domElement;
  cv.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  cv.addEventListener('pointerup', (e) => {
    if (document.body.dataset.mode !== 'plan' || !adding || !downAt) return;
    if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;   // fue un arrastre de camara
    const p = pickGround(e); if (!p) return;
    nCustom++;
    const s = { id: 'C' + nCustom, name: t('stop.custom', { n: nCustom }), sub: t('stop.crew'), x: p.x, z: p.z, photos: [], on: true, custom: true,
      sci: scienceFor(A.terrain, p.x, p.z) };
    A.stops.push(s); A.selected = s;
    adding = false; $('btnAdd').classList.remove('on'); $('btnAdd').textContent = t('btn.add');
    replan();
  });
  // tarjetas plegables: [boton, caja que recibe la clase, clase, flecha abierta, flecha plegada]
  for (const [id, box, cls, open, shut] of [['foldLeft', $('app'), 'noleft', '◀', '▶'], ['foldRight', $('app'), 'noright', '▶', '◀'], ['foldProf', $('mapCell'), 'noprof', '▼', '▲']]) {
    const b = $(id);
    const set = (off) => {
      box.classList.toggle(cls, off); b.textContent = off ? shut : open;
      b.title = off ? t('fold.show') : t('fold.hide'); b.setAttribute('aria-expanded', String(!off));
      store('mw_' + cls, off ? '1' : ''); layout();      // layout() ajusta el mapa al nuevo hueco
    };
    b.onclick = () => set(!box.classList.contains(cls));
    set(recall('mw_' + cls) === '1');
  }
  // pestañas del panel derecho
  for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => {
    for (const k of document.querySelectorAll('.tabs button')) k.classList.toggle('on', k === b);
    for (const t of document.querySelectorAll('.tab')) t.hidden = t.id !== 'tab-' + b.dataset.tab;
  };
  // clic en la etiqueta de una parada = seleccionarla
  $('labels').addEventListener('click', (e) => {
    const el = e.target.closest('.lbl'); const s = el && A.stops.find((k) => k.id === el.dataset.id);
    if (s) selectStop(s);
  });
  $('btnSolar').onclick = () => {
    if (A.event) return clearEvent();
    const s = (A.selected && A.selected.order) ? A.selected : A.plan && A.plan.order[0];
    const info = s && setEvent(s, true);
    addMsg('tars', info ? localReply('simular_evento_solar', info) : t('tars.noSim'));
  };
  $('btnBack').onclick = () => {
    if (!A.event) return;
    const s = A.event.stop, mx = (s.x + A.habitat.x) / 2, mz = (s.z + A.habitat.z) / 2, d = Math.hypot(s.x - A.habitat.x, s.z - A.habitat.z);
    A.controls.target.set(mx, A.terrain.heightAt(mx, mz), mz);
    A.camera.position.set(mx - d * 0.15, A.terrain.heightAt(mx, mz) + d * 0.95, mz + d * 0.85);
  };
  $('photoClose').onclick = () => { $('photo').hidden = true; };
  $('btnHud').onclick = enterHud;
  $('btnGlb').onclick = exportGlb;
  $('hExit').onclick = exitHud;
  $('hPlay').onclick = () => { H.playing = !H.playing; $('hPlay').textContent = H.playing ? '⏸' : '▶'; };
  $('hSpeed').onchange = (e) => { H.speed = +e.target.value; };
  $('hScrub').oninput = (e) => { H.t = (e.target.value / 1000) * A.hudTl.total.time; };
  $('hSep').onclick = openDecision;                    // la alerta solar abre la decision del astronauta
  $('dBack').onclick = () => decide(true);
  $('dCont').onclick = () => decide(false);
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
//  TARS: herramientas, conversacion y voz
// =====================================================================
const findStop = (q) => {
  const t = String(q || '').trim().toLowerCase();
  return A.stops.find((s) => s.id.toLowerCase() === t) || A.stops.find((s) => s.name.toLowerCase() === t) ||
    A.stops.find((s) => t && s.name.toLowerCase().includes(t)) || null;
};

function planSummary() {
  const o = { modo: document.body.dataset.mode === 'hud' ? 'casco' : 'planificador', hay_ruta: Boolean(A.tl),
    paradas_activas: inRoute(), paradas_totales: A.stops.length,
    orden: (A.plan ? A.plan.order : []).map((s) => s.name),
    omitidas_por_reserva: A.omitted.map((s) => s.name), inalcanzables: A.unreachable.map((s) => s.name),
    desactivadas: A.stops.filter((s) => !s.on).map((s) => s.name), reserva_minima_pct: P.o2ReservePct };
  if (A.tl) {
    const T = A.tl.total;
    Object.assign(o, { veredicto: isGo() ? 'GO' : 'NO-GO', distancia_km: +(T.dist / 1000).toFixed(2), duracion_min: Math.round(T.time / 60),
      subida_m: Math.round(T.up), o2_usado_pct: Math.round(100 - T.o2LeftPct), o2_al_llegar_pct: Math.round(T.o2LeftPct),
      margen_minimo_o2_g: Math.round(T.minMargin * 1000), dosis_uSv: Math.round(T.dose * 1000), regreso_a_pie_maximo_min: Math.round(T.maxBack / 60),
      minutos_por_parada: P.stopMinutes });
  }
  if (A.event) o.escenario_simulado = A.event.info;
  o.nota = 'Distancia y elevación vienen del terreno medido; tiempos, oxígeno y veredicto son estimaciones del modelo.';
  return o;
}

function hudSummary() {
  const tl = A.hudTl, s = A.nav.sample(tl, H.t), hour = EVA_START_H + H.t / 3699;
  let next = null;
  for (let i = s.i + 1; i < tl.pts.length; i++) if (tl.pts[i].arrive) { next = tl.pts[i]; break; }
  const end = tl.pts[tl.pts.length - 1];
  return { tiempo_min: Math.round(s.t / 60), distancia_recorrida_km: +(s.dist / 1000).toFixed(2),
    o2_restante_pct: Math.round((1 - s.o2 / P.o2TankKg) * 100), margen_regreso_o2_g: Math.round(s.margin * 1000),
    regreso_a_pie_min: Math.round(s.back / 60), dosis_uSv: +(s.dose * 1000).toFixed(1),
    siguiente: s.dwell ? t('hud.inStop', { name: s.dwell.name }) : next ? next.arrive.name : t('hab'),
    distancia_siguiente_m: Math.round(((next || end).dist - s.dist)), pendiente_grados: Math.round(s.stepSlope || 0),
    elevacion_m: Math.round(A.terrain.heightAt(s.x, s.z) + A.eRef),
    hora_local: `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')} LMST`,
    temperatura_aire_estimada_C: Math.round(airTemp(hour)), alerta_solar: A.sep, tiempo_total_previsto_min: Math.round(tl.total.time / 60) };
}

// Ejecuta una herramienta de TARS sobre el estado real de la app
async function runTool(name, input) {
  const hud = document.body.dataset.mode === 'hud';
  const soloPlan = { error: t('err.planOnly') };
  switch (name) {
    case 'estado_mision': { const o = planSummary(); if (hud) o.casco = hudSummary(); return o; }
    case 'entorno': {
      const w = A.weather.latest, r = A.radiation, rows = A.donkiRows || [];
      return { clima: { fuente: 'REMS, Curiosity (medido)', sol: w.sol, fecha: w.terrestrial_date, aire_min_C: w.min_temp, aire_max_C: w.max_temp,
        suelo_min_C: w.min_gts_temp, suelo_max_C: w.max_gts_temp, presion_Pa: w.pressure, cielo: w.atmo_opacity, uv: w.local_uv_irradiance_index,
        amanecer: w.sunrise, atardecer: w.sunset },
      radiacion: { fuente: 'RAD, Curiosity (medido; Hassler et al. 2014)', mSv_por_dia: r.gcr_dose_equivalent_mSv_per_day,
        incertidumbre: r.gcr_dose_equivalent_uncertainty, uSv_por_hora: Math.round((r.gcr_dose_equivalent_mSv_per_day / 24) * 1000), limite_carrera_mSv: r.career_limit_mSv },
      clima_espacial: { fuente: 'NASA DONKI (' + (A.donkiState || '') + ')', avisos: rows.length, mencionan_marte: rows.filter((k) => /Mars/.test(k.summary)).length,
        recientes: rows.slice(0, 4).map((k) => `${k.time.slice(0, 10)} ${DONKI_NAMES[k.type] || k.type}`),
        nota: 'DONKI observa desde el entorno de la Tierra; no es un pronóstico para Marte.' } };
    }
    case 'info_parada': {
      const s = findStop(input.parada); if (!s) return { error: t('err.noStop', { q: input.parada }) };
      const c = A.nav.cellOf(s.x, s.z), back = A.backField.time[c];
      return { id: s.id, nombre: s.name, descripcion: s.sub, en_la_ruta: Boolean(s.order), orden: s.order, activa: s.on,
        elevacion_m: Math.round(A.terrain.heightAt(s.x, s.z) + A.eRef), pendiente_grados: Math.round(A.nav.S[c]),
        regreso_a_pie_min: back === Infinity ? null : Math.round(back / 60), fotos_de_curiosity: (s.photos || []).length,
        ciencia: { pregunta_de_la_caminata: PREGUNTA, situacion: s.sci.lugar, relieve_m: s.sci.relieve_m, objetivo: s.sci.objetivo, tarea: s.sci.tarea,
          nota: 'El relieve se deriva del DEM de HiRISE. El objetivo y la tarea son una propuesta del equipo, no resultados de Curiosity.' } };
    }
    case 'fijar_reserva_o2': {
      if (hud) return soloPlan;
      P.o2ReservePct = Math.max(0, Math.min(95, Math.round(+input.porcentaje || 0)));
      A.syncReserve(); replan();
      return { ...planSummary(), omitidas: A.omitted.map((s) => s.name), cumple: Boolean(A.tl && A.tl.total.o2LeftPct >= P.o2ReservePct) };
    }
    case 'activar_parada': {
      if (hud) return soloPlan;
      const s = findStop(input.parada); if (!s) return { error: t('err.noStop', { q: input.parada }) };
      s.on = Boolean(input.activa); replan();
      return { parada: s.name, activa: s.on, ...planSummary() };
    }
    case 'simular_evento_solar':
    case 'regresar_al_habitat': {
      const solar = name === 'simular_evento_solar';
      if (hud) return hudReturn(solar) || { error: t('err.alreadyBack') };
      const s = findStop(input.parada) || ((A.selected && A.selected.order) ? A.selected : A.plan && A.plan.order[0]);
      if (!s || !s.order) return { error: t('err.notInRoute') };
      return setEvent(s, solar) || { error: t('err.noBack') };
    }
    case 'salud_astronauta': {
      const nota = 'Constantes SIMULADAS por un modelo a partir del esfuerzo de la ruta; en esta demo no hay sensores reales.';
      if (hud) return { momento: 'ahora', ...vitals(A.nav, A.hudTl, H.t), nota };
      if (!A.tl) return { error: t('err.noEffort') };
      let pico = null;                       // en el planificador: el momento de mas esfuerzo de la ruta
      for (let t = 0; t <= A.tl.total.time; t += 60) { const v = vitals(A.nav, A.tl, t); if (!pico || v.fc_lpm > pico.fc_lpm) pico = { ...v, t }; }
      return { momento: 'previsión para la ruta planificada', fc_maxima_lpm: pico.fc_lpm, en_el_minuto: Math.round(pico.t / 60),
        respiracion_maxima_rpm: pico.respiracion_rpm, esfuerzo_maximo_W: pico.esfuerzo_W, estado_en_el_pico: pico.estado, nota };
    }
    case 'mostrar_capa': {
      const L = LAYERS.find((k) => k.id === input.capa); if (!L) return { error: t('err.noLayer', { q: input.capa }) };
      L.set(Boolean(input.visible)); return { capa: L.name, visible: Boolean(input.visible) };
    }
    default: return { error: t('err.noTool', { name }) };
  }
}

function addMsg(who, text, cls = '') {
  const d = document.createElement('div'); d.className = `msg ${who} ${cls}`;
  d.innerHTML = `<div class="who">${who === 'tars' ? '🤖 TARS' : t('chat.you')}</div><div class="txt"></div>`;
  d.querySelector('.txt').textContent = text;
  $('chat').appendChild(d); $('chat').scrollTop = 1e9;
  return d.querySelector('.txt');
}

// Ordenes rapidas: cada boton ejecuta su herramienta directamente
const QUICK = [
  { label: t('quick.status'), text: t('quick.status.q'), tool: 'estado_mision', input: {} },
  { label: t('quick.r30'), text: t('quick.r30.q'), tool: 'fijar_reserva_o2', input: { porcentaje: 30 } },
  { label: t('quick.r75'), text: t('quick.r75.q'), tool: 'fijar_reserva_o2', input: { porcentaje: 75 } },
  { label: t('quick.r0'), text: t('quick.r0.q'), tool: 'fijar_reserva_o2', input: { porcentaje: 0 } },
  { label: t('quick.env'), text: t('quick.env.q'), tool: 'entorno', input: {} },
  { label: t('quick.health'), text: t('quick.health.q'), tool: 'salud_astronauta', input: {} },
];
// Sin IA y por voz o texto libre: se reconoce la intencion por palabras clave
function offlineIntent(text) {
  const t = text.toLowerCase();
  const pct = (t.match(/(\d{1,2})\s*(%|por ciento|percent)/) || [])[1];
  if (/reserv/.test(t) && pct) return ['fijar_reserva_o2', { porcentaje: +pct }];
  if (/solar|tormenta|storm/.test(t)) return ['simular_evento_solar', { parada: '' }];
  if (/volver|regres|h[aá]bitat|return|\bback\b|habitat/.test(t)) return ['regresar_al_habitat', {}];
  if (/salud|pulso|coraz|cansa|fatiga|vitales|health|pulse|heart|tired|vitals/.test(t)) return ['salud_astronauta', {}];
  if (/clima|temperatura|radiaci|fr[ií]o|presi[oó]n|weather|temperature|radiation|pressure|environment/.test(t)) return ['entorno', {}];
  return ['estado_mision', {}];
}

async function tarsSay(text) {
  const [tool, input] = offlineIntent(text);
  return localReply(tool, await runTool(tool, input));
}

function setupTars() {
  // TARS simulado: respuestas locales armadas con los datos de la app (sin IA ni conexion)
  $('tarsState').innerHTML = `<b class="off">${t('tars.sim')}</b> · ${t('tars.simDetail')}`;
  $('hTarsState').textContent = t('tars.hudSim');
  addMsg('tars', t('tars.helloBasic'));
  const q = $('quick');
  for (const k of QUICK) { const b = document.createElement('button'); b.textContent = k.label; b.onclick = () => chatAsk(k.text, k); q.appendChild(b); }

  // conversacion en el planificador
  async function chatAsk(text, quick = null, speak = false) {
    if (A.busy) return; A.busy = true;
    addMsg('tu', text); const wait = addMsg('tars', t('chat.thinking'), 'wait');
    try {
      const reply = quick ? localReply(quick.tool, await runTool(quick.tool, quick.input)) : await tarsSay(text);
      wait.textContent = reply; wait.parentElement.classList.remove('wait');
      if (speak) A.voice.speak(reply);
    } catch (e) { wait.textContent = e.message; wait.parentElement.classList.replace('wait', 'err'); }
    A.busy = false; $('chat').scrollTop = 1e9;
  }
  A.chatAsk = chatAsk;
  $('tarsForm').onsubmit = (e) => { e.preventDefault(); const t = $('tarsIn').value.trim(); if (t) { $('tarsIn').value = ''; chatAsk(t); } };

  // conversacion en el casco (por voz o texto)
  async function hudAsk(text) {
    if (A.busy) return; A.busy = true;
    $('hTarsYou').textContent = '› ' + text; $('hTarsSay').textContent = '…';
    let reply;
    try { reply = await tarsSay(text); } catch (e) { reply = e.message; }
    $('hTarsSay').textContent = reply; A.voice.speak(reply); A.busy = false;
  }
  A.hudAsk = hudAsk;
  $('hTarsForm').onsubmit = (e) => { e.preventDefault(); const t = $('hTarsIn').value.trim(); if (t) { $('hTarsIn').value = ''; hudAsk(t); } };

  // voz: mantener pulsado el boton (o la tecla V en el casco) para hablar
  const mics = [$('tarsMic'), $('hMic')];
  A.voice = createVoice({
    onText: (t) => (document.body.dataset.mode === 'hud' ? hudAsk(t) : chatAsk(t, null, true)),
    onState: (st, txt) => {
      const rec = st === 'escuchando';
      mics.forEach((m) => m.classList.toggle('rec', rec));
      if (document.body.dataset.mode === 'hud') {
        if (rec) $('hTarsYou').textContent = '🎙 ' + (txt || t('hud.listening'));
        else if (st === 'error') $('hTarsSay').textContent = txt;
      } else if (rec) $('tarsIn').value = txt; else if (st === 'error') addMsg('tars', txt, 'err');
    },
  });
  // dialogo simulado TARS <-> astronauta en la vista de casco (guion en ingles, src/tars-dialog.js)
  A.dialog = createDialog(A.voice, (who, text) => {
    if (!who) { $('hSub').hidden = true; return; }
    $('hSubWho').textContent = who === 'EV1' ? 'ASTRONAUT · EV1' : 'TARS';
    $('hSubWho').className = who === 'EV1' ? 'ev1' : '';
    $('hSubText').textContent = text; $('hSub').hidden = false;
  });
  if (!A.voice.supported) {
    $('tarsMic').hidden = true; $('hMic').disabled = true; $('hMic').textContent = t('voice.none');
  } else {
    for (const m of mics) {
      m.addEventListener('pointerdown', (e) => { e.preventDefault(); A.voice.start(); });
      m.addEventListener('pointerup', () => A.voice.stop());
      m.addEventListener('pointerleave', () => A.voice.stop());
    }
    const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    addEventListener('keydown', (e) => { if (e.code === 'KeyV' && !e.repeat && !typing() && document.body.dataset.mode === 'hud') A.voice.start(); });
    addEventListener('keyup', (e) => { if (e.code === 'KeyV') A.voice.stop(); });
  }
}

// =====================================================================
//  VISTA DE CASCO (HUD)
// =====================================================================
const H = { t: 0, playing: true, speed: 10, o2: 100, lookYaw: 0, lookPitch: 0, heading: 0, phase: 0 };
A.H = H;

function enterHud() {
  if (!A.tl) return;
  A.hudTl = A.tl; A.sep = false; A.returning = false; H.tipKey = null; H.t = 0; H.playing = true; H.lookYaw = 0; H.lookPitch = -0.05;
  $('hPlay').textContent = '⏸'; $('hSep').disabled = false;
  H.o2 = 100; H.speed = +$('hSpeed').value; A.dialog.reset(); $('hSub').hidden = true;
  H.decided = false; H.pending = null; H.solarCont = null; H.mapTl = null; $('hDecide').hidden = true;
  document.body.dataset.mode = 'hud';
  A.controls.enabled = false;
  A.savedCam = { p: A.camera.position.clone(), t: A.controls.target.clone() };
  A.camera.near = 0.3; A.camera.far = 8000; A.camera.fov = 70;
  A.scene.background = new THREE.Color(0xd9b48a);
  A.terrain.uniforms.uFogDensity.value = 0.00055;
  A.routeLine.material.linewidth = 6; A.backLine.visible = false; A.backArrows.visible = false;
  $('labels').innerHTML = ''; layout();
}
function exitHud() {
  document.body.dataset.mode = 'plan';
  A.controls.enabled = true;
  A.camera.near = 2; A.camera.far = 20000; A.camera.fov = 45; A.camera.rotation.set(0, 0, 0);
  A.camera.position.copy(A.savedCam.p); A.controls.target.copy(A.savedCam.t);
  A.scene.background = null; A.terrain.uniforms.uFogDensity.value = 0;
  A.routeLine.material.linewidth = 4.5; A.backArrows.visible = true;
  $('hudPhoto').hidden = true; $('hSub').hidden = true; $('hDecide').hidden = true; $('labels').innerHTML = '';
  A.dialog.reset();                  // corta la voz y vacia la conversacion simulada
  setSun(EVA_START_H); layout();
  drawRoute(); drawBack(); requestAnimationFrame(drawProfile);
}

// Vuelta inmediata al habitat desde la posicion actual. solar=true: alerta solar, la dosis
// se duplica (como midio RAD en septiembre de 2017). Devuelve un resumen o null.
function hudReturn(solar) {
  if (A.returning) return null;
  const s = A.nav.sample(A.hudTl, H.t);
  const cells = A.nav.pathBack(A.backField, A.nav.cellOf(s.x, s.z));
  if (!cells || cells.length < 2) return null;
  A.returning = true; A.sep = solar; $('hSep').disabled = true;
  const back = A.nav.buildTimeline([{ cells, toStop: null }], A.doseRate * (solar ? 2 : 1), A.backField);
  const info = { desde: t('here'), regreso_min: Math.round(back.total.time / 60), distancia_regreso_m: Math.round(back.total.dist),
    o2_al_llegar_pct: Math.round((1 - (s.o2 + back.total.o2) / P.o2TankKg) * 100), dosis_duplicada: solar,
    nota: 'Tiempos y oxígeno son estimaciones del modelo.' };
  for (const p of back.pts) { p.t += s.t; p.dist += s.dist; p.o2 += s.o2; p.energy += s.energy; p.dose += s.dose; p.margin -= s.o2; }
  const before = A.hudTl.pts.filter((p) => p.t < s.t);
  A.hudTl = { pts: [...before, ...back.pts], total: { ...back.total, time: back.pts[back.pts.length - 1].t } };
  A.sepAt = s.t;
  setLine(A.routeLine, linePos(back.pts, 1.2));
  return info;
}

function smoothPos(tl, t) {       // posicion suavizada para que la camara no zigzaguee
  let x = 0, z = 0; const ks = [-6, -3, 0, 3, 6];
  for (const k of ks) { const s = A.nav.sample(tl, t + k); x += s.x; z += s.z; }
  return { x: x / ks.length, z: z / ks.length };
}

function updateHud(dt) {
  const tl = A.hudTl, nav = A.nav, T = tl.total.time;
  // mientras TARS y el astronauta hablan, la caminata va a ×1 para poder escucharlos
  const hablando = A.dialog.talking();
  if (H.playing) H.t = Math.min(T, H.t + dt * (hablando ? 1 : H.speed));
  // Oxigeno de DEMOSTRACION: baja 1 % cada 2 s reales para que el publico lo vea (no es el modelo).
  // Se detiene mientras hablan, para que lo que dice TARS coincida con lo que se ve.
  if (H.playing && H.t < T && !hablando) H.o2 = Math.max(40, H.o2 - dt * 0.5);
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

  const hour = EVA_START_H + H.t / 3699;          // 1 hora marciana = 3699 s
  setSun(hour);
  const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);

  const left = Math.max(0, 1 - s.o2 / P.o2TankKg);
  $('hO2').innerHTML = H.o2.toFixed(0) + ' %<small>SIM</small>';
  $('hO2bar').style.width = H.o2 + '%';
  $('hO2bar').style.background = H.o2 > 60 ? 'var(--ok)' : 'var(--warn)';
  // regreso y margen en minutos, de un vistazo; los gramos de O2 quedan como detalle tecnico (al pasar el raton)
  $('hRet').textContent = minTxt(Math.round(s.back / 60));
  $('hMargin').textContent = minTxt(marginMin(s.margin));
  $('hMargin').title = t('hud.marginTip', { g: (s.margin * 1000).toFixed(0) });
  $('hMargin').style.color = s.margin < 0 ? 'var(--bad)' : s.margin < 0.05 ? 'var(--warn)' : '';
  $('hTime').textContent = fmtTime(s.t);
  $('hClock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} LMST`;
  $('hDose').textContent = num(s.dose * 1000, 1) + ' µSv';
  $('hTemp').textContent = airTemp(hour).toFixed(0) + ' °C ' + t('hud.estAbbr');
  $('hSlope').textContent = (Math.round(moving ? s.stepSlope : 0) || 0) + '°';
  $('hElev').textContent = (y + A.eRef).toFixed(0) + ' m';
  $('hDist').textContent = num(s.dist / 1000, 2) + ' km';

  let next = null;
  for (let i = s.i + 1; i < tl.pts.length; i++) if (tl.pts[i].arrive) { next = tl.pts[i]; break; }
  const end = tl.pts[tl.pts.length - 1];
  $('hNext').textContent = s.dwell ? t('hud.at', { name: s.dwell.name.toUpperCase() }) : next ? next.arrive.name.toUpperCase() : t('hud.habitat');
  $('hNextD').textContent = s.dwell ? t('hud.sciNow') : (((next || end).dist - s.dist)).toFixed(0) + ' m';

  // Salud simulada del astronauta e indicacion automatica de TARS (reglas locales, sin IA)
  const v = vitals(nav, tl, H.t);
  $('hHr').textContent = v.fc_lpm + ' ' + t('u.hr'); $('hHr').style.color = ['', 'var(--warn)', 'var(--bad)'][v.nivel];
  $('hResp').textContent = v.respiracion_rpm + ' ' + t('u.resp');
  $('hBodyT').textContent = num(v.temperatura_corporal_C, 1) + ' °C';
  $('hLoad').textContent = v.esfuerzo_W + ' W';
  tarsGuide(guidance({ fin: H.t >= T, alertaSolar: A.sep, regresando: A.returning, margen: s.margin, o2Pct: left * 100, salud: v,
    enMarcha: moving, pendiente: s.stepSlope || 0, parada: s.dwell ? s.dwell.name : null, tarea: s.dwell && s.dwell.sci ? s.dwell.sci.tarea : '',
    siguiente: next ? next.arrive.name : null, distancia: (next || end).dist - s.dist }));

  // Conversacion simulada: pendiente de 10° o mas en los proximos 40 m y datos del momento
  // (la ruta ya evita las de mas de 15°, asi que el aviso hablado empieza antes)
  let slope = 0, slopeM = 0;
  if (moving) for (let k = 5; k <= 60; k += 5) {
    const a = nav.sample(tl, Math.min(T, H.t + k)), m = a.dist - s.dist;
    if (m > 40) break;
    if (!a.dwell && Math.abs(a.stepSlope || 0) >= 10) { slope = Math.round(Math.abs(a.stepSlope)); slopeM = Math.max(5, Math.round(m)); break; }
  }
  // Momento de decision para la demo: a menos de 120 m de la primera parada salta la alerta solar simulada
  // (asi el publico la ve enseguida; el boton «Simular alerta solar» la lanza en cualquier momento)
  const firstArr = tl.pts.find((q) => q.arrive);
  if (!H.decided && !A.returning && next && next === firstArr && next.dist - s.dist < 120) openDecision();

  A.dialog.update(dt, {                              // la voz sigue aunque la caminata este en pausa
    o2: H.o2, hr: v.fc_lpm, resp: v.respiracion_rpm, temp: v.temperatura_corporal_C.toFixed(1),
    km: ((end.dist - s.dist) / 1000).toFixed(1), min: Math.round((T - H.t) / 60), back: Math.round(s.back / 60),
    o2Fin: Math.round(Math.max(40, H.o2 - ((T - H.t) / H.speed) * 0.5)),      // al ritmo de la demo
    slope, slopeM, simT: H.t, stop: s.dwell ? s.dwell.name : null, fin: H.t >= T,
  });

  const al = [];
  if (A.sep) al.push(['bad', t('hud.alertSolar')]);
  else if (A.returning && H.t < T) al.push(['info', t('hud.alertReturn')]);
  if (s.margin < 0) al.push(['bad', t('hud.alertO2')]);
  if (moving && Math.abs(s.stepSlope) >= 15) al.push(['warn', t('hud.alertSlope', { n: Math.abs(s.stepSlope).toFixed(0) })]);
  if (H.solarCont && !A.returning && H.t < T) al.push(['warn', t('hud.alertCont', { name: H.solarCont.toUpperCase() })]);
  if (H.pending) al.push(['warn', t('hud.pending', { name: H.pending.toUpperCase() })]);
  if (s.dwell) al.push(['info', t('hud.alertStop', { name: s.dwell.name, min: P.stopMinutes })]);
  if (H.t >= T) al.push(['info', t('hud.alertEnd')]);
  const html = al.map(([c, t]) => `<div class="${c}">${t}</div>`).join('');
  if ($('hudAlert').innerHTML !== html) $('hudAlert').innerHTML = html;

  const ph = s.dwell && s.dwell.photos && s.dwell.photos[0];      // foto real de Curiosity al llegar
  if (ph) {
    if ($('hudPhotoImg').dataset.f !== ph.file) { $('hudPhotoImg').src = 'data/' + ph.file; $('hudPhotoImg').dataset.f = ph.file; }
    $('hudPhotoCap').textContent = t('hud.photoCap', { sol: ph.sol, credit: ph.credit });
  }
  $('hudPhoto').hidden = !ph;
  $('hMapBox').hidden = Boolean(ph) && innerHeight < 860;     // en pantallas bajas la foto ocupa el sitio del mapa
  if (document.activeElement !== $('hScrub')) $('hScrub').value = (H.t / T) * 1000;

  drawCompass();
  const marks = A.stops.filter((k) => k.order && !A.returning).map((k) => ({ x: k.x, z: k.z, text: k.name, cls: '' }));
  marks.push({ x: A.habitat.x, z: A.habitat.z, text: t('hud.habitat'), cls: 'hab' });
  placeLabels(marks.map((m) => ({ ...m, y: A.terrain.heightAt(m.x, m.z) + 4,
    html: `${m.text}<br>${t('hud.straight', { m: Math.hypot(m.x - p.x, m.z - p.z).toFixed(0) })}`, cls: 'ar ' + m.cls })));
  if (performance.now() - (H.mapAt || 0) > 200) { H.mapAt = performance.now(); drawMinimap(p); }
}

// Margen de O2 (kg, sobre la reserva) pasado a minutos de caminata en llano. Es del modelo.
function marginMin(kg) {
  const kgPorMin = (P.baseWalkW / 1e6) * P.o2PerMJ * 60;
  return Math.max(0, Math.round(kg / kgPorMin));
}
// minutos en texto: «12 min» o «6 h 54 min»
const minTxt = (n) => (n < 60 ? t('hud.min', { n }) : fmtTime(n * 60));

// ---------- Decision ante la alerta solar (simulada) ----------
// Pausa la caminata y compara: regresar ya, o seguir a la siguiente parada y volver despues.
function openDecision() {
  if (A.returning || !$('hDecide').hidden) return;
  const tl = A.hudTl, s = A.nav.sample(tl, H.t);
  let target = null;
  for (let i = s.i + 1; i < tl.pts.length; i++) if (tl.pts[i].arrive) { target = tl.pts[i]; break; }
  H.decided = true; H.playing = false; $('hPlay').textContent = '▶';
  H.decTarget = target ? target.arrive.name : null;
  const back = Math.round(s.back / 60), margin = marginMin(s.margin);
  $('dBackT').textContent = t('dec.back');
  $('dBackD').textContent = t('dec.backD', { min: back, m: minTxt(margin) });
  let extra = 0;
  if (target) {
    const fin = target.t + P.stopMinutes * 60, after = A.nav.sample(tl, fin);     // tras la parada, ¿cuanto queda?
    extra = Math.max(1, Math.round((fin - H.t + after.back - s.back) / 60));
    $('dContT').textContent = t('dec.cont', { name: target.arrive.name });
    $('dContD').textContent = t('dec.contD', { extra, m: minTxt(marginMin(after.margin)) });
    $('dCont').textContent = t('dec.btnCont', { name: target.arrive.name });
  }
  for (const id of ['dContT', 'dContD', 'dCont']) $(id).hidden = !target;
  $('dContT').parentElement.hidden = !target;
  $('hDecide').hidden = false;
  A.dialog.urgente('alerta', { back, margin, extra, stop: H.decTarget || 'the next stop' });
}
function decide(regresar) {
  $('hDecide').hidden = true;
  const stop = H.decTarget || 'the next stop';
  if (regresar) {
    hudReturn(true);                                  // dibuja la ruta de vuelta (dosis x2, como en 2017)
    H.pending = H.decTarget;                          // la observacion de esa parada queda pendiente
    A.dialog.urgente('regreso', { stop });
  } else {
    H.solarCont = H.decTarget;
    A.dialog.urgente('sigue', { stop });
  }
  H.playing = true; $('hPlay').textContent = '⏸';
}

// ---------- Minimapa del casco (norte arriba) ----------
function drawMinimap(p) {
  const c = $('hMap'), W = c.clientWidth, Hh = c.clientHeight, dpr = devicePixelRatio || 1;
  if (!W || !Hh) return;
  if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(Hh * dpr); }
  const g = c.getContext('2d'), tl = A.hudTl;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, Hh);
  if (H.mapTl !== tl) {                                // limites: ruta completa + habitat (se recalcula si cambia la ruta)
    let x0 = A.habitat.x, x1 = x0, z0 = A.habitat.z, z1 = z0;
    for (const q of tl.pts) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
    H.mapB = [x0, x1, z0, z1]; H.mapTl = tl;
  }
  const [x0, x1, z0, z1] = H.mapB, pad = 10;
  const k = Math.min((W - 2 * pad) / Math.max(1, x1 - x0), (Hh - 2 * pad) / Math.max(1, z1 - z0));
  const X = (x) => (W - (x1 - x0) * k) / 2 + (x - x0) * k, Y = (z) => (Hh - (z1 - z0) * k) / 2 + (z - z0) * k;
  const tramo = (filtro, color, ancho) => {
    g.strokeStyle = color; g.lineWidth = ancho; g.beginPath(); let on = false;
    for (const q of tl.pts) { if (!filtro(q)) { on = false; continue; } on ? g.lineTo(X(q.x), Y(q.z)) : g.moveTo(X(q.x), Y(q.z)); on = true; }
    g.stroke();
  };
  const vuelta = (q) => A.returning && q.t > A.sepAt;
  tramo((q) => q.t <= H.t && !vuelta(q), 'rgba(79,216,255,.35)', 2);       // ya recorrido
  tramo((q) => q.t >= H.t && !vuelta(q), '#4fd8ff', 2);                     // por delante
  if (A.returning) tramo((q) => vuelta(q), '#ff8a3d', 2.5);               // ruta de regreso
  // paradas: verde = visitada, naranja = pendiente, blanco = por visitar
  const llegadas = new Map(tl.pts.filter((q) => q.arrive).map((q) => [q.arrive.name, q.t]));
  for (const st of A.stops.filter((k) => k.order)) {
    const tA = llegadas.get(st.name);
    g.fillStyle = st.name === H.pending ? '#ff8a3d' : tA !== undefined && tA < H.t ? '#3ecf8e' : '#eafaff';
    g.beginPath(); g.arc(X(st.x), Y(st.z), 3.2, 0, 7); g.fill();
  }
  g.fillStyle = '#ff8a3d'; g.fillRect(X(A.habitat.x) - 4, Y(A.habitat.z) - 4, 8, 8);           // habitat
  g.save(); g.translate(X(p.x), Y(p.z)); g.rotate(H.heading);                                // tu posicion y rumbo
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(-5, 5); g.fill(); g.restore();
}

// Muestra la indicacion corta de TARS (solo texto: la voz es del dialogo simulado)
function tarsGuide(g) {
  if (g.key === H.tipKey) return;
  H.tipKey = g.key; $('hTarsTip').textContent = '▸ ' + g.text;
}

function drawCompass() {
  const c = $('compass'), g = c.getContext('2d'), W = c.width, Hh = c.height;
  const deg = (((H.heading - H.lookYaw) * 180 / Math.PI) % 360 + 360) % 360;
  g.clearRect(0, 0, W, Hh); g.strokeStyle = g.fillStyle = '#4fd8ff'; g.textAlign = 'center'; g.font = 'bold 13px ui-monospace, monospace';
  const names = { 0: t('dir.N'), 45: t('dir.NE'), 90: t('dir.E'), 135: t('dir.SE'), 180: t('dir.S'), 225: t('dir.SW'), 270: t('dir.W'), 315: t('dir.NW') };
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
  const box = $('labels'), w = A.vw, h = A.vh;
  while (box.children.length < items.length) box.appendChild(document.createElement('div'));
  while (box.children.length > items.length) box.lastChild.remove();
  items.forEach((it, i) => {
    const el = box.children[i];
    v3.set(it.x, it.y, it.z).project(A.camera);
    const vis = v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05;
    el.style.display = vis ? '' : 'none';
    if (!vis) return;
    if (el.className !== it.cls) el.className = it.cls;
    if (el.dataset.id !== (it.id || '')) el.dataset.id = it.id || '';
    if (el.dataset.h !== it.html) { el.innerHTML = it.html; el.dataset.h = it.html; }
    el.style.left = ((v3.x + 1) / 2) * w + 'px'; el.style.top = ((1 - v3.y) / 2) * h + 'px';
  });
}

function updatePlan() {
  A.controls.update();
  A.ev1.visible = true; A.ev1.userData.animate(0); A.ev2.userData.animate(0);
  const items = A.stops.filter((s) => s.on).map((s) => ({ id: s.id, x: s.x, z: s.z, y: A.terrain.heightAt(s.x, s.z) + 5,
    html: `<b>${s.order || '–'}</b>${s.name}`, cls: 'lbl' + (s.order ? '' : ' off') + (s === A.selected ? ' sel' : '') }));
  items.push({ x: A.habitat.x, z: A.habitat.z, y: A.terrain.heightAt(A.habitat.x, A.habitat.z) + 14, html: t('hud.habitat'), cls: 'lbl hab' });
  const c = A.curiosity.position;
  items.push({ x: c.x, z: c.z, y: c.y + 5, html: `Curiosity · sol ${A.curiositySol}`, cls: 'lbl rov' });
  placeLabels(items);
}

let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  const mode = document.body.dataset.mode;
  if (mode === 'hud') updateHud(dt); else if (mode === 'intro') A.intro.update(dt); else updatePlan();
  A.renderer.render(A.scene, A.camera);
}

// =====================================================================
//  EXPORTAR MODELO 3D (GLB): terreno real + ruta + habitat y balizas
// =====================================================================
function exportGlb() {
  const n = 256, T = A.terrain;
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
  new GLTFExporter().parse(root, (buf) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
    a.download = 'marswalk-gale.glb'; a.click(); A.lastGlbBytes = buf.byteLength;
  }, (e) => console.error(e), { binary: true });
}
