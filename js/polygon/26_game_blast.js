
/* ==========================================================================
   МОДУЛЬ: game/blast.js
   ========================================================================== */
/* ============================================================================
   Подрыв мины: вспышка, столб грунта и дыма, кольцо пыли, комья земли,
   мелкая земля, воронка.

   ПМН-2 (≈100 г ТГ-40) лежит в грунте на 1–4 см. Вспышка короткая
   (сотые доли секунды) и почти вся скрыта грунтом. Газы выбрасывают
   конус грунта вверх: тёмный буро-серый столб за 0,2–0,4 с поднимается на
   3–5 м и тормозится воздухом, верх расползается шапкой. Понизу ударная
   волна гонит кольцо светлой пыли на 2–4 м. Комья и мелкая земля летят
   по баллистике и через 1–2 с осыпаются. Дым тротила тёмный (сажа),
   пыль грунта — серо-бурая; облако светлеет, тянется ветром и за
   8–12 с рассеивается. На месте — воронка Ø 0,3–0,5 м с закопчённым дном
   и выброшенной землёй вокруг.

   ОЗМ-72: вышибной заряд выбрасывает корпус из стакана (глухой хлопок,
   облачко серого дыма и земли), на высоте 0,6–0,8 м его догоняет
   натянувшийся трос и рвётся основной заряд (660 г ТНТ): сферическая
   вспышка, чёрно-серый шар дыма, осколки поднимают по грунту пыльные
   фонтанчики на десятки метров.

   Дым — billboard-частицы с обычным PBR-освещением сцены (окружение,
   солнце, тени, туман): нормали клубов берутся из атласа, поэтому облако
   освещено так же, как всё вокруг, и не светится само. Сортировка по
   глубине — на CPU, внизу частица мягко гаснет у грунта, вблизи камеры —
   тоже, чтобы не было резких срезов.
   ========================================================================== */
