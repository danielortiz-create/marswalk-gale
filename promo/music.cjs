// music.cjs — musica original del video (60 s o 30 s), sintetizada desde cero con Node. Sin muestras ni archivos externos.
// Uso: node promo/music.cjs  -> promo/out/music.wav
// 120 pulsos por minuto (1 compas = 2 s), re menor: Dm - Bb - F - C.
// Momentos sincronizados con la imagen: 10 s entra el ritmo, 22 y 38 s golpes, 44 s alerta solar, 50 s calma, 55 s cierre.
const fs = require('fs');
const path = require('path');

// Momentos de cada version (DUR=30 node promo/music.cjs -> out/music-30s.wav)
const DUR = +(process.env.DUR || 60);
const CUES = {
  60: { full: [[10, 44], [47.5, 50]], alert: [44, 47.5], heart: [5, 10], calm: [50, 55], end: 55, arp: [1.5, 57], up: [27.5, 38],
        risers: [[7.5, 10, 1], [20.5, 22, .7], [35.5, 38, 1], [46, 47.5, .8], [52.5, 55, 1.1]],
        hits: [[0, .6], [10, 1], [22, .8], [38, 1], [47.5, .7], [55, 1.3]],
        clicks: [11.4, 14.5, 17, 19.5, 21.1, 51.1, 51.48, 51.86, 52.24], alarm: [44, 0.5, 6], file: 'music.wav' },
  30: { full: [[4.5, 23.1], [24.9, 26.5]], alert: [23.1, 24.9], heart: [2, 4.5], calm: [26.5, 26.5], end: 26.5, arp: [0.5, 28], up: [14.5, 20.5],
        risers: [[3, 4.5, 1], [7.8, 9, .7], [13.3, 14.5, .8], [19.3, 20.5, 1], [24.3, 24.9, .7], [25.6, 26.5, 1.1]],
        hits: [[0, .6], [4.5, 1], [9, .7], [14.5, .8], [20.5, 1], [24.9, .6], [26.5, 1.3]],
        clicks: [9.8, 10.15, 10.5, 10.85], alarm: [23.1, 0.4, 4], file: 'music-30s.wav' },
}[DUR];
const SR = 44100, N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N), FX = new Float32Array(N);   // FX = envio a reverb
const BEAT = 0.5, BAR = 2;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

// pone una muestra en estereo (pan -1 izquierda .. 1 derecha) y parte en la reverb
function put(i, v, pan = 0, rev = 0) {
  if (i < 0 || i >= N) return;
  L[i] += v * (1 - pan) * 0.5 * 1.4; R[i] += v * (1 + pan) * 0.5 * 1.4; FX[i] += v * rev;
}
// volumen general de cada parte segun el momento del video
const between = (t, a, b) => t >= a && t < b;
const full = (t) => CUES.full.some(([a, b]) => between(t, a, b));     // ritmo completo
const alert = (t) => between(t, CUES.alert[0], CUES.alert[1]);

// ---------- acordes ----------
const CH = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]];
const ROOT = [38, 34, 41, 36];
const chordAt = (t) => Math.floor(t / BAR) % 4;

// ---------- pad: sierras desafinadas con filtro suave ----------
(function pad() {
  const ph = new Float64Array(12); let lp = 0, lp2 = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR, c = CH[chordAt(t)];
    let v = 0;
    for (let k = 0; k < 3; k++) for (let d = 0; d < 4; d++) {
      const j = k * 4 + d, f = hz(c[k] + (d === 3 ? 12 : 0)) * (1 + (d - 1.5) * 0.004);
      ph[j] = (ph[j] + f / SR) % 1; v += (ph[j] * 2 - 1) * (d === 3 ? 0.5 : 1);
    }
    let g = Math.min(1, t / (DUR === 30 ? 1.5 : 3)) * 0.05;           // entrada suave al principio
    if (t >= CUES.end) g = 0.07 * Math.exp(-(t - CUES.end) / 2.6);    // cierre: se apaga despacio
    if (between(t, CUES.calm[0], CUES.calm[1])) g = 0.065;
    const cut = 0.02 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.7)) + (full(t) ? 0.03 : 0);
    lp += cut * (v - lp); lp2 += cut * (lp - lp2);
    put(i, lp2 * g, Math.sin(t * 0.5) * 0.3, 0.5);
  }
})();

