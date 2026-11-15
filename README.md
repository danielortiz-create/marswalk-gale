# Marswalk Gale

An integrated, layered 3D map to plan and carry out an astronaut walk (a "Marswalk") across the *boxwork* ridges of Mount Sharp, Gale Crater, Mars. It combines data from three NASA missions — **MRO**, **Mars Odyssey** and **Curiosity** — plus space weather from **DONKI**, and pairs the map with **TARS**, a proposed on-suit AI agent that guides the astronaut and watches their health.

**Live demo:** https://danielortiz-create.github.io/marswalk-gale/?lang=en
(The app opens in Spanish by default; `?lang=en`, or the ES | EN button in the header, switches the whole app to English.)

## Objective

Give an astronaut on Mars two things that do not exist together today:

1. **An integrated map** of the exact place where they will walk, used in the habitat to plan and in the helmet visor to carry out the walk.
2. **TARS**, a proposed AI agent that runs locally on the suit, guides the astronaut, watches their health and oxygen, and helps them decide when to turn back, without waiting for Earth. In this demo TARS is simulated.

Science question of the walk: *did groundwater flow through these fractures late in Mars' history?*

📄 **Full document:** [Project objective and scope](docs/project-objective.md) (the problem, the two parts of the objective, the science, what is real and what is concept, and what is in and out of scope).

**NASA data at a glance**

| Source | Kind | What we used |
|---|---|---|
| **MRO** (Mars Reconnaissance Orbiter), HiRISE camera | Satellite in orbit | 1,048,576 elevation points and a 16.8-million-pixel image |
| **Mars Odyssey**, THEMIS camera | Satellite in orbit | Day and night thermal mosaics |
| **Curiosity** rover: REMS, RAD, Navcam, traverse | Rover on the surface | 90 sols of weather, its radiation dose, 10 photos and 150 positions |
| **DONKI** (NASA space weather database) | Database | 33 space weather notifications |