(function (root, factory) {
  const B = factory(root.GUtil);
  if (typeof module !== 'undefined' && module.exports) module.exports = B;
  else root.GBlast = B;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';
  const TAU = Math.PI * 2;
  const R = Math.random;
  const rr = (a, b) => a + (b - a) * R();
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ------------------------------------------------ шум для текстур --- */
  function hash2(x, y, s) {
    let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, oct) {
    let a = 0.5, f = 1, t = 0, n = 0;
    for (let i = 0; i < oct; i++) { t += a * vnoise(x * f, y * f, s + i * 17); n += a; a *= 0.5; f *= 2.03; }
    return t / n;
  }

  /* Атлас клубов 2×2: R,G — нормаль (касательное пространство), B —
     толщина, A — покрытие. Клуб — искривлённое пятно с гребнями
     турбулентного шума («цветная капуста») и рваным краем; нормаль — от
     плотности, мягкая: пыль рассеивает свет многократно и не выглядит
     твёрдым шаром. Данные, не цвет: без предумножения альфы. */
  function smokeAtlas(THREE) {
    const T = 128, W = T * 2, data = new Uint8Array(W * W * 4), d = new Float32Array(T * T);
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
      const seed = 11 + tx * 7 + ty * 13;
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        const px = (x + 0.5) / T * 2 - 1, py = (y + 0.5) / T * 2 - 1;
        const r = Math.hypot(px, py);
        /* искривлённый круг: край клуба рваный, не циркульный */
        const wx = px + 0.42 * (fbm(px * 1.6 + seed, py * 1.6, seed, 3) - 0.5);
        const wy = py + 0.42 * (fbm(px * 1.6, py * 1.6 + seed, seed + 3, 3) - 0.5);
        const rw = Math.hypot(wx, wy);
        const base = 1 - sstep(0.0, 0.86, rw);
        /* «цветная капуста»: гребни турбулентного шума */
        const bill = 1 - Math.abs(fbm(wx * 3.1 + 7, wy * 3.1 - 2, seed + 9, 4) * 2 - 1);
        const fine = fbm(px * 9.0 + 1.3, py * 9.0 + 4.1, seed + 21, 3) - 0.5;
        let v = base * (0.5 + 0.62 * bill) + fine * 0.3 * base;
        v *= 1 - sstep(0.74, 1.0, r);
        d[y * T + x] = clamp(v, 0, 1);
      }
      const h = (i, j) => { i = clamp(i, 0, T - 1); j = clamp(j, 0, T - 1); return d[j * T + i]; };
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        const dx = (h(x + 1, y) - h(x - 1, y)) * 7, dy = (h(x, y + 1) - h(x, y - 1)) * 7;
        let nx = -dx, ny = -dy, nz = 1;
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l;
        const v = d[y * T + x];
        const k = ((ty * T + y) * W + tx * T + x) * 4;
        data[k] = Math.round((nx * 0.5 + 0.5) * 255);
        data[k + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[k + 2] = Math.round(v * 255);
        data[k + 3] = Math.round(sstep(0.06, 0.62, v) * 255);
      }
    }
    const t = new THREE.DataTexture(data, W, W, THREE.RGBAFormat);
    t.colorSpace = THREE.NoColorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }

  /* v19: тот же атлас 2×2 (RG нормаль, B толщина, A покрытие), но из кадров
     настоящего клуба дыма — Unity Labs VFX Flipbooks «Cloud02» (CC0),
     assets/data/vfx_blast.js. Данные приходят асинхронно (deflate), до этого
     и без файла работает процедурный атлас. */
  const G0 = typeof self !== 'undefined' ? self : globalThis;
  function upgradeSmokeAtlas(tex) {
    const D = G0.__VFX_DATA;
    if (!D || !D.smoke || typeof DecompressionStream === 'undefined' || typeof Response === 'undefined') return;
    try {
      const bin = atob(D.smoke), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer().then((buf) => {
        const a = new Uint8Array(buf), img = tex.image;
        if (!img || !img.data || a.length !== img.data.length) return;
        img.data.set(a); tex.needsUpdate = true;
      }).catch(() => { /* остаётся процедурный */ });
    } catch (e) { /* остаётся процедурный */ }
  }

  /* вспышка: тёплое ядро и короткие лучи */
  function flashCanvas() {
    const S = 128, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    r.addColorStop(0, 'rgba(255,252,236,1)');
    r.addColorStop(0.12, 'rgba(255,236,180,0.95)');
    r.addColorStop(0.32, 'rgba(255,170,70,0.45)');
    r.addColorStop(0.62, 'rgba(240,100,25,0.12)');
    r.addColorStop(1, 'rgba(200,60,10,0)');
    g.fillStyle = r; g.fillRect(0, 0, S, S);
    return cv;
  }

  /* воронка: закопчённое дно, рваный край, выброшенная земля лучами */
  function craterCanvas(kind, seed) {
    const S = 256, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const c = S / 2;
    let s = seed * 7919 + 13;
    const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    const core = kind === 'ozm' ? 0.16 : kind === 'tm' ? 0.36 : 0.26;
    /* земля, выброшенная из воронки: гуще у края, редеет наружу */
    for (let i = 0; i < 1400; i++) {
      const a = rnd() * TAU, rad = (core + Math.pow(rnd(), 1.6) * (0.98 - core)) * c;
      const f = 1 - rad / c;
      const sz = 0.8 + f * f * 9 * rnd() + rnd() * 1.5;
      const k = rnd();
      g.fillStyle = `rgba(${(38 + k * 36) | 0},${(28 + k * 26) | 0},${(19 + k * 17) | 0},${(0.14 + 0.62 * f * f).toFixed(3)})`;
      g.beginPath();
      g.ellipse(c + Math.cos(a) * rad, c + Math.sin(a) * rad, sz * (1 + rnd() * 1.4), sz, a, 0, TAU);
      g.fill();
    }
    /* лучи выброса */
    for (let i = 0; i < 46; i++) {
      const a = rnd() * TAU, r0 = c * core * 0.9, r1 = c * (core + 0.25 + rnd() * (0.7 - core));
      const gr = g.createLinearGradient(c + Math.cos(a) * r0, c + Math.sin(a) * r0, c + Math.cos(a) * r1, c + Math.sin(a) * r1);
      gr.addColorStop(0, 'rgba(30,22,15,0.42)'); gr.addColorStop(1, 'rgba(34,26,18,0)');
      g.strokeStyle = gr; g.lineWidth = 1.5 + rnd() * 5;
      g.beginPath(); g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); g.stroke();
    }
    /* закопчённое дно: рваный край по шуму */
    const n = 90;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU;
      const rad = c * core * (1 + 0.28 * (fbm(Math.cos(a) * 1.7 + seed, Math.sin(a) * 1.7, seed, 4) - 0.5) * 2);
      const x = c + Math.cos(a) * rad, y = c + Math.sin(a) * rad;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    const gr = g.createRadialGradient(c, c, 0, c, c, c * core * 1.25);
    gr.addColorStop(0, 'rgba(9,7,5,1)');
    gr.addColorStop(0.45, 'rgba(16,12,9,0.97)');
    gr.addColorStop(0.8, 'rgba(26,20,14,0.9)');
    gr.addColorStop(1, 'rgba(32,25,17,0.55)');
    g.fillStyle = gr; g.fill();
    /* копоть вокруг дна */
    const gs = g.createRadialGradient(c, c, c * core * 0.8, c, c, c * Math.min(0.95, core * 1.9));
    gs.addColorStop(0, 'rgba(12,10,8,0.32)'); gs.addColorStop(1, 'rgba(12,10,8,0)');
    g.fillStyle = gs; g.beginPath(); g.arc(c, c, c * 0.98, 0, TAU); g.fill();
    return cv;
  }

  function create(THREE, o) {
    const scene = o.scene, camera = o.camera;
    const groundAt = o.groundAt || (() => 0);
    const BX = { t: 0, group: new THREE.Group(), stats: { smoke: 0, clods: 0, craters: 0, blasts: 0 } };
    BX.group.name = 'blasts';
    scene.add(BX.group);
    const V = () => new THREE.Vector3();
    const _a = V(), _b = V(), _c = V(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = V(), _e = new THREE.Euler();
    const UP = new THREE.Vector3(0, 1, 0);
    const wind = o.wind || new THREE.Vector3(0.35, 0, 0.18);
    const events = [];

    /* ============================================== дым и пыль === */
    const SN = 480;
    const atlas = smokeAtlas(THREE);
    upgradeSmokeAtlas(atlas);
    const base = new THREE.PlaneGeometry(1, 1);
    const sGeo = new THREE.InstancedBufferGeometry();
    sGeo.index = base.index;
    sGeo.setAttribute('position', base.attributes.position);
    sGeo.setAttribute('uv', base.attributes.uv);
    sGeo.setAttribute('normal', base.attributes.normal);
    const iPos = new Float32Array(SN * 3), iSz = new Float32Array(SN * 2), iCol = new Float32Array(SN * 4), iMs = new Float32Array(SN * 4), iVel = new Float32Array(SN * 3);
    const aPos = new THREE.InstancedBufferAttribute(iPos, 3).setUsage(THREE.DynamicDrawUsage);
    const aSz = new THREE.InstancedBufferAttribute(iSz, 2).setUsage(THREE.DynamicDrawUsage);
    const aCol = new THREE.InstancedBufferAttribute(iCol, 4).setUsage(THREE.DynamicDrawUsage);
    const aMs = new THREE.InstancedBufferAttribute(iMs, 4).setUsage(THREE.DynamicDrawUsage);
    const aVel = new THREE.InstancedBufferAttribute(iVel, 3).setUsage(THREE.DynamicDrawUsage);
    sGeo.setAttribute('iPos', aPos); sGeo.setAttribute('iSz', aSz); sGeo.setAttribute('iCol', aCol); sGeo.setAttribute('iMs', aMs); sGeo.setAttribute('iVel', aVel);
    sGeo.instanceCount = 0;
    const sMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 1, metalness: 0, transparent: true, depthWrite: false });
    sMat.customProgramCacheKey = () => 'blast-smoke';
    sMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 iPos; attribute vec2 iSz; attribute vec4 iCol; attribute vec4 iMs; attribute vec3 iVel;
          varying vec4 vSCol; varying vec4 vSMs; varying vec4 vSRot; varying float vSWy; varying float vSNear;`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          vMapUv = uv * 0.5 + vec2(mod(iMs.x, 2.0), floor(iMs.x * 0.5)) * 0.5;`)
        .replace('#include <beginnormal_vertex>', `
          vec3 bbR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 bbU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 objectNormal = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);`)
        .replace('#include <begin_vertex>', `
          /* струя грунта: клуб вытянут вдоль скорости на экране (сам
             выброс волокнистый, плюс смаз движения за ~1/30 с) */
          vec2 sv = vec2(dot(iVel, bbR), dot(iVel, bbU));
          float sL = length(sv);
          vec2 e2 = sL > 1e-3 ? sv / sL : vec2(0.0, 1.0);
          vec2 e1 = vec2(e2.y, -e2.x);
          float st = 1.0 + min(3.2, sL * 0.033 / max(iSz.x, 0.05));
          float rotK = 1.0 / (st * st);
          float bc = cos(iSz.y * rotK), bs = sin(iSz.y * rotK);
          vec2 bq = vec2(bc * position.x - bs * position.y, bs * position.x + bc * position.y) * iSz.x;
          vec2 sq = e1 * bq.x + e2 * bq.y * st;
          vec3 transformed = iPos + bbR * sq.x + bbU * sq.y;
          vSCol = iCol; vSMs = iMs; vSWy = transformed.y;
          vSRot = vec4(e1 * bc + e2 * bs, -e1 * bs + e2 * bc);`)
        .replace('#include <project_vertex>', `#include <project_vertex>
          vSNear = -mvPosition.z;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec4 vSCol; varying vec4 vSMs; varying vec4 vSRot; varying float vSWy; varying float vSNear;`)
        .replace('#include <map_fragment>', `
          vec4 sm = texture2D(map, vMapUv);
          float sTh = sm.b;
          float sG = smoothstep(0.0, max(0.04, 0.32 * vSMs.w), vSWy - vSMs.z);
          float sN = smoothstep(0.2, 0.2 + 0.7 * vSMs.w, vSNear);
          diffuseColor.rgb = vSCol.rgb * mix(1.04, 0.72, sTh * sTh);
          diffuseColor.a = sm.a * vSCol.a * sG * sN;
          if (diffuseColor.a < 0.004) discard;`)
        .replace('#include <normal_fragment_maps>', `
          {
            vec2 tn2 = sm.rg * 2.0 - 1.0;
            vec3 tn = vec3(tn2, sqrt(max(0.0, 1.0 - dot(tn2, tn2))));
            vec3 bx = vec3(vSRot.xy, 0.0), by = vec3(vSRot.zw, 0.0);
            normal = normalize(bx * tn.x + by * tn.y + vec3(0.0, 0.0, tn.z * 1.35));
            /* многократное рассеяние: облако светится сверху, как от неба,
               а не как твёрдый шар с тёмным боком — наклоняем нормаль к зениту */
            normal = normalize(normal + (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz * 0.55);
          }`)
        .replace('#include <emissivemap_fragment>', `
          totalEmissiveRadiance += vec3(1.0, 0.42, 0.10) * vSMs.y * (0.25 + sTh) * 5.0;`);
    };
    const smokeMesh = new THREE.Mesh(sGeo, sMat);
    smokeMesh.frustumCulled = false;
    smokeMesh.renderOrder = 8;
    smokeMesh.receiveShadow = true;
    smokeMesh.name = 'blast_smoke';
    BX.group.add(smokeMesh);
    const smoke = [];
    for (let i = 0; i < SN; i++) smoke.push({ on: false, p: V(), v: V(), t: 0, ttl: 1, s0: 0.2, s1: 1, tau: 1, rot: 0, rv: 0, tile: 0, a: 1, col: new THREE.Color(), drag: 2, buoy: 0, heat: 0, fadeIn: 0.05, delay: 0, gy: 0, lift: 0, str: 0, fall: 0 });
    let sI = 0;
    /* одна частица дыма: p — центр, v — скорость, м/с; s0→s1 — рост
       поперечника за τ; drag — торможение 1/с; buoy — всплытие м/с²;
       a — плотность; heat — накал первых кадров */
    function puff(p, v, opt) {
      const q = smoke[sI = (sI + 1) % SN];
      q.on = true; q.p.copy(p); q.v.copy(v); q.t = 0;
      q.ttl = opt.ttl; q.s0 = opt.s0; q.s1 = opt.s1; q.tau = opt.tau || 1;
      q.rot = R() * TAU; q.rv = rr(-0.25, 0.25) * (opt.spin || 1);
      q.tile = Math.floor(R() * 4); q.a = opt.a; q.col.copy(opt.col);
      q.drag = opt.drag; q.buoy = opt.buoy || 0; q.heat = opt.heat || 0; q.fadeIn = opt.fadeIn || 0.04;
      q.delay = opt.delay || 0; q.lift = opt.lift || 0; q.str = opt.str || 0; q.fall = opt.fall || 0;
      q.gy = groundAt(p.x, p.z);
      BX.stats.smoke++;
      return q;
    }
    /* альбедо, линейное: подстилка вокруг ≈ (0,26 0,19 0,11); пыль из неё
       светлее и серее (мелкая фракция), сажа тротила — почти чёрная */
    const _cols = {
      soot: new THREE.Color(0.036, 0.033, 0.030),
      sootB: new THREE.Color(0.06, 0.055, 0.05),
      dirtD: new THREE.Color(0.078, 0.058, 0.040),
      soil: new THREE.Color(0.145, 0.107, 0.072),
      soilL: new THREE.Color(0.23, 0.175, 0.118),
      dust: new THREE.Color(0.33, 0.265, 0.19),
      grey: new THREE.Color(0.10, 0.097, 0.092)
    };
    const _cc = new THREE.Color();
    const mixCol = (a, b, t) => _cc.copy(a).lerp(b, t);

    /* ============================================ комья земли === */
    const CN = 420;
    const clodGeo = (() => {
      const gg = new THREE.IcosahedronGeometry(1, 0);
      const p = gg.attributes.position;
      const key = (x, y, z) => `${Math.round(x * 1e3)},${Math.round(y * 1e3)},${Math.round(z * 1e3)}`;
      const jit = new Map();
      for (let i = 0; i < p.count; i++) {
        const k = key(p.getX(i), p.getY(i), p.getZ(i));
        if (!jit.has(k)) jit.set(k, 0.62 + R() * 0.55);
        const f = jit.get(k);
        p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.8, p.getZ(i) * f);
      }
      gg.computeVertexNormals();
      return gg;
    })();
    const clodMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    const clodIm = new THREE.InstancedMesh(clodGeo, clodMat, CN);
    clodIm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    clodIm.frustumCulled = false; clodIm.castShadow = false; clodIm.receiveShadow = true;
    clodIm.name = 'blast_clods';
    const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const _tc = new THREE.Color();
    for (let i = 0; i < CN; i++) { clodIm.setMatrixAt(i, _zero); clodIm.setColorAt(i, _tc.setRGB(0.1, 0.08, 0.06)); }
    BX.group.add(clodIm);
    const clods = [];
    for (let i = 0; i < CN; i++) clods.push({ on: false, rest: false, p: V(), v: V(), ax: V(), ang: 0, w: 0, r: 0.03, t: 0, life: 60 });
    let cI = 0;
    function clod(p, v, r, k) {
      const c = clods[cI = (cI + 1) % CN];
      c.on = true; c.rest = false; c.p.copy(p); c.v.copy(v); c.r = r; c.t = 0; c.life = rr(40, 70);
      c.ax.set(R() - 0.5, R() - 0.5, R() - 0.5).normalize(); c.ang = R() * TAU; c.w = rr(4, 18);
      clodIm.setColorAt(cI, _tc.setRGB(0.10 + k * 0.12, 0.075 + k * 0.09, 0.05 + k * 0.06));
      clodIm.instanceColor.needsUpdate = true;
      BX.stats.clods++;
    }

    /* =========================================== мелкая земля === */
    /* Земля, хвоя и мелкие камешки. Летят со скоростями 5–25 м/с, поэтому
       глаз (и кадр 1/60 с) видит их не точками, а чёрточками вдоль пути:
       рисуем каждую крупинку отрезком «голова — хвост», хвост = путь за
       ≈ 1/50 с. Ширина — не тоньше 0,6 пикселя, покрытие ослабляем по
       доле пикселя и по длине размазанного следа. */
    const DN = 1400;
    const gHead = new Float32Array(DN * 4 * 3), gTail = new Float32Array(DN * 4 * 3);
    const gCorner = new Float32Array(DN * 4 * 2), gRad = new Float32Array(DN * 4), gCol = new Float32Array(DN * 4 * 4);
    const gIdx = new Uint32Array(DN * 6);
    for (let i = 0; i < DN; i++) {
      const v = i * 4;
      gCorner.set([0, -1, 0, 1, 1, -1, 1, 1], v * 2);
      gIdx.set([v, v + 2, v + 1, v + 1, v + 2, v + 3], i * 6);
    }
    const dGeo = new THREE.BufferGeometry();
    const gaHead = new THREE.BufferAttribute(gHead, 3).setUsage(THREE.DynamicDrawUsage);
    const gaTail = new THREE.BufferAttribute(gTail, 3).setUsage(THREE.DynamicDrawUsage);
    const gaRad = new THREE.BufferAttribute(gRad, 1).setUsage(THREE.DynamicDrawUsage);
    const gaCol = new THREE.BufferAttribute(gCol, 4).setUsage(THREE.DynamicDrawUsage);
    dGeo.setAttribute('position', gaHead);
    dGeo.setAttribute('aTail', gaTail);
    dGeo.setAttribute('aCorner', new THREE.BufferAttribute(gCorner, 2));
    dGeo.setAttribute('aRad', gaRad);
    dGeo.setAttribute('aCol', gaCol);
    dGeo.setIndex(new THREE.BufferAttribute(gIdx, 1));
    const dMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uRes: { value: new THREE.Vector2(1920, 1080) }, uLum: { value: 1 } }]),
      vertexShader: `
        attribute vec3 aTail; attribute vec2 aCorner; attribute float aRad; attribute vec4 aCol;
        uniform vec2 uRes;
        varying vec4 vCol; varying float vSide;
        #include <common>
        #include <fog_pars_vertex>
        void main() {
          vec4 h = modelViewMatrix * vec4(position, 1.0);
          vec4 t = modelViewMatrix * vec4(aTail, 1.0);
          if (t.z > -0.05 && h.z < -0.05) t.xyz = h.xyz + (t.xyz - h.xyz) * ((-0.05 - h.z) / (t.z - h.z));
          vec4 ch = projectionMatrix * h, ct = projectionMatrix * t;
          vec2 sh = ch.xy / ch.w * uRes * 0.5, st = ct.xy / max(ct.w, 1e-4) * uRes * 0.5;
          vec2 d = sh - st; float L = length(d);
          d = L > 1e-4 ? d / L : vec2(0.0, 1.0);
          vec2 n = vec2(-d.y, d.x);
          float pxm = projectionMatrix[1][1] * uRes.y * 0.5 / max(-h.z, 0.05);
          float wpx = aRad * pxm, hw = max(wpx, 0.6);
          vec4 c = aCorner.x < 0.5 ? ch : ct;
          vec2 off = n * aCorner.y * hw + d * (aCorner.x < 0.5 ? hw : -hw);
          c.xy += off * 2.0 / uRes * c.w;
          gl_Position = c;
          vec4 mvPosition = h;
          vCol = aCol;
          /* глаз видит летящую тёмную крупинку на светлом фоне лучше, чем
             честная доля пикселя: покрытие не опускаем ниже 0,45 */
          vCol.a *= mix(0.45, 1.0, clamp(wpx / hw, 0.0, 1.0)) * pow(2.0 * hw / (L + 2.0 * hw), 0.2);
          vSide = aCorner.y;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uLum;
        varying vec4 vCol; varying float vSide;
        #include <common>
        #include <fog_pars_fragment>
        void main() {
          float a = vCol.a * (1.0 - smoothstep(0.55, 1.0, abs(vSide)));
          if (a < 0.003) discard;
          gl_FragColor = vec4(vCol.rgb * uLum, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide
    });
    const dirtPts = new THREE.Mesh(dGeo, dMat);
    dirtPts.frustumCulled = false; dirtPts.renderOrder = 7; dirtPts.name = 'blast_dirt';
    BX.group.add(dirtPts);
    const dirt = [];
    for (let i = 0; i < DN; i++) dirt.push({ on: false, p: V(), v: V(), r: 0.003, t: 0, k: 0.5, cd: 1 });
    let dI = 0;
    /* k — оттенок (0 — тёмный гумус, 1 — светлая хвоя/песок);
       cd — «парусность»: хвоя и труха тормозятся сильнее камешков */
    function grit(p, v, r, k, cd) {
      const d = dirt[dI = (dI + 1) % DN];
      d.on = true; d.p.copy(p); d.v.copy(v); d.r = r; d.t = 0; d.k = k; d.cd = cd || 1;
    }

    /* ============================================ вспышка и свет === */
    const flashTex = new THREE.CanvasTexture(flashCanvas());
    flashTex.colorSpace = THREE.SRGBColorSpace;
    const flashes = [];
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff, fog: false }));
      sp.visible = false; sp.renderOrder = 9;
      BX.group.add(sp);
      flashes.push({ o: sp, t: 9, ttl: 0.06, s: 1, k: 1, w: 0 });
    }
    let fI = 0;
    /* свет заводится сразу, при создании: новый источник посреди боя
       заставил бы перекомпилировать все материалы сцены */
    const light = new THREE.PointLight(0xffb469, 0, 38, 2);
    light.castShadow = false;
    BX.group.add(light);
    let lightT = 9, lightI = 0, lightTau = 0.04;
    /* v19: огненный шар — 16 кадров Unity Labs «Explosion01» (CC0), очень коротко
       (90–200 мс: у тротила и состава B шар живёт миллисекунды). Даёт рваную
       форму вспышке вместо идеального круга; дальше всё делает дым. */
    const FIRE = { tex: null, list: [] };
    (function () {
      const D = G0.__VFX_DATA;
      if (!D || !D.fire || typeof Image === 'undefined') return;
      const img = new Image();
      img.onload = () => { const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; FIRE.tex = t; };
      img.src = 'data:image/jpeg;base64,' + D.fire;
    })();
    function fireball(p, size, k, ttl) {
      if (!FIRE.tex) return;
      let f = null;
      for (const q of FIRE.list) if (!q.o.visible) { f = q; break; }
      if (!f) {
        if (FIRE.list.length >= 6) return;
        const tx = FIRE.tex.clone(); tx.repeat.set(0.25, 0.25); tx.needsUpdate = true;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        sp.renderOrder = 9; sp.visible = false; sp.name = 'blast_fireball';
        BX.group.add(sp);
        f = { o: sp, tx, t: 0, ttl: 0.1, s: 1, k: 1 };
        FIRE.list.push(f);
      }
      f.t = 0; f.ttl = ttl; f.s = size; f.k = k;
      f.o.position.copy(p); f.o.material.rotation = R() * TAU; f.o.visible = true;
    }
    function fireFrame(dt) {
      for (const f of FIRE.list) {
        if (!f.o.visible) continue;
        f.t += dt;
        const u = f.t / f.ttl;
        if (u >= 1) { f.o.visible = false; continue; }
        const fr = Math.min(15, Math.floor(u * 16));
        f.tx.offset.set((fr % 4) * 0.25, 0.75 - Math.floor(fr / 4) * 0.25);
        const s = f.s * (0.8 + 0.5 * u);
        f.o.scale.set(s, s, 1);
        const e = 2.4 * f.k * (1 - 0.5 * u);
        f.o.material.color.setRGB(e, e * 0.92, e * 0.85);
      }
    }
    function flash(p, size, k, ttl, white) {
      if (!white && size >= 0.8) fireball(p, size * 0.85, Math.min(1.4, k), clamp(ttl * 2.2, 0.09, 0.2));
      const f = flashes[fI = (fI + 1) % flashes.length];
      f.t = 0; f.ttl = ttl; f.s = size; f.k = k; f.w = white ? 1 : 0;
      light.color.setHex(white ? 0xf4f6ff : 0xffb469);
      f.o.position.copy(p);
      f.o.material.rotation = R() * TAU;
      f.o.visible = true;
      light.position.copy(p); light.position.y += 0.4;
      lightT = 0; lightI = 700 * k * k; lightTau = ttl * 0.7;
    }

    /* =============================================== воронки === */
    const crTex = { pmn: [], ozm: [], tm: [] };
    const craterTex = (kind) => {
      const L = crTex[kind] || crTex.pmn;
      if (L.length < 3) {
        const t = new THREE.CanvasTexture(craterCanvas(kind, 3 + L.length * 11 + (kind === 'ozm' ? 5 : kind === 'tm' ? 9 : 0)));
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
        L.push(t);
        return t;
      }
      return L[Math.floor(R() * L.length)];
    };
    const craters = [];
    BX.crater = (pos, kind) => {
      const Rm = kind === 'tm' ? 2.6 : kind === 'ozm' ? 0.75 : 1.25;
      const core = kind === 'ozm' ? 0.16 : kind === 'tm' ? 0.36 : 0.26;
      const RINGS = 18, SEGS = 48, pos3 = [], uv = [], idx = [];
      const y0 = groundAt(pos.x, pos.z), rot = R() * TAU;
      /* бруствер: поднятый край на границе дна */
      const rimH = kind === 'tm' ? 0.07 : kind === 'ozm' ? 0.015 : 0.035;
      const hAt = (u) => 0.008 + rimH * Math.exp(-Math.pow((u - core * 1.12) / 0.085, 2)) + rimH * 0.35 * Math.exp(-Math.pow((u - core * 1.6) / 0.15, 2));
      pos3.push(0, groundAt(pos.x, pos.z) - y0 + 0.006, 0); uv.push(0.5, 0.5);
      for (let r = 1; r <= RINGS; r++) {
        const u = Math.pow(r / RINGS, 1.25);
        for (let k = 0; k < SEGS; k++) {
          const a = k / SEGS * TAU, j = 1 + 0.08 * Math.sin(a * 5 + r) * (u > core * 0.8 ? 1 : 0);
          const lx = Math.cos(a) * u * Rm * j, lz = Math.sin(a) * u * Rm * j;
          pos3.push(lx, groundAt(pos.x + lx, pos.z + lz) - y0 + hAt(u), lz);
          const ca = Math.cos(rot), sa = Math.sin(rot);
          uv.push(0.5 + 0.5 * (lx * ca - lz * sa) / Rm, 0.5 + 0.5 * (lx * sa + lz * ca) / Rm);
        }
      }
      for (let k = 0; k < SEGS; k++) idx.push(0, 1 + (k + 1) % SEGS, 1 + k);
      for (let r = 1; r < RINGS; r++) {
        const a0 = 1 + (r - 1) * SEGS, a1 = 1 + r * SEGS;
        for (let k = 0; k < SEGS; k++) { const k2 = (k + 1) % SEGS; idx.push(a0 + k, a0 + k2, a1 + k, a0 + k2, a1 + k2, a1 + k); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos3, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ map: craterTex(kind), transparent: true, depthWrite: false, roughness: 0.97, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pos.x, y0, pos.z);
      mesh.renderOrder = 1; mesh.receiveShadow = true; mesh.name = 'crater';
      BX.group.add(mesh);
      craters.push(mesh);
      if (craters.length > 30) { const old = craters.shift(); BX.group.remove(old); old.geometry.dispose(); old.material.dispose(); }
      BX.stats.craters++;
      return mesh;
    };

    /* ========================================== канистра ОЗМ === */
    const canG = new THREE.CylinderGeometry(0.054, 0.054, 0.17, 18, 1);
    const canM = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.16, 0.18, 0.12), roughness: 0.6, metalness: 0.5 });
    const canister = new THREE.Mesh(canG, canM);
    canister.visible = false; canister.castShadow = true; canister.name = 'ozm_canister';
    BX.group.add(canister);

    /* ======================================= сценарии взрывов === */
    const dirUp = (spread, out) => {
      /* направление в конусе вокруг вертикали: spread — тангенс полуугла */
      const a = R() * TAU, r = Math.sqrt(R()) * spread;
      return out.set(Math.cos(a) * r, 1, Math.sin(a) * r).normalize();
    };
    /* ПМН-2 и другие заглублённые заряды: k — масштаб (ПМН 1, ТМ ~3).
       Как это выглядит на съёмке подрывов: вспышки днём почти не видно;
       за 0,1–0,3 с вверх бьёт V-образный «венец» тёмных струй грунта на
       3–5 м, понизу расходится кольцо светлой пыли; затем земля осыпается
       дождём, а буро-серое облако клубится, расползается и за 8–15 с
       уходит по ветру, светлея. */
    function buried(p, k, kind) {
      const gy = groundAt(p.x, p.z);
      const c = _a.set(p.x, gy + 0.02, p.z);
      const sk = Math.sqrt(k);
      flash(_b.set(p.x, gy + 0.12 * k, p.z), 0.9 * k, 0.7 * k, 0.035);
      /* ядро: продукты взрыва с сажей — горячо, тёмно, коротко */
      for (let i = 0; i < 3; i++)
        puff(_b.copy(c).add(_c.set(rr(-0.05, 0.05), rr(0.05, 0.2), rr(-0.05, 0.05))), dirUp(0.35, _c).multiplyScalar(rr(4, 8) * sk),
          { ttl: rr(0.6, 1.0), s0: 0.3 * k, s1: 0.8 * k, tau: 0.2, a: 0.8, col: _cols.soot, drag: 6, heat: 0.7, fadeIn: 0.004, str: 1 });
      /* венец: струи тёмного грунта. Каждая струя — «голова» и два клуба
         следа помедленнее; крутые струи быстрее пологих. Грунт тяжёлый:
         через 0,2–0,5 с струи сникают и осыпаются */
      const nj = Math.round(30 * sk);
      for (let i = 0; i < nj; i++) {
        /* струи ложатся венцом 12–38° от вертикали: середина воронки
           выброшена первой и реже — на съёмке «V», а не столб */
        const u = R(), az = R() * TAU, tn = 0.2 + 0.58 * Math.pow(u, 0.75);
        _d3.set(Math.cos(az) * tn, 1, Math.sin(az) * tn).normalize();
        const sp = rr(16, 31) * (1 - 0.35 * u) * (0.7 + 0.3 * sk);
        const col = mixCol(_cols.dirtD, _cols.soil, R() * 0.7);
        for (let j = 0; j < 3; j++) {
          const f = 1 - j * 0.28;
          puff(_b.copy(c).add(_e3.set(rr(-0.08, 0.08), rr(0, 0.1), rr(-0.08, 0.08))), _c.copy(_d3).multiplyScalar(sp * f),
            { ttl: rr(1.6, 3.2), s0: rr(0.3, 0.44) * k * (1 - 0.15 * j), s1: rr(0.95, 1.6) * sk, tau: rr(0.35, 0.7), a: rr(0.6, 0.85) * (1 - 0.2 * j),
              col, drag: rr(7, 9), buoy: 0, fadeIn: 0.005, delay: j * 0.01 + u * 0.012, str: 1, fall: rr(2, 4), spin: 1.5 });
        }
      }
      /* «купол»: в первые сотые доли секунды над миной вспухает плотный
         тёмный бугор выброса шириной около метра */
      for (let i = 0; i < 6; i++) {
        const az = R() * TAU, tn = rr(0.3, 1.2);
        puff(_b.copy(c).add(_e3.set(Math.cos(az) * 0.1, 0.12, Math.sin(az) * 0.1)), _c.set(Math.cos(az) * tn, 1, Math.sin(az) * tn).normalize().multiplyScalar(rr(5, 9) * sk),
          { ttl: rr(0.9, 1.4), s0: 0.45 * k, s1: rr(1.2, 1.6) * sk, tau: 0.18, a: 0.85, col: mixCol(_cols.dirtD, _cols.soot, 0.35), drag: 9, buoy: 0, fadeIn: 0.004, str: 0.6, fall: 2 });
      }
      /* облако пыли: основная масса, светлее, держится долго */
      const nc2 = Math.round(34 * sk);
      for (let i = 0; i < nc2; i++) {
        const a = R() * TAU, r = Math.sqrt(R()) * 0.4;
        puff(_b.set(c.x + Math.cos(a) * r, gy + rr(0.1, 0.7) * sk, c.z + Math.sin(a) * r), dirUp(0.8, _c).multiplyScalar(rr(2, 7) * sk),
          { ttl: rr(8, 13) * (0.85 + 0.15 * k), s0: 0.45 * k, s1: rr(2.0, 3.0) * sk, tau: rr(1.0, 2.0), a: rr(0.36, 0.55),
            col: mixCol(_cols.soilL, _cols.dust, R()), drag: rr(2.2, 3.0), buoy: rr(0.12, 0.3), fadeIn: 0.08, delay: rr(0.04, 0.2) });
      }
      /* кольцо у грунта: ударная волна гонит пыль и труху */
      const nr = Math.round(26 * sk);
      for (let i = 0; i < nr; i++) {
        const a = i / nr * TAU + rr(-0.12, 0.12);
        const sp = rr(5, 11) * sk;
        puff(_b.set(c.x + Math.cos(a) * 0.25, gy + rr(0.08, 0.25), c.z + Math.sin(a) * 0.25), _c.set(Math.cos(a) * sp, rr(0.1, 0.8), Math.sin(a) * sp),
          { ttl: rr(4, 7), s0: 0.25 * k, s1: rr(1.1, 1.9) * sk, tau: rr(0.5, 0.9), a: rr(0.35, 0.55), col: mixCol(_cols.soilL, _cols.dust, R()), drag: rr(3, 4), buoy: 0.06, fadeIn: 0.015, delay: rr(0.005, 0.03) });
      }
      /* остаточная дымка */
      for (let i = 0; i < 8; i++)
        puff(_b.set(c.x + rr(-0.8, 0.8), gy + rr(0.6, 2.2) * sk, c.z + rr(-0.8, 0.8)), _c.set(rr(-0.4, 0.4), rr(0.1, 0.5), rr(-0.4, 0.4)),
          { ttl: rr(10, 16), s0: 1.2 * k, s1: rr(3.0, 4.5) * sk, tau: rr(2, 4), a: rr(0.12, 0.2), col: mixCol(_cols.soilL, _cols.dust, 0.5 + 0.5 * R()), drag: 1.0, buoy: 0.05, fadeIn: 0.8, delay: rr(0.4, 1.0) });
      /* комья: конус ~35°, часть — почти горизонтально */
      const nc = Math.round(110 * k);
      for (let i = 0; i < nc; i++) {
        const flat = R() < 0.25;
        const d = flat ? _c.set(R() - 0.5, rr(0.15, 0.5), R() - 0.5).normalize() : dirUp(0.75, _c);
        d.multiplyScalar(rr(3, 15) * (0.7 + 0.3 * k));
        clod(_b.copy(c).add(_e3.set(rr(-0.12, 0.12), rr(0, 0.1), rr(-0.12, 0.12))), d, rr(0.006, 0.026) * (R() < 0.08 ? 1.8 : 1) * sk, R());
      }
      /* мелкая земля струями: камешки, гумус, хвоя */
      const nd = Math.round(900 * k);
      for (let i = 0; i < nd; i++) {
        const u = R();
        const d = dirUp(0.15 + 0.85 * u, _c).multiplyScalar(rr(5, 26) * (1 - 0.45 * u));
        const needle = R() < 0.3;
        grit(_b.copy(c).add(_e3.set(rr(-0.08, 0.08), rr(0, 0.1), rr(-0.08, 0.08))), d,
          needle ? rr(0.001, 0.002) : rr(0.003, 0.01), needle ? rr(0.6, 1) : R() * 0.6, needle ? 3 : 1);
      }
      BX.crater(_b.set(p.x, gy, p.z), kind === 'tm' ? 'tm' : 'pmn');
    }
    const _e3 = V(), _d3 = V();

    /* ОЗМ-72: хлопок вышибного заряда, корпус вверх, разрыв на высоте */
    function ozmPop(p, opt) {
      const gy = groundAt(p.x, p.z);
      const c = _a.set(p.x, gy + 0.02, p.z);
      for (let i = 0; i < 7; i++)
        puff(_b.copy(c).add(_e3.set(rr(-0.05, 0.05), rr(0.02, 0.12), rr(-0.05, 0.05))), dirUp(0.6, _c).multiplyScalar(rr(1.2, 3.5)),
          { ttl: rr(2.5, 4), s0: 0.12, s1: rr(0.5, 0.85), tau: 0.4, a: rr(0.55, 0.8), col: mixCol(_cols.grey, _cols.soil, R()), drag: 3.5, buoy: 0.15, fadeIn: 0.01 });
      for (let i = 0; i < 28; i++) clod(_b.copy(c), dirUp(0.9, _c).multiplyScalar(rr(1.5, 5)), rr(0.006, 0.018), R());
      for (let i = 0; i < 80; i++) grit(_b.copy(c), dirUp(1.0, _c).multiplyScalar(rr(1, 6)), rr(0.0015, 0.004), R());
      canister.visible = true;
      canister.position.set(p.x, gy + 0.05, p.z);
      canister.rotation.set(rr(-0.2, 0.2), R() * TAU, rr(-0.2, 0.2));
      const h = opt.h || rr(0.6, 0.8);
      /* v0 = √(2gh) с запасом: трос натягивается раньше вершины */
      const v0 = Math.sqrt(2 * 9.81 * (h + 0.25));
      const tA = (v0 - Math.sqrt(Math.max(0, v0 * v0 - 2 * 9.81 * h))) / 9.81;
      events.push({ t: 0, kind: 'can', v0, gy, tA, h, p: p.clone(), opt });
    }
    function ozmAir(p, opt) {
      canister.visible = false;
      const gy = groundAt(p.x, p.z);
      flash(p, 3.2, 1.6, 0.07);
      /* огненный шар живёт миллисекунды; затем — плотный тёмно-серый шар
         продуктов взрыва Ø 2–3 м: газы тормозятся воздухом за десятки
         сантиметров, дальше облако только клубится, всплывает и сносится */
      for (let i = 0; i < 5; i++)
        puff(_b.copy(p).add(_e3.set(rr(-0.08, 0.08), rr(-0.08, 0.08), rr(-0.08, 0.08))), _c.set(R() - 0.5, R() - 0.45, R() - 0.5).normalize().multiplyScalar(rr(3, 6)),
          { ttl: rr(0.4, 0.7), s0: 0.6, s1: 1.5, tau: 0.12, a: 0.9, col: _cols.soot, drag: 9, heat: 1, fadeIn: 0.003 });
      for (let i = 0; i < 30; i++) {
        const d = _c.set(R() - 0.5, R() - 0.42, R() - 0.5).normalize();
        puff(_b.copy(p).addScaledVector(d, rr(0.05, 0.3)), d.multiplyScalar(rr(4, 10)),
          { ttl: rr(6, 10), s0: rr(0.4, 0.65), s1: rr(1.3, 2.2), tau: rr(0.5, 1.1), a: rr(0.55, 0.8), col: mixCol(_cols.soot, _cols.grey, 0.25 + R() * 0.75), drag: rr(7, 9.5), buoy: rr(0.2, 0.4), heat: R() < 0.25 ? 0.4 : 0, fadeIn: 0.006, spin: 2, str: 0.6 });
      }
      /* волна по грунту: пыль и хвоя кольцом */
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * TAU + rr(-0.15, 0.15), sp = rr(6, 12);
        puff(_b.set(p.x + Math.cos(a) * 0.4, gy + rr(0.1, 0.3), p.z + Math.sin(a) * 0.4), _c.set(Math.cos(a) * sp, rr(0.1, 0.8), Math.sin(a) * sp),
          { ttl: rr(3.5, 6), s0: 0.4, s1: rr(1.6, 2.4), tau: rr(0.5, 0.9), a: rr(0.35, 0.55), col: mixCol(_cols.soilL, _cols.dust, R()), drag: rr(2.8, 3.8), buoy: 0.06, fadeIn: 0.02, delay: rr(0.005, 0.03) });
      }
      /* осколки по грунту: фонтанчики пыли на 2–22 м */
      const nf = opt.fragDust || 70;
      for (let i = 0; i < nf; i++) {
        const a = R() * TAU, r = 1.6 + Math.pow(R(), 1.3) * 20;
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, y = groundAt(x, z);
        puff(_b.set(x, y + 0.06, z), _c.set(Math.cos(a) * rr(0.3, 1.2), rr(0.5, 1.6), Math.sin(a) * rr(0.3, 1.2)),
          { ttl: rr(1.4, 2.8), s0: 0.06, s1: rr(0.3, 0.6) * (1 - r / 30), tau: 0.35, a: rr(0.4, 0.7), col: mixCol(_cols.soilL, _cols.dust, R()), drag: 3.5, buoy: 0.02, fadeIn: 0.01, delay: r / 900 });
        for (let j = 0; j < 3; j++) grit(_b, _c.set(rr(-1, 1), rr(1, 3.5), rr(-1, 1)), rr(0.0015, 0.0035), R());
      }
      for (let i = 0; i < 40; i++) clod(_b.set(p.x, gy + 0.05, p.z), dirUp(1.4, _c).multiplyScalar(rr(1.5, 6)), rr(0.006, 0.02), R());
      if (o.fx && o.fx.sparks) o.fx.sparks(p, 14, _c.set(0, 0.3, 0), 2.2, 1);
      BX.crater(_b.set(p.x, gy, p.z), 'ozm');
    }

    /* M84: магниевая смесь — ослепительная белая вспышка, хлопок и
       облачко белёсого дыма из окон корпуса; корпус цел, воронки нет */
    function m84(p, opt) {
      const gy = groundAt(p.x, p.z);
      flash(p, 5.2, 2.6, 0.11, true);
      for (let i = 0; i < 16; i++) {
        const d = _c.set(R() - 0.5, R() * 0.7 - 0.15, R() - 0.5).normalize();
        puff(_b.copy(p).addScaledVector(d, rr(0.02, 0.12)), d.multiplyScalar(rr(2, 5.5)),
          { ttl: rr(4, 7), s0: rr(0.18, 0.3), s1: rr(0.9, 1.7), tau: rr(0.4, 0.9), a: rr(0.3, 0.5), col: mixCol(_cols.dust, _cols.grey, R() * 0.5), drag: rr(6, 9), buoy: rr(0.18, 0.32), fadeIn: 0.005, spin: 1.5 });
      }
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * TAU + rr(-0.2, 0.2), sp = rr(3, 6);
        puff(_b.set(p.x + Math.cos(a) * 0.25, gy + rr(0.05, 0.2), p.z + Math.sin(a) * 0.25), _c.set(Math.cos(a) * sp, rr(0.1, 0.5), Math.sin(a) * sp),
          { ttl: rr(2.5, 4), s0: 0.25, s1: rr(0.9, 1.4), tau: rr(0.5, 0.9), a: rr(0.25, 0.4), col: mixCol(_cols.soilL, _cols.dust, R()), drag: rr(3, 4), buoy: 0.05, fadeIn: 0.02 });
      }
      if (o.fx && o.fx.sparks) o.fx.sparks(p, 8, _c.set(0, 0.5, 0), 1.6, 1);
    }

    BX.explode = (p, kind, opt) => {
      opt = opt || {};
      BX.stats.blasts++;
      if (kind === 'm84') m84(p, opt);
      else if (kind === 'ozm') ozmPop(p, opt);
      else if (kind === 'ozm_air') ozmAir(p, opt);
      else if (kind === 'tm') buried(p, 3.2, 'tm');
      else buried(p, opt.k || 1, 'pmn');
    };

    /* ======================================================= кадр === */
    const order = [];
    const _sz = new THREE.Vector2();
    BX.update = (dt) => {
      BX.t += dt;
      /* сценарии */
      for (let k = events.length - 1; k >= 0; k--) {
        const ev = events[k];
        ev.t += dt;
        if (ev.kind === 'can') {
          const t = Math.min(ev.t, ev.tA);
          canister.position.y = ev.gy + 0.05 + ev.v0 * t - 4.905 * t * t;
          canister.rotation.x += dt * 9; canister.rotation.z += dt * 5;
          if (ev.t >= ev.tA) {
            events.splice(k, 1);
            const ap = ev.p.clone(); ap.y = ev.gy + ev.h;
            ozmAir(ap, ev.opt);
            if (ev.opt.onAir) ev.opt.onAir(ap);
          }
        }
      }
      /* вспышки и свет */
      fireFrame(dt);
      for (const f of flashes) {
        if (!f.o.visible) continue;
        f.t += dt;
        const u = f.t / f.ttl;
        if (u >= 1) { f.o.visible = false; continue; }
        const s = f.s * (0.7 + 0.6 * u);
        f.o.scale.set(s, s, 1);
        f.o.material.opacity = Math.pow(1 - u, 1.5);
        if (f.w) f.o.material.color.setRGB(3.4 * f.k, 3.4 * f.k, 3.5 * f.k);
        else f.o.material.color.setRGB(3 * f.k, 2.6 * f.k, 2.1 * f.k);
      }
      lightT += dt;
      light.intensity = lightT < 1 ? lightI * Math.exp(-lightT / Math.max(0.01, lightTau)) : 0;
      if (light.intensity < 0.5) light.intensity = 0;
      /* дым */
      order.length = 0;
      const cp = camera.position;
      for (let i = 0; i < SN; i++) {
        const q = smoke[i];
        if (!q.on) continue;
        if (q.delay > 0) { q.delay -= dt; if (q.delay > 0) continue; }
        q.t += dt;
        if (q.t >= q.ttl) { q.on = false; continue; }
        const dk = Math.exp(-q.drag * dt);
        q.v.multiplyScalar(dk);
        /* воздух вокруг облака медленно уносит его по ветру */
        q.v.x += (wind.x - q.v.x) * (1 - Math.exp(-0.4 * dt));
        q.v.z += (wind.z - q.v.z) * (1 - Math.exp(-0.4 * dt));
        q.v.y += (q.buoy - (q.t < 0.6 ? 2.5 : 0.25) - q.fall * sstep(0.15, 0.5, q.t)) * dt;
        q.p.addScaledVector(q.v, dt);
        const s = q.s0 + (q.s1 - q.s0) * (1 - Math.exp(-q.t / q.tau));
        /* клуб не уходит под грунт */
        const gy = groundAt(q.p.x, q.p.z);
        if (q.p.y < gy + s * 0.18) { q.p.y = gy + s * 0.18; if (q.v.y < 0) q.v.y *= -0.2; }
        q.gy = gy;
        q.rot += q.rv * dt;
        q.cs = s;
        q.dist = (q.p.x - cp.x) * (q.p.x - cp.x) + (q.p.y - cp.y) * (q.p.y - cp.y) + (q.p.z - cp.z) * (q.p.z - cp.z);
        order.push(q);
      }
      order.sort((a, b) => b.dist - a.dist);
      const n = order.length;
      /* камера внутри облака: у ближних клубов шейдер гасит край у
         объектива, поэтому плотность вокруг камеры уходит в вуаль на весь
         кадр (BX.veil) — изнутри столба грунта видно только бурую муть */
      let vA = 0, vR = 0, vG = 0, vB = 0;
      for (let i = 0; i < n; i++) {
        const q = order[i];
        const u = q.t / q.ttl;
        const fin = Math.min(1, q.t / q.fadeIn);
        /* плотность: быстро набирается, медленно тает; облако редеет по мере роста */
        const thin = Math.pow(q.s0 / Math.max(q.cs, q.s0), 0.35);
        const a = q.a * fin * Math.pow(1 - u, 1.4) * (0.45 + 0.55 * thin);
        const heat = q.heat * Math.exp(-q.t / 0.028);
        iPos[i * 3] = q.p.x; iPos[i * 3 + 1] = q.p.y; iPos[i * 3 + 2] = q.p.z;
        iSz[i * 2] = q.cs; iSz[i * 2 + 1] = q.rot;
        /* пыль светлеет, оседая и смешиваясь с воздухом */
        const lt = Math.min(1, q.t / 7) * 0.4;
        iCol[i * 4] = q.col.r + (0.30 - q.col.r) * lt; iCol[i * 4 + 1] = q.col.g + (0.255 - q.col.g) * lt; iCol[i * 4 + 2] = q.col.b + (0.20 - q.col.b) * lt;
        iCol[i * 4 + 3] = a;
        {
          const dq = Math.sqrt(q.dist), rq = q.cs * 0.62;
          if (dq < rq) {
            const w = a * (1 - dq / rq) * (1 - 0.5 * heat);
            vA += w; vR += iCol[i * 4] * w; vG += iCol[i * 4 + 1] * w; vB += iCol[i * 4 + 2] * w;
          }
        }
        iMs[i * 4] = q.tile; iMs[i * 4 + 1] = heat; iMs[i * 4 + 2] = q.gy; iMs[i * 4 + 3] = q.cs;
        iVel[i * 3] = q.v.x * q.str; iVel[i * 3 + 1] = q.v.y * q.str; iVel[i * 3 + 2] = q.v.z * q.str;
      }
      BX.veil.a = vA > 1e-4 ? 1 - Math.exp(-vA * 1.5) : 0;
      if (vA > 1e-4) { BX.veil.r = vR / vA; BX.veil.g = vG / vA; BX.veil.b = vB / vA; }
      sGeo.instanceCount = n;
      smokeMesh.visible = n > 0;
      if (n) { aPos.needsUpdate = true; aSz.needsUpdate = true; aCol.needsUpdate = true; aMs.needsUpdate = true; aVel.needsUpdate = true; }
      /* комья */
      let anyC = false;
      for (let i = 0; i < CN; i++) {
        const c = clods[i];
        if (!c.on) continue;
        anyC = true;
        c.t += dt;
        if (!c.rest) {
          c.v.y -= 9.81 * dt;
          c.v.multiplyScalar(Math.exp(-dt * 0.004 / c.r));
          c.p.addScaledVector(c.v, dt);
          c.ang += c.w * dt;
          const gy = groundAt(c.p.x, c.p.z) + c.r * 0.55;
          if (c.p.y < gy) {
            c.p.y = gy;
            if (c.v.y < -1.6) { c.v.y *= -0.22; c.v.x *= 0.45; c.v.z *= 0.45; c.w *= 0.5; }
            else { c.rest = true; c.v.set(0, 0, 0); }
          }
        }
        /* лежащие через минуту уходят в грунт */
        const sink = c.t > c.life ? Math.max(0, 1 - (c.t - c.life) / 6) : 1;
        if (sink <= 0) { c.on = false; clodIm.setMatrixAt(i, _zero); continue; }
        _q.setFromAxisAngle(c.ax, c.ang);
        _m.compose(_s.set(c.p.x, c.p.y - (1 - sink) * c.r, c.p.z), _q, _b.set(c.r, c.r, c.r).multiplyScalar(sink));
        clodIm.setMatrixAt(i, _m);
      }
      if (anyC) clodIm.instanceMatrix.needsUpdate = true;
      /* мелкая земля */
      if (o.renderer) { o.renderer.getDrawingBufferSize(dMat.uniforms.uRes.value); dMat.uniforms.uRes.value.multiplyScalar(globalThis.AEGIS_RS || 1); }
      let anyD = false;
      const TR = 1 / 75;
      for (let i = 0; i < DN; i++) {
        const d = dirt[i], v12 = i * 12, v16 = i * 16;
        if (!d.on) { if (gRad[i * 4] !== 0) { gRad.fill(0, i * 4, i * 4 + 4); for (let j = 0; j < 4; j++) gCol[v16 + j * 4 + 3] = 0; } continue; }
        anyD = true;
        d.t += dt;
        const vl = d.v.length();
        /* квадратичное сопротивление: крупинка 3 мм падает с ≈ 9 м/с, камешек 1 см — с ≈ 17 м/с */
        d.v.multiplyScalar(1 - Math.min(0.9, 3.5e-4 * d.cd / d.r * vl * dt));
        d.v.y -= 9.81 * dt;
        d.p.addScaledVector(d.v, dt);
        if (d.p.y <= groundAt(d.p.x, d.p.z) || d.t > 6) d.on = false;
        const tx = d.p.x - d.v.x * TR, ty = d.p.y - d.v.y * TR, tz = d.p.z - d.v.z * TR;
        const r = d.on ? d.r : 0;
        const cr = 0.045 + d.k * 0.09, cg = 0.036 + d.k * 0.072, cb = 0.027 + d.k * 0.05;
        for (let j = 0; j < 4; j++) {
          const o3 = v12 + j * 3, o4 = v16 + j * 4;
          gHead[o3] = d.p.x; gHead[o3 + 1] = d.p.y; gHead[o3 + 2] = d.p.z;
          gTail[o3] = tx; gTail[o3 + 1] = ty; gTail[o3 + 2] = tz;
          gRad[i * 4 + j] = r;
          gCol[o4] = cr; gCol[o4 + 1] = cg; gCol[o4 + 2] = cb; gCol[o4 + 3] = d.on ? 0.95 : 0;
        }
      }
      dirtPts.visible = anyD;
      if (anyD) { gaHead.needsUpdate = true; gaTail.needsUpdate = true; gaRad.needsUpdate = true; gaCol.needsUpdate = true; }
    };
    BX.clear = () => {
      for (const f of FIRE.list) f.o.visible = false;
      for (const q of smoke) q.on = false;
      for (let i = 0; i < CN; i++) { clods[i].on = false; clodIm.setMatrixAt(i, _zero); }
      clodIm.instanceMatrix.needsUpdate = true;
      for (const d of dirt) d.on = false;
      for (const c of craters) { BX.group.remove(c); c.geometry.dispose(); c.material.dispose(); }
      craters.length = 0; events.length = 0; canister.visible = false;
      sGeo.instanceCount = 0;
    };
    BX.light = light;
    BX.flash = flash;
    BX.puff = puff;
    BX._smoke = smoke;
    BX.veil = { a: 0, r: 0.2, g: 0.16, b: 0.12 };
    BX.atlas = atlas;   /* v23: тот же атлас облака для дымовых шашек (26c_smoke.js) */
    return BX;
  }
  return { create };
});

