#!/bin/bash
# AEGIS v26: ./serve26.sh <голос|голос_ang12> <порт> — сервер qwen_tts 0.6B-Base (int8) с x-vector голоса в фоне; печатает PID.
# x-vector: $TTS/refs/<имя>.bin (копии — tools/voice/qwen3/refs26/). Только x-vector (без ICL-текста): тембр без
# «заимствования» интонаций референса.
TTS=${TTS:-/data/tts}; V=$1; PORT=${2:-8091}
cd $TTS/qwen3-tts || exit 1
nohup ./qwen_tts -d qwen3-tts-0.6b-base --load-voice "$TTS/refs/$V.bin" --xvector-only -l Russian --int8 -j 2 --eos-strategy v2 --serve "$PORT" > "/tmp/srv_$V.log" 2>&1 &
SP=$!
for i in $(seq 1 120); do curl -s -m 2 "http://127.0.0.1:$PORT/v1/health" >/dev/null 2>&1 && break; sleep 1; done
echo $SP
