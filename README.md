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

## TARS, el agente de IA del traje

En la misión que imaginamos, TARS es un agente de IA local que corre en el propio traje: da indicaciones al astronauta mientras camina y vigila su salud, sin depender de la Tierra.

En esta demostración **TARS es una simulación**: no hay IA, ni conexión, ni clave de API. Todo funciona dentro del navegador, también en GitHub Pages.

- **Diálogo simulado en la vista de casco (en inglés):** TARS habla con el astronauta (EV1), con dos voces distintas y subtítulos. Le pregunta cómo se siente cuando sube el pulso, le avisa de las pendientes de 10° o más en los próximos 40 m, le dice cuánto falta por recorrer y le acompaña en cada parada. Empieza al 99 % de oxígeno y vuelve a hablar al 95, 80, 70 y 60 %. Mientras hablan, la caminata baja a ×1. Guion en `src/tars-dialog.js`.
- **Oxígeno de demostración:** en el casco el oxígeno baja deprisa (1 % cada 2 s, y se detiene mientras hablan) para que el público lo vea, y lleva la etiqueta «SIM». No es la estimación del modelo, que sigue en el planificador.
- **Salud del astronauta (simulada):** pulso, respiración, temperatura corporal y esfuerzo. No hay sensores reales: son un modelo calculado a partir del esfuerzo de la ruta (`src/health.js`) y van etiquetados como «Modelo».
- **Órdenes en el planificador:** botones rápidos o palabras clave («estado», «reserva 30 %», «entorno», «salud», «evento solar», «volver»). TARS ejecuta la orden y responde con los datos de la app.

**Voz en la vista de casco:** mantén pulsado «Hablar con TARS» o la tecla `V`, pregunta, y suelta. TARS responde en el visor y en voz alta. Funciona en Chrome y Edge; en otros navegadores se escribe la pregunta. En Chrome, el audio se envía a los servidores de Google para transcribirlo.

## Qué hace

**Introducción**
- La primera vez que se abre la app, una nave aterriza junto al hábitat; la nave y un astronauta explican el proyecto en unas pocas frases, con subtítulos y voz.
- Botón ES / EN para el idioma de la introducción (cambia al instante) y botón «Saltar introducción» (o tecla `Esc`). Si eliges otro idioma aquí, al terminar la app se recarga en ese idioma.
- Para volver a verla, pulsa «?» en la cabecera o añade `?intro=1` a la dirección; `?intro=0` la omite.

**Idioma (ES | EN)**
- Un botón ES | EN en la cabecera del planificador cambia TODA la app (interfaz, TARS por texto y voz, indicaciones del casco y objetivos científicos) entre español e inglés. El español es el idioma por defecto; la elección se recuerda en el navegador. Cambiar de idioma recarga la página; también se puede forzar con `?lang=en` o `?lang=es` en la dirección. Los textos están en `src/i18n.js`.

**Planificador (dentro del hábitat)**
- Terreno 3D real de 2 × 2 km (un millón de puntos de elevación).
- Seis capas activables con opacidad y leyenda: óptica, elevación, pendiente, térmica, rugosidad y tiempo de regreso a pie al hábitat; más curvas de nivel y el recorrido real de Curiosity.
- Ruta automática: elige el mejor orden de paradas y el camino más seguro, evitando pendientes. Puedes añadir paradas propias con un clic en el terreno.
- Las tarjetas de capas, el panel derecho y el perfil de la ruta se pliegan con su flecha para dejar más sitio al terreno.
- Franja de resumen sobre el mapa: paradas activas, distancia, duración, regreso y oxígeno al llegar.
- Reserva mínima de oxígeno: si el plan no la cumple, omite paradas hasta cumplirla.
- Escenario de evento solar desde cualquier parada, con la ruta de regreso en línea discontinua.
- Presupuesto de la caminata: distancia, duración, desnivel, energía, oxígeno, dosis de radiación y un veredicto GO / NO-GO según si siempre queda oxígeno para volver a pie.
- Fotos reales de Curiosity en cada parada: lo que el astronauta verá al llegar.
- Exporta el terreno, la ruta y el hábitat a un archivo GLB (para Blender o impresión 3D).

**Ciencia en cada parada**
- Pregunta de la caminata: ¿circuló agua subterránea por estas fracturas tarde en la historia de Marte?
- La app calcula con el terreno si cada parada está sobre una cresta, en un hueco o entre ambos (etiqueta «Derivado»).
- Según eso propone un objetivo y una tarea (etiqueta «Propuesta»): son una propuesta del equipo, no resultados de Curiosity. Se ven en la tarjeta de la parada, TARS los dice al llegar y sirven también para las paradas añadidas a mano. Textos en `src/science.js`.

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
- **Modelo:** constantes vitales del astronauta (simuladas), velocidad de marcha, gasto metabólico, consumo de oxígeno, tiempo de regreso y veredicto GO / NO-GO. Los parámetros están en `src/nav.js` (objeto `P`) y se pueden cambiar. La temperatura mostrada en el casco es una interpolación entre el mínimo y el máximo de REMS. El color del terreno es aproximado (la ortofoto es en escala de grises).
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
src/tars.js      TARS simulado: respuestas locales y voz
src/tars-dialog.js  diálogo simulado TARS ↔ astronauta en el casco (en inglés)
src/health.js    salud simulada del astronauta e indicaciones automáticas de TARS
src/science.js   objetivo científico de cada parada
src/intro.js     introducción animada (aterrizaje, nave y astronauta)
src/intro-text.js  textos de la introducción en español e inglés
src/i18n.js      idioma de la app (ES | EN) y diccionario de todos los textos
tests/smoke.cjs  prueba automática en navegador
video/           scripts que generan el vídeo de presentación
```

## Guion de 3 minutos para el jurado

1. **El problema (20 s).** "Los mapas de Marte que existen son globales. Un astronauta que sale a caminar necesita uno de su kilómetro cuadrado, con todo junto."
2. **El lugar (20 s).** "Elegimos las crestas boxwork de Monte Sharp, que Curiosity exploró en 2025. Pueden decirnos si hubo agua subterránea tarde en la historia de Marte." Gira el terreno 3D; señala la línea blanca: el recorrido real de Curiosity.
3. **Las capas (40 s).** Activa pendiente, luego térmica, luego regreso a pie. "Tres misiones en una sola vista: MRO, Odyssey y Curiosity."
4. **La ruta (40 s).** "El sistema elige el orden de las paradas y el camino más seguro." Muestra que la ruta rodea las zonas rojas. Baja la pendiente máxima y enseña cómo cambia. Añade una parada con un clic.
5. **La seguridad (30 s).** Señala el veredicto GO, el oxígeno y la dosis. "En todo momento sabemos si queda oxígeno para volver a pie."
6. **El casco (30 s).** Inicia la caminata. Al llegar a una parada aparece la foto real de Curiosity. Pulsa "Simular alerta solar": la ruta cambia hacia el hábitat.
7. **Cierre (10 s).** "Datos reales, etiquetados; modelos transparentes; y funciona para cualquier zona del cráter cambiando una línea."
