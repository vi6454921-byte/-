/* ==========================================================================
   AEGIS · экран загрузки (v25: 2D-иллюстрации оружия вместо 3D; ниже — история v21).
   Чёрный фон и 3D-модель оружия по центру — слайд-шоу «от Калашникова до
   снайперской винтовки»: АКМ (модернизированный АК-47) → АК-74М → HK416 →
   FN SCAR-H → HK MP5A3 → Remington 870 → СВД. Пистолетов нет.
   Модели — те же процедурные, что в оружейной и в бою (AEGIS_WK.Assembler),
   поэтому ничего не скачивается дополнительно.
   Как это не мешает загрузке на слабом ПК:
     • отдельный маленький WebGL-контекст, 30 кадров/с (на слабом — 24) и
       пониженное разрешение буфера; кадр не рисуется, пока вкладка скрыта;
     • каждая модель после сборки сливается по материалам (сотни деталей →
       ~10–20 вызовов отрисовки); следующая собирается в паузе между слайдами,
       когда кадр погас, и остаётся в кэше — второй круг ничего не собирает;
     • материалы собираются один раз и потом достаются бою (AEGIS_WK.introCtx),
       поэтому сборка оружия в бою не повторяет эту работу;
     • при закрытии контекст уничтожается (forceContextLoss) — видеопамять
       возвращается игре.
   Совет, этап и честный процент — как в v12. API прежний:
   AEGIS_INTRO.{active, ready, closed, heavyOk, onClose, markReady, close}.
   ========================================================================== */
