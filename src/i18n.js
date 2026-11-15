// i18n.js — idioma de la app (es | en) y todos los textos visibles.
//
// Como funciona (sencillo a proposito):
//   - El idioma se decide al cargar la pagina: ?lang=es|en en la direccion manda; si no,
//     el guardado en el navegador (clave "mw_lang", la misma que usa la introduccion); si no, español.
//   - t('clave', { nombre: valor }) devuelve el texto en el idioma activo y sustituye {nombre}.
//   - Cambiar de idioma (setLang) guarda la eleccion y RECARGA la pagina: asi no hay que
//     redibujar cada texto dinamico a mano.
//   - El HTML fijo se marca con data-i18n="clave" (y data-i18n-title / -placeholder / -aria-label)
//     y applyStatic() lo rellena una vez al arrancar.
// Regla: todo texto visible nuevo se añade AQUI, en los dos idiomas (las claves de es y en deben coincidir).

const hayWeb = typeof location !== 'undefined';
const valido = (l) => (l === 'es' || l === 'en' ? l : null);
const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

export const lang = (hayWeb && valido(new URLSearchParams(location.search).get('lang'))) || valido(hayWeb && leer('mw_lang')) || 'es';
export const voiceLang = lang === 'en' ? 'en-US' : 'es-ES';       // idioma de la voz y del reconocimiento

// Decimales: coma en español, punto en inglés (recibe un texto ya formateado con punto)
export const dec = (s) => (lang === 'es' ? String(s).replace('.', ',') : String(s));

