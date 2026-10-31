#!/bin/bash
# Все четыре голоса, один сид: ./clone_all.sh 1   (≈1 ч на 2 ядрах; дубли для неудачных фраз — сиды 2–4)
HERE=$(cd "$(dirname "$0")" && pwd)
for V in grom hrip sokol tihiy; do "$HERE/run_clone.sh" $V 8091 "${1:-1}" "$2"; done
