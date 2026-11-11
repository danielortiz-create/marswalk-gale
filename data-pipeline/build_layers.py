"""
build_layers.py — convierte los datos crudos de NASA en archivos listos para la app web.

Entrada (carpeta raw/, creada por fetch_data.py):
  dem.tif, ortho.tif, aoi.json, MSL_waypoints.json
Ademas descarga aqui (pequenos):
  - Teselas THEMIS infrarrojo nocturno y diurno (Mars Odyssey) desde NASA Mars Trek
  - Clima REMS (Curiosity)        - Notificaciones DONKI (clima espacial)
  - Fotos crudas de Curiosity para cada parada cientifica

Salida (public/data/):
  meta.json  height.bin  normal.png  ortho.jpg  slope.png  rough.png
  thermal_night.png  thermal_day.png  nav_slope.bin  nav_rough.bin
  stops.json  traverse.json  weather.json  radiation.json  donki.json  pov/*.jpg

Uso:  python3 data-pipeline/build_layers.py
"""
import io, json, math, os, ssl, sys, urllib.request
import numpy as np
import rasterio
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "raw")
OUT = os.path.join(ROOT, "public", "data")
os.makedirs(os.path.join(OUT, "pov"), exist_ok=True)

R_MARS = 3396190.0          # radio usado por la proyeccion de los mosaicos (m)
MESH_N = 1024               # la malla 3D usa 1024x1024 puntos (2 m)
NAV_N = 512                 # la rejilla de navegacion usa 512x512 celdas (4 m)
BOXWORK_SOLS = (4600, 4900)

_ctx = ssl.create_default_context()
if os.path.exists("/root/.ccr/ca-bundle.crt"):
    _ctx.load_verify_locations("/root/.ccr/ca-bundle.crt")


def http_get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "marswalk-pipeline"})
    with urllib.request.urlopen(req, timeout=timeout, context=_ctx) as r:
        return r.read()


def save_gray(arr, name):
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name), optimize=True)


# ----------------------------------------------------------------------------
# 1. Terreno
# ----------------------------------------------------------------------------
def build_terrain():
    aoi = json.load(open(os.path.join(RAW, "aoi.json")))
    left, bottom, right, top = aoi["bounds"]
    dem = rasterio.open(os.path.join(RAW, "dem.tif")).read(1).astype(np.float64)
    n = dem.shape[0]
    zmin, zmax = float(dem.min()), float(dem.max())

    # Malla: promedio 2x2 -> 1024x1024, cuantizada a 16 bits
    f = n // MESH_N
    mesh = dem.reshape(MESH_N, f, MESH_N, f).mean(axis=(1, 3))
    q = np.round((mesh - zmin) / (zmax - zmin) * 65535).astype("<u2")
    q.tofile(os.path.join(OUT, "height.bin"))

    # Pendiente a escala de un caminante: suavizado ~2 m antes de derivar
    sm = ndi.gaussian_filter(dem, 1.5)
    gy, gx = np.gradient(sm, 1.0)          # gy: hacia el sur (filas), gx: hacia el este
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    save_gray(slope * 4.0, "slope.png")     # 1 nivel = 0.25 grados (tope 63.75)

    # Mapa de normales (para iluminar el relieve fino con el Sol)
    gy1, gx1 = np.gradient(ndi.gaussian_filter(dem, 0.7), 1.0)
    nx, ny, nz = -gx1, np.ones_like(gx1), -gy1   # x=este, y=arriba, z=sur
    ln = np.sqrt(nx**2 + ny**2 + nz**2)
    nrm = np.stack([nx / ln, ny / ln, nz / ln], axis=-1)
    Image.fromarray(np.round((nrm * 0.5 + 0.5) * 255).astype(np.uint8)).save(
        os.path.join(OUT, "normal.png"), optimize=True)

    # Rugosidad: desviacion del relieve respecto a su media local (ventana 5 m)
    local = ndi.uniform_filter(dem, 5)
    rough = np.sqrt(np.maximum(ndi.uniform_filter((dem - local) ** 2, 5), 0))
    save_gray(rough * 255.0 / 0.5, "rough.png")   # 255 = 0.5 m

    # Rejilla de navegacion (4 m): pendiente media y rugosidad media por celda
    g = n // NAV_N
    nav_slope = slope.reshape(NAV_N, g, NAV_N, g).mean(axis=(1, 3)).astype("<f4")
    nav_rough = rough.reshape(NAV_N, g, NAV_N, g).mean(axis=(1, 3)).astype("<f4")
    nav_slope.tofile(os.path.join(OUT, "nav_slope.bin"))
    nav_rough.tofile(os.path.join(OUT, "nav_rough.bin"))

    # Ortofoto
    ortho = rasterio.open(os.path.join(RAW, "ortho.tif")).read(1)
    Image.fromarray(ortho).save(os.path.join(OUT, "ortho.jpg"), quality=88)

    meta = {
        "size_m": aoi["size_m"], "mesh_n": MESH_N, "nav_n": NAV_N,
        "elev_min": zmin, "elev_max": zmax,
        "bounds_eqc": [left, bottom, right, top],
        "center_lon": math.degrees((left + right) / 2 / R_MARS),
        "center_lat": math.degrees((bottom + top) / 2 / R_MARS),
        "slope_scale": 4.0, "rough_max_m": 0.5,
        "sources": {
            "dem": "MSL Gale Merged DEM 1 m v3 — MRO HiRISE / USGS Astrogeology",
            "ortho": "MSL Gale Orthophoto Mosaic 25 cm v3 — MRO HiRISE / USGS Astrogeology",
            "thermal": "THEMIS IR Controlled Mosaics 100 m v2 — Mars Odyssey / NASA Mars Trek",
        },
    }
    print("Terreno: elevacion %.1f a %.1f m | pendiente media %.1f°, p95 %.1f°"
          % (zmin, zmax, slope.mean(), np.percentile(slope, 95)))
    return meta, dem, nav_slope


