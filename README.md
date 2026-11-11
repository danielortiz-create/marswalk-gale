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

## Qué hace

**Planificador (dentro del hábitat)**
- Terreno 3D real de 2 × 2 km (un millón de puntos de elevación).
- Seis capas activables con opacidad y leyenda: óptica, elevación, pendiente, térmica, rugosidad y tiempo de regreso a pie al hábitat; más curvas de nivel y el recorrido real de Curiosity.
- Ruta automática: elige el mejor orden de paradas y el camino más seguro, evitando pendientes. Puedes añadir paradas propias con un clic en el terreno.
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

La app marca cada elemento con una etiqueta verde ("dato NASA") o amarilla ("modelo").

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
src/main.js      interfaz: planificador y vista de casco
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
