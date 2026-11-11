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
import { createTars, createVoice, localReply } from './tars.js';

const $ = (id) => document.getElementById(id);
const json = (u) => fetch(u).then((r) => r.json());
const fmtTime = (s) => { const m = Math.round(s / 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; };
const num = (n, d = 0) => n.toFixed(d).replace('.', ',');     // numeros con coma decimal
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

  $('loadmsg').textContent = 'Construyendo la malla 3D (1 048 576 puntos de elevación HiRISE)…';
  // ?malla=2 (o 4) usa una malla mas ligera para equipos sin tarjeta grafica
  const q = new URLSearchParams(location.search);
  const stride = Math.max(1, Math.min(8, +q.get('malla') || 1));
  if (q.get('px')) renderer.setPixelRatio(+q.get('px'));
  const terrain = A.terrain = await loadTerrain(meta, A.eRef, stride);
  scene.add(terrain.mesh);
  $('loadmsg').textContent = 'Calculando rejilla de navegación…';
  A.nav = await createNav(meta, terrain);

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
  $('loadmsg').textContent = 'Calculando la ruta más segura…';
  await new Promise((r) => setTimeout(r, 30));
  replan();
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

// El lienzo 3D ocupa la columna central en el planificador y toda la pantalla en el casco
function layout() {
  const hud = document.body.dataset.mode === 'hud';
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
const TAGS = { obs: ['', 'Observación'], der: ['der', 'Derivado'], mod: ['mod', 'Modelo'] };
const LAYERS = [
  { id: 'ortofoto', key: 'oOrtho', name: 'Ortofoto HiRISE', tag: 'obs', on: 1, src: 'MRO HiRISE · 25 cm/píxel (mostrada a 50 cm). Color aproximado.',
    grad: 'linear-gradient(90deg,#3a2012,#ffcc99)' },
  { id: 'elevacion', key: 'oElev', name: 'Elevación', tag: 'der', src: 'MRO HiRISE DEM · 1 m (USGS).',
    grad: 'linear-gradient(90deg,#21338c,#2699a6,#8cc759,#edbf40,#f2f2eb)', ends: () => [`${A.meta.elev_min.toFixed(0)} m`, `${A.meta.elev_max.toFixed(0)} m`] },
  { id: 'pendiente', key: 'oSlope', name: 'Pendiente', tag: 'der', src: 'Derivada del DEM HiRISE (escala de ~2 m).',
    grad: 'linear-gradient(90deg,#33b859 0 30%,#f2d933 30% 62%,#f5851f 62% 80%,#d91f26 80%)', ends: () => ['<10°', '10–20°', '20–25°', '>25°'] },
  { id: 'termica', key: 'oTherm', name: 'Térmica THEMIS', tag: 'obs', src: 'Mars Odyssey THEMIS · 100 m/píxel (25×25 píxeles aquí). De noche, más cálido = roca firme.',
    grad: 'linear-gradient(90deg,#050333,#6b0f73,#cc404d,#fa9926,#fcfab3)', ends: () => ['frío', 'cálido'],
    extra: '<label class="sub"><input type="checkbox" id="thDay"> usar imagen diurna</label>' },
  { id: 'recorrido_curiosity', line: 'traverseLine', name: 'Recorrido de Curiosity', tag: 'obs', on: 1,
    src: () => `Trayectoria documentada del rover (soles ${A.traverse[0].sol}–${A.traverse[A.traverse.length - 1].sol}, 2025–2026).` },
  // --- en "Mas capas" ---
  { id: 'rugosidad', key: 'oRough', name: 'Rugosidad del suelo', tag: 'der', more: true, src: 'Relieve en ventanas de 5 m, del DEM HiRISE.',
    grad: 'linear-gradient(90deg,#450054,#3b528c,#21918c,#5ec961,#fde824)', ends: () => ['liso', '≥ 0,5 m'] },
  { id: 'regreso', key: 'oBack', name: 'Regreso a pie al hábitat', tag: 'mod', more: true, src: 'Minutos caminando hasta el hábitat; líneas cada 10 min. Morado = inalcanzable.',
    grad: 'linear-gradient(90deg,#26bf66,#bfd940,#f7b326,#eb5926,#b31a33)', ends: () => ['0 min', '≥ 60 min'] },
  { id: 'curvas', uni: 'uContours', name: 'Curvas de nivel (10 m / 50 m)', tag: 'der', more: true },
  { id: 'ruta', line: 'routeLine', name: 'Ruta de la caminata', tag: 'mod', more: true, on: 1 },
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
      ${L.key ? `<input type="range" min="0" max="1" step="0.05" value="${L.on ? 1 : 0.75}" style="--grad:${L.grad}" title="Opacidad">` : ''}
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
  A.backField = nav.dijkstra(nav.cellOf(A.habitat.x, A.habitat.z), true);
  const mins = new Float32Array(nav.n * nav.n);
  for (let i = 0; i < mins.length; i++) mins[i] = A.backField.time[i] === Infinity ? -1 : A.backField.time[i] / 60;
  terrain.setBackTexture(mins, nav.n);

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
  $('btnSolar').textContent = ev ? 'Quitar evento simulado' : 'Simular evento solar';
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
  $('sStops').textContent = `${inRoute()} de ${A.stops.length} paradas activas`;
  const st = $('sState');
  if (!A.tl) {
    for (const id of ['sDist', 'sTime', 'sBack', 'sO2']) $(id).textContent = '–';
    st.className = 'chip nogo'; st.textContent = 'Sin ruta'; return;
  }
  const T = A.tl.total, ev = A.event;
  $('sDist').textContent = num(T.dist / 1000, 1) + ' km';
  $('sTime').textContent = fmtTime(T.time);
  $('sBackLbl').textContent = ev ? 'Regreso' : 'Regreso máx.';
  $('sBack').textContent = (ev ? ev.info.regreso_min : Math.round(T.maxBack / 60)) + ' min';
  $('sO2').textContent = (ev ? ev.info.o2_al_llegar_pct : Math.round(T.o2LeftPct)) + ' %';
  if (ev) { st.className = 'chip sim'; st.textContent = 'Escenario simulado'; }
  else { st.className = 'chip ' + (isGo() ? 'go' : 'nogo'); st.textContent = isGo() ? 'GO · plan viable' : 'NO-GO'; }
}

function drawBudget() {
  const st = $('status'), b = $('budget');
  if (!A.tl) {
    st.className = 'nogo'; st.innerHTML = 'SIN RUTA<small>No hay camino transitable con estos límites. Sube la pendiente máxima o quita paradas.</small>';
    b.innerHTML = ''; return;
  }
  const T = A.tl.total;
  st.className = isGo() ? 'go' : 'nogo';
  st.innerHTML = isGo()
    ? `GO — caminata viable<small>Siempre queda oxígeno para volver a pie con ${P.o2ReserveMin} min de reserva.${A.omitted.length ? ` Omitidas por la reserva de O₂: ${A.omitted.map((s) => s.name).join(', ')}.` : ''}</small>`
    : A.unreachable.length
      ? `NO-GO — parada inalcanzable<small>${A.unreachable.map((s) => s.name).join(', ')} queda fuera del terreno transitable con estos límites.</small>`
      : T.o2LeftPct < P.o2ReservePct
        ? `NO-GO — reserva de O₂ no alcanzable<small>Ni con una sola parada se llega con ${P.o2ReservePct} % de oxígeno.</small>`
        : `NO-GO — oxígeno insuficiente<small>A los ${fmtTime(T.noReturn.t)} ya no se podría volver a pie con la reserva exigida.</small>`;
  const cell = (k, v) => `<div class="cell"><span>${k}</span><b>${v}</b></div>`;
  b.innerHTML =
    cell('Distancia', num(T.dist / 1000, 2) + ' km') + cell('Duración', fmtTime(T.time)) +
    cell('Subida / bajada', `${T.up.toFixed(0)} / ${T.down.toFixed(0)} m`) + cell('Energía metabólica', num(T.energy / 1e6, 1) + ' MJ') +
    cell('Oxígeno usado', `${num(T.o2, 2)} kg · ${(100 - T.o2LeftPct).toFixed(0)} %`) + cell('Margen mínimo de O₂', (T.minMargin * 1000).toFixed(0) + ' g') +
    cell('Dosis de radiación', (T.dose * 1000).toFixed(0) + ' µSv') + cell('Regreso a pie máximo', fmtTime(T.maxBack));
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
    const why = !s.on ? 'desactivada' : A.omitted.includes(s) ? 'omitida por la reserva de O₂' : A.unreachable.includes(s) ? 'inalcanzable' : s.sub;
    const d = document.createElement('div'); d.className = 'stop' + (s === A.selected ? ' sel' : '');
    d.innerHTML = `<input type="checkbox" ${s.on ? 'checked' : ''}><span class="badge ${s.order ? '' : 'off'}">${s.order || '–'}</span>
      <span class="nm">${s.name}<small>${why}</small></span>
      ${s.photos && s.photos.length ? '<button class="ph">Fotos</button>' : ''}${s.custom ? '<button class="rm">✕</button>' : ''}`;
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
  box.innerHTML = `<h3>${s.name}</h3><p>${s.sub}</p>` + (ph
    ? `<div class="ph"><img src="data/${ph.file}" alt="Foto de Curiosity en ${s.name}"><span class="cap">Foto de Curiosity · sol ${ph.sol}</span></div>`
    : '<p>Sin fotos de Curiosity en este punto.</p>');
  const el = box.querySelector('.ph'); if (el) el.onclick = () => showPhotos(s);
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
  const w = A.weather.latest, r = A.radiation;
  const eva = (r.gcr_dose_equivalent_mSv_per_day / 24) * 1000;
  $('env').innerHTML = `
    <div class="card"><h3>Clima en Gale <em>Observación · REMS</em></h3>
      <p>Última medición: <b>sol ${w.sol}</b> (${w.terrestrial_date})</p>
      <p>Aire <b>${w.min_temp} a ${w.max_temp} °C</b> · suelo <b>${w.min_gts_temp} a ${w.max_gts_temp} °C</b></p>
      <p>Presión <b>${w.pressure} Pa</b> · cielo <b>${w.atmo_opacity === 'Sunny' ? 'despejado' : w.atmo_opacity}</b> · UV <b>${({ Low: 'bajo', Moderate: 'moderado', High: 'alto', Very_High: 'muy alto' })[w.local_uv_irradiance_index] || w.local_uv_irradiance_index}</b></p>
      <p>Amanecer ${w.sunrise} · atardecer ${w.sunset} · Ls ${w.ls}°</p></div>
    <div class="card"><h3>Radiación en superficie <em>Observación · RAD</em></h3>
      <p>Rayos cósmicos: <b>${num(r.gcr_dose_equivalent_mSv_per_day, 2)} ± ${num(r.gcr_dose_equivalent_uncertainty, 2)} mSv/día</b> (≈ ${eva.toFixed(0)} µSv por hora de caminata)</p>
      <p>${r.sep_event_note}</p>
      <p>Referencia: ${r.career_limit_source}</p><p style="font-size:10.5px">Fuente: Hassler et al. 2014, <i>Science</i>.</p></div>
    <div class="card"><h3>Clima espacial <em>Observación · DONKI</em></h3><p id="donkiState"></p><div class="donki" id="donkiList"></div>
      <p style="font-size:10.5px">DONKI vigila el Sol desde el entorno de la Tierra; las eyecciones dirigidas a Marte se resaltan.</p></div>`;
  showDonki(A.donki.notifications, `copia guardada (${(A.donki.fetched || '').slice(0, 10)})`);
  const start = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);     // intento en vivo desde el navegador
  fetch(`https://api.nasa.gov/DONKI/notifications?startDate=${start}&type=all&api_key=DEMO_KEY`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((list) => {
      const rows = list.map((n) => ({ type: n.messageType, id: n.messageID, time: n.messageIssueTime, url: n.messageURL,
        summary: (n.messageBody.split('## Summary:')[1] || '').trim().split('\n\n').slice(0, 2).join(' ').replace(/\s+/g, ' ').slice(0, 320) }));
      rows.sort((a, b) => (a.time < b.time ? 1 : -1));
      if (rows.length) showDonki(rows, 'en vivo, últimos 14 días');
    }).catch(() => {});
}
const DONKI_NAMES = { CME: 'Eyección de masa coronal', FLR: 'Fulguración', SEP: 'Partículas energéticas', GST: 'Tormenta geomagnética', RBE: 'Cinturón de radiación', IPS: 'Choque interplanetario', Report: 'Informe semanal' };
function showDonki(rows, state) {
  A.donkiRows = rows; A.donkiState = state;
  const mars = rows.filter((r) => /Mars/.test(r.summary)).length;
  $('donkiState').innerHTML = `<b>${rows.length}</b> avisos · <b>${mars}</b> mencionan Marte · ${state}`;
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
  $('btnAdd').onclick = () => { adding = !adding; $('btnAdd').classList.toggle('on', adding); $('btnAdd').textContent = adding ? 'Haz clic en el terreno…' : '＋ Añadir parada'; };
  const cv = A.renderer.domElement;
  cv.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  cv.addEventListener('pointerup', (e) => {
    if (document.body.dataset.mode !== 'plan' || !adding || !downAt) return;
    if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;   // fue un arrastre de camara
    const p = pickGround(e); if (!p) return;
    nCustom++;
    const s = { id: 'C' + nCustom, name: `Parada propia ${nCustom}`, sub: 'Elegida por la tripulación', x: p.x, z: p.z, photos: [], on: true, custom: true };
    A.stops.push(s); A.selected = s;
    adding = false; $('btnAdd').classList.remove('on'); $('btnAdd').textContent = '＋ Añadir parada';
    replan();
  });
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
    addMsg('tars', info ? localReply('simular_evento_solar', info) : 'No hay ruta sobre la que simular el evento.');
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
  $('hSep').onclick = () => hudReturn(true);
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
    siguiente: s.dwell ? `en ${s.dwell.name} (ciencia en curso)` : next ? next.arrive.name : 'hábitat',
    distancia_siguiente_m: Math.round(((next || end).dist - s.dist)), pendiente_grados: Math.round(s.stepSlope || 0),
    elevacion_m: Math.round(A.terrain.heightAt(s.x, s.z) + A.eRef),
    hora_local: `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')} LMST`,
    temperatura_aire_estimada_C: Math.round(airTemp(hour)), alerta_solar: A.sep, tiempo_total_previsto_min: Math.round(tl.total.time / 60) };
}

// Ejecuta una herramienta de TARS sobre el estado real de la app
async function runTool(name, input) {
  const hud = document.body.dataset.mode === 'hud';
  const soloPlan = { error: 'Esa orden cambia el plan y solo está disponible en el planificador, antes de salir.' };
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
      const s = findStop(input.parada); if (!s) return { error: `No conozco la parada "${input.parada}".` };
      const c = A.nav.cellOf(s.x, s.z), back = A.backField.time[c];
      return { id: s.id, nombre: s.name, descripcion: s.sub, en_la_ruta: Boolean(s.order), orden: s.order, activa: s.on,
        elevacion_m: Math.round(A.terrain.heightAt(s.x, s.z) + A.eRef), pendiente_grados: Math.round(A.nav.S[c]),
        regreso_a_pie_min: back === Infinity ? null : Math.round(back / 60), fotos_de_curiosity: (s.photos || []).length };
    }
    case 'fijar_reserva_o2': {
      if (hud) return soloPlan;
      P.o2ReservePct = Math.max(0, Math.min(95, Math.round(+input.porcentaje || 0)));
      A.syncReserve(); replan();
      return { ...planSummary(), omitidas: A.omitted.map((s) => s.name), cumple: Boolean(A.tl && A.tl.total.o2LeftPct >= P.o2ReservePct) };
    }
    case 'activar_parada': {
      if (hud) return soloPlan;
      const s = findStop(input.parada); if (!s) return { error: `No conozco la parada "${input.parada}".` };
      s.on = Boolean(input.activa); replan();
      return { parada: s.name, activa: s.on, ...planSummary() };
    }
    case 'simular_evento_solar':
    case 'regresar_al_habitat': {
      const solar = name === 'simular_evento_solar';
      if (hud) return hudReturn(solar) || { error: 'Ya estás volviendo al hábitat o no hay ruta de regreso desde aquí.' };
      const s = findStop(input.parada) || ((A.selected && A.selected.order) ? A.selected : A.plan && A.plan.order[0]);
      if (!s || !s.order) return { error: 'Esa parada no está en la ruta actual.' };
      return setEvent(s, solar) || { error: 'No hay ruta de regreso desde esa parada.' };
    }
    case 'mostrar_capa': {
      const L = LAYERS.find((k) => k.id === input.capa); if (!L) return { error: `No existe la capa "${input.capa}".` };
      L.set(Boolean(input.visible)); return { capa: L.name, visible: Boolean(input.visible) };
    }
    default: return { error: `Herramienta desconocida: ${name}` };
  }
}