# ----------------------------------------------------------------------------
# 2. Capa termica THEMIS (Mars Odyssey) desde las teselas WMTS de Mars Trek
# ----------------------------------------------------------------------------
def build_thermal(meta):
    left, bottom, right, top = meta["bounds_eqc"]
    lon0, lon1 = math.degrees(left / R_MARS), math.degrees(right / R_MARS)
    lat0, lat1 = math.degrees(bottom / R_MARS), math.degrees(top / R_MARS)
    z = 9
    px_per_deg = (1024 * 256) / 360.0       # nivel 9: 1024 x 512 teselas de 256 px
    for kind, layer in (("night", "THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018"),
                        ("day", "THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018")):
        # margen de 2 px para interpolar bien en los bordes
        x0 = (lon0 + 180) * px_per_deg - 2; x1 = (lon1 + 180) * px_per_deg + 2
        y0 = (90 - lat1) * px_per_deg - 2;  y1 = (90 - lat0) * px_per_deg + 2
        tx0, tx1 = int(x0 // 256), int(x1 // 256)
        ty0, ty1 = int(y0 // 256), int(y1 // 256)
        mosaic = Image.new("L", ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
        for ty in range(ty0, ty1 + 1):
            for tx in range(tx0, tx1 + 1):
                url = ("https://trek.nasa.gov/tiles/Mars/EQ/%s/1.0.0/default/default028mm/%d/%d/%d.png"
                       % (layer, z, ty, tx))
                tile = Image.open(io.BytesIO(http_get(url))).convert("L")
                mosaic.paste(tile, ((tx - tx0) * 256, (ty - ty0) * 256))
        box = (x0 + 2 - tx0 * 256, y0 + 2 - ty0 * 256, x1 - 2 - tx0 * 256, y1 - 2 - ty0 * 256)
        crop = mosaic.resize((512, 512), Image.BICUBIC, box=box)
        a = np.asarray(crop).astype(np.float32)
        native = np.asarray(mosaic.crop(tuple(int(round(v)) for v in box)))
        print("THEMIS %s: %dx%d px nativos, brillo %d-%d" %
              (kind, native.shape[1], native.shape[0], native.min(), native.max()))
        meta["thermal_%s_range" % kind] = [int(native.min()), int(native.max())]
        # estirar contraste al rango local para que se vea la variacion
        lo, hi = np.percentile(a, 1), np.percentile(a, 99)
        save_gray((a - lo) / max(hi - lo, 1) * 255, "thermal_%s.png" % kind)


# ----------------------------------------------------------------------------
# 3. Recorrido de Curiosity, paradas cientificas y habitat
# ----------------------------------------------------------------------------
def build_stops(meta, dem, nav_slope):
    left, bottom, right, top = meta["bounds_eqc"]
    size = meta["size_m"]
    wps = json.load(open(os.path.join(RAW, "MSL_waypoints.json")))["features"]

    def local(p):   # metros desde la esquina noroeste: x al este, y al sur
        return p["easting"] - left, top - p["northing"]

    def elev(x, y):
        return float(dem[min(int(y), dem.shape[0] - 1), min(int(x), dem.shape[1] - 1)])

    trav = []
    for w in wps:
        p = w["properties"]
        x, y = local(p)
        if 0 <= x < size and 0 <= y < size:
            trav.append({"sol": p["sol"], "x": round(x, 1), "y": round(y, 1)})
    json.dump(trav, open(os.path.join(OUT, "traverse.json"), "w"))
    print("Recorrido de Curiosity dentro del area: %d puntos, soles %d-%d"
          % (len(trav), trav[0]["sol"], trav[-1]["sol"]))

    box = [t for t in trav if BOXWORK_SOLS[0] <= t["sol"] <= BOXWORK_SOLS[1]]
    # distancia acumulada, para elegir 5 paradas bien repartidas
    d = [0.0]
    for a, b in zip(box, box[1:]):
        d.append(d[-1] + math.hypot(b["x"] - a["x"], b["y"] - a["y"]))
    stops = []
    for k in range(5):
        target = d[-1] * (k + 0.5) / 5
        i = int(np.argmin([abs(v - target) for v in d]))
        t = box[i]
        stops.append({"id": "S%d" % (k + 1), "sol": t["sol"], "x": t["x"], "y": t["y"],
                      "elev": round(elev(t["x"], t["y"]), 1)})

    # Habitat: el parche mas llano (ventana ~60 m) a 350-650 m del centro de las paradas
    cx = np.mean([s["x"] for s in stops]); cy = np.mean([s["y"] for s in stops])
    cell = size / NAV_N
    flat = ndi.uniform_filter(nav_slope.astype(np.float64), 15)
    worst = ndi.maximum_filter(nav_slope, 9)
    yy, xx = np.mgrid[0:NAV_N, 0:NAV_N]
    dist = np.hypot((xx + 0.5) * cell - cx, (yy + 0.5) * cell - cy)
    score = flat + worst * 0.5
    score[(dist < 350) | (dist > 650)] = 1e9
    edge = 20
    score[:edge, :] = score[-edge:, :] = 1e9; score[:, :edge] = score[:, -edge:] = 1e9
    hy, hx = np.unravel_index(np.argmin(score), score.shape)
    hab = {"x": round((hx + 0.5) * cell, 1), "y": round((hy + 0.5) * cell, 1)}
    hab["elev"] = round(elev(hab["x"], hab["y"]), 1)
    hab["mean_slope_deg"] = round(float(flat[hy, hx]), 1)
    print("Habitat en (%.0f, %.0f), pendiente media del parche %.1f°" % (hab["x"], hab["y"], hab["mean_slope_deg"]))
    return {"habitat": hab, "stops": stops}


# ----------------------------------------------------------------------------
# 4. Fotos reales de Curiosity para cada parada
# ----------------------------------------------------------------------------
def build_pov(plan):
    api = ("https://mars.nasa.gov/api/v1/raw_image_items/?order=sol+desc&per_page=100&page=%d"
           "&condition_1=msl:mission&condition_2=%d:sol:gte&condition_3=%d:sol:lte")
    for s in plan["stops"]:
        s["photos"] = []
        for dsol in (0, 1, -1, 2, -2, 3):
            sol = s["sol"] + dsol
            items = []
            for page in range(4):
                try:
                    got = json.loads(http_get(api % (page, sol, sol))).get("items", [])
                except Exception as e:
                    print("  aviso: fallo la consulta de imagenes sol", sol, e); got = []
                items += got
                if len(got) < 100:
                    break
            def ok(it, inst):
                return (it["instrument"] in inst and it.get("extended", {}).get("sample_type") == "full"
                        and not it.get("is_thumbnail"))
            mast = [it for it in items if ok(it, ("MAST_LEFT", "MAST_RIGHT"))]
            nav = [it for it in items if ok(it, ("NAV_LEFT_B", "NAV_RIGHT_B", "NAV_LEFT_A", "NAV_RIGHT_A"))]
            # Primero 2 Navcam (vista amplia del paisaje) y luego, si hay una buena, 1 Mastcam.
            # "Mejor" = bien expuesta y sin zonas negras (se descartan recortes parciales).
            def fetch(it):
                try:
                    return Image.open(io.BytesIO(http_get(it["https_url"]))).convert("RGB")
                except Exception as e:
                    print("  aviso: no se pudo bajar", it["https_url"], e); return None
            def quality(img):
                g = np.asarray(img.convert("L").resize((96, 96))).astype(float)
                return (g > 25).mean() * min(g.std() / 40.0, 1.0) * (1.0 if img.width >= img.height else 0.6)
            chosen = []
            for group, want, tries in ((nav, 2, 8), (mast, 1, 8)):
                if not group:
                    continue
                idx = sorted(set(np.linspace(0, len(group) - 1, min(tries, len(group))).astype(int)))
                cands = []
                for i in idx:
                    img = fetch(group[i])
                    if img is not None and min(img.size) >= 400:
                        cands.append((quality(img), group[i], img))
                cands.sort(key=lambda c: -c[0])
                chosen += [c for c in cands[:want] if c[0] > 0.6]
            for _, it, img in chosen:
                img.thumbnail((1280, 1280))
                name = "pov/%s_%s.jpg" % (s["id"], it["imageid"])
                img.save(os.path.join(OUT, name), quality=85)
                s["photos"].append({"file": name, "sol": it["sol"], "instrument": it["instrument"],
                                    "date": it["date_taken"], "credit": it.get("image_credit") or "NASA/JPL-Caltech",
                                    "source": it["https_url"]})
            if s["photos"]:
                break
        print("Parada %s (sol %d): %d fotos" % (s["id"], s["sol"], len(s["photos"])))


# ----------------------------------------------------------------------------
# 5. Clima (REMS), radiacion (RAD) y clima espacial (DONKI)
# ----------------------------------------------------------------------------
def build_environment():
    path = os.path.join(RAW, "rems_weather.json")
    if not os.path.exists(path):
        open(path, "wb").write(http_get(
            "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json", 120))
    soles = json.load(open(path))["soles"]

    def num(v):
        try: return float(v)
        except Exception: return None
    keep = ["sol", "terrestrial_date", "ls", "min_temp", "max_temp", "min_gts_temp", "max_gts_temp",
            "pressure", "atmo_opacity", "sunrise", "sunset", "local_uv_irradiance_index"]
    rows = []
    for s in soles[:90]:
        r = {k: s.get(k) for k in keep}
        for k in ("min_temp", "max_temp", "min_gts_temp", "max_gts_temp", "pressure"):
            r[k] = num(r[k])
        r["sol"] = int(r["sol"]); r["ls"] = num(r["ls"])
        rows.append(r)
    json.dump({"source": "REMS (Rover Environmental Monitoring Station), Curiosity — NASA/JPL-Caltech/CAB(CSIC-INTA)",
               "note": "Medido en la posicion del rover dentro del crater Gale.",
               "latest": rows[0], "history": rows}, open(os.path.join(OUT, "weather.json"), "w"))
    print("REMS: ultimo sol %d (%s): aire %s a %s °C, %s Pa" %
          (rows[0]["sol"], rows[0]["terrestrial_date"], rows[0]["min_temp"], rows[0]["max_temp"], rows[0]["pressure"]))

    # Radiacion: valores PUBLICADOS medidos por RAD (no se reprocesa el archivo PDS)
    json.dump({
        "gcr_dose_equivalent_mSv_per_day": 0.64,
        "gcr_dose_equivalent_uncertainty": 0.12,
        "gcr_dose_rate_mGy_per_day": 0.21,
        "source": "RAD (Radiation Assessment Detector), Curiosity. Hassler et al. 2014, Science 343, 1244797: "
                  "dosis equivalente por rayos cosmicos galacticos en la superficie de Gale, 0.64 ± 0.12 mSv/dia.",
        "sep_event_note": "Durante la tormenta solar de septiembre de 2017, RAD midio en superficie una tasa de dosis "
                          "de aproximadamente el doble de la habitual durante unos dos dias (Zeitlin et al. 2018, GRL).",
        "career_limit_mSv": 600,
        "career_limit_source": "NASA-STD-3001 Vol. 1 Rev. B (2022): limite de carrera de 600 mSv.",
    }, open(os.path.join(OUT, "radiation.json"), "w"), ensure_ascii=False)

    path = os.path.join(RAW, "donki.json")
    try:
        notes = json.load(open(path))
    except Exception:
        notes = []
    out = []
    for n in notes:
        body = n.get("messageBody", "")
        summary = body.split("## Summary:")[-1].strip().split("\n\n")
        text = " ".join(" ".join(summary[:2]).split())[:320]
        out.append({"type": n["messageType"], "id": n["messageID"], "time": n["messageIssueTime"],
                    "url": n["messageURL"], "summary": text})
    out.sort(key=lambda r: r["time"], reverse=True)
    json.dump({"source": "NASA CCMC DONKI (Space Weather Database Of Notifications, Knowledge, Information)",
               "fetched": out[0]["time"] if out else None, "notifications": out},
              open(os.path.join(OUT, "donki.json"), "w"), ensure_ascii=False)
    print("DONKI: %d notificaciones guardadas" % len(out))


def main():
    meta, dem, nav_slope = build_terrain()
    build_thermal(meta)
    plan = build_stops(meta, dem, nav_slope)
    if "--no-photos" not in sys.argv:
        build_pov(plan)
    else:
        for s in plan["stops"]: s["photos"] = []
    json.dump(plan, open(os.path.join(OUT, "stops.json"), "w"), ensure_ascii=False, indent=1)
    build_environment()
    json.dump(meta, open(os.path.join(OUT, "meta.json"), "w"), ensure_ascii=False, indent=1)
    print("Listo. Archivos en", OUT)


if __name__ == "__main__":
    main()
