#!/bin/bash
# AEGIS v26 — полный прогон озвучки: проход 1 (сид 1) → check26 → проходы 2..4 только для плохих дублей.
#   TTS=/data/tts V26=$TTS/v26 ./gen26.sh [первый_проход] [последний_проход]
# Сервер qwen_tts (0.6B-Base, int8) поднимается на каждый голос/вариант x-vector и гасится — с проверкой
# (wav2vec2, ~1.3 ГБ) он одновременно не работает: машине с 4 ГБ хватает.
TTS=${TTS:-/data/tts}; V26=${V26:-$TTS/v26}; Q=$(cd "$(dirname "$0")" && pwd); P0=${1:-1}; P1=${2:-4}
cd "$V26" || exit 1
mkdir -p gen
for p in $(seq $P0 $P1); do
  python3 "$Q/gen26.py" $p "$V26" > gen/plan_p$p.txt
  echo "== проход $p: $(wc -l < gen/plan_p$p.txt) серий, $(awk '{s+=$4} END {print s+0}' gen/plan_p$p.txt) фраз"
  while read v bin jf n; do
    mkdir -p gen/$v
    SP=$("$Q/serve26.sh" $bin 8091 | tail -1)
    echo "-- $v ($bin): $n"
    python3 "$Q/client26.py" 8091 "$jf" | awk 'NR % 20 == 0 {print "   ", NR, $0; fflush()}'
    kill $SP 2>/dev/null; sleep 2
  done < gen/plan_p$p.txt
  python3 "$Q/check26.py" gen phr26.json | tail -1
done
echo ALLDONE