// ---------- arpegio de semicorcheas ----------
(function arp() {
  const PAT = [0, 1, 2, 3, 2, 1, 3, 4];
  for (let s = 0; s < DUR / (BEAT / 4); s++) {
    const [a0, a1] = CUES.arp, t0 = s * BEAT / 4; if (t0 < a0 || t0 >= a1) continue;
    const c = CH[chordAt(t0)], k = PAT[s % 8];
    const note = k < 3 ? c[k] + 12 : c[k - 3] + 24;
    const ramp = DUR === 30 ? 2 : 4;
    const f = hz(note + (between(t0, CUES.up[0], CUES.up[1]) ? 12 : 0)), vel = (s % 4 === 0 ? 1 : 0.65) * Math.min(1, (t0 - a0) / ramp);
    const len = 0.22 * SR, i0 = Math.floor(t0 * SR);
    for (let n = 0; n < len; n++) {
      const tt = n / SR, env = Math.exp(-tt * 18) * vel;
      const v = (Math.sin(2 * Math.PI * f * tt) + 0.35 * Math.sin(4 * Math.PI * f * tt + 0.3)) * env * 0.06;
      put(i0 + n, v, s % 2 ? 0.45 : -0.45, 0.35);
    }
  }
})();

// ---------- bombo, palmas y platillos ----------
function kick(t0, amp = 1) {
  const i0 = Math.floor(t0 * SR);
  for (let n = 0; n < 0.45 * SR; n++) {
    const tt = n / SR, f = 45 + 120 * Math.exp(-tt * 28);
    const ph = 2 * Math.PI * (45 * tt + (120 / 28) * (1 - Math.exp(-tt * 28)));
    put(i0 + n, Math.sin(ph) * Math.exp(-tt * 7) * 0.55 * amp + (n < 80 ? rnd() * 0.15 * amp : 0), 0, 0);
    void f;
  }
}
function clap(t0) {
  const i0 = Math.floor(t0 * SR); let hp = 0, prev = 0;
  for (let n = 0; n < 0.25 * SR; n++) {
    const tt = n / SR, x = rnd(); hp = 0.9 * (hp + x - prev); prev = x;
    const env = (tt < 0.03 ? (Math.floor(tt / 0.01) % 2 ? 0.6 : 1) : 1) * Math.exp(-tt * 16);
    put(i0 + n, hp * env * 0.16, 0.1, 0.4);
  }
}
function hat(t0, amp = 1) {
  const i0 = Math.floor(t0 * SR); let hp = 0, prev = 0;
  for (let n = 0; n < 0.06 * SR; n++) {
    const x = rnd(); hp = 0.5 * (hp + x - prev); prev = x;
    put(i0 + n, hp * Math.exp(-n / SR * 70) * 0.07 * amp, 0.35, 0.1);
  }
}
for (let b = 0; b < DUR / BEAT; b++) {
  const t = b * BEAT;
  if (full(t)) { kick(t); hat(t + BEAT / 2); if (b % 2 === 1) clap(t); hat(t + BEAT / 4, 0.4); hat(t + 3 * BEAT / 4, 0.4); }
  else if (alert(t) && b % 2 === 0) kick(t, 0.8);                    // en la alerta el ritmo va a la mitad
  else if (between(t, CUES.heart[0], CUES.heart[1]) && b % 4 === 0) kick(t, 0.45);          // latido antes de entrar
}

// ---------- bajo ----------
(function bass() {
  let ph = 0, lp = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR; if (!(full(t) || alert(t))) { lp *= 0.999; put(i, lp * 0.3, 0, 0); continue; }
    const f = hz(ROOT[chordAt(t)] + (Math.floor(t / (BEAT / 2)) % 4 === 3 ? 12 : 0));
    ph = (ph + f / SR) % 1;
    const step = (t % (BEAT / 2)) / (BEAT / 2), env = Math.exp(-step * 2.2);
    const v = (ph < 0.5 ? 1 : -1) * 0.6 + (ph * 2 - 1) * 0.4;
    lp += (0.04 + 0.08 * env) * (v - lp);
    // se agacha cuando suena el bombo (efecto de bombeo)
    const duck = 0.45 + 0.55 * Math.min(1, (t % BEAT) / 0.18);
    put(i, lp * 0.3 * duck, 0, 0);
  }
})();

