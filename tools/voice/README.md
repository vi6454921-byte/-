# Голоса бойцов

**v24:** пакет `assets/snd/voice_pack.js` собирается из голосов **Qwen3-TTS** — см. [`qwen3/README.md`](qwen3/README.md)
(четыре придуманных голоса: Гром, Хрип, Сокол, Тихий; лицензия без некоммерческих ограничений).
Ниже — прежний конвейер Piper (v23), оставлен для истории и как запасной вариант. Голос `ruslan` (CC BY-NC-SA)
в v24 не используется.

---

## v23 (Piper): пересборка `assets/snd/voice_pack.js`

Фразы озвучены офлайн синтезом речи **Piper** (https://github.com/rhasspy/piper), три мужских голоса ru_RU:
`ruslan` (низкий, ~114 Гц после обработки), `denis` (~134 Гц), `dmitri` (~157 Гц). Модели и лицензии наборов данных:
`denis`, `dmitri` — CC0; `ruslan` — корпус RUSLAN, CC BY-NC-SA 4.0 (некоммерческое использование).

Обработка (`build_voices.py`): высота ниже с сохранением формант (ffmpeg `rubberband`), срез 75 Гц, «грудь» 135 Гц,
присутствие 2,9 кГц, компрессор 4:1, нормализация по громкости речи, MP3 16 кГц 32 кбит/с. Каждая фраза
синтезируется 3–5 раз; берётся дубль, который лучше всех распознаёт офлайн-распознаватель Vosk (проверка внятности).

```
pip install piper-tts vosk
# модели Piper: huggingface.co/rhasspy/piper-voices → ru/ru_RU/{ruslan,denis,dmitri}/medium/*.onnx(+.json) — сюда
# Vosk: alphacephei.com/vosk/models → vosk-model-small-ru-0.22 — сюда (распаковать)
python3 build_voices.py            # все голоса → out/<голос>/*.mp3 (+ .wav), out/meta.json
python3 build_voices.py denis      # один голос (остальные берутся из прошлой сборки)
python3 asr_check.py               # отчёт: что распознаётся не так
python3 pack_voices.py ../../assets/snd/voice_pack.js
python3 strip_voice.py ruslan      # убрать голос из готового пакета (например, для коммерческого выпуска)
```

Фразы собираются в игре из кусков (`js/polygon/31c_voice.js`): «Контакт!» + «Сто тридцать градусов, юго-восток!» +
«Метров девяносто!». Список кусков — словарь `PHR` в `build_voices.py` (тексты дублируются в `31c_voice.js` для
субтитров и запасного Web Speech; стенд `tools/v22-tests/voice_pack.js` сверяет, что всё играет).
