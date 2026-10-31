#!/bin/bash
# ./run25.sh <голос> <порт> <сид> [ключи]
TTS=${TTS:-/data/tts}; H=$(cd "$(dirname "$0")" && pwd); V=$1; PORT=${2:-8091}; SEED=${3:-1}; KEYS=$4
cd "$TTS/qwen3-tts" || exit 1
./qwen_tts -d qwen3-tts-0.6b-base --load-voice "$TTS/refs/$V.qvoice" -l Russian --int8 -j 2 --eos-strategy v2 --serve "$PORT" > "/tmp/srv_$V.log" 2>&1 &
SP=$!
for i in $(seq 1 120); do curl -s -m 2 "http://127.0.0.1:$PORT/v1/health" >/dev/null 2>&1 && break; sleep 2; done
python3 "$H/clone25.py" "$V" "$PORT" "$SEED" "$KEYS"
kill $SP; wait $SP 2>/dev/null
