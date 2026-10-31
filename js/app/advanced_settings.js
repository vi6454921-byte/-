/* Standard settings controls, persisted with the existing schema. */
(function () {
  "use strict";
  const AE = window.AEGIS;
  if (!AE) return;
  let set = AE.loadSettings();
  const initial = { ...set };
  function save(k, v) {
    set[k] = v;
    AE.saveSettings(set);
    if (window.AEGIS_GAME) AEGIS_GAME.applySettings({ [k]: v });
  }
  function row(parent, title, k, type, min, max, step, choices) {
    const box = document.createElement("label");
    box.className = "s-check";
    box.style.cssText =
      "display:flex;gap:16px;justify-content:space-between;align-items:center";
    const cap = document.createElement("span");
    cap.textContent = title;
    box.append(cap);
    const input = document.createElement(
      type === "select" ? "select" : "input",
    );
    input.dataset.setting = k;
    if (type === "select") {
      for (const [value, label] of choices) {
        const o = document.createElement("option");
        o.value = value;
        o.textContent = label;
        input.append(o);
      }
      input.value = set[k];
    } else {
      input.type = type;
      input.min = min;
      input.max = max;
      input.step = step;
      if (type === "checkbox") input.checked = !!set[k];
      else input.value = set[k];
    }
    const val = document.createElement("b");
    const update = () => {
      if (type === "range")
        val.textContent = Number(input.value).toFixed(step < 1 ? 2 : 0);
    };
    input.addEventListener("input", () => {
      save(
        k,
        type === "checkbox"
          ? input.checked
          : type === "range"
            ? +input.value
            : input.value,
      );
      update();
    });
    update();
    box.append(input, val);
    parent.append(box);
  }
  const gfx = document.querySelector('[data-pane="gfx"]'),
    snd = document.querySelector('[data-pane="snd"]');
  row(gfx, "Вертикальный FOV, °", "fov", "range", 60, 110, 1);
  row(
    gfx,
    "Жестокость (только визуальные эффекты)",
    "gore",
    "range",
    0,
    1,
    0.05,
  );
  row(gfx, "Цвет марки", "reticleColor", "select", 0, 0, 1, [
    ["red", "Красный"],
    ["green", "Зелёный"],
    ["blue", "Синий"],
    ["yellow", "Жёлтый"],
    ["white", "Белый"],
  ]);
  row(gfx, "Дальтонизм: цвет марки", "colorblind", "select", 0, 0, 1, [
    ["off", "Выключен"],
    ["deuter", "Дейтеранопия"],
    ["protan", "Протанопия"],
    ["tritan", "Тританопия"],
  ]);
  row(
    gfx,
    "GPU BC1-текстуры окружения (после перезапуска)",
    "gpuCompressed",
    "checkbox",
  );
  const effects = document.createElement("div");
  gfx.append(effects);
  for (const [k, label] of Object.entries({
    distortion: "Искажение линзы",
    grain: "Зерно",
    chroma: "Хроматические края",
    blur: "Размытие движения",
    vignette: "Виньетка",
    dirt: "Грязь и дождь на линзе",
    concussion: "Эффект контузии",
  })) {
    const l = document.createElement("label");
    l.className = "s-check";
    const i = document.createElement("input");
    i.type = "checkbox";
    i.checked = set.effects[k];
    i.dataset.effect = k;
    i.onchange = () => {
      set.effects = { ...set.effects, [k]: i.checked };
      save("effects", set.effects);
    };
    l.append(i, document.createTextNode(" " + label));
    effects.append(l);
  }
  for (const [k, label] of Object.entries({
    shots: "Выстрелы",
    ambience: "Окружение: лес, погода, далёкий бой",
    voices: "Голоса и дыхание",
    uiVolume: "Интерфейс",
  }))
    row(snd, label, k, "range", 0, 1, 0.05);
  for (const [k, label] of Object.entries({
    ads1: "ADS 1×",
    ads2: "ADS 2×",
    ads4: "ADS 4×",
    ads8: "ADS 8× и выше",
  }))
    row(snd, "Чувствительность " + label, k, "range", 0.1, 3, 0.05);
  for (const [k, label] of Object.entries({
    adsMode: "Прицеливание",
    crouchMode: "Приседание",
  }))
    row(snd, label, k, "select", 0, 0, 1, [
      ["hold", "Удержание"],
      ["toggle", "Переключение"],
    ]);
  row(snd, "Инвертировать Y", "invertY", "checkbox");
  row(snd, "Записанные звуки мира (взрывы, пули, шаги, фон)", "sfxRecorded", "checkbox");
  row(snd, "Далёкий бой за картой (артиллерия, очереди)", "farBattle", "checkbox");
  row(
    snd,
    "Речевые команды (системный русский голос, если доступен)",
    "calloutSpeech",
    "checkbox",
  );
  // Existing settings UI keeps its own set object: merge new keys during old saves.
  const saveOriginal = AE.saveSettings,
    prev = new WeakMap();
  AE.saveSettings = function (s) {
    if (s !== set) {
      const old = prev.get(s) || initial;
      const changes = {};
      for (const k of Object.keys(s))
        if (JSON.stringify(s[k]) !== JSON.stringify(old[k])) changes[k] = s[k];
      prev.set(s, JSON.parse(JSON.stringify(s)));
      set = { ...set, ...changes };
    }
    saveOriginal(set);
  };
  document.addEventListener("click", (e) => {
    if (e.target.closest("button")) {
      const g = window.__GAME;
      if (g && g.audio && g.audio.uiClick) g.audio.uiClick();
    }
  });
})();