In total: **2 satellites, 1 rover and 1 NASA database**, 8 datasets and about 22 MB of real data. Full details in [NASA data used](#nasa-data-used).

## How it answers the NASA challenge

| The challenge asks for | What Marswalk Gale does | Real data or simulated? |
|---|---|---|
| A specific site and science objective | Boxwork ridges of Mount Sharp, which Curiosity explored in 2025. Walk question: *did groundwater flow through these fractures late in Mars' history?* Each stop gets an objective and a field task based on whether it sits on a ridge, in a hollow or between them. | Site and terrain: real. Ridge/hollow: derived from the elevation model. Objective and task: our proposal. |
| At least three data types | Topographic (HiRISE DEM), optical (HiRISE orthophoto), thermal (THEMIS), atmospheric (REMS), radiation (RAD), space weather (DONKI), first-person images (Navcam) and Curiosity's traverse. | Real NASA data |
| An integrated, layered view | One 3D scene with six switchable layers (optical, elevation, slope, thermal, roughness, walk-back time), contour lines and Curiosity's path, each with opacity and legend. | Real data; slope, roughness and walk-back time are derived |
| Safety first: radiation and space weather | Radiation dose along the walk; a simulated solar alert that doubles the dose, pauses the walk and lets the astronaut choose between returning now or reaching the next stop, comparing time and margin. Choosing to return draws the way back. | Dose rate: real (RAD). Alert scenario: simulated. Times and margins: model. |
| Mobility in a suit, carrying equipment | Walking speed and metabolic cost depend on slope; the route avoids slopes over 15°. GO / NO-GO verdict only if there is always enough oxygen to walk back. | Model (parameters in `src/nav.js`) |
| A route that avoids obstacles | Automatic route (Dijkstra on a 4 m grid) that picks the best stop order and the safest path; stops can be added with a click. | Derived from real terrain |
| Formats: habitat screen, tablet, helmet HUD | Planner for the habitat screen and a first-person helmet view (HUD) with compass, oxygen, return time, margin, health and a minimap. | — |
| First-person images from surface missions | Real Curiosity Navcam photos at each stop: what the astronaut would see on arrival. | Real |
| Rovers or working in pairs | A crewmate (EV2) walks ahead of you in the helmet view; Curiosity and its real traverse are on the map. | — |
| Different from Mars Trek and USGS maps | Hyperlocal: a 2 × 2 km area with one million elevation points, built for a single walk, not a regional map. | Real |

## TARS: a proposed local AI agent for the suit

**The proposal.** TARS is an AI agent that would run **locally, on the suit's own computer**. It would not depend on Earth: a radio signal takes several minutes, and sometimes more than 20, to travel between Mars and Earth, too slow for decisions in the middle of a walk. On board, TARS would guide the astronaut along the route, watch their vital signs and oxygen, warn about slopes and hazards, and help decide when to turn back.

**In this demo TARS is simulated.** There is no AI model, no internet connection and no API key: everything runs in the browser, including on GitHub Pages. What you see shows how the agent would behave:

- **Simulated conversation in the helmet view (in English).** TARS talks with the astronaut (EV1), with two different voices and subtitles. It asks how they feel when their heart rate rises, warns about slopes of 10° or more in the next 40 m, says how far and how long is left to the habitat, and checks in at each stop. It speaks at 99 % oxygen and again at 95, 80, 70 and 60 %. While they talk, the walk slows to ×1. Script in `src/tars-dialog.js`.
- **Decision under a solar alert.** About 120 m before the first stop (or with the *Simulate solar alert* button) the walk pauses and TARS compares *Return now* with *Continue to the stop*: minutes to the habitat and oxygen margin on arrival for each option. If you return, the visor draws the way back and that stop's observation stays pending.
- **Return at a glance.** Next to the oxygen bar: *Return* time and *Margin on arrival*, in minutes (grams of O₂ appear on hover), plus a north-up minimap with your position, the habitat, the stops and the way back. Labels on the terrain show straight-line distance; the *Walking* row in the panel shows distance along the route.
- **Demo oxygen.** In the helmet view, oxygen drops quickly (1 % every 2 s, pausing while they talk) so an audience can follow it. It is labelled **SIM**: it is not the model estimate, which stays in the planner.
- **Astronaut health (simulated).** Heart rate, breathing, body temperature and effort. There are no real sensors: values come from a model driven by the effort of the route (`src/health.js`) and are labelled *Model*.
- **Commands in the planner.** Quick buttons or keywords ("status", "reserve 30 %", "environment", "health", "solar event", "return"). TARS runs the command and answers with the app's data.

**Voice input in the helmet view:** hold *Talk to TARS* or the `V` key, ask, and release. TARS answers on the visor and out loud. This works in Chrome and Edge; in other browsers, type the question. In Chrome, audio is sent to Google's servers for transcription.

## Run it locally

```bash
npm install
```

```bash
npm run dev
```

Open the address shown (usually `http://localhost:5173`). On computers without a graphics card, add `?malla=2` to the address for a lighter mesh.

To build the static site (`dist/` folder):

```bash
npm run build
```

## Features

**Intro**
- The first time the app opens, a ship lands next to the habitat; the ship and an astronaut explain the project in a few lines, with subtitles and voice.
- ES / EN button for the intro language (changes instantly) and *Skip intro* (or `Esc`). If you pick a different language here, the app reloads in that language at the end.
- To watch it again, press "?" in the header or add `?intro=1` to the address; `?intro=0` skips it.

**Language (ES | EN)**
- The ES | EN button in the planner header switches the WHOLE app (interface, TARS, helmet guidance and science objectives) between Spanish and English. Spanish is the default; the choice is remembered in the browser. Switching reloads the page; `?lang=en` or `?lang=es` also forces it. Texts live in `src/i18n.js`.

**Planner (inside the habitat)**
- Real 3D terrain of 2 × 2 km (one million elevation points).
- Six switchable layers with opacity and legend: optical, elevation, slope, thermal, roughness and walk-back time to the habitat; plus contour lines and Curiosity's real traverse.
- Automatic route: picks the best stop order and the safest path, avoiding steep slopes. Add your own stops with a click on the terrain.
- The layer card, the right panel and the route profile fold away with their arrow to leave more room for the terrain.
- Summary strip above the map: active stops, distance, duration, walk back and oxygen on arrival.
- Minimum oxygen reserve: if the plan does not meet it, stops are dropped until it does.
- Solar event scenario from any stop, with the way back as a dashed line.
- Walk budget: distance, duration, climb, energy, oxygen, radiation dose and a GO / NO-GO verdict based on whether there is always enough oxygen to walk back.
- Real Curiosity photos at each stop.
- Exports the terrain, route and habitat to a GLB file (for Blender or 3D printing).

**Science at each stop**
- Walk question: did groundwater flow through these fractures late in Mars' history?
- The app uses the terrain to work out whether each stop sits on a ridge, in a hollow or in between (label *Derived*).
- From that it proposes an objective and a task (label *Proposal*): a proposal by our team, not Curiosity results. They appear on the stop card and in TARS's guidance on the visor when you arrive, and they also work for stops added by hand. Texts in `src/science.js`.

**Helmet view (HUD)**
- Walk the route in first person with compass, oxygen, return time, margin on arrival, local solar time, dose, slope, health and distance to the next stop.
- Floating markers over the stops and the habitat; a crewmate walks ahead.
- Starts at ×10 speed; ×1, ×30 and ×120 are also available.

## NASA data used

| Type | Data | Mission / source | Amount used in the app |
|---|---|---|---|
| Topographic | MSL Gale Merged DEM, 1 m/pixel, v3 | MRO HiRISE (orbiter) · USGS Astrogeology | 1,048,576 elevation points (1024 × 1024 grid, one every 2 m) |
| Optical | MSL Gale Orthophoto Mosaic, 25 cm/pixel, v3 | MRO HiRISE (orbiter) · USGS Astrogeology | 16.8 million pixels (one 4096 × 4096 image) |
| Thermal | THEMIS IR Controlled Mosaics, day and night, 100 m/pixel | Mars Odyssey (orbiter) · NASA Mars Trek | 2 mosaics (day and night), 25 × 25 pixels each over the area (Mars Trek tiles at about 81 m/pixel) |
| Atmospheric | Temperature, pressure, UV and opacity per sol | Curiosity REMS (NASA/JPL-Caltech/CAB) | 90 sols of readings |
| Radiation | Surface dose 0.64 ± 0.12 mSv/day | Curiosity RAD · Hassler et al. 2014, *Science* | 1 published value |
| Space weather | CME, flare and storm notifications | NASA CCMC DONKI | 33 notifications |
| Images | Raw Navcam photos per sol | Curiosity · mars.nasa.gov | 10 photos at the stops |
| Traverse | Rover positions per sol | Curiosity · MMGIS waypoints | 150 positions |

From the elevation model the app also derives slope and roughness for 262,144 navigation cells (512 × 512 grid, 4 m each). In total the app loads about 22 MB of data: three products from two orbiters (MRO and Mars Odyssey), four datasets from the Curiosity rover, and DONKI space weather.

## What is data and what is model

Every element in the app carries a label: *Observation* (measured by an instrument), *Derived* (computed directly from a measurement), *Model* (an estimate) or *Proposal* (our team's suggestion).

- **Data:** elevation, orthophoto, thermal brightness, weather, radiation dose, DONKI notices, photos and traverse. Slope and roughness are computed directly from the DEM.
- **Model:** the astronaut's vital signs (simulated), walking speed, metabolic cost, oxygen use, return time and the GO / NO-GO verdict. Parameters are in `src/nav.js` (object `P`) and can be changed. The temperature in the helmet view is interpolated between the REMS minimum and maximum. Terrain colour is approximate (the orthophoto is greyscale).
- **Simulated:** TARS (no AI model runs in this demo), its conversation with the astronaut, the solar alert and the demo oxygen in the helmet view.
- **3D models** of the habitat, rover, astronauts, lander and Curiosity: conceptual, built from basic shapes.

## Known limitations

- No spectral layer (CRISM): we could not find a source at this scale. Roughness and walk-back time are included instead.
- The thermal layer is real but coarse: 25 × 25 pixels over the whole area.
- Radiation uses the published RAD value, not the reprocessed PDS file.
- DONKI observes from near Earth; it is not a forecast for Mars.
- The navigation grid is 4 m: it does not see individual rocks smaller than that.

## Rebuild the data

```bash
pip install rasterio scipy pillow numpy
```

```bash
python3 data-pipeline/fetch_data.py
```

```bash
python3 data-pipeline/build_layers.py
```

`fetch_data.py` downloads only the window it needs from the mosaics (which are tens of GB). For another area of Gale, change `BOXWORK_SOLS` or the centre in that file.

## Project structure

```
docs/               project objective and scope (for the judges)
data-pipeline/      Python scripts that prepare the data
public/data/        data ready for the app
src/terrain.js      3D mesh and layer shader
src/nav.js          routes (Dijkstra) and walk budget
src/models.js       3D models
src/main.js         interface: planner, TARS commands and helmet view
src/tars.js         simulated TARS: local replies and voice
src/tars-dialog.js  simulated TARS ↔ astronaut conversation in the helmet view
src/health.js       simulated astronaut health and TARS guidance
src/science.js      science objective for each stop
src/intro.js        animated intro (landing, ship and astronaut)
src/intro-text.js   intro texts in Spanish and English
src/i18n.js         app language (ES | EN) and the dictionary of all texts
tests/smoke.cjs     automated browser test
video/              scripts that build the presentation video
```

Code comments are in Spanish.

## 3-minute walkthrough for the judges

1. **The problem (20 s).** "Existing Mars maps are global. An astronaut heading out on foot needs a map of their own square kilometre, with everything in one place."
2. **The site (20 s).** "We chose the boxwork ridges of Mount Sharp, which Curiosity explored in 2025. They can tell us whether groundwater flowed late in Mars' history." Rotate the 3D terrain; point at the white line: Curiosity's real traverse.
3. **The layers (40 s).** Turn on slope, then thermal, then walk-back time. "Three missions in a single view: MRO, Odyssey and Curiosity."
4. **The route (30 s).** "The system picks the order of the stops and the safest path." Show that the route goes around the red areas. Add a stop with a click.
5. **Safety (20 s).** Point at the GO verdict, the oxygen and the dose. "At every moment we know whether there is enough oxygen to walk back."
6. **The helmet and TARS (40 s).** Start the walk. TARS, the proposed on-suit AI agent, checks on the astronaut's vitals. Near Boxwork 5 the solar alert goes off: TARS compares returning with continuing, you choose *Return*, and the visor draws the way back.
7. **Close (10 s).** "Real data, clearly labelled; transparent models; and an on-suit agent that keeps the astronaut safe without waiting for Earth."
