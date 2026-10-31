#!/bin/bash
# 3) Озвучить все фразы голосом: ./run_clone.sh <голос> <порт> <сид> [ключ1,ключ2,...]
#    Модель 0.6B-Base в режиме клонирования (ICL по референсу), сервер qwen_tts --serve, ~1,9 ГБ ОЗУ.
TTS=${TTS:-/data/tts}; HERE=$(cd "$(dirname "$0")" && pwd)
V=$1; PORT=${2:-8091}; SEED=${3:-1}; KEYS=$4
REFT='Внимание! Противник на северо-западе, метров двести! Прикройте, перезаряжаюсь!'
cd "$TTS/qwen3-tts" || exit 1
if [ ! -f "$TTS/refs/$V.qvoice" ]; then
  ./qwen_tts -d qwen3-tts-0.6b-base --ref-audio "$TTS/refs/$V.wav" --ref-text "$REFT" -l Russian --int8 -j 2 \
    --voice-name "$V" --save-voice "$TTS/refs/$V.qvoice" > "/tmp/save_$V.log" 2>&1
fi
./qwen_tts -d qwen3-tts-0.6b-base --load-voice "$TTS/refs/$V.qvoice" -l Russian --int8 -j 2 --eos-strategy v2 --serve "$PORT" > "/tmp/srv_$V.log" 2>&1 &
SP=$!
for i in $(seq 1 120); do curl -s -m 2 "http://127.0.0.1:$PORT/v1/health" >/dev/null 2>&1 && break; sleep 2; done
TTS=$TTS python3 "$HERE/clone.py" "$V" "$PORT" "$SEED" "$KEYS"
kill $SP; wait $SP 2>/dev/null
