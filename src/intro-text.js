// intro-text.js — textos de la introduccion, en español e ingles.
// Cada frase se muestra como subtitulo y se lee en voz alta: conviene que sean cortas.
// Regla del proyecto: oxigeno, tiempos y veredicto son estimaciones de un modelo, no mediciones.
export const TEXT = {
  es: {
    voz: 'es-ES',
    rotulo: 'DATOS DE NASA · CRÁTER GALE · MARTE',
    lema: 'Planea la caminata. Sopesa el riesgo. Camina con datos reales.',
    iniciar: 'Iniciar ▶', saltar: 'Saltar introducción', siguiente: 'Siguiente ›',
    nombreNave: 'NAVE', nombreAstronauta: 'ASTRONAUTA',
    nave: [
      'Aterrizaje completado junto al hábitat. Estamos en las crestas boxwork de Monte Sharp, en el cráter Gale, Marte.',
      'El terreno es real: un cuadrado de dos por dos kilómetros, con elevación y ortofoto de MRO.',
      'A ese mapa se suman datos térmicos de Mars Odyssey y mediciones de Curiosity: clima, radiación, fotos y su recorrido.',
    ],
    astronauta: [
      'Hola. Marswalk Gale es un mapa 3D para planear una caminata de astronautas sobre estas crestas, que Curiosity exploró en 2025.',
      'Puedes ver capas de datos, ordenar las paradas científicas y trazar el camino más seguro, evitando las pendientes.',
      'La app estima oxígeno, tiempo y radiación, y da un veredicto GO o NO-GO. Son estimaciones de un modelo, no mediciones. Con TARS puedes pedir cambios.',
      'Así que ponte el casco, revisa el mapa y empecemos a planear la caminata.',
    ],
  },
  en: {
    voz: 'en-US',
    rotulo: 'NASA DATA · GALE CRATER · MARS',
    lema: 'Plan the walk. Weigh the risk. Walk on real data.',
    iniciar: 'Start ▶', saltar: 'Skip intro', siguiente: 'Next ›',
    nombreNave: 'SHIP', nombreAstronauta: 'ASTRONAUT',
    nave: [
      'Landing complete beside the habitat. We are on the boxwork ridges of Mount Sharp, in Gale Crater, Mars.',
      'The terrain is real: a two by two kilometer square, with elevation and orthophoto from MRO.',
      'On top of that map we add thermal data from Mars Odyssey and Curiosity measurements: weather, radiation, photos and its traverse.',
    ],
    astronauta: [
      'Hi there. Marswalk Gale is a 3D map for planning an astronaut walk across these ridges, which Curiosity explored in 2025.',
      'You can explore data layers, order the science stops and trace the safest route, steering clear of steep slopes.',
      'The app estimates oxygen, time and radiation, and gives a GO or NO-GO verdict. Those are model estimates, not measurements. Ask TARS for changes.',
      "So put on your helmet, check the map, and let's start planning the walk.",
    ],
  },
};
