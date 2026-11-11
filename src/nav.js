// nav.js — rutas sobre el terreno y presupuesto de la caminata (EVA).
//
// TODO lo de este archivo es un MODELO de planificacion (no una medicion):
// velocidad de marcha, gasto metabolico y consumo de oxigeno son estimaciones
// razonadas. Los datos de entrada (alturas, pendiente, rugosidad) si son reales.

// ---------- Parametros del modelo (se pueden ajustar) ----------
export const P = {
  vFlat: 0.9,          // m/s caminando en llano con traje
  maxCellSlope: 25,    // grados: pendiente media de celda que no se cruza
  maxDirSlope: 25,     // grados: pendiente en la direccion de avance que no se cruza
  risk: 1.0,           // cuanto se evita la pendiente aunque sea transitable (0 = nada)
  massKg: 200,         // astronauta (80) + traje y equipo (120)
  gMars: 3.71,         // m/s2
  baseWalkW: 230,      // W caminando en llano con traje (rango Apollo: ~200-300 W)
  stopW: 180,          // W trabajando en una parada cientifica
  climbEff: 0.25,      // eficiencia muscular al subir
  o2PerMJ: 0.0711,     // kg de O2 por MJ metabolico (1 L O2 = 20.1 kJ)
  o2TankKg: 0.55,      // O2 utilizable del sistema primario
  o2ReserveMin: 30,    // reserva minima exigida (minutos a ritmo de marcha)
  o2ReservePct: 0,     // % minimo de O2 que debe quedar al volver al habitat (0 = sin exigencia)
  stopMinutes: 20,     // minutos de ciencia por parada
};

const NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [1, 1, 1], [1, -1, 1], [-1, 1, 1], [-1, -1, 1]];

