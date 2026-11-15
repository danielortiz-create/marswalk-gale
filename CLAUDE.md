# Marswalk Gale

App web 3D (Vite + Three.js, JavaScript sin frameworks) para planear una caminata de astronautas en las crestas boxwork de Monte Sharp, cráter Gale. Proyecto para un reto de NASA. El usuario es principiante: código simple, comentado en español, y explicaciones cortas.

## Comandos

- `npm run dev` — servidor local
- `npm run build` — sitio estático en `dist/`
- `node tests/smoke.cjs` — prueba en navegador (necesita el servidor en el puerto 5173)
- `python3 data-pipeline/fetch_data.py` y luego `build_layers.py` — rehacer `public/data/`

## Estructura

- `src/terrain.js` — malla del terreno y shader de capas
- `src/nav.js` — rutas (Dijkstra) y presupuesto de la caminata; parámetros en el objeto `P`
- `src/models.js` — modelos 3D con primitivas
- `src/main.js` — interfaz: planificador, herramientas de TARS (`runTool`) y vista de casco (HUD)
- `src/tars.js` — TARS simulado: respuestas locales (`localReply`) y voz (`createVoice`)
- `src/tars-dialog.js` — diálogo simulado y guionizado (en inglés) entre TARS y el astronauta en la vista de casco; se dispara por oxígeno de demostración (99, 95, 80, 70, 60 %), pendientes, paradas y fin
- `src/health.js` — salud SIMULADA del astronauta (`vitals`) e indicaciones automáticas de TARS en el casco (`guidance`); sin sensores reales, siempre etiquetada «Modelo»
- `src/science.js` — objetivo científico por parada: relieve (cresta/hueco) derivado del terreno y tarea propuesta
- `src/i18n.js` — idioma de la app (`es` | `en`, clave `mw_lang`, o `?lang=` en la URL): diccionario de todos los textos, `t(clave, vars)`, `setLang` (guarda y recarga) y `applyStatic` (rellena el HTML marcado con `data-i18n*`)
- `src/intro.js` — introducción animada (nave que aterriza y astronauta que explica); textos ES/EN en `src/intro-text.js`
- `data-pipeline/` — scripts de Python que preparan los datos de NASA

## Reglas

- Interfaz en español por defecto y en inglés con el botón ES | EN; comentarios del código en español. El `README.md` va en INGLÉS (lo leen los jueces de NASA) y empieza con la tabla «How it answers the NASA challenge».
- Todo texto visible nuevo va en el diccionario de `src/i18n.js` en los DOS idiomas (las claves de `es` y `en` deben coincidir); en el HTML se marca con `data-i18n`. Los nombres de herramientas de TARS y las claves JSON de sus resultados siguen en español (son internos).
- Nunca presentar una estimación como medición: etiquetas «Observación», «Derivado» o «Modelo». Los objetivos científicos de las paradas llevan «Propuesta».
- TARS es una SIMULACIÓN: no hay IA ni API (se quitó a propósito porque el proyecto es público en GitHub). Una orden nueva se implementa en `runTool` de `src/main.js`, se reconoce en `offlineIntent` y se responde en `localReply` de `src/tars.js`.
- Mundo en metros: x = este, z = sur, y = arriba; y es relativa a la elevación del hábitat.
- Las pruebas y el vídeo abren la app con `?intro=0` para saltarse la introducción (`?intro=1` la fuerza) y con `&lang=es` para fijar el idioma.
- Subir a `main` publica solo en GitHub Pages (`.github/workflows/deploy.yml`).

## Estado actual

- Concepto: TARS es el agente de IA local del traje (da indicaciones y vigila la salud). En la demo todo es simulado: diálogo guionizado en inglés en el casco, oxígeno de demostración (etiqueta «SIM», baja 1 % cada 2 s), salud modelada y respuestas locales en el planificador.
- Hecho: decisión ante alerta solar en el casco (`openDecision`/`decide` en `main.js`, salta a 120 m de la primera parada), regreso y margen en minutos, minimapa (`drawMinimap`), diálogo simulado TARS ↔ astronauta, salud simulada, app completa en español e inglés (botón ES | EN en la cabecera), introducción animada con botón ES/EN, tarjetas plegables, datos reales, planificador 3D, vista de casco (arranca a ×10, ×1 mientras hablan), página en GitHub Pages, vídeo de presentación (`video/`, ver `build.sh`).
- Sin probar: las voces (el navegador integrado no tiene) y el micrófono.
- Pendiente: voz del vídeo. Guion en `video/narration.json`; `video/voice.py` usa el motor Kokoro (hay que descargar los archivos de voz en `video/voices/`, ver el encabezado del script).
- Ideas sin decidir: lectura bajo el cursor, versión tablet, paleta para daltonismo.
- Usuario: principiante, habla español, quiere respuestas cortas. Trabaja ahora en su PC.
