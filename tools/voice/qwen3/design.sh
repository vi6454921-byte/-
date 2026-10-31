#!/bin/bash
# 1) Придумать голоса (VoiceDesign): ./design.sh [voices.txt]  →  $TTS/design/<имя>_<сид>.wav
#    TTS=каталог с собранным qwen3-tts (github.com/gabrimatic/qwen3-tts) и моделями.
TTS=${TTS:-/data/tts}; HERE=$(cd "$(dirname "$0")" && pwd); LIST=${1:-$HERE/voices.txt}
REF='Внимание! Противник на северо-западе, метров двести! Прикройте, перезаряжаюсь!'
mkdir -p "$TTS/design"; cd "$TTS/qwen3-tts" || exit 1
grep -v '^#' "$LIST" | while read -r name seed instr; do
  [ -z "$name" ] && continue
  out=$TTS/design/${name}_${seed}.wav; [ -f "$out" ] && continue
  ./qwen_tts -d qwen3-tts-voice-design --voice-design -l Russian --int8 -j 2 --seed "$seed" -I "$instr" -t "$REF" \
    --max-duration 10 -o "$out" -S > /tmp/design_last.log 2>&1; echo "$name $seed rc=$?"
done
# 2) Референсы: обрезать тишину по краям
mkdir -p "$TTS/refs"
grep -v '^#' "$LIST" | while read -r name seed instr; do
  [ -z "$name" ] && continue
  ffmpeg -v error -y -i "$TTS/design/${name}_${seed}.wav" -af "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse" \
    -ar 24000 -ac 1 -c:a pcm_s16le "$TTS/refs/$name.wav"
done
