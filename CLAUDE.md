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
- `src/main.js` — interfaz: planificador y vista de casco (HUD)
- `data-pipeline/` — scripts de Python que preparan los datos de NASA

## Reglas

- Interfaz y comentarios en español.
- Nunca presentar una estimación como medición: etiqueta "dato NASA" (verde) o "modelo" (amarillo).
- Mundo en metros: x = este, z = sur, y = arriba; y es relativa a la elevación del hábitat.
- Subir a `main` publica solo en GitHub Pages (`.github/workflows/deploy.yml`).
