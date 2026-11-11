"""
fetch_data.py — descarga SOLO la ventana que necesitamos de los mosaicos de NASA/USGS.

Fuentes (datos reales):
  - DEM de Gale 1 m/pixel  (MRO HiRISE, USGS Astrogeology, MSL_Gale_DEM_Mosaic_1m_v3)
  - Ortofoto de Gale 25 cm (MRO HiRISE, USGS Astrogeology, MSL_Gale_Orthophoto_Mosaic_25cm_v3)
  - Recorrido de Curiosity (MSL waypoints, mars.nasa.gov MMGIS)

Los mosaicos pesan decenas de GB; aqui leemos por "range requests" solo el
recorte del area boxwork de Monte Sharp.

Uso:  python3 data-pipeline/fetch_data.py
"""
import json, os, sys, urllib.request
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from rasterio.enums import Resampling

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "raw")
os.makedirs(RAW, exist_ok=True)

BASE = "/vsicurl/https://planetarymaps.usgs.gov/mosaic/Mars/MSL/"
DEM_URL = BASE + "MSL_Gale_DEM_Mosaic_1m_v3.tif"
ORTHO_URL = BASE + "MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif"
WAYPOINTS_URL = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json"

SIZE_M = 2048            # lado del area de estudio en metros
BOXWORK_SOLS = (4600, 4900)   # soles en que Curiosity exploro las crestas boxwork

# Ajustes de GDAL para leer rapido por HTTP
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("CPL_VSIL_CURL_CHUNK_SIZE", "4194304")
os.environ.setdefault("CPL_VSIL_CURL_CACHE_SIZE", "536870912")
os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "5")
os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "2")


def get_waypoints():
    path = os.path.join(RAW, "MSL_waypoints.json")
    if not os.path.exists(path):
        urllib.request.urlretrieve(WAYPOINTS_URL, path)
    return json.load(open(path))["features"]


def main():
    wps = get_waypoints()
    box = [w["properties"] for w in wps
           if BOXWORK_SOLS[0] <= w["properties"]["sol"] <= BOXWORK_SOLS[1]]
    cx = round(float(np.mean([p["easting"] for p in box])))
    cy = round(float(np.mean([p["northing"] for p in box])))
    half = SIZE_M // 2
    bounds = (cx - half, cy - half, cx + half, cy + half)  # left, bottom, right, top
    print("Centro del area (este, norte):", cx, cy, "| limites:", bounds)

    # --- DEM a 1 m ---
    with rasterio.open(DEM_URL) as src:
        win = from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
        dem = src.read(1, window=win)
        prof = src.profile.copy()
        prof.update(width=dem.shape[1], height=dem.shape[0],
                    transform=src.window_transform(win), compress="deflate",
                    tiled=True, blockxsize=256, blockysize=256)
        prof.pop("blockxsize", None) if False else None
        with rasterio.open(os.path.join(RAW, "dem.tif"), "w", **prof) as dst:
            dst.write(dem, 1)
    valid = dem[dem > -30000]
    print("DEM", dem.shape, "elevacion min/max:", float(valid.min()), float(valid.max()),
          "| sin dato:", int((dem <= -30000).sum()))

    # --- Ortofoto: 4096 px (50 cm/pixel, remuestreada desde 25 cm) ---
    out = int(os.environ.get("ORTHO_PX", "4096"))
    with rasterio.open(ORTHO_URL) as src:
        win = from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
        ortho = src.read(1, window=win, out_shape=(out, out), resampling=Resampling.average)
        prof = dict(driver="GTiff", dtype="uint8", count=1, width=out, height=out,
                    crs=src.crs, compress="deflate",
                    transform=rasterio.transform.from_bounds(*bounds, out, out))
        with rasterio.open(os.path.join(RAW, "ortho.tif"), "w", **prof) as dst:
            dst.write(ortho, 1)
    print("Ortofoto", ortho.shape, "min/max:", int(ortho.min()), int(ortho.max()))

    json.dump({"center_easting": cx, "center_northing": cy, "size_m": SIZE_M,
               "bounds": bounds}, open(os.path.join(RAW, "aoi.json"), "w"))


if __name__ == "__main__":
    sys.exit(main())