// ---------- subidas de ruido (antes de cada cambio) y golpes ----------
function riser(a, b, amp = 1) {
  let lp = 0;
  for (let i = Math.floor(a * SR); i < b * SR; i++) {
    const u = (i / SR - a) / (b - a); lp += (0.01 + 0.35 * u * u) * (rnd() - lp);
    put(i, lp * u * u * 0.32 * amp, Math.sin(u * 20) * 0.5, 0.6);
  }
}
function impact(t0, amp = 1) {
  const i0 = Math.floor(t0 * SR); let lp = 0;
  for (let n = 0; n < 2.5 * SR; n++) {
    const tt = n / SR; lp += 0.08 * (rnd() - lp);
    const boom = Math.sin(2 * Math.PI * (32 * tt + 60 / 9 * (1 - Math.exp(-tt * 9)))) * Math.exp(-tt * 2.2);
    put(i0 + n, (boom * 0.7 + lp * Math.exp(-tt * 3) * 1.6) * amp, 0, 0.7);
  }
}
CUES.risers.forEach(([a, b, k]) => riser(a, b, k));
CUES.hits.forEach(([t0, k]) => impact(t0, k));
// chasquido digital en cada tarjeta de datos y etiqueta
CUES.clicks.forEach((t0) => {
  const i0 = Math.floor(t0 * SR);
  for (let n = 0; n < 0.12 * SR; n++) { const tt = n / SR; put(i0 + n, Math.sin(2 * Math.PI * 1760 * tt) * Math.exp(-tt * 40) * 0.08, 0.3, 0.5); }
});
// alarma suave de la alerta solar (dos tonos)
for (let k = 0; k < CUES.alarm[2]; k++) {
  const t0 = CUES.alarm[0] + k * CUES.alarm[1], f = k % 2 ? 660 : 880, i0 = Math.floor(t0 * SR);
  for (let n = 0; n < 0.22 * SR; n++) { const tt = n / SR; put(i0 + n, (Math.sin(2 * Math.PI * f * tt) > 0 ? 1 : -1) * Math.min(1, tt * 200) * Math.exp(-tt * 9) * 0.035, k % 2 ? 0.4 : -0.4, 0.4); }
}
// acorde final grande
(function finalChord() {
  const notes = [38, 50, 57, 62, 65, 69]; const i0 = CUES.end * SR;
  for (let n = 0; n < 5 * SR && i0 + n < N; n++) {
    const tt = n / SR; let v = 0;
    for (const m of notes) v += Math.sin(2 * Math.PI * hz(m) * tt) + 0.3 * Math.sin(4 * Math.PI * hz(m) * tt);
    put(i0 + n, v * Math.exp(-tt / 1.6) * 0.045, 0, 0.6);
  }
})();

// ---------- reverb sencilla (peines + pasa-todo) ----------
(function reverb() {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({ d, b: new Float32Array(d), i: 0, s: 0 }));
  const aps = [225, 556, 441].map((d) => ({ d, b: new Float32Array(d), i: 0 }));
  for (let n = 0; n < N; n++) {
    let o = 0;
    for (const c of combs) { const y = c.b[c.i]; c.s = y * 0.6 + c.s * 0.4; c.b[c.i] = FX[n] + c.s * 0.82; c.i = (c.i + 1) % c.d; o += y; }
    o /= combs.length;
    for (const a of aps) { const y = a.b[a.i]; const x = o + y * 0.5; a.b[a.i] = x; o = y - x * 0.5; a.i = (a.i + 1) % a.d; }
    L[n] += o * 0.55; R[n] += (n > 23 ? o : 0) * 0.55;
  }
})();

// ---------- mezcla final: limitador suave, fundido al final y WAV de 16 bits ----------
let peak = 0; for (let n = 0; n < N; n++) peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
const pre = 1.6 / peak;
for (let n = 0; n < N; n++) {
  const t = n / SR, fade = Math.min(1, t / 0.05, (DUR - t) / 1.5);
  const l = Math.tanh(L[n] * pre) * 0.89 * fade, r = Math.tanh(R[n] * pre) * 0.89 * fade;
  buf.writeInt16LE(Math.round(l * 32767), 44 + n * 4); buf.writeInt16LE(Math.round(r * 32767), 46 + n * 4);
}
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', CUES.file), buf);
console.log(CUES.file + ' listo · pico original', peak.toFixed(2));
