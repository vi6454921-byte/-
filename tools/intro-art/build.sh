#!/usr/bin/env bash
# Пересборка иллюстраций экрана загрузки: SVG (python3) → PNG (Chromium) → WebP (ImageMagick) → assets/intro/.
# Запуск из корня проекта: bash tools/intro-art/build.sh [akm ak74 m416 scar mp5a3 m870 svd]
set -euo pipefail
cd "$(dirname "$0")"
IDS=${*:-"akm ak74 m416 scar mp5a3 m870 svd"}
mkdir -p out
python3 guns.py $IDS > manifest.jsonl     # габариты (w, h, x0, x1) — для размерной линии в js/app/intro.js (SHOW)
for g in $IDS; do
  node render.cjs out/$g.svg out/$g.png
  magick out/$g.png -quality 85 ../../assets/intro/$g.webp
done
cat manifest.jsonl
