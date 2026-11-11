# Marswalk Gale

Mapa 3D integrado para planear y ejecutar una caminata (Marswalk) en las crestas *boxwork* de Monte Sharp, cráter Gale, Marte. Combina datos de tres misiones de NASA — **MRO**, **Mars Odyssey** y **Curiosity** — más el clima espacial de **DONKI**.

## Cómo ejecutarlo

```bash
npm install
```

```bash
npm run dev
```

Abre la dirección que aparece (normalmente `http://localhost:5173`). En equipos sin tarjeta gráfica añade `?malla=2` al final de la dirección para usar una malla más ligera.

Para generar el sitio estático publicable (carpeta `dist/`):

```bash
npm run build
```

## TARS, el agente de misión (IA)

TARS es un agente con IA (Claude Opus 5.5) que responde preguntas sobre la misión y cambia el plan cuando se lo pides: «Replanifica con una reserva mínima de 30 % de O₂», «¿cuánto oxígeno me queda?», «simula un evento solar en Boxwork 3».

Para activarlo en tu computadora:

1. Copia `.env.example` como `.env.local`.
2. Pon tu clave de la API de Claude después de `ANTHROPIC_API_KEY=`.
3. Arranca con `npm run dev`. En el panel de TARS debe aparecer «IA conectada».

La clave se queda en tu equipo: `.env.local` no se sube a GitHub y solo la usa el servidor local (`server/tars-proxy.js`); nunca llega al navegador. Cada pregunta a TARS consume uso de tu cuenta de la API.

En la página pública de GitHub Pages no hay servidor ni clave, así que TARS funciona en modo básico: órdenes rápidas y palabras clave, sin IA.

**Voz en la vista de casco:** mantén pulsado «Hablar con TARS» o la tecla `V`, pregunta, y suelta. TARS responde en el visor y en voz alta. Funciona en Chrome y Edge; en otros navegadores se escribe la pregunta. En Chrome, el audio se envía a los servidores de Google para transcribirlo.

## Qué hace

**Planificador (dentro del hábitat)**
- Terreno 3D real de 2 × 2 km (un millón de puntos de elevación).
- Seis capas activables con opacidad y leyenda: óptica, elevación, pendiente, térmica, rugosidad y tiempo de regreso a pie al hábitat; más curvas de nivel y el recorrido real de Curiosity.
- Ruta automática: elige el mejor orden de paradas y el camino más seguro, evitando pendientes. Puedes añadir paradas propias con un clic en el terreno.
- Franja de resumen sobre el mapa: paradas activas, distancia, duración, regreso y oxígeno al llegar.
- Reserva mínima de oxígeno: si el plan no la cumple, omite paradas hasta cumplirla.
- Escenario de evento solar desde cualquier parada, con la ruta de regreso en línea discontinua.
- Presupuesto de la caminata: distancia, duración, desnivel, energía, oxígeno, dosis de radiación y un veredicto GO / NO-GO según si siempre queda oxígeno para volver a pie.
- Fotos reales de Curiosity en cada parada: lo que el astronauta verá al llegar.
- Exporta el terreno, la ruta y el hábitat a un archivo GLB (para Blender o impresión 3D).

**Vista de casco (HUD)**
- Recorres la ruta en primera persona con brújula, oxígeno, margen de regreso, hora solar local, dosis, pendiente y distancia a la siguiente parada.
- Marcadores flotantes sobre las paradas y el hábitat; un compañero camina delante.
- "Simular alerta solar": duplica la dosis y recalcula al instante la ruta más rápida al hábitat.

## Datos de NASA usados

| Tipo | Dato | Misión / fuente |
|---|---|---|
| Topográfico | MSL Gale Merged DEM, 1 m/píxel, v3 | MRO HiRISE · USGS Astrogeology |
| Óptico | MSL Gale Orthophoto Mosaic, 25 cm/píxel, v3 | MRO HiRISE · USGS Astrogeology |
| Térmico | THEMIS IR Controlled Mosaics día y noche, 100 m/píxel | Mars Odyssey · NASA Mars Trek |
| Atmosférico | Temperatura, presión, UV y opacidad por sol | Curiosity REMS (NASA/JPL-Caltech/CAB) |
| Radiación | Dosis en superficie 0.64 ± 0.12 mSv/día | Curiosity RAD · Hassler et al. 2014, *Science* |
| Clima espacial | Notificaciones de CME, fulguraciones y tormentas | NASA CCMC DONKI |
| Imágenes | Fotos crudas Navcam por sol | Curiosity · mars.nasa.gov |
| Recorrido | Posiciones del rover por sol | Curiosity · MMGIS waypoints |

