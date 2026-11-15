// health.js — salud del astronauta e indicaciones automaticas de TARS en el traje.
//
// IMPORTANTE: en esta demo NO hay sensores reales. Las constantes vitales son un MODELO:
// se simulan a partir del esfuerzo (potencia metabolica) que nav.js calcula para la ruta.
// Las indicaciones son reglas sencillas que funcionan en local, sin conexion ni IA.

import { t } from './i18n.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Constantes vitales simuladas en el instante seg (segundos) de la linea de tiempo tl
// (el parametro no se llama t para no tapar la funcion t() de los textos)
export function vitals(nav, tl, seg) {
  const fin = tl.pts[tl.pts.length - 1].t;
  const a = nav.sample(tl, Math.max(0, seg - 30)), b = nav.sample(tl, Math.min(fin, seg + 30));
  const w = b.t > a.t ? (b.energy - a.energy) / (b.t - a.t) : 100;     // esfuerzo medio del ultimo minuto (W)
  const horas = seg / 3600;                                              // el cansancio sube un poco con las horas
  const fc = clamp(64 + (w - 100) * 0.2 + horas * 4, 50, 190);
  const nivel = fc >= 150 ? 2 : fc >= 125 ? 1 : 0;
  return {
    fc_lpm: Math.round(fc),                                            // frecuencia cardiaca (latidos por minuto)
    respiracion_rpm: Math.round(12 + (w - 100) * 0.045),               // respiraciones por minuto
    temperatura_corporal_C: +(36.8 + (w - 100) * 0.0015 + horas * 0.08).toFixed(1),
    esfuerzo_W: Math.round(w),
    estado: [t('vit.normal'), t('vit.high'), t('vit.toohigh')][nivel],
    nivel,
  };
}

// Indicacion que TARS da por iniciativa propia segun la situacion (la mas importante primero).
// Devuelve { key, text } o null. "key" identifica la situacion para no repetir la misma frase.
export function guidance(d) {
  if (d.fin) return { key: 'fin', text: t('g.fin') };
  if (d.alertaSolar) return { key: 'solar', text: t('g.solar') };
  if (d.margen < 0) return { key: 'o2', text: t('g.o2') };
  if (d.salud.nivel === 2) return { key: 'fc2', text: t('g.fc2', { fc: d.salud.fc_lpm }) };
  if (d.enMarcha && Math.abs(d.pendiente) >= 15) return { key: 'pend', text: t('g.slope', { n: Math.abs(d.pendiente).toFixed(0) }) };
  if (d.salud.nivel === 1) return { key: 'fc1', text: t('g.fc1', { fc: d.salud.fc_lpm }) };
  if (d.parada) return { key: 'parada:' + d.parada, text: t('g.stop', { name: d.parada, tarea: d.tarea || t('g.taskDefault') }) };
  if (d.regresando) return { key: 'regreso', text: t('g.return') };
  if (d.o2Pct < 40) return { key: 'o2bajo', text: t('g.o2low') };
  if (d.siguiente && d.distancia < 60) return { key: 'cerca:' + d.siguiente, text: t('g.near', { name: d.siguiente, m: Math.round(d.distancia) }) };
  if (d.siguiente) return { key: 'ir:' + d.siguiente, text: t('g.go', { name: d.siguiente }) };
  return { key: 'hab', text: t('g.goHab') };
}
