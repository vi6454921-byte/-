
/* ==========================================================================
   МОДУЛЬ: game/flags.js
   ========================================================================== */
/* Флаги: ткань — сетка частиц Верле (Jakobsen, «Advanced Character
   Physics»): связи по нитям основы и утка, диагонали (сдвиг) и связи
   через узел (изгиб — слабые, ткань мягкая). Кромка у древка надета на
   фал и вращается вокруг древка, как на кольцах. Силы: тяжесть
   (полиэстер ~0,17 кг/м²) и аэродинамика по треугольникам — нормальная
   сила пластины 0,5·ρ·Cn·(v⊥)|v⊥|·A и трение вдоль ткани, от
   относительной скорости ветра и ткани. Ветер общий: направление
   медленно гуляет, порывы — сумма гармоник, плюс вихревая турбулентность,
   сносимая потоком: она и раскачивает полотнище волной от древка к
   свободному краю. Древко — препятствие: ткань его не проходит. */
(function (root, factory) {
  const M = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else root.GFlags = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const RHO = 1.2, SIGMA = 0.17, CN = 1.15, CT = 0.035, H = 1 / 120, H0 = H;

  /* v25: полотнища как настоящие войсковые флаги. Как их шьют:
     — поле — ткань, окрашенная в массе (полиэстер/нейлон): ровный цвет,
       без «камуфляжных клякс»; на солнце краска чуть выгорает к свободному
       краю, к низу — пыль;
     — у древка — «шляпка» (heading): полоса плотной белёсой парусины,
       сложенная вдвое и прошитая двумя строчками, с двумя латунными
       люверсами для фала;
     — свободный край подогнут и прошит в 4 строчки (он треплется сильнее
       всего), верх и низ — в 2 строчки;
     — эмблема и надпись — вышивка гладью: стежки под одним углом, края
       выпуклые, с тенью на поле;
     — флаг двусторонний: две половины сшиты спиной к спине, поэтому надпись
       читается с обеих сторон (у печатного одностороннего — зеркально).
       Это делает шейдер fabric(): на изнанке узор зеркалится обратно,
       а шляпка остаётся у древка.
     Холст рисуется векторно, без попиксельных циклов: ~5–10 мс. */
  const FONT = '"Arial Black", "Arial Bold", Impact, Arial, sans-serif';
  const HOIST = 0.045;               /* ширина шляпки, доля длины полотнища */
  function rng(seed) { let s = (seed >>> 0) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function hex(c) { return '#' + c.map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join(''); }

  /* поле: ровный цвет + мягкая неравномерность крашения + редкие нити
     основы/утка чуть другого тона */
  function field(g, W, H, col, rnd, K) {
    g.fillStyle = hex(col); g.fillRect(0, 0, W, H);
    for (let i = 0; i < 10; i++) {
      const x = rnd() * W, y = rnd() * H, r = (0.18 + rnd() * 0.3) * W, l = rnd() < 0.5;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, l ? 'rgba(255,250,235,0.035)' : 'rgba(0,0,0,0.05)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    for (let x = 0; x < W; x += 2) { const v = rnd(); if (v > 0.72) { g.fillStyle = 'rgba(0,0,0,' + ((v - 0.72) * 0.16).toFixed(3) + ')'; g.fillRect(x, 0, 1, H); } }
    for (let y = 0; y < H; y += 2) { const v = rnd(); if (v > 0.78) { g.fillStyle = 'rgba(255,255,255,' + ((v - 0.78) * 0.11).toFixed(3) + ')'; g.fillRect(0, y, W, 1); } }
  }
  /* строчка: стежки-штрихи и блик нитки */
  function seam(g, x0, y0, x1, y1, K, dark) {
    g.save(); g.lineCap = 'butt';
    g.setLineDash([5.5 * K, 2.6 * K]);
    g.lineWidth = 1.5 * K; g.strokeStyle = dark;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.lineWidth = 0.7 * K; g.strokeStyle = 'rgba(255,255,255,0.10)';
    g.beginPath(); g.moveTo(x0 - 0.6 * K, y0 - 0.6 * K); g.lineTo(x1 - 0.6 * K, y1 - 0.6 * K); g.stroke();
    g.restore();
  }
  /* подгибы по верху, низу и свободному краю: тень складки и строчки */
  function hems(g, W, H, hw, K) {
    const e = 15 * K, sh = 'rgba(0,0,0,0.16)';
    let gr = g.createLinearGradient(0, 0, 0, e); gr.addColorStop(0, sh); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(hw, 0, W - hw, e);
    gr = g.createLinearGradient(0, H, 0, H - e); gr.addColorStop(0, sh); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(hw, H - e, W - hw, e);
    gr = g.createLinearGradient(W, 0, W - e * 1.6, 0); gr.addColorStop(0, sh); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(W - e * 1.6, 0, e * 1.6, H);
    const d = 'rgba(0,0,0,0.38)';
    for (const y of [7 * K, 11.5 * K]) { seam(g, hw + 3 * K, y, W - 4 * K, y, K, d); seam(g, hw + 3 * K, H - y, W - 4 * K, H - y, K, d); }
    for (const x of [7 * K, 11.5 * K, 16 * K, 20.5 * K]) seam(g, W - x, 4 * K, W - x, H - 4 * K, K, d);
  }
  /* шляпка у древка: двойная парусина, две строчки, два люверса */
  function heading(g, W, H, hw, K, rnd) {
    g.fillStyle = '#d6d0bd'; g.fillRect(0, 0, hw, H);
    for (let x = 0; x < hw; x += 2) { g.fillStyle = 'rgba(80,70,50,' + (0.03 + rnd() * 0.05).toFixed(3) + ')'; g.fillRect(x, 0, 1, H); }
    for (let y = 0; y < H; y += 3) { g.fillStyle = 'rgba(255,255,255,' + (rnd() * 0.07).toFixed(3) + ')'; g.fillRect(0, y, hw, 1.5); }
    let gr = g.createLinearGradient(0, 0, hw, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.10)'); gr.addColorStop(0.25, 'rgba(0,0,0,0)'); gr.addColorStop(0.85, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = gr; g.fillRect(0, 0, hw, H);
    gr = g.createLinearGradient(hw, 0, hw + 7 * K, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.30)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(hw, 0, 7 * K, H);
    const d = 'rgba(70,62,48,0.6)';
    seam(g, hw - 4.5 * K, 3 * K, hw - 4.5 * K, H - 3 * K, K, d);
    seam(g, hw * 0.22, 3 * K, hw * 0.22, H - 3 * K, K, d);
    for (const y of [0.06 * H, 0.94 * H]) {
      const x = hw * 0.55, r = 8.5 * K;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(x + 1.2 * K, y + 1.6 * K, r + 1 * K, 0, 7); g.fill();
      const rg = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      rg.addColorStop(0, '#f2e1a2'); rg.addColorStop(0.55, '#b79b55'); rg.addColorStop(1, '#5e4d24');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.fillStyle = '#1b1812'; g.beginPath(); g.arc(x, y, r * 0.5, 0, 7); g.fill();
      g.strokeStyle = 'rgba(255,240,200,0.35)'; g.lineWidth = 1 * K; g.beginPath(); g.arc(x, y, r * 0.78, 3.6, 5.4); g.stroke();
    }
  }
  /* надпись по ширине: буквы с разрядкой, подгон под maxW */
  function word(l, text, cx, cy, size, sp, maxW, col) {
    l.fillStyle = col; l.textBaseline = 'middle'; l.textAlign = 'left';
    let fs = size, ws, tot;
    for (let k = 0; k < 6; k++) {
      l.font = '900 ' + fs.toFixed(1) + 'px ' + FONT;
      ws = [...text].map((ch) => l.measureText(ch).width);
      tot = ws.reduce((a, b) => a + b, 0) + sp * (fs / size) * (ws.length - 1);
      if (tot <= maxW) break;
      fs *= maxW / tot * 0.98;
    }
    let x = cx - tot / 2;
    [...text].forEach((ch, i) => { l.fillText(ch, x, cy); x += ws[i] + sp * (fs / size); });
  }
  function frame(l, x0, y0, x1, y1, K, col) {
    l.strokeStyle = col; l.lineJoin = 'miter';
    l.lineWidth = 5 * K; l.strokeRect(x0, y0, x1 - x0, y1 - y0);
    const q = 9 * K; l.lineWidth = 1.8 * K; l.strokeRect(x0 + q, y0 + q, x1 - x0 - 2 * q, y1 - y0 - 2 * q);
  }
  /* лавровые ветви вокруг эмблемы: стебель по дуге, у каждого узла —
     пара заострённых листьев (наружу и внутрь), к верхушке мельче */
  function laurel(l, cx, cy, R, K, col, side) {
    const a0 = Math.PI * 0.5 - side * 0.34, a1 = Math.PI * 0.5 - side * 1.95, n = 10;
    const P = (a) => [cx + Math.cos(a) * R, cy + Math.sin(a) * R];
    l.strokeStyle = col; l.lineWidth = 3.4 * K; l.lineCap = 'round';
    l.beginPath();
    for (let i = 0; i <= 28; i++) { const q = P(a0 + (a1 - a0) * i / 28); i ? l.lineTo(q[0], q[1]) : l.moveTo(q[0], q[1]); }
    l.stroke();
    const leaf = (x, y, ang, len, wid) => {
      l.save(); l.translate(x, y); l.rotate(ang);
      l.beginPath(); l.moveTo(0, 0);
      l.quadraticCurveTo(len * 0.45, -wid, len, 0);
      l.quadraticCurveTo(len * 0.45, wid, 0, 0);
      l.fill(); l.restore();
    };
    l.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, a = a0 + (a1 - a0) * t, q = P(a);
      const tg = a - side * Math.PI / 2, len = (34 - 13 * t) * K, wid = len * 0.3;
      leaf(q[0], q[1], tg + side * 0.62, len, wid);         /* наружу */
      leaf(q[0], q[1], tg - side * 0.5, len * 0.92, wid);   /* внутрь */
    }
    const q = P(a1);
    leaf(q[0], q[1], a1 - side * Math.PI / 2, 26 * K, 8 * K);
  }

  /* рисунок эмблемы (вышивка) — отдельным слоем, чтобы на изнанке
     положить его зеркально, а конструкцию флага (шляпку, подгибы,
     бахрому, выгорание) — как есть */
  function design(kind, W, Hh, K, hw) {
    const cx = hw + (W - hw) / 2;
    const L = document.createElement('canvas'); L.width = W; L.height = Hh;
    const l = L.getContext('2d');
    if (kind === 'delta') {
      /* «Дельта»: песочная вышивка по оливковому полю — рамка, пирамида
         из трёх граней (как на нарукавной нашивке), лавровые ветви */
      frame(l, hw + 30 * K, 30 * K, W - 32 * K, Hh - 30 * K, K, '#c4ab73');
      const h = Hh * 0.40, cy = Hh * 0.415, top = cy - h * 0.5, bot = cy + h * 0.5, hwp = h * 0.6, mid = top + h * 0.74;
      const T = [cx, top], BL = [cx - hwp, bot], BR = [cx + hwp, bot], M = [cx, mid];
      const tri = (a, b, d, col) => { l.fillStyle = col; l.beginPath(); l.moveTo(a[0], a[1]); l.lineTo(b[0], b[1]); l.lineTo(d[0], d[1]); l.closePath(); l.fill(); };
      tri(T, M, BL, '#9b8150'); tri(T, BR, M, '#d2b87f'); tri(M, BR, BL, '#7c6639');
      l.globalCompositeOperation = 'destination-out';
      l.lineWidth = 5 * K; l.lineCap = 'butt';
      l.beginPath(); l.moveTo(T[0], T[1] + 6 * K); l.lineTo(M[0], M[1]); l.lineTo(BR[0] - 7 * K, BR[1] - 2 * K); l.moveTo(M[0], M[1]); l.lineTo(BL[0] + 7 * K, BL[1] - 2 * K); l.stroke();
      l.globalCompositeOperation = 'source-over';
      laurel(l, cx, cy + h * 0.02, h * 0.82, K, '#b79d64', -1);
      laurel(l, cx, cy + h * 0.02, h * 0.82, K, '#b79d64', 1);
      word(l, 'DELTA', cx, Hh * 0.815, 92 * K, 20 * K, (W - hw) * 0.5, '#cdb47b');
    } else if (kind === 'alpha') {
      /* «Альфа»: серебристо-белая рамка, щит с шевроном «А» с нашивки */
      frame(l, hw + 30 * K, 30 * K, W - 32 * K, Hh - 30 * K, K, '#c9cbc6');
      const sw = Hh * 0.40, sh = Hh * 0.50, cy = Hh * 0.40, x0 = cx - sw / 2, x1 = cx + sw / 2, y0 = cy - sh / 2;
      const shield = (ins) => {
        l.beginPath();
        l.moveTo(x0 + ins, y0 + ins); l.lineTo(x1 - ins, y0 + ins); l.lineTo(x1 - ins, cy + sh * 0.06);
        l.quadraticCurveTo(x1 - ins, cy + sh * 0.34, cx, cy + sh * 0.5 - ins * 1.3);
        l.quadraticCurveTo(x0 + ins, cy + sh * 0.34, x0 + ins, cy + sh * 0.06); l.closePath();
      };
      l.fillStyle = '#c9cbc6'; shield(0); l.fill();
      l.fillStyle = '#26282b'; shield(7 * K); l.fill();
      const s = sh * 0.0062, ox = cx - 64 * s, oy = cy - 64 * s + sh * 0.02;
      const poly = (pts) => { l.beginPath(); pts.forEach((q, i) => { const x = ox + q[0] * s, y = oy + q[1] * s; i ? l.lineTo(x, y) : l.moveTo(x, y); }); l.closePath(); l.fill(); };
      l.fillStyle = '#ecece6';
      poly([[64, 20], [110, 104], [86, 104], [64, 62], [42, 104], [18, 104]]);
      poly([[64, 74], [76, 96], [52, 96]]);
      word(l, 'ALPHA', cx, Hh * 0.815, 92 * K, 20 * K, (W - hw) * 0.5, '#dcddd8');
    } else return null;
    /* гладь: стежки под углом, общий скат света */
    l.globalCompositeOperation = 'source-atop';
    l.save(); l.translate(W / 2, Hh / 2); l.rotate(-0.62);
    const D = Math.hypot(W, Hh) / 2 + 4, st = 2.6 * K;
    for (let t = -D, i = 0; t < D; t += st, i++) {
      l.fillStyle = i & 1 ? 'rgba(255,255,255,0.075)' : 'rgba(0,0,0,0.11)';
      l.fillRect(t, -D, st * 0.55, 2 * D);
    }
    l.restore();
    const gr = l.createLinearGradient(0, 0, W * 0.3, Hh);
    gr.addColorStop(0, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0.08)');
    l.fillStyle = gr; l.fillRect(0, 0, W, Hh);
    l.globalCompositeOperation = 'source-over';
    return L;
  }

  /* одна сторона полотнища: поле, вышивка (на изнанке — зеркально в
     пределах поля), подгибы, шляпка, износ */
  function side(g, kind, W, Hh, K, hw, o, L, mirror) {
    const seed = kind === 'alpha' ? 7 : kind === 'delta' ? 13 : 29 + ((o.color && o.color[0] * 97) | 0);
    let rnd = rng(seed);
    const col = kind === 'delta' ? [76, 86, 54] : kind === 'alpha' ? [22, 23, 25]
      : (o.color || [0.3, 0.03, 0.025]).map((v) => Math.round(Math.pow(v, 1 / 2.2) * 255));
    field(g, W, Hh, col, rnd, K);
    if (L) {
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 2.6 * K; g.shadowOffsetX = (mirror ? -1.1 : 1.1) * K; g.shadowOffsetY = 1.7 * K;
      if (mirror) { g.translate(W + hw, 0); g.scale(-1, 1); }
      g.drawImage(L, 0, 0);
      g.restore();
    }
    hems(g, W, Hh, hw, K);
    heading(g, W, Hh, hw, K, rnd);
    const wear = o.wear || 0;
    if (wear > 0) {
      rnd = rng(seed * 31 + 5);
      let gr = g.createLinearGradient(W, 0, W * 0.35, 0);
      gr.addColorStop(0, 'rgba(235,228,205,' + (0.16 * wear).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(235,228,205,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
      gr = g.createLinearGradient(0, Hh, 0, Hh * 0.6);
      gr.addColorStop(0, 'rgba(92,78,56,' + (0.22 * wear).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(92,78,56,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 14 * wear; i++) {
        const x = hw + rnd() * (W - hw), y = Hh * (0.5 + rnd() * 0.5), r = (20 + rnd() * 60) * K;
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, 'rgba(70,58,40,' + (0.10 * wear).toFixed(3) + ')'); rg.addColorStop(1, 'rgba(70,58,40,0)');
        g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      if (o.fray) {
        /* бахрома: свободный край истрёпан ветром (нужен alphaTest);
           одинаковая с обеих сторон — это край одной и той же ткани */
        g.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 40 * wear; i++) {
          const y = rnd() * Hh, d = (3 + rnd() * 26 * wear) * K;
          g.beginPath(); g.moveTo(W + 1, y - (2 + rnd() * 8) * K); g.lineTo(W - d, y + (rnd() - 0.5) * 3 * K); g.lineTo(W + 1, y + (2 + rnd() * 8) * K); g.closePath(); g.fill();
        }
        g.globalCompositeOperation = 'source-over';
      }
    }
  }

  /* эмблема: kind 'delta' | 'alpha' | 'plain' (o.color); o.w/h — размер
     стороны, o.wear 0..1 — выгорание/пыль, o.fray — бахрома.
     Результат — атлас: сверху лицевая сторона, снизу изнанка (тот же
     флаг, рисунок зеркально — как у сшитого двустороннего). */
  function emblem(kind, opt) {
    const o = opt || {};
    const W = o.w || 1024, Hh = o.h || Math.round(W * 2 / 3), K = Hh / 683;
    const hw = Math.round(W * HOIST);
    const L = design(kind, W, Hh, K, hw);
    const c = document.createElement('canvas'); c.width = W; c.height = Hh * 2;
    const g = c.getContext('2d');
    side(g, kind, W, Hh, K, hw, o, L, false);
    g.save(); g.translate(0, Hh);
    g.beginPath(); g.rect(0, 0, W, Hh); g.clip();
    side(g, kind, W, Hh, K, hw, o, L, true);
    g.restore();
    c.hoist = hw / W; c.atlas = true;
    return c;
  }

  /* полотняное переплетение для рельефа ткани (bumpMap, повтор) */
  let _weave = null;
  function weaveCanvas() {
    if (_weave) return _weave;
    const S = 64, n = 8, cell = S / n, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#555'; g.fillRect(0, 0, S, S);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = i * cell, y = j * cell, over = (i + j) & 1;
      const gr = over ? g.createLinearGradient(x, y, x, y + cell) : g.createLinearGradient(x, y, x + cell, y);
      gr.addColorStop(0, '#5a5a5a'); gr.addColorStop(0.5, '#d0d0d0'); gr.addColorStop(1, '#5a5a5a');
      g.fillStyle = gr; g.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    }
    return (_weave = c);
  }
  function weaveTexture(THREE, w, h) {
    const t = new THREE.CanvasTexture(weaveCanvas());
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.max(1, Math.round(w / 0.012)), Math.max(1, Math.round(h / 0.012)));
    t.anisotropy = 4;
    return t;
  }
  /* шейдер ткани для любого MeshStandardMaterial флага с атласом emblem():
     1) лицевая грань берёт верхнюю половину атласа, изнанка — нижнюю:
        надпись читается с обеих сторон, шляпка — у древка, бахрома и
        выгорание — на своих местах (тень и alphaTest берут лицевую);
     2) просвет: тонкая ткань пропускает ~треть света солнца, если оно с
        другой стороны. Вставлено до lights_fragment_end — тень крон
        (01_gloom) гасит и его. */
  function fabric(mat, opt) {
    const o = opt || {};
    const tr = o.trans !== undefined ? o.trans : 0.45;
    const prev = mat.__glF !== undefined ? mat.__glF : (Object.prototype.hasOwnProperty.call(mat, 'onBeforeCompile') ? mat.onBeforeCompile : null);
    mat.onBeforeCompile = function (sh, r) {
      if (typeof prev === 'function') prev.call(this, sh, r);
      /* 3) тень у ткани нулевой толщины: штатный normalBias сдвигает точку
         вдоль нормали лицевой грани — и та сторона, что смотрит на
         солнце «изнанкой», уходила в собственную тень (тёмное пятно).
         Сдвигаем всегда к солнцу: направление света — градиент глубины
         матрицы тени (строка z). */
      const TH = globalThis.THREE, ch = TH && TH.ShaderChunk && TH.ShaderChunk.shadowmap_vertex;
      const line = 'shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );';
      if (ch && ch.indexOf(line) >= 0) {
        sh.vertexShader = sh.vertexShader.replace('#include <shadowmap_vertex>', ch.replace(line,
          'vec3 fLd = vec3( directionalShadowMatrix[ i ][ 0 ][ 2 ], directionalShadowMatrix[ i ][ 1 ][ 2 ], directionalShadowMatrix[ i ][ 2 ][ 2 ] );\n' +
          'shadowWorldPosition = worldPosition + vec4( ( dot( shadowWorldNormal, fLd ) > 0.0 ? -shadowWorldNormal : shadowWorldNormal ) * directionalLightShadows[ i ].shadowNormalBias, 0 );'));
      }
      sh.uniforms.uFlagTrans = { value: tr };
      sh.uniforms.uFlagAtlas = { value: mat.map && mat.map.userData && mat.map.userData.atlas ? 0.5 : 0.0 };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uFlagTrans;\nuniform float uFlagAtlas;')
        .replace('#include <map_fragment>', `#ifdef USE_MAP
          vec2 fUv = vMapUv;
          if ( !gl_FrontFacing ) fUv.y -= uFlagAtlas;
          diffuseColor *= texture2D( map, fUv );
        #endif`)
        .replace('#include <lights_fragment_end>', `#if NUM_DIR_LIGHTS > 0
          {
            float fBack = max( 0.0, -dot( normal, directLight.direction ) );
            reflectedLight.directDiffuse += diffuseColor.rgb * directLight.color * ( fBack * uFlagTrans * RECIPROCAL_PI );
          }
        #endif
        #include <lights_fragment_end>`);
    };
    mat.userData.aegisFabric = 1;
    return mat;
  }
  const _texCache = {};
  function texture(THREE, kind, opt) {
    const o = opt || {}, key = kind + '|' + (o.w || 1024) + '|' + (o.h || 0) + '|' + (o.wear || 0) + '|' + (o.fray ? 1 : 0) + '|' + (o.color ? o.color.join(',') : '');
    if (_texCache[key]) return _texCache[key];
    const c = emblem(kind, o);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    /* по умолчанию uv -> лицевая (верхняя) половина атласа */
    t.repeat.set(1, 0.5); t.offset.set(0, 0.5);
    t.userData = { hoist: c.hoist, atlas: true };
    return (_texCache[key] = t);
  }

  function create(THREE, opt) {
    const o = opt || {};
    const scene = o.scene, groundAt = o.groundAt || (() => 0);
    const FL = { list: [], t: 0, wind: new THREE.Vector3(), base: o.windDir || Math.atan2(0.18, 0.35), U0: o.windSpeed || 4.2 };
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x9a9c9b, roughness: 0.42, metalness: 0.75 });
    const knobMat = new THREE.MeshStandardMaterial({ color: 0xb59a52, roughness: 0.35, metalness: 0.85 });
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xd8d4c6, roughness: 0.9 });

    /* ветер в момент t в точке (x, y, z): средний поток + порыв +
       вихри, переносимые потоком */
    function windAt(out, x, y, z, t) {
      if(globalThis.AEGIS_WIND){const w=globalThis.AEGIS_WIND(x,y,z,t);return out.set(w.x,w.y,w.z);}
      const U = FL.U, dx = FL.dir.x, dz = FL.dir.z;
      const s = x * dx + z * dz - U * t;          /* координата вдоль потока в подвижной системе */
      const q = -x * dz + z * dx;
      const n1 = Math.sin(s * 2.1 + q * 0.7 + y * 1.3) * 0.6 + Math.sin(s * 4.7 - y * 2.9 + 1.7) * 0.4;
      const n2 = Math.sin(s * 1.7 - q * 1.1 + 2.3) * 0.6 + Math.sin(s * 5.3 + y * 3.7) * 0.4;
      const n3 = Math.sin(s * 2.9 + y * 2.3 + 4.1) * 0.5 + Math.sin(s * 6.1 + q * 1.9) * 0.5;
      const k = 0.32 * U;
      out.set(dx * U + (-dz) * n1 * k + dx * n3 * k * 0.5, n2 * k * 0.55, dz * U + dx * n1 * k + dz * n3 * k * 0.5);
      return out;
    }

    function add(spec) {
      const lite = ['low','ultra'].includes(globalThis.AEGIS_QTIER||o.quality);
      const nx = spec.nx || (lite?14:20), ny = spec.ny || (lite?10:14), w = spec.w, h = spec.h;
      const x0 = spec.x, z0 = spec.z, gy = spec.y0 !== undefined ? spec.y0 : groundAt(x0, z0);
      const top = gy + spec.poleH;
      const grp = new THREE.Group(); grp.name = 'flag_' + (spec.name || FL.list.length);
      if (spec.pole !== false) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.045, spec.poleH + 0.25, 12), poleMat);
        pole.position.set(x0, gy + (spec.poleH + 0.25) / 2 - 0.25 + 0.06, z0);
        pole.castShadow = pole.receiveShadow = true;
        grp.add(pole);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), knobMat);
        knob.position.set(x0, top + 0.1, z0); knob.castShadow = true; grp.add(knob);
        /* бетонный стакан у основания */
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 14), new THREE.MeshStandardMaterial({ color: 0x8b8984, roughness: 0.95 }));
        foot.position.set(x0, gy + 0.06, z0); foot.receiveShadow = foot.castShadow = true; grp.add(foot);
        /* фал: от нижнего угла полотнища к утке на древке */
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, spec.poleH - h - 1.1, 4), ropeMat);
        rope.position.set(x0 + 0.035, gy + 1.1 + (spec.poleH - h - 1.1) / 2, z0); grp.add(rope);
        if (o.colliders) o.colliders.push({ type: 'cyl', x: x0, z: z0, r: 0.08, h: spec.poleH });
      }
      const N = nx * ny;
      const p = new Float32Array(N * 3), pp = new Float32Array(N * 3), f = new Float32Array(N * 3), m = new Float32Array(N);
      const dx = w / (nx - 1), dy = h / (ny - 1);
      /* старт — полотнище по ветру, иначе первый же кадр — рывок */
      const a0 = FL.base;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        p[k * 3] = x0 + Math.cos(a0) * i * dx; p[k * 3 + 1] = top - spec.drop - j * dy; p[k * 3 + 2] = z0 + Math.sin(a0) * i * dx;
        m[k] = SIGMA * dx * dy * ((i === 0 || i === nx - 1) ? 0.5 : 1) * ((j === 0 || j === ny - 1) ? 0.5 : 1);
      }
      pp.set(p);
      const C = [];
      const L = (a, b, st) => C.push(a, b, Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]), st);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (i < nx - 1) L(k, k + 1, 1);
        if (j < ny - 1) L(k, k + nx, 1);
        if (i < nx - 1 && j < ny - 1) { L(k, k + nx + 1, 0.7); L(k + 1, k + nx, 0.7); }
        if (i < nx - 2) L(k, k + 2, 0.12);
        if (j < ny - 2) L(k, k + 2 * nx, 0.12);
      }
      const geo = new THREE.PlaneGeometry(w, h, nx - 1, ny - 1);
      /* v25: ткань — текстура флага (эмблема или ровное поле) + рельеф
         переплетения + шейдер двустороннего флага с просветом */
      const tex = texture(THREE, spec.kind || 'plain', spec.kind ? { wear: spec.wear || 0.25 } : { color: spec.color, wear: spec.wear || 0.35 });
      const mat = fabric(new THREE.MeshStandardMaterial({ map: tex, bumpMap: weaveTexture(THREE, w, h), bumpScale: 0.5, roughness: 0.84, metalness: 0, side: THREE.DoubleSide }));
      if (lite) mat.bumpMap = null;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      mesh.raycast = () => {};
      grp.add(mesh);
      scene.add(grp);
      const F = { spec, nx, ny, N, p, pp, f, m, C: new Float32Array(C), mesh, geo, x0, z0, top, drop: spec.drop, dy, acc: 0, poleR: spec.poleR || 0.04 };
      FL.list.push(F);
      return F;
    }

    const _w = new THREE.Vector3();
    /* v10: ветер считается один раз на узел (а не на каждый треугольник —
       их вдвое больше), силы по треугольникам — без временных массивов:
       раньше [[k,k+1,k+nx],…] и [a,b,c] создавались ~1000 раз за шаг, и
       сборщик мусора дёргал кадр. Физика та же (Jakobsen + аэродинамика
       пластины), ветер треугольника — среднее его трёх узлов. */
    function triForce(F, a, b, c) {
      const p = F.p, pp = F.pp, f = F.f, Wv = F.wv;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      let nxv = uy * vz - uz * vy, nyv = uz * vx - ux * vz, nzv = ux * vy - uy * vx;
      const nl = Math.sqrt(nxv * nxv + nyv * nyv + nzv * nzv) || 1e-9, A = nl * 0.5;
      nxv /= nl; nyv /= nl; nzv /= nl;
      const i3 = 1 / (3 * (F.hc || H));
      const tvx = ((p[a] - pp[a]) + (p[b] - pp[b]) + (p[c] - pp[c])) * i3;
      const tvy = ((p[a + 1] - pp[a + 1]) + (p[b + 1] - pp[b + 1]) + (p[c + 1] - pp[c + 1])) * i3;
      const tvz = ((p[a + 2] - pp[a + 2]) + (p[b + 2] - pp[b + 2]) + (p[c + 2] - pp[c + 2])) * i3;
      const rx = (Wv[a] + Wv[b] + Wv[c]) / 3 - tvx, ry = (Wv[a + 1] + Wv[b + 1] + Wv[c + 1]) / 3 - tvy, rz = (Wv[a + 2] + Wv[b + 2] + Wv[c + 2]) / 3 - tvz;
      const vn = rx * nxv + ry * nyv + rz * nzv;
      const fn = 0.5 * RHO * CN * vn * Math.abs(vn) * A;
      const tx = rx - vn * nxv, ty = ry - vn * nyv, tz = rz - vn * nzv;
      const tl = Math.sqrt(tx * tx + ty * ty + tz * tz), ft = 0.5 * RHO * CT * tl * A;
      const Fx = (fn * nxv + ft * tx) / 3, Fy = (fn * nyv + ft * ty) / 3, Fz = (fn * nzv + ft * tz) / 3;
      f[a] += Fx; f[a + 1] += Fy; f[a + 2] += Fz;
      f[b] += Fx; f[b + 1] += Fy; f[b + 2] += Fz;
      f[c] += Fx; f[c + 1] += Fy; f[c + 2] += Fz;
    }
    function step(F, t, iters, hS) {
      const H = hS || H0; F.hc = H;
      const { p, pp, f, m, N, nx, ny, C } = F;
      f.fill(0);
      const Wv = F.wv || (F.wv = new Float32Array(N * 3));
      // Sample the slowly varying shared wind at cloth corners, not at all 280 nodes.
      // Bilinear interpolation keeps a spatial gradient and removes repeated canopy queries.
      const sample=F.windCorners||(F.windCorners=new Float32Array(12));
      const corners=F.windCornerIds||(F.windCornerIds=[0,nx-1,(ny-1)*nx,N-1]);
      for(let i=0;i<4;i++){const q=corners[i]*3;windAt(_w,p[q],p[q+1],p[q+2],t);sample[i*3]=_w.x;sample[i*3+1]=_w.y;sample[i*3+2]=_w.z;}
      for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
        const u=i/(nx-1),v=j/(ny-1),q=(j*nx+i)*3;
        for(let a=0;a<3;a++){const lo=sample[a]+(sample[3+a]-sample[a])*u,hi=sample[6+a]+(sample[9+a]-sample[6+a])*u;Wv[q+a]=lo+(hi-lo)*v;}
      }
      /* аэродинамика по треугольникам */
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const k = j * nx + i;
        triForce(F, k * 3, (k + 1) * 3, (k + nx) * 3);
        triForce(F, (k + 1) * 3, (k + nx + 1) * 3, (k + nx) * 3);
      }
      /* Верле */
      const hh = H * H;
      for (let k = 0; k < N; k++) {
        const q = k * 3, im = 1 / m[k];
        const x = p[q], y = p[q + 1], z = p[q + 2];
        p[q] += (x - pp[q]) * 0.996 + f[q] * im * hh;
        p[q + 1] += (y - pp[q + 1]) * 0.996 + (f[q + 1] * im - 9.81) * hh;
        p[q + 2] += (z - pp[q + 2]) * 0.996 + f[q + 2] * im * hh;
        pp[q] = x; pp[q + 1] = y; pp[q + 2] = z;
      }
      const gy = F.gy !== undefined ? F.gy : (F.gy = groundAt(F.x0, F.z0) + 0.03), R = F.poleR;
      for (let it = 0; it < iters; it++) {
        for (let c = 0; c < C.length; c += 4) {
          const a = C[c] * 3, b = C[c + 1] * 3, L = C[c + 2], st = C[c + 3];
          const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
          /* ткань почти не тянется, но сжимается свободно (сминается) у изгибных связей */
          if (st < 0.5 && d < L) continue;
          const k = (d - L) / d * 0.5 * st;
          p[a] += dx * k; p[a + 1] += dy * k; p[a + 2] += dz * k;
          p[b] -= dx * k; p[b + 1] -= dy * k; p[b + 2] -= dz * k;
        }
        /* кромка на фале: на оси древка */
        for (let j = 0; j < ny; j++) {
          const q = j * nx * 3;
          p[q] = F.x0; p[q + 1] = F.top - F.drop - j * F.dy; p[q + 2] = F.z0;
        }
        /* древко и грунт */
        for (let k = 0; k < N; k++) {
          if (k % nx === 0) continue;
          const q = k * 3;
          const ex = p[q] - F.x0, ez = p[q + 2] - F.z0, e = Math.sqrt(ex * ex + ez * ez);
          if (e < R && p[q + 1] < F.top + 0.1) {
            const s = e > 1e-6 ? R / e : 0;
            if (s) { p[q] = F.x0 + ex * s; p[q + 2] = F.z0 + ez * s; } else p[q] += R;
          }
          if (p[q + 1] < gy) p[q + 1] = gy;
        }
      }
    }

    let _fr = null, _frF = -1;
    const _pm = new THREE.Matrix4();
    FL.frameN = 0;
    FL.update = function (dt, cam) {
      FL.frameN++;
      dt = Math.min(dt || 0, 0.05);
      FL.t += dt;
      const t = FL.t;
      /* направление и сила ветра: медленные блуждания и порывы */
      const ang = FL.base + 0.32 * Math.sin(t * 0.047) + 0.14 * Math.sin(t * 0.13 + 1.1) + 0.05 * Math.sin(t * 0.61 + 2.3);
      const gust = 0.42 * Math.sin(t * 0.29) + 0.26 * Math.sin(t * 0.71 + 2.0) + 0.16 * Math.sin(t * 1.63 + 4.0) + 0.1 * Math.sin(t * 3.1 + 0.4);
      FL.U = FL.U0 * Math.max(0.25, 1 + 0.4 * gust);
      FL.dir = FL.wind.set(Math.cos(ang), 0, Math.sin(ang));
      for (const F of FL.list) {
        /* v10: LOD ткани, как у cloth в UE/Unity: вне кадра полотнище
           «спит» (форма остаётся, симуляции нет), далеко — меньше итераций
           связей. В кадре вблизи — полные 10 итераций. */
        let iters = 10;
        if (cam) {
          const c = F.ctr || (F.ctr = new THREE.Vector3(F.x0, F.top - F.drop - F.dy * (F.ny - 1) * 0.5, F.z0));
          const d = cam.position.distanceTo(c);
          if (!F.sph) F.sph = new THREE.Sphere(c, Math.hypot(F.spec.w, F.spec.h) + 0.3);
          if (!_fr || _frF !== FL.frameN) {
            _frF = FL.frameN;
            _pm.copy(cam.matrixWorld).invert().premultiply(cam.projectionMatrix);
            (_fr || (_fr = new THREE.Frustum())).setFromProjectionMatrix(_pm);
          }
          if (!_fr.intersectsSphere(F.sph) || d > 90) { F.acc = 0; F.sleep = true; continue; }
          F.sleep = false;
          /* v14: дальше 20 м — шаг 1/60 вместо 1/120 и меньше итераций
             (на экране полотнище — десяток пикселей); на «Низком» качестве —
             не больше 6 итераций. Вдвое-вчетверо дешевле, вид тот же. */
          const lowQ = ['low','ultra'].includes(globalThis.AEGIS_QTIER||o.quality);
          iters = d < 20 ? (lowQ ? 6 : 9) : d < 45 ? 5 : 3;
          F.h = d < 20 && !lowQ ? H : H * 2;
        } else F.h = H;
        const hS = F.h || H;
        F.acc += dt;
        let n = 0;
        /* не больше 3 подшагов за кадр: на слабом ПК при просадке кадра
           ткань не должна съедать ещё больше времени («спираль смерти») */
        while (F.acc >= hS && n < 3) { F.acc -= hS; step(F, t - F.acc, iters, hS); n++; }
        if (n === 3) F.acc = 0;
        if (n === 0) continue;
        /* вершины сетки -> геометрия (порядок PlaneGeometry совпадает) */
        const pos = F.geo.attributes.position, arr = pos.array, p = F.p;
        for (let k = 0; k < F.N; k++) { arr[k * 3] = p[k * 3]; arr[k * 3 + 1] = p[k * 3 + 1]; arr[k * 3 + 2] = p[k * 3 + 2]; }
        pos.needsUpdate = true;
        if(!['low','ultra'].includes(globalThis.AEGIS_QTIER||o.quality)||FL.frameN%2===0)F.geo.computeVertexNormals();
      }
    };
    FL.dir = FL.wind.set(Math.cos(FL.base), 0, Math.sin(FL.base));
    FL.U = FL.U0;
    FL.add = add;
    FL.windAt = windAt;
    return FL;
  }
  return { create, emblem, texture, fabric, weaveTexture, HOIST };
});
