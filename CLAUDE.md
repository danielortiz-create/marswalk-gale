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
- `src/tars.js` — cliente del agente TARS: bucle de herramientas y voz
- `server/tars-proxy.js` — complemento de Vite que llama a Claude (`claude-opus-5-5`); define las herramientas
- `data-pipeline/` — scripts de Python que preparan los datos de NASA

## Reglas

- Interfaz y comentarios en español.
- Nunca presentar una estimación como medición: etiquetas «Observación», «Derivado» o «Modelo».
- La clave `ANTHROPIC_API_KEY` va solo en `.env.local` (no se sube); nunca con prefijo `VITE_` ni en código del navegador.
- Una herramienta nueva de TARS se define en `server/tars-proxy.js` y se implementa en `runTool` de `src/main.js`.
- Mundo en metros: x = este, z = sur, y = arriba; y es relativa a la elevación del hábitat.
- Subir a `main` publica solo en GitHub Pages (`.github/workflows/deploy.yml`).

## Estado actual

- Hecho: datos reales, planificador 3D, vista de casco, TARS con IA y voz, página en GitHub Pages, vídeo de presentación (`video/`, ver `build.sh`).
- Sin probar con clave real: la IA de TARS y el micrófono (se probaron con un servidor simulado).
- Pendiente: voz del vídeo. Guion en `video/narration.json`; `video/voice.py` usa el motor Kokoro (hay que descargar los archivos de voz en `video/voices/`, ver el encabezado del script).
- Ideas sin decidir: bienvenida guiada, lectura bajo el cursor, versión tablet, botón ES/EN, paleta para daltonismo.
- Usuario: principiante, habla español, quiere respuestas cortas. Trabaja ahora en su PC (clave en `.env.local`).
