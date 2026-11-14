# voice.py — narracion del video con una voz generada por codigo (motor libre Kokoro).
#
# Preparacion (una sola vez):
#   pip install kokoro-onnx soundfile
#   y descargar en video/voices/ estos dos archivos de
#   https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
#     kokoro-v1.0.onnx   voices-v1.0.bin
#
# Uso:  python3 video/voice.py   ->  video/out/voice.wav (80 s, cada frase en su toma)
#
# El texto esta en video/narration.json: una frase por toma, con su segundo de inicio y fin.
import json
import os
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
VOZ = os.environ.get('VOZ', 'am_michael')     # otras voces: af_heart, af_bella, am_adam, bm_george
VELOCIDAD = 1.0
RETRASO = 0.6                                 # la voz empieza un poco despues del cambio de toma
TOTAL = 80.0                                  # duracion del video en segundos

motor = Kokoro(os.path.join(HERE, 'voices', 'kokoro-v1.0.onnx'), os.path.join(HERE, 'voices', 'voices-v1.0.bin'))
tomas = json.load(open(os.path.join(HERE, 'narration.json'), encoding='utf-8'))

pista = None
sr = None
fallo = False
for t in tomas:
    audio, sr = motor.create(t['text'], voice=VOZ, speed=VELOCIDAD, lang='en-us')
    audio = np.asarray(audio, dtype=np.float32)
    if pista is None:
        pista = np.zeros(int(TOTAL * sr), dtype=np.float32)
    dur = len(audio) / sr
    hueco = t['end'] - t['start'] - RETRASO
    estado = 'cabe' if dur <= hueco else 'NO CABE: acorta la frase'
    fallo = fallo or dur > hueco
    print(f"toma {t['shot']}: {dur:4.1f} s de voz en {hueco:4.1f} s -> {estado}")
    i = int((t['start'] + RETRASO) * sr)
    audio = audio[: len(pista) - i]
    pista[i:i + len(audio)] += audio

pista = pista / max(1e-6, np.abs(pista).max()) * 0.9      # volumen parejo
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
sf.write(os.path.join(HERE, 'out', 'voice.wav'), pista, sr)
print('voice.wav listo con la voz', VOZ)
sys.exit(1 if fallo else 0)
