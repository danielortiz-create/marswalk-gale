# music.py — musica original para el video, generada con numeros (sin derechos de terceros).
# Uso:  python3 video/music.py   ->  video/out/music.wav
#
# Es una pieza ambiental sencilla: acordes largos y suaves, un bajo, un pulso lento
# y unas notas agudas con eco que entran a mitad del video.
import os
import wave
import numpy as np

SR = 44100            # muestras por segundo
DUR = 82.0            # duracion en segundos (el video dura 80)
BEAT = 60 / 72        # 72 pulsos por minuto
rng = np.random.default_rng(7)
t = np.arange(int(SR * DUR)) / SR
L = np.zeros_like(t)
R = np.zeros_like(t)


def freq(midi):
    """Numero de nota MIDI -> frecuencia en Hz."""
    return 440.0 * 2 ** ((midi - 69) / 12)


def add(sig, start, pan=0.0, gain=1.0):
    """Suma un sonido a la mezcla en el segundo `start`. pan: -1 izquierda, 1 derecha."""
    i = int(start * SR)
    if i >= len(t):
        return
    sig = sig[: len(t) - i] * gain
    L[i:i + len(sig)] += sig * (1 - pan) / 2
    R[i:i + len(sig)] += sig * (1 + pan) / 2


def env(n, attack, release):
    """Envolvente: sube en `attack` segundos y baja en `release` segundos."""
    e = np.ones(n)
    a, r = int(attack * SR), int(release * SR)
    e[:a] = np.linspace(0, 1, a) ** 2
    e[-r:] = np.linspace(1, 0, r) ** 2
    return e


def pad(midi, secs):
    """Nota larga y suave: varias ondas un poco desafinadas entre si."""
    n = int(secs * SR)
    x = np.arange(n) / SR
    out = np.zeros(n)
    for det in (-0.07, 0.0, 0.07):
        f = freq(midi + det)
        ph = rng.uniform(0, 6.28)
        out += np.sin(2 * np.pi * f * x + ph) + 0.35 * np.sin(4 * np.pi * f * x + ph) + 0.12 * np.sin(6 * np.pi * f * x)
    return out / 3 * env(n, 1.6, 2.2)


def pluck(midi, secs=1.6):
    """Nota corta tipo campana."""
    n = int(secs * SR)
    x = np.arange(n) / SR
    return (np.sin(2 * np.pi * freq(midi) * x) + 0.4 * np.sin(4 * np.pi * freq(midi) * x)) * np.exp(-x * 3.2) * np.minimum(1, x * 200)


def kick():
    """Pulso grave y blando."""
    n = int(0.5 * SR)
    x = np.arange(n) / SR
    return np.sin(2 * np.pi * (45 * x + 30 * (1 - np.exp(-x * 30)) / 30)) * np.exp(-x * 9)


# Cuatro acordes que se repiten (re menor, si bemol, fa, do); cada uno dura 4 pulsos dobles
CHORDS = [
    (38, [62, 65, 69, 72]),   # Dm7
    (34, [58, 62, 65, 69]),   # Bbmaj7
    (41, [60, 65, 69, 72]),   # F
    (36, [60, 64, 67, 71]),   # Cmaj7
]
BAR = BEAT * 8
bar = 0
while bar * BAR < DUR:
    start = bar * BAR
    bass, notes = CHORDS[bar % 4]
    for k, m in enumerate(notes):
        add(pad(m, BAR + 2.0), start, pan=(k - 1.5) / 3, gain=0.16)
    add(pad(bass, BAR + 1.5), start, gain=0.30)
    add(pad(bass + 12, BAR + 1.5), start, gain=0.10)
    if start >= 13:                                   # el pulso entra con las capas de datos
        for b in range(8):
            add(kick(), start + b * BEAT, gain=0.42 if b % 2 == 0 else 0.20)
    if start >= 26:                                   # las notas agudas entran con la ruta
        seq = [notes[0], notes[2], notes[1], notes[3], notes[2], notes[3], notes[1], notes[2]]
        for b in range(16):
            m = seq[b % 8] + 12
            add(pluck(m), start + b * BEAT / 2, pan=0.6 if b % 2 else -0.6, gain=0.085)
            add(pluck(m), start + b * BEAT / 2 + BEAT * 0.75, pan=-0.6 if b % 2 else 0.6, gain=0.035)   # eco
    bar += 1

# Entrada y salida graduales, y volumen final
master = np.ones_like(t)
master[: int(2 * SR)] = np.linspace(0, 1, int(2 * SR))
master[-int(5 * SR):] = np.linspace(1, 0, int(5 * SR)) ** 1.5
mix = np.stack([L, R], axis=1) * master[:, None]
mix = np.tanh(mix * 1.4)                              # limita los picos con suavidad
mix = mix / np.abs(mix).max() * 0.82

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(out, exist_ok=True)
with wave.open(os.path.join(out, 'music.wav'), 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print('music.wav listo:', DUR, 's')