## Qué es dato y qué es modelo

La app marca cada elemento con una etiqueta: «Observación» (medido por un instrumento), «Derivado» (calculado directamente de una medición) o «Modelo» (estimación).

- **Dato:** elevación, ortofoto, brillo térmico, clima, dosis de radiación, avisos DONKI, fotos y recorrido. La pendiente y la rugosidad se calculan directamente del DEM.
- **Modelo:** velocidad de marcha, gasto metabólico, consumo de oxígeno, tiempo de regreso y veredicto GO / NO-GO. Los parámetros están en `src/nav.js` (objeto `P`) y se pueden cambiar. La temperatura mostrada en el casco es una interpolación entre el mínimo y el máximo de REMS. El color del terreno es aproximado (la ortofoto es en escala de grises).
- **Modelos 3D** de hábitat, rover, astronautas y Curiosity: conceptuales, hechos con formas básicas.

## Limitaciones conocidas

- No hay capa espectral (CRISM): no se consiguió una fuente a esta escala. En su lugar hay rugosidad y tiempo de regreso.
- La capa térmica es real pero gruesa: 25 × 25 píxeles en toda el área.
- La radiación usa el valor publicado de RAD, no el archivo PDS reprocesado.
- DONKI observa desde el entorno de la Tierra; no es un pronóstico para Marte.
- La rejilla de navegación es de 4 m: no ve rocas individuales menores que eso.

## Rehacer los datos

```bash
pip install rasterio scipy pillow numpy
```

```bash
python3 data-pipeline/fetch_data.py
```

```bash
python3 data-pipeline/build_layers.py
```

`fetch_data.py` descarga solo la ventana necesaria de los mosaicos (que pesan decenas de GB). Para otra zona de Gale, cambia `BOXWORK_SOLS` o el centro en ese archivo.

## Estructura

```
data-pipeline/   scripts de Python que preparan los datos
public/data/     datos listos para la app
src/terrain.js   malla 3D y shader de capas
src/nav.js       rutas (Dijkstra) y presupuesto de la caminata
src/models.js    modelos 3D
src/main.js      interfaz: planificador, herramientas de TARS y vista de casco
src/tars.js      cliente de TARS: conversación y voz
server/          puente con la API de Claude (guarda la clave fuera del navegador)
tests/smoke.cjs  prueba automática en navegador
```

## Guion de 3 minutos para el jurado

1. **El problema (20 s).** "Los mapas de Marte que existen son globales. Un astronauta que sale a caminar necesita uno de su kilómetro cuadrado, con todo junto."
2. **El lugar (20 s).** "Elegimos las crestas boxwork de Monte Sharp, que Curiosity exploró en 2025. Pueden decirnos si hubo agua subterránea tarde en la historia de Marte." Gira el terreno 3D; señala la línea blanca: el recorrido real de Curiosity.
3. **Las capas (40 s).** Activa pendiente, luego térmica, luego regreso a pie. "Tres misiones en una sola vista: MRO, Odyssey y Curiosity."
4. **La ruta (40 s).** "El sistema elige el orden de las paradas y el camino más seguro." Muestra que la ruta rodea las zonas rojas. Baja la pendiente máxima y enseña cómo cambia. Añade una parada con un clic.
5. **La seguridad (30 s).** Señala el veredicto GO, el oxígeno y la dosis. "En todo momento sabemos si queda oxígeno para volver a pie."
6. **El casco (30 s).** Inicia la caminata. Al llegar a una parada aparece la foto real de Curiosity. Pulsa "Simular alerta solar": la ruta cambia hacia el hábitat.
7. **Cierre (10 s).** "Datos reales, etiquetados; modelos transparentes; y funciona para cualquier zona del cráter cambiando una línea."
