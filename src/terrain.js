// terrain.js — malla 3D del terreno real y shader que mezcla las capas de datos.
//
// Sistema de coordenadas del mundo (metros):
//   x = este,  z = sur,  y = arriba.  El centro del area es (0, 0).
//   y = elevacion real - elevacion de referencia (la del habitat).
import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec3 vW;
  void main() {
    vW = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tOrtho, tNormal, tSlope, tRough, tThermN, tThermD, tBack;
  uniform float oOrtho, oElev, oSlope, oTherm, oRough, oBack, uContours, uThermDay;
  uniform float uHalf, eMin, eMax, eRef, uBackReady;
  uniform vec3 uSun, uFogColor;
  uniform float uFogDensity;
  varying vec3 vW;

  // Paleta por tramos: interpola entre 5 colores
  vec3 ramp(float t, vec3 a, vec3 b, vec3 c, vec3 d, vec3 e) {
    t = clamp(t, 0.0, 1.0) * 4.0;
    if (t < 1.0) return mix(a, b, t);
    if (t < 2.0) return mix(b, c, t - 1.0);
    if (t < 3.0) return mix(c, d, t - 2.0);
    return mix(d, e, t - 3.0);
  }

  void main() {
    vec2 m = (vW.xz + uHalf) / (2.0 * uHalf);   // 0..1, (0,0) = esquina noroeste
    vec2 uv = vec2(m.x, 1.0 - m.y);             // imagenes cargadas con flipY
    float elev = vW.y + eRef;

    // Relieve sombreado con la posicion real del Sol
    vec3 n = normalize(texture2D(tNormal, uv).xyz * 2.0 - 1.0);
    float shade = 0.45 + 0.75 * max(dot(n, normalize(uSun)), 0.0);

    // Base: ortofoto HiRISE (gris) tenida con color marciano aproximado
    float g = texture2D(tOrtho, uv).r;
    vec3 orthoCol = mix(vec3(0.20, 0.11, 0.07), vec3(1.0, 0.80, 0.60), pow(g, 0.9));
    vec3 col = mix(vec3(0.62, 0.60, 0.58) * shade, orthoCol, oOrtho);

    // Topografia
    float te = (elev - eMin) / (eMax - eMin);
    vec3 cElev = ramp(te, vec3(0.13,0.20,0.55), vec3(0.15,0.60,0.65), vec3(0.55,0.78,0.35),
                          vec3(0.93,0.75,0.25), vec3(0.95,0.95,0.92));
    col = mix(col, cElev * shade, oElev);

    // Pendiente (grados): verde <10, amarillo 10-20, naranja 20-25, rojo >25
    float s = texture2D(tSlope, uv).r * 255.0 / 4.0;
    vec3 cSlope = s < 10.0 ? vec3(0.20, 0.72, 0.35)
                : s < 20.0 ? vec3(0.95, 0.85, 0.20)
                : s < 25.0 ? vec3(0.96, 0.52, 0.12) : vec3(0.85, 0.12, 0.15);
    col = mix(col, cSlope * (0.6 + 0.4 * shade), oSlope);

    // Termica THEMIS (brillo infrarrojo relativo, 100 m/pixel)
    float th = mix(texture2D(tThermN, uv).r, texture2D(tThermD, uv).r, uThermDay);
    vec3 cTh = ramp(th, vec3(0.02,0.01,0.20), vec3(0.42,0.06,0.45), vec3(0.80,0.25,0.30),
                        vec3(0.98,0.60,0.15), vec3(0.99,0.98,0.70));
    col = mix(col, cTh * (0.65 + 0.35 * shade), oTherm);

    // Rugosidad (0 a 0.5 m)
    float r = texture2D(tRough, uv).r;
    vec3 cR = ramp(pow(r, 0.6), vec3(0.27,0.00,0.33), vec3(0.23,0.32,0.55), vec3(0.13,0.57,0.55),
                       vec3(0.37,0.79,0.38), vec3(0.99,0.91,0.14));
    col = mix(col, cR * (0.65 + 0.35 * shade), oRough);

    // Tiempo de regreso a pie al habitat (minutos), con isocronas cada 10 min
    if (uBackReady > 0.5 && oBack > 0.0) {
      float mins = texture2D(tBack, m).r;
      vec3 cB;
      if (mins < 0.0) cB = vec3(0.25, 0.05, 0.30);            // inalcanzable
      else {
        cB = ramp(mins / 60.0, vec3(0.15,0.75,0.40), vec3(0.75,0.85,0.25), vec3(0.97,0.70,0.15),
                               vec3(0.92,0.35,0.15), vec3(0.70,0.10,0.20));
        float f = fract(mins / 10.0);
        float w = fwidth(mins / 10.0) * 1.5;
        cB *= 1.0 - 0.6 * (1.0 - smoothstep(0.0, w, min(f, 1.0 - f)));
      }
      col = mix(col, cB * (0.65 + 0.35 * shade), oBack);
    }

    // Curvas de nivel: finas cada 10 m, gruesas cada 50 m
    if (uContours > 0.5) {
      float f10 = fract(elev / 10.0), w10 = fwidth(elev / 10.0);
      float f50 = fract(elev / 50.0), w50 = fwidth(elev / 50.0);
      float l10 = 1.0 - smoothstep(0.0, w10 * 1.2, min(f10, 1.0 - f10));
      float l50 = 1.0 - smoothstep(0.0, w50 * 2.2, min(f50, 1.0 - f50));
      col = mix(col, vec3(0.05, 0.03, 0.02), max(l10 * 0.45, l50 * 0.85));
    }

    // Niebla de polvo (solo se nota en la vista de casco)
    float d = distance(cameraPosition, vW);
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
    col = mix(col, uFogColor, fog);
    gl_FragColor = vec4(col, 1.0);
  }`;

export async function loadTerrain(meta, eRef, stride = 1) {
  const N = meta.mesh_n;                 // 1024
  const size = meta.size_m;              // 2048 m
  const half = size / 2;
  const step = size / N;                 // 2 m

  // Alturas reales (16 bits) -> metros
  const buf = await (await fetch('data/height.bin')).arrayBuffer();
  const q = new Uint16Array(buf);
  const H = new Float32Array(N * N);
  const k = (meta.elev_max - meta.elev_min) / 65535;
  for (let i = 0; i < q.length; i++) H[i] = meta.elev_min + q[i] * k;

  // Geometria: un vertice por muestra del DEM (o uno de cada "stride" en modo ligero)
  const M = Math.floor((N - 1) / stride) + 1;
  const pos = new Float32Array(M * M * 3);
  for (let r = 0; r < M; r++) for (let c = 0; c < M; c++) {
    const i = (r * M + c) * 3, sr = r * stride, sc = c * stride;
    pos[i] = -half + (sc + 0.5) * step;
    pos[i + 1] = H[sr * N + sc] - eRef;
    pos[i + 2] = -half + (sr + 0.5) * step;
  }
  const idx = new Uint32Array((M - 1) * (M - 1) * 6);
  let p = 0;
  for (let r = 0; r < M - 1; r++) for (let c = 0; c < M - 1; c++) {
    const a = r * M + c, b = a + 1, d = a + M, e = d + 1;
    idx[p++] = a; idx[p++] = d; idx[p++] = b;
    idx[p++] = b; idx[p++] = d; idx[p++] = e;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();

  const loader = new THREE.TextureLoader();
  const tex = (url, smooth = true) => new Promise((res) => loader.load(url, (t) => {
    t.minFilter = smooth ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 8;
    res(t);
  }));
  const [tOrtho, tNormal, tSlope, tRough, tThermN, tThermD] = await Promise.all([
    tex('data/ortho.jpg'), tex('data/normal.png'), tex('data/slope.png', false),
    tex('data/rough.png'), tex('data/thermal_night.png'), tex('data/thermal_day.png'),
  ]);

  const uniforms = {
    tOrtho: { value: tOrtho }, tNormal: { value: tNormal }, tSlope: { value: tSlope },
    tRough: { value: tRough }, tThermN: { value: tThermN }, tThermD: { value: tThermD },
    tBack: { value: null }, uBackReady: { value: 0 },
    oOrtho: { value: 1 }, oElev: { value: 0 }, oSlope: { value: 0 }, oTherm: { value: 0 },
    oRough: { value: 0 }, oBack: { value: 0 }, uContours: { value: 0 }, uThermDay: { value: 0 },
    uHalf: { value: half }, eMin: { value: meta.elev_min }, eMax: { value: meta.elev_max },
    eRef: { value: eRef }, uSun: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
    uFogColor: { value: new THREE.Color(0xd2a679) }, uFogDensity: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;

  // Altura del terreno (y del mundo) en cualquier punto, interpolando entre muestras
  function heightAt(x, z) {
    let fc = (x + half) / step - 0.5, fr = (z + half) / step - 0.5;
    fc = Math.min(Math.max(fc, 0), N - 1.001); fr = Math.min(Math.max(fr, 0), N - 1.001);
    const c = Math.floor(fc), r = Math.floor(fr), u = fc - c, v = fr - r, i = r * N + c;
    return (H[i] * (1 - u) + H[i + 1] * u) * (1 - v) + (H[i + N] * (1 - u) + H[i + N + 1] * u) * v - eRef;
  }

  // Textura de "minutos de regreso al habitat" (la calcula nav.js)
  function setBackTexture(minutes, n) {
    const t = new THREE.DataTexture(minutes, n, n, THREE.RedFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    if (uniforms.tBack.value) uniforms.tBack.value.dispose();
    uniforms.tBack.value = t; uniforms.uBackReady.value = 1;
  }

  return { mesh, uniforms, heightAt, setBackTexture, H, N, size, half, step, tOrtho };
}
