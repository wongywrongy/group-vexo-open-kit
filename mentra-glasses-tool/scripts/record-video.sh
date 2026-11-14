#!/usr/bin/env bash
# Receive the glasses' RTMP video on this computer, keep it, and cut screenshots out of it.
#   bash scripts/record-video.sh [output-folder]
# Start this BEFORE the app asks the glasses to stream. Needs ffmpeg.
# Outputs (in the output folder):
#   recording.mp4      the video, copied as it arrives (fragmented MP4: an interrupted recording still plays)
#   frames/            one screenshot per FRAME_EVERY_SEC seconds (default 1)
#   latest.jpg         the newest frame, replaced twice a second: feed this to a vision model
set -euo pipefail

command -v ffmpeg >/dev/null || { echo "ffmpeg is not installed (macOS: brew install ffmpeg)"; exit 1; }

OUT="${1:-data/video/$(date +%Y%m%d-%H%M%S)}"
PORT="${RTMP_PORT:-1935}"
EVERY="${FRAME_EVERY_SEC:-1}"
mkdir -p "$OUT/frames"

echo "Waiting for the glasses' video on rtmp://0.0.0.0:${PORT}/live/glasses"
echo "Saving to $OUT"
exec ffmpeg -hide_banner -loglevel warning -stats -listen 1 -i "rtmp://0.0.0.0:${PORT}/live/glasses" \
  -map 0:v -map '0:a?' -c copy -movflags +frag_keyframe+empty_moov+default_base_moof -f mp4 "$OUT/recording.mp4" \
  -map 0:v -vf "fps=1/${EVERY}" -q:v 3 "$OUT/frames/frame_%06d.jpg" \
  -map 0:v -vf "fps=2" -q:v 5 -update 1 -atomic_writing 1 "$OUT/latest.jpg"