function addMsg(who, text, cls = '') {
  const d = document.createElement('div'); d.className = `msg ${who} ${cls}`;
  d.innerHTML = `<div class="who">${who === 'tars' ? '🤖 TARS' : '👤 Tú'}</div><div class="txt"></div>`;
  d.querySelector('.txt').textContent = text;
  $('chat').appendChild(d); $('chat').scrollTop = 1e9;
  return d.querySelector('.txt');
}

// Ordenes rapidas: con IA se envian como texto; sin IA ejecutan la herramienta directamente
const QUICK = [
  { label: 'Estado', text: '¿Cómo va el plan de la misión?', tool: 'estado_mision', input: {} },
  { label: 'Reserva O₂ 30 %', text: 'Replanifica con una reserva mínima de 30 % de O₂.', tool: 'fijar_reserva_o2', input: { porcentaje: 30 } },
  { label: 'Reserva O₂ 75 %', text: 'Replanifica con una reserva mínima de 75 % de O₂.', tool: 'fijar_reserva_o2', input: { porcentaje: 75 } },
  { label: 'Sin reserva', text: 'Quita la reserva mínima de O₂ y replanifica.', tool: 'fijar_reserva_o2', input: { porcentaje: 0 } },
  { label: 'Entorno', text: '¿Cómo están el clima y la radiación?', tool: 'entorno', input: {} },
];
// Sin IA y por voz o texto libre: se reconoce la intencion por palabras clave
function offlineIntent(text) {
  const t = text.toLowerCase();
  const pct = (t.match(/(\d{1,2})\s*(%|por ciento)/) || [])[1];
  if (/reserva/.test(t) && pct) return ['fijar_reserva_o2', { porcentaje: +pct }];
  if (/solar|tormenta/.test(t)) return ['simular_evento_solar', { parada: '' }];
  if (/volver|regres|h[aá]bitat/.test(t)) return ['regresar_al_habitat', {}];
  if (/clima|temperatura|radiaci|fr[ií]o|presi[oó]n/.test(t)) return ['entorno', {}];
  return ['estado_mision', {}];
}

