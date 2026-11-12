#!/usr/bin/env bash
# build.sh — une los fotogramas y la musica en el video final.
# Pasos previos:  node video/capture.cjs   y   python3 video/music.py
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out

# Los fotogramas se capturaron a 15 por segundo; el video sale a 30 (cada uno se repite).
ffmpeg -y -loglevel error -framerate 15 -i frames/f%05d.jpg -i out/music.wav \
  -vf "fps=30,fade=t=in:st=0:d=0.8,fade=t=out:st=79:d=1,format=yuv420p" \
  -c:v libx264 -preset slow -crf 23 -c:a aac -b:a 192k -shortest -movflags +faststart \
  out/marswalk-gale-intro.mp4

# Subtitulos aparte (ya van dibujados en el video; este archivo sirve para YouTube u otros)
cat > out/subtitles.srt <<'EOF'
1
00:00:06,500 --> 00:00:14,000
Global Mars maps don't help an astronaut on foot.
This one covers the two kilometres they will actually walk.

2
00:00:14,500 --> 00:00:26,000
Three NASA missions in one view:
MRO, Mars Odyssey and Curiosity.

3
00:00:26,500 --> 00:00:38,000
It picks the stop order and the safest path,
and shows distance, time and oxygen at a glance.

4
00:00:38,500 --> 00:00:48,000
Solar event? The fastest way back to the habitat, instantly.

5
00:00:48,500 --> 00:00:58,000
TARS, the mission agent, answers questions
and replans on request.

6
00:00:58,500 --> 00:01:12,000
In the helmet: heading, oxygen, return margin,
and what Curiosity saw from this very spot.
EOF
echo "Listo: video/out/marswalk-gale-intro.mp4"
