# Marswalk Gale: project objective and scope

[← Back to the README](../README.md) · [Live demo](https://danielortiz-create.github.io/marswalk-gale/?lang=en)

## Objective

Give an astronaut on Mars two things that do not exist together today: an integrated map of the exact place where they are going to walk, and an artificial intelligence agent that stays with them in the suit for the whole walk.

The project answers the NASA challenge to build a layered view of a place on the Martian surface, using data from several science missions, that helps plan and carry out a safe walk while doing science along the way.

## The problem

Available Mars maps, such as Mars Trek, are built for regional or global views. Someone heading out on foot needs the opposite: their own two kilometres, with the terrain, the risk, the oxygen and the way back on a single screen. On top of that, Earth is several minutes away by radio, and sometimes more than 20, so the astronaut cannot wait for mission control to answer every decision.

## The two parts of the objective

### 1. The integrated map

A 3D map, 2 × 2 km, of the boxwork ridges of Mount Sharp in Gale Crater, the area the Curiosity rover explored in 2025. It is used at two moments:

- **In the habitat, to plan:** data layers, stop order, safest route, and an oxygen, time and radiation budget with a GO or NO-GO verdict.
- **In the helmet visor, to carry out the walk:** heading, oxygen, return time and margin, next stop, a minimap, and the real photo Curiosity took at that spot.

### 2. TARS, the AI agent that looks after the crew member

TARS is a **proposed local AI agent that runs on the suit itself**. Its job is to look after the crew member and help them complete the mission without depending on Earth:

- **Guides:** says where to go, how far is left and how to step on slopes.
- **Watches health:** heart rate, breathing, body temperature and effort, and says when to slow down.
- **Watches resources:** oxygen left and whether there is still enough to walk back with a reserve.
- **Reacts to hazards:** during a solar alert it compares returning now with continuing to the next stop, and if the astronaut returns it works out the fastest way back to the habitat.
- **Replans on request:** change the oxygen reserve, drop or add a stop.
- **Keeps the science in mind:** at each stop it shows which sample to take and why.
- **Talks by voice**, so the astronaut keeps their hands free.

## Science objective of the walk

The question behind the walk: **did groundwater flow through these fractures late in Mars' history?** Each stop gets a task based on the terrain: a rock sample on a ridge, a soil sample in a hollow, or a record of the contact between the two.

## NASA data combined

From **2 satellites in orbit** (MRO and Mars Odyssey), **1 rover on the surface** (Curiosity) and **1 NASA database** (DONKI): 8 datasets, about 22 MB.

| Data type | Source | What it is used for |
|---|---|---|
| Topographic | MRO HiRISE, 1 m/pixel | Relief, slope and roughness of the terrain |
| Optical | MRO HiRISE orthophoto | What the ground really looks like |
| Thermal | Mars Odyssey THEMIS | Telling solid rock from loose material |
| Atmospheric | Curiosity REMS | Temperature, pressure and ultraviolet radiation |
| Radiation | Curiosity RAD | Dose received during the walk |
| Space weather | NASA DONKI | Solar activity notifications |
| Images and traverse | Curiosity Navcam and rover positions | What the astronaut will see at each stop |

Amounts used from each source are listed in the [README](../README.md#nasa-data-used).

## What is real and what is concept in the demo

The project labels every value as *Observation*, *Derived*, *Model* or *Proposal*, and never presents an estimate as a measurement. Following the same rule:

- **Real measurements:** terrain, orthophoto, thermal image, weather, radiation, solar notifications, and Curiosity's photos and traverse.
- **Model estimates:** walking speed, oxygen, times and the GO or NO-GO verdict.
- **Simulated:** the astronaut's health (there are no sensors; values come from the effort of the route), the solar alert, and the fast-dropping demo oxygen in the helmet view (labelled SIM).
- **TARS is simulated in this demo.** No AI model runs: its conversation with the astronaut is scripted and its answers in the planner are built from the app's own data. Everything works offline in the browser. Running a real AI model inside the suit is the concept of the mission, not something the demo does today.
- **The science objectives per stop** are a proposal by our team, not Curiosity results.

## Project scope

The scope is a working demonstration for the challenge, not an operational tool.

**Included:**

- 3D planner with layers, automatic route and walk budget.
- Helmet view with TARS, simulated health, voice guidance, a minimap, and return time and margin at a glance.
- Solar alert scenario where the astronaut decides between returning and continuing, with the way back drawn on the visor.
- Animated intro that explains the project.
- Full interface in Spanish and English.

**Out of scope:**

- Real biometric sensors and an AI model actually running in the suit.
- A spectral or chemical layer: no source was found at this scale.
- Rocks smaller than 4 metres: the navigation grid cannot see them.
- Using the rover in the plan, and a tablet version.

## Delivery

- Link to the GitHub repository, with the public page.
- Presentation video.