(function () {
  'use strict';
  const API = {
    active: false, ready: false, closed: false, T: 99,
    _heavy: Promise.resolve(), _onClose: [],
    heavyOk() { return this._heavy; },
    onClose(fn) { if (this.closed) fn(); else this._onClose.push(fn); },
    markReady() { this.ready = true; update(); },
    close() { close(); },
    redraw() { /* совместимость */ }
  };
  window.AEGIS_INTRO = API;

  const TIPS = [
    ['Вселение', 'Наведите камеру на генерала и удерживайте <kbd>F</kbd>. Повторное удержание — выйти из тела.'],
    ['Медицина', '<kbd>K</kbd> — жгут или перевязка себе или раненому рядом. Артериальное кровотечение без жгута убивает за десятки секунд.'],
    ['Прицелы', 'Колесо мыши переключает прицел: основной, боковой коллиматор под 45° или верхний.'],
    ['Укрытие', 'Лёжа (<kbd>Z</kbd>) силуэт прячется в траве. <kbd>Q</kbd> / <kbd>E</kbd> — выглянуть из-за ствола, не выходя из укрытия.'],
    ['Перезарядка', 'Магазин, расстрелянный досуха, меняется дольше: после него нужно ещё взвести затвор. Меняйте магазин заранее.'],
    ['Броня', 'Плиты держат пистолетную пулю и часть винтовочных. Таз, шея и руки плитами не закрыты.'],
    ['Патроны', '<kbd>N</kbd> — тип патрона. От него зависят пробитие брони и рикошеты.'],
    ['Полигон', '<kbd>H</kbd> — поднять мишени и вернуть бойцов на позиции.'],
    ['Хардкор', 'В настройках можно включить задержки: недосыл и перекос гильзы устраняются клавишей перезарядки.']
  ];
  const STAGE = {
    files: 'Загрузка ресурсов', map: 'Сборка карты', post: 'Постобработка', world: 'Лес и рельеф', impostors: 'Дальний лес',
    weather: 'Погода', soldier: 'Бойцы', preLoop: 'Снаряжение', preFinish: 'Снаряжение', preInv: 'Шейдеры', inv: 'Шейдеры'
  };

  const root = document.createElement('div');
  root.id = 'intro';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Загрузка AEGIS');
  root.innerHTML =
    '<div class="ld-bg" aria-hidden="true"></div><div class="ld-show" aria-hidden="true"></div><div class="ld-scrim"></div>' +
    '<div class="ld-gun" aria-hidden="true"></div>' +
    '<div class="ld-main">' +
      '<div class="ld-brand"><div class="ld-logo">AEGIS</div><div class="ld-sub">Учебный полигон · Лесной рубеж</div></div>' +
      '<div class="ld-tip" aria-live="polite"><div class="ld-tip-h"></div><p class="ld-tip-t"></p></div>' +
    '</div>' +
    '<div class="ld-foot">' +
      '<div class="ld-row"><span class="ld-stage">Загрузка ресурсов</span><span class="ld-pct">0%</span></div>' +
      '<div class="ld-bar"><i></i></div>' +
    '</div>';
  document.body.appendChild(root);
  const $q = (s) => root.querySelector(s);
  const stageEl = $q('.ld-stage'), pctEl = $q('.ld-pct'), barEl = $q('.ld-bar i');
  const tipH = $q('.ld-tip-h'), tipT = $q('.ld-tip-t'), tipBox = $q('.ld-tip');
  API.active = true;
  document.body.classList.add('intro-on');

  /* подпись карты (фон — только чёрный, кадр-картинка больше не грузится) */
  const levelNames={angar_map:'Ангар',forest_map_camp:'Тихий бор',stroyka_zarechye_v2:'Заречье'};
  const mapId=new URLSearchParams(location.search).get('map');
  const level=levelNames[mapId];
  if(level)$q('.ld-sub').textContent='Боевая карта · '+level;

  /* ------------------------------ v25: 2D-иллюстрации оружия (без WebGL) -- */
  /* Рисунки — собственные векторные иллюстрации (tools/intro-art: детали в миллиметрах по реальным
     размерам, вид справа), заранее растеризованы в WebP (~30 КБ каждый). Слайд-шоу целиком на CSS:
     анимируются только opacity и transform, их ведёт поток композитора — смена кадров идёт плавно,
     даже когда главный поток на секунды занят сборкой полигона. Ни одного таймера и ни одного
     WebGL-контекста: на слабом ПК заставка не отнимает процессор у загрузки. Между сменами кадр
     неподвижен (композитор простаивает примерно 80 процентов времени). */
  const SHOW = [
    ['akm', 'АК-47 · АКМ', 'Автомат Калашникова модернизированный · 7,62×39 · 3,1 кг', '880 мм', {"w": 1707, "h": 623, "x0": 0.0264, "x1": 0.9801}],
    ['ak74', 'АК-74М', 'Автомат Калашникова, складной приклад · 5,45×39 · 3,4 кг', '943 мм', {"w": 1729, "h": 593, "x0": 0.0257, "x1": 0.9802}],
    ['m416', 'HK416 A5', 'Heckler & Koch · 5,56×45 NATO · 3,5 кг', '893 мм', {"w": 1748, "h": 562, "x0": 0.0238, "x1": 0.9803}],
    ['scar', 'SCAR-H', 'FN SCAR-H Mk 17 · 7,62×51 NATO · 3,6 кг', '965 мм', {"w": 1764, "h": 558, "x0": 0.0232, "x1": 0.9806}],
    ['mp5a3', 'MP5A3', 'Пистолет-пулемёт Heckler & Koch · 9×19 Парабеллум · 2,9 кг', '700 мм', {"w": 1687, "h": 666, "x0": 0.0256, "x1": 0.98}],
    ['m870', 'Remington 870', 'Police Magnum, помповое ружьё · 12/76 · 3,6 кг', '978 мм', {"w": 1764, "h": 418, "x0": 0.0232, "x1": 0.9806}],
    ['svd', 'СВД', 'Снайперская винтовка Драгунова · 7,62×54R · 4,3 кг с ПСО-1', '1225 мм', {"w": 1764, "h": 413, "x0": 0.0224, "x1": 0.9807}]
  ];
  const SLIDE_S = 6.5;
  /* v26: слайд-шоу больше не зависит от CSS-анимаций с задержками. На части ПК (главный поток
     занят разбором скриптов сразу после создания заставки) анимации стояли в кадре 0 %
     (opacity 0) — витрина была пустой. Теперь видимый слайд — просто класс .on: первый
     виден с первого кадра без всякой анимации, смену ведёт тот же 200-мс таймер прогресса,
     а плавность даёт CSS-переход (opacity/transform — поток композитора). Если главный поток
     занят, слайд просто дольше стоит на экране, но пустым экран не бывает. */
  const SL = { slides: [], caps: [], cur: 0, t0: performance.now() };
  (function buildShow() {
    const show = root.querySelector('.ld-show'), caps = root.querySelector('.ld-gun');
    SHOW.forEach((g, i) => {
      const m = g[4], f = document.createElement('div');
      f.className = 'ld-slot';
      f.innerHTML = '<div class="ld-slide' + (i === 0 ? ' on' : '') + '" style="--a:' + (m.w / m.h).toFixed(3) + '">' +
        '<img alt="" draggable="false" ' + (i === 0 ? 'fetchpriority="high"' : 'loading="eager"') + ' src="assets/intro/' + g[0] + '.webp" width="' + m.w + '" height="' + m.h + '">' +
        '<div class="ld-dim" style="left:' + (m.x0 * 100).toFixed(2) + '%;right:' + ((1 - m.x1) * 100).toFixed(2) + '%"><span>' + g[3] + '</span></div></div>';
      show.appendChild(f);
      SL.slides.push(f.firstChild);
      const c = document.createElement('div');
      c.className = 'ld-cap' + (i === 0 ? ' on' : '');
      c.innerHTML = '<div class="ld-gun-n"></div><div class="ld-gun-t"></div>';
      c.firstChild.textContent = g[1]; c.lastChild.textContent = g[2];
      caps.appendChild(c);
      SL.caps.push(c);
    });
  })();
  function slideTick() {
    const n = SL.slides.length; if (!n) return;
    const k = Math.floor((performance.now() - SL.t0) / (SLIDE_S * 1000)) % n;
    if (k === SL.cur) return;
    const prev = SL.cur; SL.cur = k;
    for (const L of [SL.slides, SL.caps]) {
      L[prev].classList.remove('on'); L[prev].classList.add('off');
      L[k].classList.remove('off'); L[k].classList.add('on');
    }
    /* ушедший слайд возвращается на исходную позицию уже невидимым */
    const back = prev;
    setTimeout(() => { if (SL.cur !== back) { SL.slides[back].classList.remove('off'); SL.caps[back].classList.remove('off'); } }, 1200);
  }
  const GL = {};

  /* советы: случайный старт, смена каждые 8 с с плавной сменой */
  let tipI = Math.floor(Math.random() * TIPS.length);
  function showTip() {
    const t = TIPS[tipI % TIPS.length];
    tipH.textContent = t[0]; tipT.innerHTML = t[1];
  }
  showTip();
  /* смена совета: текст меняется сразу, появление — CSS-анимацией на
     потоке композитора. Прежний вариант «скрыть → setTimeout → показать»
     на слабом ПК застревал скрытым: главный поток занят сборкой полигона,
     и таймер показа срабатывал через несколько секунд. */
  const tipTimer = setInterval(() => {
    tipI++; showTip();
    tipBox.classList.remove('swap'); void tipBox.offsetWidth; tipBox.classList.add('swap');
  }, 8000);

  /* прогресс: 0–70 % — скачивание и разбор файлов, 70–80 % — декодирование
     встроенных ассетов, 80–100 % — этапы сборки полигона (AEGIS_BOOT) */
  let shown = 0;
  function progress() {
    const lp = window.AEGIS_LOADP || { n: 0, k: 0 };
    let ga = 0;
    try { ga = window.GAssets && GAssets.progress ? GAssets.progress() : 0; } catch (e) { ga = 0; }
    const B = window.AEGIS_BOOT, bk = B && B.k ? Math.min(1, B.k) : 0;
    let stage = 'files';
    if (B && B.t && B.t.length) stage = String(B.t[B.t.length - 1][0]).split(' ')[0];
    const p = Math.min(0.99, (lp.k || 0) * 0.7 + ga * 0.1 + bk * 0.2);
    return { p, stage: B && B.t && B.t.length ? stage : (ga > 0 ? 'files' : 'files') };
  }
  function update() {
    if (API.closed) return;
    if (API.ready) {
      root.classList.add('ready');
      stageEl.textContent = 'Нажмите любую клавишу, чтобы продолжить';
      pctEl.textContent = '100%';
      barEl.style.transform = 'scaleX(1)';
      return;
    }
    const P = progress();
    /* полоса не откатывается назад и не прыгает рывками больше чем на 4 % */
    shown = Math.max(shown, Math.min(P.p, shown + 0.04));
    const pct = Math.round(shown * 100);
    barEl.style.transform = 'scaleX(' + shown.toFixed(3) + ')';
    pctEl.textContent = pct + '%';
    const s = STAGE[P.stage] || 'Сборка полигона';
    if (stageEl.textContent !== s + '…') stageEl.textContent = s + '…';
  }
  const upTimer = setInterval(() => { update(); slideTick(); }, 200);
  update();

  /* --------------------------------------------- управление и выход -- */
  function onInput(e) {
    if (API.closed) return;
    if (e.type === 'keydown' && (e.code === 'F12' || e.ctrlKey || e.metaKey)) return;
    try { window.AEGIS_UNLOCK_AUDIO && window.AEGIS_UNLOCK_AUDIO(); } catch (er) { /* */ }
    if (!API.ready) return;
    e.preventDefault(); e.stopImmediatePropagation();
    close();
  }
  const evs = ['keydown', 'pointerdown', 'wheel', 'contextmenu'];
  evs.forEach((t) => window.addEventListener(t, onInput, { capture: true, passive: false }));

  function close() {
    if (API.closed || !API.ready) return;
    API.closed = true; API.active = false;
    evs.forEach((t) => window.removeEventListener(t, onInput, { capture: true }));
    clearInterval(tipTimer); clearInterval(upTimer);
    root.classList.add('out');
    /* контекст WebGL заставки — сразу после затухания, видеопамять нужна бою */
    setTimeout(() => { if (GL.stop) GL.stop(); }, 640);   /* v25: WebGL нет — останавливать нечего */
    document.body.classList.remove('intro-on');
    setTimeout(() => root.remove(), 650);
    const cbs = API._onClose.splice(0); cbs.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
  }
})();
