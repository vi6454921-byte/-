Источник: приложенный bullet_impacts_clean.zip. Decals.ts адаптирован для AEGIS/Three.js r166. DecalGeometry.js — Three.js r166.1 (MIT), https://github.com/mrdoob/three.js/blob/r166/examples/jsm/geometries/DecalGeometry.js. Runtime собирается tools/build-bullet-impacts.cjs; npm и интернет для запуска игры не нужны.

## Переработка v3
Бетонные слои и исходная стеновая POM-ветка сохранены. Генераторы дерева/металла/бумаги/ткани заменены; добавлен soil. Новые профили используют отдельную ветку глубокого POM с поддержкой приподнятых краёв. Aux A=255 означает legacy wall/rubble; 1=metal, 2=wood, 3=paper, 4=fabric, 5=soil. Проверка: tools/impact-tests/materials-check.cjs.
