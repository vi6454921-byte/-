# AEGIS v19 — авторы звуков, эффектов и библиотек

## Звуки мира (`assets/snd/sfx_pack.js`, `assets/snd/amb_pack.js`)

Источник — бесплатные архивы **Sonniss.com GDC Game Audio Bundle** (2015, 2016, 2017).
Лицензия Sonniss: royalty-free, можно в коммерческих играх, указывать авторов
не обязательно (здесь указаны из уважения). Нельзя продавать или раздавать сами
звуки отдельно от игры, как библиотеку. Поэтому файлы пака лежат только внутри
игры, в сжатом виде (MP3 в base64), и обрезаны под её нужды.

Страница архивов: https://sonniss.com/gameaudiogdc

| Автор / пакет | Архив Sonniss | Исходные файлы | Ключи в игре |
|---|---|---|---|
| Gamemaster Audio — Explosion Sound Pack | GDC 2017, часть 4 из 9 | explosion_large_08, explosion_large_no_tail_03, explosion_med_long_tail_01, explosion_far_distant_02 | `exp_near`, `exp_med`, `exp_far` |
| Gamemaster Audio — Bullet Impact Sounds | GDC 2017, часть 4 из 9 | bullet_flyby_fast_05, bullet_impact_body_thump_02, bullet_impact_metal_heavy_08, bullet_impact_concrete_brick_01 | `whizz`, `hit_body`, `hit_metal`, `hit_stone` |
| Coll Anderson — Guns | GDC 2015, часть 1 из 5 | EFX EXT Mortar Explosion 08, EFX INT AR-15 M4 Charging Handle With Mag 01_A | `exp_big`, `charge_rel` |
| Coll Anderson — Metal Plate | GDC 2015, часть 1 из 5 | EFX SD Metal plate bang 01 B.M | `hit_metal` |
| Pole Position Production — Heckler & Koch G36C 5.56mm | GDC 2016, часть 3 из 6 | G36C 1m left off axis MKH416 clean (звуки магазина между сериями) | `mag_out`, `mag_in` |
| Pole Position Production — Steyr TMP 9mm | GDC 2016, часть 4 из 6 | Steyr TMP 1m right CS3 clean (взвод затвора, сухой щелчок) | `charge_back`, `charge_rel`, `dry` |
| Pole Position Production — The Warfare Library | GDC 2017, часть 6 из 9 | warfare_t3_mg_whizzes_ricochets_bullet_cracks_M10, warfare_t1b_cannon_firing_forest_distant_MKH8060_2 | `crack`, `artillery` |
| Mechanical Wave — Rock, Brick and Dirt | GDC 2015, часть 3 из 5 | Debris Brick_RBD 02, Hit Rock Debris_RBD 02 | `hit_stone` |
| Mechanical Wave — Rock, Brick and Dirt II | GDC 2017, часть 5 из 9 | Multiple Rock Hit Dirt_RBDII 07, Rock Hit and Bounce Dirt_RBDII 06 | `debris` |
| Stuart Duffield — Bullet SFX | GDC 2016, часть 6 из 6 | Bullet_Drop_Leaves_03, Bullet_Drop_Wood_04, ShotgunShell_Land_Concrete_02, ShotgunShell_Land_Lino_03 | `case_soft`, `case_hard` |
| Tovusound — Foley Footsteps | GDC 2017, часть 8 из 9 | 015_Foley_Footsteps_Asphalt_Boot_Walk_Fast_Run_Jog_Close, 237_Foley_Footsteps_Metal_Boot_Walk_Normal_Close | `step_hard`, `step_hard_run`, `step_metal` |
| Levan Nadashvili — Soldier Footsteps | GDC 2016, часть 2 из 6 | FS Concrete Soldier Crouch N02, FS Metal Soldier Walk N01 | `step_hard`, `step_metal` |
| Mindful Audio — Woodland Atmosphere | GDC 2016, часть 2 из 6 | MAFX001 wind robin blackbird 01 (v21: птицы вырезаны, остался ветер) | `amb_forest` |
| RDGSFX003 — Industrial Warehouse | GDC 2015, часть 3 из 5 | Industrial Warehouse_Mid Perspective 1 | `amb_hangar` |
| Sonniss GDC 2017 (ветер у скал) | GDC 2017, часть 7 из 9 | Wind, Gusty Behind Rock Bird | `amb_wind` (v21: без птицы) |

Обработка (своя): обрезка, фильтр низких частот, нормализация, бесшовные петли
40 с с перекрёстным переходом 3 с, MP3 80–128 кбит/с. Скрипты сборки не входят в
игру. Громкость каждой группы подогнана под прежние синтезированные звуки
(±3 дБ, `tools/sound-tests/levels.html`).

`step_metal` (шаги по металлу) лежит в паке про запас и пока не подключён.

Выстрелы оружия **не заменялись** — у каждого ствола остались его прежние звуки.

## Эффекты взрыва (`assets/data/vfx_blast.js`)

- **Unity Labs — VFX Toolbox / Image Sequences** (Unity Technologies, лицензия CC0):
  кадры дыма *Cloud02* (4 кадра, атлас 256×256) и огненного шара *Explosion01*
  (16 кадров, 4×4). Уменьшены и пересжаты.
  Источник: https://unity3d.com/files/labs/downloads/vfx/assets01/ (Unity Labs, «Free VFX Image Sequences & Flipbooks», 2016).

## Голоса бойцов (v24, `assets/snd/voice_pack.js`)

Четыре голоса (Гром, Хрип, Сокол, Тихий) **созданы синтезом с нуля**, записей реальных людей нет:
голос задан текстовым описанием в модели **Qwen3-TTS-12Hz-1.7B-VoiceDesign**, все 100 фраз каждым голосом
озвучены моделью **Qwen3-TTS-12Hz-0.6B-Base** (клонирование по 7-секундному образцу, который сделала первая модель).

| Компонент | Автор | Лицензия |
|---|---|---|
| Qwen3-TTS (модели 1.7B-VoiceDesign, 0.6B-Base) | Qwen, Alibaba Cloud — https://github.com/QwenLM/Qwen3-TTS | Apache 2.0 |
| qwen3-tts — C-движок для CPU | Gabriele Mastrapasqua — https://github.com/gabriele-mastrapasqua/qwen3-tts | MIT |

Сгенерированный звук ограничений «только некоммерческое» не имеет. Сборка пакета и описания голосов —
`tools/voice/qwen3/` (README там). Голоса Piper v23 (`ruslan` — CC BY-NC-SA 4.0, `denis`, `dmitri` — CC0) в v24
не используются; их конвейер оставлен в `tools/voice/` для истории.

Проверка внятности дублей — офлайн-распознаватель **Vosk** (`vosk-model-small-ru-0.22`, Apache 2.0) — только при сборке,
в игру не входит.

## Библиотеки

- **stats-gl** — Renaud Rohlinger, лицензия MIT (`vendor/stats-gl/LICENSE`).
  График FPS, CPU и GPU в оверлее F3.
