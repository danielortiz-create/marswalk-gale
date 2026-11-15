// science.js — objetivo cientifico de cada parada.
//
// Que es dato y que no:
//   - El RELIEVE del punto (si esta sobre una cresta o en un hueco) es «Derivado»: se calcula
//     comparando su altura con la del terreno a su alrededor, con el DEM de HiRISE.
//   - El OBJETIVO y la TAREA son una «Propuesta» del equipo para la caminata: no son
//     resultados de Curiosity ni un plan de NASA.

import { t } from './i18n.js';

// Pregunta que guia toda la caminata (los textos estan en i18n.js, en español e ingles)
export const PREGUNTA = t('sci.question');

const RADIO = 12;      // metros alrededor del punto con los que se compara su altura
const UMBRAL = 0.3;    // metros de diferencia para llamarlo cresta o hueco

const TIPOS = {
  cresta: {
    lugar: t('sci.cresta.lugar'),
    objetivo: t('sci.cresta.objetivo'),
    tarea: t('sci.cresta.tarea'),
  },
  hueco: {
    lugar: t('sci.hueco.lugar'),
    objetivo: t('sci.hueco.objetivo'),
    tarea: t('sci.hueco.tarea'),
  },
  transicion: {
    lugar: t('sci.transicion.lugar'),
    objetivo: t('sci.transicion.objetivo'),
    tarea: t('sci.transicion.tarea'),
  },
};

// Devuelve el relieve del punto (Derivado) y la ciencia propuesta para el (Propuesta)
export function scienceFor(terrain, x, z) {
  let suma = 0; const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    suma += terrain.heightAt(x + Math.cos(a) * RADIO, z + Math.sin(a) * RADIO);
  }
  const relieve = terrain.heightAt(x, z) - suma / n;      // + = mas alto que su entorno
  const tipo = relieve > UMBRAL ? 'cresta' : relieve < -UMBRAL ? 'hueco' : 'transicion';
  return { tipo, relieve_m: +relieve.toFixed(1), ...TIPOS[tipo] };
}