// Texto en el idioma activo. Si falta en ese idioma cae al español; si tampoco existe, muestra la clave.
export function t(key, vars) {
  let s = DICT[lang][key];
  if (s === undefined) s = DICT.es[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}

// Guarda el idioma y recarga. Si la direccion lleva ?lang= se actualiza (para que no contradiga
// la eleccion) y un ?intro=1 se quita (para no repetir la introduccion al recargar).
export function setLang(l) {
  if (!valido(l)) return;
  try { localStorage.setItem('mw_lang', l); } catch { /* sin almacenamiento */ }
  const u = new URL(location.href);
  if (u.searchParams.has('lang')) u.searchParams.set('lang', l);
  if (u.searchParams.get('intro') === '1') u.searchParams.delete('intro');
  if (u.href !== location.href) location.replace(u.href); else location.reload();
}

// Rellena el HTML fijo una vez y conecta el boton ES | EN de la cabecera
export function applyStatic() {
  document.documentElement.lang = lang;
  document.title = t('app.title');
  const attrs = [['data-i18n', (e, v) => { e.textContent = v; }], ['data-i18n-title', (e, v) => e.setAttribute('title', v)],
    ['data-i18n-placeholder', (e, v) => e.setAttribute('placeholder', v)], ['data-i18n-aria-label', (e, v) => e.setAttribute('aria-label', v)]];
  for (const [attr, poner] of attrs) for (const e of document.querySelectorAll(`[${attr}]`)) poner(e, t(e.getAttribute(attr)));
  for (const b of document.querySelectorAll('#langSw button')) {
    b.classList.toggle('on', b.dataset.lang === lang);
    b.onclick = () => { if (b.dataset.lang !== lang) setLang(b.dataset.lang); };
  }
}

export const DICT = {
  es: {
    'app.title': 'Marswalk Gale — planificador de caminatas en Monte Sharp',
    'load.terrain': 'Cargando terreno real de Marte…',
    'load.mesh': 'Construyendo la malla 3D (1 048 576 puntos de elevación HiRISE)…',
    'load.nav': 'Calculando rejilla de navegación…',
    'load.route': 'Calculando la ruta más segura…',
    'brand.sub': 'Monte Sharp · cráter Gale',

    // etiquetas de honestidad
    'tag.obs': 'Observación', 'tag.der': 'Derivado', 'tag.model': 'Modelo', 'tag.prop': 'Propuesta',

    // cabecera
    'btn.intro': 'Ver la introducción',
    'btn.add': '＋ Añadir parada', 'btn.adding': 'Haz clic en el terreno…',
    'btn.glb': 'Exportar modelo 3D (GLB)', 'btn.hud': 'Vista de casco ▶',
    'lang.aria': 'Idioma de la aplicación',

    // franja de resumen
    'k.dist': 'Distancia', 'k.time': 'Duración',
    'strip.backMax': 'Regreso máx.', 'strip.back': 'Regreso', 'strip.o2': 'al llegar',
    'strip.stops': '{n} de {total} paradas activas', 'strip.none': 'Sin ruta', 'strip.sim': 'Escenario simulado',
    'strip.go': 'GO · plan viable', 'strip.nogo': 'NO-GO',

    // panel izquierdo
    'fold.left': 'Ocultar o mostrar las capas de datos', 'fold.right': 'Ocultar o mostrar el panel de TARS, paradas y entorno',
    'fold.prof': 'Ocultar o mostrar el perfil de la ruta', 'fold.show': 'Mostrar', 'fold.hide': 'Ocultar',
    'panel.layers': 'Capas de datos', 'panel.more': 'Más capas y ajustes', 'panel.gait': 'Modelo de marcha',
    'gait.slope': 'Pendiente máxima', 'gait.risk': 'Aversión al riesgo', 'gait.stop': 'Minutos por parada',
    'gait.res': 'Reserva mínima de O₂ al llegar',
    'layer.opacity': 'Opacidad',
    'layer.ortofoto.name': 'Ortofoto HiRISE',
    'layer.ortofoto.src': 'MRO HiRISE · 25 cm/píxel (mostrada a 50 cm). Color aproximado.',
    'layer.elevacion.name': 'Elevación', 'layer.elevacion.src': 'MRO HiRISE DEM · 1 m (USGS).',
    'layer.pendiente.name': 'Pendiente', 'layer.pendiente.src': 'Derivada del DEM HiRISE (escala de ~2 m).',
    'layer.termica.name': 'Térmica THEMIS',
    'layer.termica.src': 'Mars Odyssey THEMIS · 100 m/píxel (25×25 píxeles aquí). De noche, más cálido = roca firme.',
    'layer.termica.cold': 'frío', 'layer.termica.warm': 'cálido', 'layer.termica.day': 'usar imagen diurna',
    'layer.curiosity.name': 'Recorrido de Curiosity',
    'layer.curiosity.src': 'Trayectoria documentada del rover (soles {a}–{b}, 2025–2026).',
    'layer.rugosidad.name': 'Rugosidad del suelo', 'layer.rugosidad.src': 'Relieve en ventanas de 5 m, del DEM HiRISE.',
    'layer.rugosidad.lo': 'liso', 'layer.rugosidad.hi': '≥ 0,5 m',
    'layer.regreso.name': 'Regreso a pie al hábitat',
    'layer.regreso.src': 'Minutos caminando hasta el hábitat; líneas cada 10 min. Morado = inalcanzable.',
    'layer.curvas.name': 'Curvas de nivel (10 m / 50 m)', 'layer.ruta.name': 'Ruta de la caminata',

    // mapa
    'leg.route': 'Ruta original', 'leg.back': 'Regreso al hábitat',
    'prof.title': 'Perfil de la ruta — elevación (color = pendiente) y oxígeno restante',

    // panel derecho
    'tab.stops': 'Paradas', 'tab.env': 'Entorno',
    'tars.title': 'TARS · agente de IA del traje', 'ev.chip': '☀ Evento solar simulado',
    'btn.solar': 'Simular evento solar', 'btn.solarOff': 'Quitar evento simulado',
    'tars.ph': 'Pídele algo a TARS…', 'tars.mic': 'Hablar', 'btn.send': 'Enviar', 'btn.backRoute': 'Ver ruta de regreso',
    'tars.sim': 'TARS simulado', 'tars.simDetail': 'respuestas locales con los datos de la app, sin IA ni conexión.',
    'tars.hudSim': 'simulación',
    'tars.helloBasic': 'TARS (simulado). Usa las órdenes rápidas o escribe una palabra clave: estado, reserva 30 %, entorno, evento solar.',
    'tars.noSim': 'No hay ruta sobre la que simular el evento.',
    'chat.you': '👤 Tú', 'chat.thinking': 'Pensando…',
    'quick.status': 'Estado', 'quick.status.q': '¿Cómo va el plan de la misión?',
    'quick.r30': 'Reserva O₂ 30 %', 'quick.r30.q': 'Replanifica con una reserva mínima de 30 % de O₂.',
    'quick.r75': 'Reserva O₂ 75 %', 'quick.r75.q': 'Replanifica con una reserva mínima de 75 % de O₂.',
    'quick.r0': 'Sin reserva', 'quick.r0.q': 'Quita la reserva mínima de O₂ y replanifica.',
    'quick.env': 'Entorno', 'quick.env.q': '¿Cómo están el clima y la radiación?',
    'quick.health': 'Salud', 'quick.health.q': '¿Cómo están mis constantes vitales?',
    'voice.none': 'Voz no disponible en este navegador',
    'voice.denied': 'Permite el micrófono para hablar con TARS.', 'voice.nohear': 'No te oí. Inténtalo de nuevo.',
    'hud.listening': 'escuchando…',

    // presupuesto
    'budget.title': 'Presupuesto de la caminata', 'stops.title': 'Paradas científicas',
    'bud.noRoute': 'SIN RUTA', 'bud.noRoute.d': 'No hay camino transitable con estos límites. Sube la pendiente máxima o quita paradas.',
    'bud.go': 'GO — caminata viable', 'bud.go.d': 'Siempre queda oxígeno para volver a pie con {min} min de reserva.',
    'bud.go.omit': ' Omitidas por la reserva de O₂: {list}.',
    'bud.unreach': 'NO-GO — parada inalcanzable', 'bud.unreach.d': '{list} queda fuera del terreno transitable con estos límites.',
    'bud.noRes': 'NO-GO — reserva de O₂ no alcanzable', 'bud.noRes.d': 'Ni con una sola parada se llega con {pct} % de oxígeno.',
    'bud.noO2': 'NO-GO — oxígeno insuficiente', 'bud.noO2.d': 'A los {time} ya no se podría volver a pie con la reserva exigida.',
    'bud.updown': 'Subida / bajada', 'bud.energy': 'Energía metabólica', 'bud.o2used': 'Oxígeno usado',
    'bud.o2margin': 'Margen mínimo de O₂', 'bud.dose': 'Dosis de radiación', 'bud.maxback': 'Regreso a pie máximo',

    // paradas
    'stop.sub': 'Curiosity estuvo aquí · sol {sol}', 'stop.custom': 'Parada propia {n}', 'stop.crew': 'Elegida por la tripulación',
    'stop.off': 'desactivada', 'stop.omitted': 'omitida por la reserva de O₂', 'stop.unreach': 'inalcanzable', 'stop.photos': 'Fotos',
    'card.rel': '{v} m respecto al terreno cercano', 'card.point': 'Punto {lugar}: {rel}',
    'card.obj': 'Objetivo científico',
    'card.alt': 'Foto de Curiosity en {name}', 'card.cap': 'Foto de Curiosity · sol {sol}', 'card.nophoto': 'Sin fotos de Curiosity en este punto.',
    'photo.alt': 'Foto de Curiosity, sol {sol}',
    'photo.cap': ' — lo que verás al llegar. Imágenes reales tomadas por Curiosity en este lugar: ',

    // entorno
    'env.weather': 'Clima en Gale', 'env.last': 'Última medición:', 'env.air': 'Aire', 'env.to': 'a', 'env.ground': 'suelo',
    'env.pressure': 'Presión', 'env.sky': 'cielo', 'env.sunny': 'despejado',
    'uv.Low': 'bajo', 'uv.Moderate': 'moderado', 'uv.High': 'alto', 'uv.Very_High': 'muy alto',
    'env.sunrise': 'Amanecer', 'env.sunset': 'atardecer',
    'env.rad': 'Radiación en superficie', 'env.gcr': 'Rayos cósmicos:', 'env.perDay': 'mSv/día',
    'env.perHour': '(≈ {n} µSv por hora de caminata)',
    'env.sepNote': 'Durante la tormenta solar de septiembre de 2017, RAD midio en superficie una tasa de dosis de aproximadamente el doble de la habitual durante unos dos dias (Zeitlin et al. 2018, GRL).',
    'env.career': 'NASA-STD-3001 Vol. 1 Rev. B (2022): limite de carrera de 600 mSv.',
    'env.reference': 'Referencia:', 'env.source': 'Fuente: Hassler et al. 2014, <i>Science</i>.',
    'env.space': 'Clima espacial',
    'env.donkiNote': 'DONKI vigila el Sol desde el entorno de la Tierra; las eyecciones dirigidas a Marte se resaltan.',
    'env.notices': 'avisos', 'env.mention': 'mencionan Marte',
    'env.saved': 'copia guardada ({date})', 'env.live': 'en vivo, últimos 14 días',
    'donki.CME': 'Eyección de masa coronal', 'donki.FLR': 'Fulguración', 'donki.SEP': 'Partículas energéticas',
    'donki.GST': 'Tormenta geomagnética', 'donki.RBE': 'Cinturón de radiación', 'donki.IPS': 'Choque interplanetario', 'donki.Report': 'Informe semanal',

    // ciencia
    'sci.question': '¿Circuló agua subterránea por estas fracturas tarde en la historia de Marte?',
    'sci.cresta.lugar': 'sobre una cresta',
    'sci.cresta.objetivo': 'Las crestas resisten la erosión; se cree que el agua subterránea las cementó con minerales. Aquí se busca qué minerales son.',
    'sci.cresta.tarea': 'Toma una muestra de la roca de la cresta y fotografía de cerca las vetas claras.',
    'sci.hueco.lugar': 'en un hueco entre crestas',
    'sci.hueco.objetivo': 'Los huecos son la roca más blanda que se erosionó. Compararla con la cresta dice qué cambió el agua y qué no.',
    'sci.hueco.tarea': 'Toma una muestra del suelo del hueco y anota su color y su grano frente a la cresta vecina.',
    'sci.transicion.lugar': 'entre cresta y hueco',
    'sci.transicion.objetivo': 'El paso de cresta a hueco muestra cómo se formó la red de fracturas y en qué orden.',
    'sci.transicion.tarea': 'Fotografía el contacto entre cresta y hueco y mide hacia dónde se orientan las crestas.',

    // casco (HUD)
    'hud.margin': 'MARGEN REGRESO', 'hud.eva': 'TIEMPO EVA', 'hud.clock': 'HORA LOCAL', 'hud.dose': 'DOSIS', 'hud.airT': 'TEMP. AIRE',
    'hud.health': 'SALUD', 'hud.healthSub': 'simulada · Modelo',
    'hud.pulse': 'PULSO', 'hud.breath': 'RESPIRACIÓN', 'hud.bodyT': 'TEMP. CORPORAL', 'hud.effort': 'ESFUERZO',
    'hud.next': 'SIGUIENTE', 'hud.dist': 'DISTANCIA', 'hud.slope': 'PENDIENTE', 'hud.elev': 'ELEVACIÓN', 'hud.walked': 'RECORRIDO', 'hud.back': 'REGRESO A PIE',
    'hud.tarsTitle': 'TARS · AGENTE DEL TRAJE',
    'hud.say': 'Mantén pulsado el botón o la tecla V y pregunta.',
    'hud.mic': '🎙 Hablar con TARS', 'hud.type': 'o escribe aquí…', 'hud.sep': 'Simular alerta solar', 'hud.exit': 'Salir',
    'hud.habitat': 'HÁBITAT', 'hab': 'hábitat', 'hud.sciNow': 'ciencia en curso', 'hud.inStop': 'en {name} (ciencia en curso)',
    'hud.at': 'EN {name}', 'hud.estAbbr': '(est.)', 'hud.o2g': '{g} g O₂',
    'hud.photoCap': 'Vista real desde aquí · Curiosity, sol {sol} · {credit}',
    'hud.alertSolar': 'ALERTA SOLAR — REGRESO INMEDIATO AL HÁBITAT · DOSIS ×2',
    'hud.alertReturn': 'REGRESO AL HÁBITAT POR LA RUTA MÁS RÁPIDA',
    'hud.alertO2': 'OXÍGENO INSUFICIENTE PARA VOLVER A PIE CON RESERVA',
    'hud.alertSlope': 'PENDIENTE {n}° — PASO CORTO',
    'hud.alertStop': 'PARADA CIENTÍFICA: {name} — {min} min de muestreo',
    'hud.alertEnd': 'DE VUELTA EN EL HÁBITAT — CAMINATA COMPLETADA',
    'dir.N': 'N', 'dir.NE': 'NE', 'dir.E': 'E', 'dir.SE': 'SE', 'dir.S': 'S', 'dir.SW': 'SO', 'dir.W': 'O', 'dir.NW': 'NO',
    'u.hr': 'lpm', 'u.resp': 'rpm',
    'here': 'tu posición actual',

    // errores de las herramientas de TARS
    'err.planOnly': 'Esa orden cambia el plan y solo está disponible en el planificador, antes de salir.',
    'err.noStop': 'No conozco la parada "{q}".',
    'err.alreadyBack': 'Ya estás volviendo al hábitat o no hay ruta de regreso desde aquí.',
    'err.notInRoute': 'Esa parada no está en la ruta actual.',
    'err.noBack': 'No hay ruta de regreso desde esa parada.',
    'err.noEffort': 'No hay ruta sobre la que estimar el esfuerzo.',
    'err.noLayer': 'No existe la capa "{q}".',
    'err.noTool': 'Herramienta desconocida: {name}',

    'lr.noRoute': 'No hay ruta transitable con los límites actuales.',
    'lr.statusHud': 'Llevas {min} min y {km} km. Oxígeno {o2} %. Siguiente: {next}, a {m} m. Regreso a pie: {back} min.',
    'lr.statusPlan': '{verdict}. {a} de {b} paradas, {km} km en {min} min. Oxígeno al llegar: {o2} % (estimado).',
    'lr.skip': 'Omito {list}. ', 'lr.noSkip': 'No hace falta omitir paradas. ',
    'lr.reserve': 'Reserva estimada al llegar: {pct} %', 'lr.reserveOk': '.', 'lr.reserveLow': ', por debajo del {min} % pedido.',
    'lr.back': 'Regreso al hábitat desde {from}: {min} min. Oxígeno estimado al llegar: {o2} %.',
    'lr.backDouble': ' Dosis de radiación duplicada durante el regreso.',
    'lr.stop': '{p} {estado}. Ahora {a} de {b} paradas y {km} km.', 'lr.included': 'incluida', 'lr.excluded': 'excluida',
    'lr.env': 'Aire de {min} a {max} °C, presión {p} Pa (REMS, sol {sol}). Radiación {r} mSv al día (RAD). {n} avisos solares recientes.',
    'lr.stopInfo': '{nombre}, {situacion}. {tarea} Datos: elevación {e} m, pendiente {s}°, ',
    'lr.noWayBack': 'sin camino de regreso con los límites actuales.', 'lr.walkBack': 'regreso a pie {m} min.',
    'lr.healthNow': 'Pulso {fc}, respiración {rr} por minuto, temperatura corporal {temp} °C. Estado: {estado}.',
    'lr.healthPlan': 'En esta ruta el pulso máximo previsto es {fc}, hacia el minuto {min}.',
    'lr.simulated': ' Son valores simulados.',
    'lr.layerOn': 'Capa {capa} encendida.', 'lr.layerOff': 'Capa {capa} apagada.',
    'lr.default': 'Hecho.',

    // salud e indicaciones (health.js)
    'vit.normal': 'normal', 'vit.high': 'esfuerzo alto', 'vit.toohigh': 'demasiado alto: reducir el ritmo',
    'g.fin': 'De vuelta en el hábitat. Caminata completada.',
    'g.solar': 'Alerta solar. Vuelve al hábitat por la ruta marcada.',
    'g.o2': 'El oxígeno estimado no alcanza para volver a pie con reserva. Regresa ya.',
    'g.fc2': 'Pulso estimado de {fc}. Para un momento y reduce el ritmo.',
    'g.slope': 'Pendiente de {n} grados. Paso corto y firme.',
    'g.fc1': 'Esfuerzo alto, pulso estimado de {fc}. Baja un poco el ritmo.',
    'g.stop': 'Estás en {name}. {tarea}', 'g.taskDefault': 'Toma las muestras y descansa.',
    'g.return': 'Sigue la ruta de regreso al hábitat.',
    'g.o2low': 'Queda menos del 40 % de oxígeno estimado. Vigila el margen de regreso.',
    'g.near': '{name} a {m} metros.',
    'g.go': 'Sigue la línea azul hacia {name}.',
    'g.goHab': 'Sigue la línea azul hacia el hábitat.',
  },

  en: {
    'app.title': 'Marswalk Gale — Mount Sharp walk planner',
    'load.terrain': 'Loading real Mars terrain…',
    'load.mesh': 'Building the 3D mesh (1,048,576 HiRISE elevation points)…',
    'load.nav': 'Computing the navigation grid…',
    'load.route': 'Computing the safest route…',
    'brand.sub': 'Mount Sharp · Gale crater',

    'tag.obs': 'Observation', 'tag.der': 'Derived', 'tag.model': 'Model', 'tag.prop': 'Proposal',

    'btn.intro': 'Watch the intro',
    'btn.add': '＋ Add stop', 'btn.adding': 'Click on the terrain…',
    'btn.glb': 'Export 3D model (GLB)', 'btn.hud': 'Helmet view ▶',
    'lang.aria': 'App language',

    'k.dist': 'Distance', 'k.time': 'Duration',
    'strip.backMax': 'Max. return', 'strip.back': 'Return', 'strip.o2': 'on arrival',
    'strip.stops': '{n} of {total} stops active', 'strip.none': 'No route', 'strip.sim': 'Simulated scenario',
    'strip.go': 'GO · viable plan', 'strip.nogo': 'NO-GO',

    'fold.left': 'Hide or show the data layers', 'fold.right': 'Hide or show the TARS, stops and environment panel',
    'fold.prof': 'Hide or show the route profile', 'fold.show': 'Show', 'fold.hide': 'Hide',
    'panel.layers': 'Data layers', 'panel.more': 'More layers and settings', 'panel.gait': 'Walking model',
    'gait.slope': 'Maximum slope', 'gait.risk': 'Risk aversion', 'gait.stop': 'Minutes per stop',
    'gait.res': 'Minimum O₂ reserve on arrival',
    'layer.opacity': 'Opacity',
    'layer.ortofoto.name': 'HiRISE orthophoto',
    'layer.ortofoto.src': 'MRO HiRISE · 25 cm/pixel (shown at 50 cm). Approximate color.',
    'layer.elevacion.name': 'Elevation', 'layer.elevacion.src': 'MRO HiRISE DEM · 1 m (USGS).',
    'layer.pendiente.name': 'Slope', 'layer.pendiente.src': 'Derived from the HiRISE DEM (~2 m scale).',
    'layer.termica.name': 'THEMIS thermal',
    'layer.termica.src': 'Mars Odyssey THEMIS · 100 m/pixel (25×25 pixels here). At night, warmer = solid rock.',
    'layer.termica.cold': 'cold', 'layer.termica.warm': 'warm', 'layer.termica.day': 'use daytime image',
    'layer.curiosity.name': 'Curiosity traverse',
    'layer.curiosity.src': 'Documented rover path (sols {a}–{b}, 2025–2026).',
    'layer.rugosidad.name': 'Ground roughness', 'layer.rugosidad.src': 'Relief in 5 m windows, from the HiRISE DEM.',
    'layer.rugosidad.lo': 'smooth', 'layer.rugosidad.hi': '≥ 0.5 m',
    'layer.regreso.name': 'Walk back to the habitat',
    'layer.regreso.src': 'Minutes walking to the habitat; lines every 10 min. Purple = unreachable.',
    'layer.curvas.name': 'Contour lines (10 m / 50 m)', 'layer.ruta.name': 'Walk route',

    'leg.route': 'Original route', 'leg.back': 'Return to the habitat',
    'prof.title': 'Route profile — elevation (color = slope) and remaining oxygen',

    'tab.stops': 'Stops', 'tab.env': 'Environment',
    'tars.title': 'TARS · suit AI agent', 'ev.chip': '☀ Simulated solar event',
    'btn.solar': 'Simulate solar event', 'btn.solarOff': 'Remove simulated event',
    'tars.ph': 'Ask TARS for something…', 'tars.mic': 'Speak', 'btn.send': 'Send', 'btn.backRoute': 'Show return route',
    'tars.sim': 'Simulated TARS', 'tars.simDetail': 'local replies built from the app data, no AI or connection.',
    'tars.hudSim': 'simulation',
    'tars.helloBasic': 'TARS (simulated). Use the quick commands or type a keyword: status, reserve 30 %, environment, solar event.',
    'tars.noSim': 'There is no route on which to simulate the event.',
    'chat.you': '👤 You', 'chat.thinking': 'Thinking…',
    'quick.status': 'Status', 'quick.status.q': 'How is the mission plan going?',
    'quick.r30': 'O₂ reserve 30 %', 'quick.r30.q': 'Replan with a minimum O₂ reserve of 30 %.',
    'quick.r75': 'O₂ reserve 75 %', 'quick.r75.q': 'Replan with a minimum O₂ reserve of 75 %.',
    'quick.r0': 'No reserve', 'quick.r0.q': 'Remove the minimum O₂ reserve and replan.',
    'quick.env': 'Environment', 'quick.env.q': 'How are the weather and the radiation?',
    'quick.health': 'Health', 'quick.health.q': 'How are my vital signs?',
    'voice.none': 'Voice not available in this browser',
    'voice.denied': 'Allow the microphone to talk to TARS.', 'voice.nohear': 'I did not hear you. Try again.',
    'hud.listening': 'listening…',

    'budget.title': 'Walk budget', 'stops.title': 'Science stops',
    'bud.noRoute': 'NO ROUTE', 'bud.noRoute.d': 'There is no passable path within these limits. Raise the maximum slope or remove stops.',
    'bud.go': 'GO — viable walk', 'bud.go.d': 'There is always enough oxygen to walk back with {min} min of reserve.',
    'bud.go.omit': ' Skipped because of the O₂ reserve: {list}.',
    'bud.unreach': 'NO-GO — unreachable stop', 'bud.unreach.d': '{list} is outside the passable terrain within these limits.',
    'bud.noRes': 'NO-GO — O₂ reserve not reachable', 'bud.noRes.d': 'Even with a single stop you cannot arrive with {pct} % of oxygen.',
    'bud.noO2': 'NO-GO — not enough oxygen', 'bud.noO2.d': 'After {time} you could no longer walk back with the required reserve.',
    'bud.updown': 'Up / down', 'bud.energy': 'Metabolic energy', 'bud.o2used': 'Oxygen used',
    'bud.o2margin': 'Minimum O₂ margin', 'bud.dose': 'Radiation dose', 'bud.maxback': 'Longest walk back',

    'stop.sub': 'Curiosity was here · sol {sol}', 'stop.custom': 'Custom stop {n}', 'stop.crew': 'Chosen by the crew',
    'stop.off': 'disabled', 'stop.omitted': 'skipped because of the O₂ reserve', 'stop.unreach': 'unreachable', 'stop.photos': 'Photos',
    'card.rel': '{v} m relative to the nearby terrain', 'card.point': 'Point {lugar}: {rel}',
    'card.obj': 'Science objective',
    'card.alt': 'Curiosity photo at {name}', 'card.cap': 'Curiosity photo · sol {sol}', 'card.nophoto': 'No Curiosity photos at this point.',
    'photo.alt': 'Curiosity photo, sol {sol}',
    'photo.cap': ' — what you will see on arrival. Real images taken by Curiosity at this place: ',

    'env.weather': 'Weather at Gale', 'env.last': 'Latest measurement:', 'env.air': 'Air', 'env.to': 'to', 'env.ground': 'ground',
    'env.pressure': 'Pressure', 'env.sky': 'sky', 'env.sunny': 'clear',
    'uv.Low': 'low', 'uv.Moderate': 'moderate', 'uv.High': 'high', 'uv.Very_High': 'very high',
    'env.sunrise': 'Sunrise', 'env.sunset': 'sunset',
    'env.rad': 'Surface radiation', 'env.gcr': 'Cosmic rays:', 'env.perDay': 'mSv/day',
    'env.perHour': '(≈ {n} µSv per hour of walking)',
    'env.sepNote': 'During the September 2017 solar storm, RAD measured a surface dose rate roughly double the usual one for about two days (Zeitlin et al. 2018, GRL).',
    'env.career': 'NASA-STD-3001 Vol. 1 Rev. B (2022): career limit of 600 mSv.',
    'env.reference': 'Reference:', 'env.source': 'Source: Hassler et al. 2014, <i>Science</i>.',
    'env.space': 'Space weather',
    'env.donkiNote': 'DONKI watches the Sun from near Earth; ejections aimed at Mars are highlighted.',
    'env.notices': 'notices', 'env.mention': 'mention Mars',
    'env.saved': 'saved copy ({date})', 'env.live': 'live, last 14 days',
    'donki.CME': 'Coronal mass ejection', 'donki.FLR': 'Solar flare', 'donki.SEP': 'Energetic particles',
    'donki.GST': 'Geomagnetic storm', 'donki.RBE': 'Radiation belt enhancement', 'donki.IPS': 'Interplanetary shock', 'donki.Report': 'Weekly report',

    'sci.question': 'Did groundwater flow through these fractures late in Mars history?',
    'sci.cresta.lugar': 'on a ridge',
    'sci.cresta.objetivo': 'Ridges resist erosion; groundwater is believed to have cemented them with minerals. The goal here is to find out which minerals.',
    'sci.cresta.tarea': 'Take a sample of the ridge rock and photograph the light-colored veins up close.',
    'sci.hueco.lugar': 'in a hollow between ridges',
    'sci.hueco.objetivo': 'Hollows are the softer rock that eroded away. Comparing it with the ridge shows what the water changed and what it did not.',
    'sci.hueco.tarea': 'Take a sample of the hollow soil and note its color and grain compared with the neighboring ridge.',
    'sci.transicion.lugar': 'between ridge and hollow',
    'sci.transicion.objetivo': 'The step from ridge to hollow shows how the fracture network formed and in what order.',
    'sci.transicion.tarea': 'Photograph the contact between ridge and hollow and measure which way the ridges are oriented.',

    'hud.margin': 'RETURN MARGIN', 'hud.eva': 'EVA TIME', 'hud.clock': 'LOCAL TIME', 'hud.dose': 'DOSE', 'hud.airT': 'AIR TEMP.',
    'hud.health': 'HEALTH', 'hud.healthSub': 'simulated · Model',
    'hud.pulse': 'PULSE', 'hud.breath': 'BREATHING', 'hud.bodyT': 'BODY TEMP.', 'hud.effort': 'EFFORT',
    'hud.next': 'NEXT', 'hud.dist': 'DISTANCE', 'hud.slope': 'SLOPE', 'hud.elev': 'ELEVATION', 'hud.walked': 'TRAVELED', 'hud.back': 'WALK BACK',
    'hud.tarsTitle': 'TARS · SUIT AGENT',
    'hud.say': 'Hold the button or the V key and ask.',
    'hud.mic': '🎙 Talk to TARS', 'hud.type': 'or type here…', 'hud.sep': 'Simulate solar alert', 'hud.exit': 'Exit',
    'hud.habitat': 'HABITAT', 'hab': 'habitat', 'hud.sciNow': 'science in progress', 'hud.inStop': 'at {name} (science in progress)',
    'hud.at': 'AT {name}', 'hud.estAbbr': '(est.)', 'hud.o2g': '{g} g O₂',
    'hud.photoCap': 'Real view from here · Curiosity, sol {sol} · {credit}',
    'hud.alertSolar': 'SOLAR ALERT — RETURN TO THE HABITAT IMMEDIATELY · DOSE ×2',
    'hud.alertReturn': 'RETURNING TO THE HABITAT BY THE FASTEST ROUTE',
    'hud.alertO2': 'NOT ENOUGH OXYGEN TO WALK BACK WITH RESERVE',
    'hud.alertSlope': 'SLOPE {n}° — SHORT STEPS',
    'hud.alertStop': 'SCIENCE STOP: {name} — {min} min of sampling',
    'hud.alertEnd': 'BACK AT THE HABITAT — WALK COMPLETE',
    'dir.N': 'N', 'dir.NE': 'NE', 'dir.E': 'E', 'dir.SE': 'SE', 'dir.S': 'S', 'dir.SW': 'SW', 'dir.W': 'W', 'dir.NW': 'NW',
    'u.hr': 'bpm', 'u.resp': 'br/min',
    'here': 'your current position',

    'err.planOnly': 'That command changes the plan and is only available in the planner, before heading out.',
    'err.noStop': 'I do not know the stop "{q}".',
    'err.alreadyBack': 'You are already returning to the habitat or there is no way back from here.',
    'err.notInRoute': 'That stop is not on the current route.',
    'err.noBack': 'There is no way back from that stop.',
    'err.noEffort': 'There is no route on which to estimate the effort.',
    'err.noLayer': 'There is no layer "{q}".',
    'err.noTool': 'Unknown tool: {name}',

    'lr.noRoute': 'There is no passable route within the current limits.',
    'lr.statusHud': 'You have walked {min} min and {km} km. Oxygen {o2} %. Next: {next}, {m} m away. Walk back: {back} min.',
    'lr.statusPlan': '{verdict}. {a} of {b} stops, {km} km in {min} min. Oxygen on arrival: {o2} % (estimated).',
    'lr.skip': 'Skipping {list}. ', 'lr.noSkip': 'No stops need to be skipped. ',
    'lr.reserve': 'Estimated reserve on arrival: {pct} %', 'lr.reserveOk': '.', 'lr.reserveLow': ', below the requested {min} %.',
    'lr.back': 'Return to the habitat from {from}: {min} min. Estimated oxygen on arrival: {o2} %.',
    'lr.backDouble': ' Radiation dose doubled during the return.',
    'lr.stop': '{p} {estado}. Now {a} of {b} stops and {km} km.', 'lr.included': 'included', 'lr.excluded': 'excluded',
    'lr.env': 'Air from {min} to {max} °C, pressure {p} Pa (REMS, sol {sol}). Radiation {r} mSv per day (RAD). {n} recent solar notices.',
    'lr.stopInfo': '{nombre}, {situacion}. {tarea} Data: elevation {e} m, slope {s}°, ',
    'lr.noWayBack': 'no way back within the current limits.', 'lr.walkBack': 'walk back {m} min.',
    'lr.healthNow': 'Pulse {fc}, breathing {rr} per minute, body temperature {temp} °C. State: {estado}.',
    'lr.healthPlan': 'On this route the expected peak pulse is {fc}, around minute {min}.',
    'lr.simulated': ' These are simulated values.',
    'lr.layerOn': 'Layer {capa} turned on.', 'lr.layerOff': 'Layer {capa} turned off.',
    'lr.default': 'Done.',

    'vit.normal': 'normal', 'vit.high': 'high effort', 'vit.toohigh': 'too high: slow down',
    'g.fin': 'Back at the habitat. Walk complete.',
    'g.solar': 'Solar alert. Return to the habitat along the marked route.',
    'g.o2': 'Estimated oxygen is not enough to walk back with reserve. Head back now.',
    'g.fc2': 'Estimated pulse of {fc}. Stop for a moment and slow down.',
    'g.slope': 'Slope of {n} degrees. Short, firm steps.',
    'g.fc1': 'High effort, estimated pulse of {fc}. Ease the pace a little.',
    'g.stop': 'You are at {name}. {tarea}', 'g.taskDefault': 'Take the samples and rest.',
    'g.return': 'Follow the return route to the habitat.',
    'g.o2low': 'Less than 40 % of estimated oxygen left. Watch the return margin.',
    'g.near': '{name}, {m} meters away.',
    'g.go': 'Follow the blue line toward {name}.',
    'g.goHab': 'Follow the blue line toward the habitat.',
  },
};
