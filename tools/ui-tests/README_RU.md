# Изолированный стенд интерфейса

menu-stand.html использует настоящий DOM/CSS и js/app/ui.js, но API 3D-игры заменён заглушкой. Результаты относятся только к интерфейсу.

В корне AEGIS запустить: `python3 -m http.server 8765`.
В отдельном терминале: `node tools/ui-tests/run-ui.cjs`. Нужны Node, пакет playwright и установленный Chromium в PATH. Скрипт создаёт результаты и снимки в своей папке.

Результаты свежих баллистических тестов — ballistics-run.txt, trace-run.txt. Физическая регрессия: rig-run.json, 180 сценариев, 0 неудач; tools/rig-tests/physics-results.json обновлён текущим прогоном. Остальные старые tools/rig-tests и tools/pack-tests унаследованы из входного архива и не считаются новыми подтверждёнными проверками. Незавершённые проверки перечислены в incomplete-tests.json.