async function tarsSay(text) {
  if (A.tars.isOnline()) return A.tars.ask(text);
  const [tool, input] = offlineIntent(text);
  return localReply(tool, await runTool(tool, input));
}

function setupTars() {
  A.tars = createTars(runTool);
  A.tars.ready.then((ok) => {
    $('tarsState').innerHTML = ok
      ? `<b>IA conectada</b> · ${A.tars.model()}`
      : '<b class="off">Sin IA en este sitio</b> · TARS responde con órdenes básicas. Para la IA, ejecuta la app en tu equipo con tu clave en <code>.env.local</code>.';
    $('hTarsState').textContent = ok ? 'IA conectada' : 'modo básico, sin IA';
    addMsg('tars', ok ? 'TARS en línea. Pídeme un cambio de plan o un dato de la misión.' : 'TARS en modo básico. Usa las órdenes rápidas o escribe una palabra clave: estado, reserva 30 %, entorno, evento solar.');
  });
  const q = $('quick');
  for (const k of QUICK) { const b = document.createElement('button'); b.textContent = k.label; b.onclick = () => chatAsk(k.text, k); q.appendChild(b); }

  // conversacion en el planificador
  async function chatAsk(text, quick = null, speak = false) {
    if (A.busy) return; A.busy = true;
    addMsg('tu', text); const wait = addMsg('tars', 'Pensando…', 'wait');
    try {
      const reply = (quick && !A.tars.isOnline()) ? localReply(quick.tool, await runTool(quick.tool, quick.input)) : await tarsSay(text);
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
        if (rec) $('hTarsYou').textContent = '🎙 ' + (txt || 'escuchando…');
        else if (st === 'error') $('hTarsSay').textContent = txt;
      } else if (rec) $('tarsIn').value = txt; else if (st === 'error') addMsg('tars', txt, 'err');
    },
  });
  if (!A.voice.supported) {
    $('tarsMic').hidden = true; $('hMic').disabled = true; $('hMic').textContent = 'Voz no disponible en este navegador';
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
const H = { t: 0, playing: true, speed: 30, lookYaw: 0, lookPitch: 0, heading: 0, phase: 0 };
A.H = H;

function enterHud() {
  if (!A.tl) return;
  A.hudTl = A.tl; A.sep = false; A.returning = false; H.t = 0; H.playing = true; H.lookYaw = 0; H.lookPitch = -0.05;
  $('hPlay').textContent = '⏸'; $('hSep').disabled = false;
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
  $('hudPhoto').hidden = true; $('labels').innerHTML = '';
  window.speechSynthesis?.cancel();
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
  const info = { desde: 'tu posición actual', regreso_min: Math.round(back.total.time / 60), distancia_regreso_m: Math.round(back.total.dist),
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

  const hour = EVA_START_H + H.t / 3699;          // 1 hora marciana = 3699 s
  setSun(hour);
  const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);

  const left = Math.max(0, 1 - s.o2 / P.o2TankKg);
  $('hO2').textContent = (left * 100).toFixed(0) + ' %';
  $('hO2bar').style.width = left * 100 + '%';
  $('hO2bar').style.background = left > 0.4 ? 'var(--ok)' : left > 0.2 ? 'var(--warn)' : 'var(--bad)';
  $('hMargin').textContent = (s.margin * 1000).toFixed(0) + ' g O₂';
  $('hMargin').style.color = s.margin < 0 ? 'var(--bad)' : s.margin < 0.05 ? 'var(--warn)' : '';
  $('hTime').textContent = fmtTime(s.t);
  $('hClock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} LMST`;
  $('hDose').textContent = num(s.dose * 1000, 1) + ' µSv';
  $('hTemp').textContent = airTemp(hour).toFixed(0) + ' °C (est.)';
  $('hSlope').textContent = (Math.round(moving ? s.stepSlope : 0) || 0) + '°';
  $('hElev').textContent = (y + A.eRef).toFixed(0) + ' m';
  $('hDist').textContent = num(s.dist / 1000, 2) + ' km';
  $('hBack').textContent = fmtTime(s.back);

  let next = null;
  for (let i = s.i + 1; i < tl.pts.length; i++) if (tl.pts[i].arrive) { next = tl.pts[i]; break; }
  const end = tl.pts[tl.pts.length - 1];
  $('hNext').textContent = s.dwell ? `EN ${s.dwell.name.toUpperCase()}` : next ? next.arrive.name.toUpperCase() : 'HÁBITAT';
  $('hNextD').textContent = s.dwell ? 'ciencia en curso' : (((next || end).dist - s.dist)).toFixed(0) + ' m';

  const al = [];
  if (A.sep) al.push(['bad', 'ALERTA SOLAR — REGRESO INMEDIATO AL HÁBITAT · DOSIS ×2']);
  else if (A.returning && H.t < T) al.push(['info', 'REGRESO AL HÁBITAT POR LA RUTA MÁS RÁPIDA']);
  if (s.margin < 0) al.push(['bad', 'OXÍGENO INSUFICIENTE PARA VOLVER A PIE CON RESERVA']);
  if (moving && Math.abs(s.stepSlope) >= 15) al.push(['warn', `PENDIENTE ${Math.abs(s.stepSlope).toFixed(0)}° — PASO CORTO`]);
  if (s.dwell) al.push(['info', `PARADA CIENTÍFICA: ${s.dwell.name} — ${P.stopMinutes} min de muestreo`]);
  if (H.t >= T) al.push(['info', 'DE VUELTA EN EL HÁBITAT — CAMINATA COMPLETADA']);
  const html = al.map(([c, t]) => `<div class="${c}">${t}</div>`).join('');
  if ($('hudAlert').innerHTML !== html) $('hudAlert').innerHTML = html;

  const ph = s.dwell && s.dwell.photos && s.dwell.photos[0];      // foto real de Curiosity al llegar
  if (ph) {
    if ($('hudPhotoImg').dataset.f !== ph.file) { $('hudPhotoImg').src = 'data/' + ph.file; $('hudPhotoImg').dataset.f = ph.file; }
    $('hudPhotoCap').textContent = `Vista real desde aquí · Curiosity, sol ${ph.sol} · ${ph.credit}`;
  }
  $('hudPhoto').hidden = !ph;
  if (document.activeElement !== $('hScrub')) $('hScrub').value = (H.t / T) * 1000;

  drawCompass();
  const marks = A.stops.filter((k) => k.order && !A.returning).map((k) => ({ x: k.x, z: k.z, text: k.name, cls: '' }));
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
  items.push({ x: A.habitat.x, z: A.habitat.z, y: A.terrain.heightAt(A.habitat.x, A.habitat.z) + 14, html: 'HÁBITAT', cls: 'lbl hab' });
  const c = A.curiosity.position;
  items.push({ x: c.x, z: c.z, y: c.y + 5, html: `Curiosity · sol ${A.curiositySol}`, cls: 'lbl rov' });
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