export async function createNav(meta, terrain) {
  const n = meta.nav_n;                 // 512
  const cell = meta.size_m / n;         // 4 m
  const half = meta.size_m / 2;
  const [sb, rb] = await Promise.all([
    fetch('data/nav_slope.bin').then((r) => r.arrayBuffer()),
    fetch('data/nav_rough.bin').then((r) => r.arrayBuffer()),
  ]);
  const S = new Float32Array(sb);       // pendiente media de la celda (grados)
  const R = new Float32Array(rb);       // rugosidad media (m)
  const H = new Float32Array(n * n);    // altura del centro de la celda (m, mundo)
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
    H[r * n + c] = terrain.heightAt(-half + (c + 0.5) * cell, -half + (r + 0.5) * cell);

  const cellOf = (x, z) => {
    const c = Math.min(n - 1, Math.max(0, Math.floor((x + half) / cell)));
    const r = Math.min(n - 1, Math.max(0, Math.floor((z + half) / cell)));
    return r * n + c;
  };
  const posOf = (i) => ({ x: -half + ((i % n) + 0.5) * cell, z: -half + (Math.floor(i / n) + 0.5) * cell });

  // Velocidad (m/s) segun la pendiente en la direccion de avance y la rugosidad.
  // Forma de la "funcion de Tobler" para caminantes, escalada a la marcha con traje.
  function speed(tanS, rough) {
    return P.vFlat * Math.exp(-3.5 * Math.abs(tanS + 0.05)) / 0.8395 / (1 + rough / 0.3);
  }

  // Tiempo real (s) para ir de la celda a a la vecina b; Infinity si no se puede.
  function stepTime(a, b, diag) {
    const d = diag ? cell * Math.SQRT2 : cell;
    const dh = H[b] - H[a];
    const tanS = dh / d;
    if (S[b] > P.maxCellSlope || Math.atan(Math.abs(tanS)) * 57.2958 > P.maxDirSlope) return Infinity;
    return Math.hypot(d, dh) / speed(tanS, R[b]);
  }

  // Dijkstra sobre toda la rejilla desde una celda.
  //   reverse=false: costo de ir DESDE el origen a cada celda.
  //   reverse=true : costo de ir desde cada celda HASTA el origen (regreso al habitat).
  // Devuelve costo (con penalizacion de riesgo), tiempo real y padre de cada celda.
  function dijkstra(src, reverse = false) {
    const cost = new Float32Array(n * n).fill(Infinity);
    const time = new Float32Array(n * n).fill(Infinity);
    const parent = new Int32Array(n * n).fill(-1);
    // monticulo binario (costo, celda)
    const hc = [], hi = [];
    const push = (c, i) => {
      let k = hc.length; hc.push(c); hi.push(i);
      while (k > 0) { const p = (k - 1) >> 1; if (hc[p] <= c) break; hc[k] = hc[p]; hi[k] = hi[p]; k = p; }
      hc[k] = c; hi[k] = i;
    };
    const pop = () => {
      const top = hi[0], c = hc.pop(), i = hi.pop(), len = hc.length;
      if (len > 0) {
        let k = 0;
        for (;;) {
          let ch = 2 * k + 1; if (ch >= len) break;
          if (ch + 1 < len && hc[ch + 1] < hc[ch]) ch++;
          if (hc[ch] >= c) break;
          hc[k] = hc[ch]; hi[k] = hi[ch]; k = ch;
        }
        hc[k] = c; hi[k] = i;
      }
      return top;
    };
    cost[src] = 0; time[src] = 0; push(0, src);
    const done = new Uint8Array(n * n);
    while (hc.length) {
      const cur = pop();
      if (done[cur]) continue; done[cur] = 1;
      const cr = Math.floor(cur / n), cc = cur % n;
      for (const [dc, dr, diag] of NB) {
        const r = cr + dr, c = cc + dc;
        if (r < 0 || c < 0 || r >= n || c >= n) continue;
        const nb = r * n + c;
        if (done[nb]) continue;
        const t = reverse ? stepTime(nb, cur, diag) : stepTime(cur, nb, diag);
        if (t === Infinity) continue;
        const into = reverse ? cur : nb;
        const w = t * (1 + P.risk * (S[into] / 20) ** 2);   // castigo por terreno inclinado
        if (cost[cur] + w < cost[nb]) {
          cost[nb] = cost[cur] + w; time[nb] = time[cur] + t; parent[nb] = cur; push(cost[nb], nb);
        }
      }
    }
    return { cost, time, parent };
  }

  // Camino (lista de celdas) origen -> destino usando los padres de un Dijkstra directo
  function pathTo(field, dst) {
    if (field.cost[dst] === Infinity) return null;
    const out = [];
    for (let i = dst; i !== -1; i = field.parent[i]) out.push(i);
    return out.reverse();
  }
  // Camino celda -> origen usando un Dijkstra inverso
  function pathBack(field, from) {
    if (field.cost[from] === Infinity) return null;
    const out = [];
    for (let i = from; i !== -1; i = field.parent[i]) out.push(i);
    return out;
  }

  // Memoria de campos Dijkstra ya calculados (se vacia si cambian los parametros de marcha)
  let cacheSig = ''; const cache = new Map();
  function fieldFor(c) {
    const sig = [P.vFlat, P.maxCellSlope, P.maxDirSlope, P.risk].join('|');
    if (sig !== cacheSig) { cache.clear(); cacheSig = sig; }
    if (!cache.has(c)) cache.set(c, dijkstra(c));
    return cache.get(c);
  }

  // Planifica la caminata: habitat -> paradas (en el mejor orden) -> habitat.
  function planRoute(habitat, stops) {
    const nodes = [habitat, ...stops].map((s) => cellOf(s.x, s.z));
    const fields = nodes.map((c) => fieldFor(c));
    const m = nodes.length;
    const C = (i, j) => fields[i].cost[nodes[j]];
    // mejor orden: fuerza bruta hasta 7 paradas; si hay mas, vecino mas cercano
    let best = null, bestCost = Infinity;
    const ids = stops.map((_, i) => i + 1);
    const tour = (order) => {
      let c = 0, prev = 0;
      for (const k of order) { c += C(prev, k); prev = k; }
      return c + C(prev, 0);
    };
    if (ids.length <= 7) {
      const perm = (arr, k = 0) => {
        if (k === arr.length) { const c = tour(arr); if (c < bestCost) { bestCost = c; best = arr.slice(); } return; }
        for (let i = k; i < arr.length; i++) {
          [arr[k], arr[i]] = [arr[i], arr[k]]; perm(arr, k + 1); [arr[k], arr[i]] = [arr[i], arr[k]];
        }
      };
      perm(ids);
    } else {
      const left = new Set(ids); best = []; let prev = 0;
      while (left.size) {
        let bk = -1, bc = Infinity;
        for (const k of left) if (C(prev, k) < bc) { bc = C(prev, k); bk = k; }
        if (bk < 0) break; best.push(bk); left.delete(bk); prev = bk;
      }
      bestCost = tour(best);
    }
    if (!best || bestCost === Infinity) return null;
    const seq = [0, ...best, 0];
    const legs = [];
    for (let i = 0; i < seq.length - 1; i++) {
      const cells = pathTo(fields[seq[i]], nodes[seq[i + 1]]);
      if (!cells) return null;
      legs.push({ cells, toStop: seq[i + 1] === 0 ? null : stops[seq[i + 1] - 1] });
    }
    return { legs, order: best.map((k) => stops[k - 1]) };
  }

  // Potencia metabolica (W) al caminar con velocidad vertical vz (m/s)
  function walkPower(vz) {
    const lift = P.massKg * P.gMars * Math.abs(vz);
    return P.baseWalkW + (vz > 0 ? lift / P.climbEff : lift * 0.3);
  }

  // Convierte los tramos en una linea de tiempo con todo el presupuesto.
  //   doseRate: mSv por dia.   backField: Dijkstra inverso desde el habitat.
  function buildTimeline(legs, doseRate, backField) {
    const pts = [];
    let t = 0, dist = 0, o2 = 0, energy = 0, up = 0, down = 0;
    const add = (i, extra = {}) => {
      const p = posOf(i);
      const back = backField ? backField.time[i] : 0;
      pts.push({ x: p.x, z: p.z, y: H[i], cell: i, t, dist, o2, energy,
        dose: (t / 86400) * doseRate, slope: S[i], back, ...extra });
    };
    const first = legs[0].cells[0];
    add(first);
    for (const leg of legs) {
      for (let k = 1; k < leg.cells.length; k++) {
        const a = leg.cells[k - 1], b = leg.cells[k];
        const diag = (a % n !== b % n) && (Math.floor(a / n) !== Math.floor(b / n));
        const dt = stepTime(a, b, diag);
        const dh = H[b] - H[a];
        const e = walkPower(dh / dt) * dt;
        t += dt; dist += Math.hypot(diag ? cell * Math.SQRT2 : cell, dh);
        energy += e; o2 += (e / 1e6) * P.o2PerMJ;
        if (dh > 0) up += dh; else down -= dh;
        add(b);
      }
      if (leg.toStop) {     // trabajo cientifico en la parada
        const dt = P.stopMinutes * 60, e = P.stopW * dt;
        pts[pts.length - 1].arrive = leg.toStop;
        t += dt; energy += e; o2 += (e / 1e6) * P.o2PerMJ;
        add(leg.cells[leg.cells.length - 1], { depart: leg.toStop });
      }
    }
    // Margen de oxigeno si hubiera que volver a pie al habitat desde cada punto
    const walkO2PerS = (300 / 1e6) * P.o2PerMJ;                 // regreso a ritmo exigente
    const reserve = P.o2ReserveMin * 60 * (P.baseWalkW / 1e6) * P.o2PerMJ;
    let minMargin = Infinity, noReturn = null;
    for (const p of pts) {
      p.margin = P.o2TankKg - p.o2 - p.back * walkO2PerS - reserve;
      if (p.margin < minMargin) minMargin = p.margin;
      if (p.margin < 0 && !noReturn) noReturn = p;
    }
    const last = pts[pts.length - 1];
    return { pts, total: { time: last.t, dist: last.dist, o2: last.o2, energy: last.energy,
      dose: last.dose, up, down, minMargin, noReturn,
      o2Left: P.o2TankKg - last.o2, o2LeftPct: (1 - last.o2 / P.o2TankKg) * 100,
      maxBack: Math.max(...pts.map((p) => p.back)) } };
  }

  // Planifica cumpliendo la reserva minima de O2 al llegar (P.o2ReservePct).
  // Si el plan completo no la cumple, quita paradas de una en una (siempre la que
  // mas oxigeno ahorra) hasta cumplirla. Devuelve tambien las paradas omitidas.
  function planWithReserve(habitat, stops, doseRate, backField) {
    let active = stops.slice();
    const omitted = [];
    for (;;) {
      const plan = active.length ? planRoute(habitat, active) : null;
      const tl = plan ? buildTimeline(plan.legs, doseRate, backField) : null;
      if (!tl || tl.total.o2LeftPct >= P.o2ReservePct || active.length <= 1) return { plan, tl, omitted };
      let best = null;
      for (const s of active) {
        const rest = active.filter((k) => k !== s);
        const p2 = planRoute(habitat, rest);
        if (!p2) continue;
        const left = buildTimeline(p2.legs, doseRate, backField).total.o2LeftPct;
        if (!best || left > best.left) best = { s, left };
      }
      if (!best) return { plan, tl, omitted };
      omitted.push(best.s);
      active = active.filter((k) => k !== best.s);
    }
  }

  // Estado interpolado en el instante t de la linea de tiempo
  function sample(tl, t) {
    const pts = tl.pts;
    if (t <= 0) return { ...pts[0], i: 0 };
    if (t >= pts[pts.length - 1].t) return { ...pts[pts.length - 1], i: pts.length - 1 };
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].t <= t) lo = mid; else hi = mid; }
    const a = pts[lo], b = pts[hi], f = (t - a.t) / Math.max(b.t - a.t, 1e-6);
    const L = (k) => a[k] + (b[k] - a[k]) * f;
    return { x: L('x'), z: L('z'), t, dist: L('dist'), o2: L('o2'), energy: L('energy'), dose: L('dose'),
      slope: L('slope'), back: L('back'), margin: L('margin'), i: lo,
      dwell: b.depart || null, stepSlope: Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z) || 1) * 57.2958 };
  }

  return { n, cell, S, R, H, cellOf, posOf, dijkstra, pathBack, planRoute, planWithReserve, buildTimeline, sample };
}
