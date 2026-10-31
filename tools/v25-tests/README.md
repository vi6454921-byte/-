# Стенды и проверки v25

Сервер — из корня игры: `python3 tools/serve.py --no-browser --port 8000`. Нужны `playwright` (npm) и Chromium;
путь к Chromium — `CHROMIUM_PATH`. Снимки и результаты ложатся в `tools/v25-tests/out/`.
Там же лежат результаты итогового прогона v25 (JSON без снимков) и несколько снимков.

## Сценарии на карте (через `tools/v22-tests/run.cjs`)

| Сценарий | Что проверяет | Запуск |
|---|---|---|
| `fence_climb.js` | перелаз через высокий забор 1,3–2,15 м (и пролёты с зазором снизу > 0,43 м): игрок и боты оказываются по другую сторону, камера не заходит в доски | `MAP=stroyka_zarechye_v2 SEC=1 node tools/v22-tests/run.cjs $PWD/tools/v25-tests/fence_climb.js` |
| `war_atmos.js` | «рядом идёт война»: дымы, воронки (где стоят: грунт, не под крышей, не у баз), 10 мин далёкого боя, грубая цена кадра (точнее — `plume_cost.js`); снимки | `MAP=stroyka_zarechye_v2 SEC=1 OUT_DIR=/tmp/w node tools/v22-tests/run.cjs $PWD/tools/v25-tests/war_atmos.js`, затем `node tools/v25-tests/decode_shots.cjs /tmp/w/war_atmos.json tools/v25-tests/out/war` |
| `plume_cost.js` | цена дымов: один и тот же кадр (взгляд с 40 м на дым) — без дымов, с дымами, без частиц, со всеми частицами в `discard`; время с ожиданием конца отрисовки (`readPixels`) и без, вызовы отрисовки, треугольники | `MAP=forest_map_camp SEC=1 OUT_DIR=/tmp/pc node tools/v22-tests/run.cjs $PWD/tools/v25-tests/plume_cost.js` |

## Отдельные проверки

| Скрипт | Что проверяет |
|---|---|
| `armory_skins.cjs` | оружейная: панель окраски, применение окрасок (`PLAN='[["akm",["walnut","digital"]]]'`), раскладка панелей без наложений (`W`, `H` — окно), ошибки страницы |
| `armory_top.cjs` | верхняя полоса оружейной при ширине окна 1024–1920 px: слоты не закрывают кнопки «Погода», «Снаряжение», «?» |
| `intro_cost.cjs` | цена экрана загрузки: одна и та же «работа загрузки» на стенде заставки и на пустой странице (`URLS="blank=about:blank,v25=http://127.0.0.1:8000/loading-preview.html?hold"`) |
| `farlevels.cjs` | громкость далёкого боя, артиллерии и выстрелов на карте (OfflineAudioContext, RMS 300 мс) |
| `climb_shot.cjs` | снимки перелаза: бот со стороны (`WHO=bot`, `CAMS=A,B,C,S,S2`) и игрок от первого лица (`WHO=player`, `CAMS=FP`) |
| `crater_shot.cjs` | снимки стенда воронок `tools/v25-stands/craters.html` (`JOBS='[{"qs":"kind=big&sun=side","name":"big"}]'`) |
| `flags_shot.cjs` | снимки стенда флагов `tools/v25-stands/flags.html` |
| `soldier_shot.cjs` | снимки стенда бойца `tools/v25-stands/soldier.html` (снаряжение, хват, ремень) |
| `decode_shots.cjs` | достать JPEG-снимки из результата сценария (`shots: [{name, data}]`) |
