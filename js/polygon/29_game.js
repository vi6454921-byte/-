
/* ==========================================================================
   МОДУЛЬ: game.js
   ========================================================================== */
/* ============================================================================
   Игровой слой: сцена, четыре бойца, выбор персонажа, камера, баллистика.

   Порядок кадра важен и выдержан строго:
     1) ввод -> контроллер игрока (позиция, отдача, стрельба);
     2) поза бойца (корпус, ноги, голова);
     3) размещение оружия относительно плеча и взгляда;
     4) обратная кинематика рук к рукоятке и цевью;
     5) камера: свободная / от третьего лица / от глаз бойца;
     6) эффекты и рендер.

   Такой порядок гарантирует, что руки всегда держат оружие, а оружие
   всегда согласовано со взглядом: ничего не «летает в воздухе».
   ========================================================================== */
(function (root, factory) {
  const G = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  else root.GGame = G;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const U = root.GUtil, TEX = root.GTex, CHAR = root.GChar, RIG = root.GRig,
    WORLD = root.GWorld, FX = root.GFX, AUDIO = root.GAudio, PLAYER = root.GPlayer;

  /* Расстановка бойцов: «Дельта» слева, «Альфа» справа, все в ряд лицом к
     игроку, между шеренгами — проход, где начинается свободная камера. */
  /* Шеренга разбита на два фланга: «Дельта» слева, «Альфа» справа, между
     ними проход, где стартует свободная камера. Бойцы развёрнуты лицом к
     игроку (yaw = PI, потому что модель смотрит в -Z). */
  const SPAWN = [
    { key: 'delta_1', x: -8.20, z: 1.2, yaw: Math.PI - 0.08 },
    { key: 'delta_2', x: -5.75, z: 1.2, yaw: Math.PI - 0.04 },
    { key: 'alpha_1', x: 1.75, z: 1.2, yaw: Math.PI + 0.02 },
    { key: 'alpha_2', x: 4.20, z: 1.2, yaw: Math.PI + 0.06 }
  ];
  /* точки сбора команд: флагшток за строем каждой команды */
  const TEAM_FLAGS = [
    { name: 'delta', kind: 'delta', x: -6.95, z: -1.3, poleH: 4.6, drop: 0.06, w: 1.35, h: 0.9 },
    { name: 'alpha', kind: 'alpha', x: 2.55, z: -1.3, poleH: 4.6, drop: 0.06, w: 1.35, h: 0.9 }
  ];

  const HOLD_TIME = 0.62;         // сколько держать F
  const USE_RANGE = 2.9;          // дистанция взаимодействия, м

  /* Окружение и постобработка грузятся до старта игры через GAssets:
     HDRI (RGBE) + фон 4k и аддоны three динамическим import(). Любая
     неудача даёт null, и main() откатывается к процедурной заливке и
     прямому renderer.render. */
  const GA = root.GAssets || null;
  const ENV_BG_SCALE = 8;                        // фон хранит linear/8 в sRGB
  const ENV_MIST = [2.889, 2.962, 3.332];        // цвет дымки на фото (linear), build_env_assets.py
  if (GA) {
    GA.add('env_hdr', __addon('loaders/RGBELoader.js').then((m) =>
      GA.fetchAny('assets/env/misty_pines_1k.hdr').then((buf) => new m.RGBELoader().parse(buf))));
    const mods = ['EffectComposer', 'RenderPass', 'OutputPass', 'ShaderPass', 'GTAOPass', 'SMAAPass'];
    GA.add('post_addons', Promise.allSettled(mods.map((m) => __addon('postprocessing/' + m + '.js')))
      .then((rs) => {
        const out = {};
        rs.forEach((r, i) => {
          if (r.status === 'fulfilled') Object.assign(out, r.value);
          else console.warn('addon ' + mods[i] + ' failed:', r.reason && r.reason.message);
        });
        return out;
      }));
  }

  /* Финальный грейд в display-пространстве (после ACES): холодная
     серо-зелёная гамма пасмурного леса, мягкий контраст, приподнятые
     тени как у плёнки, виньетка и анимированное зерно. */
  const GRADE_SHADER = {
    uniforms: {
      tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new root.THREE.Vector2(1, 1) },
      uSat: { value: 0.8 }, uContrast: { value: 1.05 }, uVig: { value: 0.3 }, uGrain: { value: 0.03 }, uLift: { value: 0.02 },
      uShadowTint: { value: new root.THREE.Vector3(1, 1, 1) }, uHighTint: { value: new root.THREE.Vector3(1, 1, 1) },
      uLut: { value: null }, uLutK: { value: 0 }, uLutN: { value: 32 },
      /* v7: bleach bypass (пропуск отбеливания, «Спасти рядового Райана» /
         «Иди и смотри»), подавление (Squad: тёмные края вместо размытия),
         вспышка-«засветка» при выходе из тёмного леса на свет */
      uBleach: { value: 0 }, uSup: { value: 0 }, uGlare: { value: 0 },
      /* v8: марево над горячим стволом (uMz: экранные дульный срез и
         патронник), ударная волна взрыва (uShock: центр, радиус, сила),
         грязь на объективе (uMud: сколько, uMudS: «рисунок») и контузия */
      uMirage: { value: 0 }, uMz: { value: new root.THREE.Vector4(0.5, 0.4, 0.55, 0.3) },
      uShock: { value: new root.THREE.Vector4(0.5, 0.5, 0, 0) }, uMud: { value: 0 }, uMudS: { value: 0 }, uConc: { value: 0 },
      /* v9: FXAA (NVIDIA, T. Lottes) — когда нет ни MSAA, ни SMAA («Низкая») */
      uFxaa: { value: 0 }
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse;
      uniform highp sampler3D uLut;
      uniform float uLutK, uLutN;
      uniform float uTime, uSat, uContrast, uVig, uGrain, uLift;
      uniform vec2 uRes;
      uniform vec3 uShadowTint, uHighTint;
      uniform float uBleach, uSup, uGlare;
      uniform float uMirage, uMud, uMudS, uConc;
      uniform vec4 uMz, uShock;
      uniform float uFxaa;
      varying vec2 vUv;
      /* FXAA «лайт»: 5 выборок на пиксель, ещё 4 — только на краях */
      vec3 fxaa(vec2 uv) {
        vec2 px = 1.0 / uRes;
        vec3 rM = texture2D(tDiffuse, uv).rgb;
        vec3 rNW = texture2D(tDiffuse, uv + vec2(-px.x, px.y)).rgb, rNE = texture2D(tDiffuse, uv + px).rgb;
        vec3 rSW = texture2D(tDiffuse, uv - px).rgb, rSE = texture2D(tDiffuse, uv + vec2(px.x, -px.y)).rgb;
        const vec3 LW = vec3(0.299, 0.587, 0.114);
        float lM = dot(rM, LW), lNW = dot(rNW, LW), lNE = dot(rNE, LW), lSW = dot(rSW, LW), lSE = dot(rSE, LW);
        float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
        if (lMax - lMin < max(0.0312, lMax * 0.125)) return rM;
        vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
        float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
        dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -8.0, 8.0) * px;
        vec3 A = 0.5 * (texture2D(tDiffuse, uv - dir * 0.1667).rgb + texture2D(tDiffuse, uv + dir * 0.1667).rgb);
        vec3 B = A * 0.5 + 0.25 * (texture2D(tDiffuse, uv - dir * 0.5).rgb + texture2D(tDiffuse, uv + dir * 0.5).rgb);
        float lB = dot(B, LW);
        return (lB < lMin || lB > lMax) ? A : B;
      }
      float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
      float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main() {
        vec2 uv = vUv;
        float asp = uRes.x / max(1.0, uRes.y);
        /* v25: искажения картинки убраны — марево над стволом, кольцо
           преломления от взрыва и «плавание» кадра при контузии давали рябь
           на экране. Контузию передают звон, туннель, серость и двоение. */
        vec3 c = uFxaa > 0.5 ? fxaa(uv) : texture2D(tDiffuse, uv).rgb;
        if (uConc > 0.002) c = mix(c, texture2D(tDiffuse, uv + vec2(0.006, 0.002) * uConc).rgb, 0.35 * uConc);
        /* v6: 3D LUT 32³ (строится из параметров погоды или из .cube) */
        if (uLutK > 0.001) c = mix(c, texture(uLut, clamp(c, 0.0, 1.0) * ((uLutN - 1.0) / uLutN) + 0.5 / uLutN).rgb, uLutK);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        /* bleach bypass (формула NVIDIA SDK): серебро остаётся в плёнке —
           цвет вымывается, контраст в светах растёт, тени плотнеют */
        if (uBleach > 0.001) {
          vec3 bl = vec3(l);
          float bk = clamp(10.0 * (l - 0.45), 0.0, 1.0);
          vec3 r1 = 2.0 * c * bl, r2 = 1.0 - 2.0 * (1.0 - bl) * (1.0 - c);
          c = mix(c, mix(r1, r2, bk), uBleach);
          l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        }
        c = mix(vec3(l), c, uSat * (1.0 - uSup * 0.35));
        c *= mix(uShadowTint, uHighTint, smoothstep(0.05, 0.75, l));
        c = (c - 0.45) * uContrast + 0.45;
        c = uLift * vec3(0.92, 1.0, 0.96) + c * (1.0 - uLift);
        vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
        c *= mix(1.0 - uVig, 1.0, smoothstep(1.05, 0.25, length(q)));
        /* подавление: края темнеют и «сужают» обзор, центр не трогаем */
        if (uSup > 0.001) c *= mix(1.0 - 0.75 * uSup, 1.0, smoothstep(0.95 - uSup * 0.25, 0.18, length(q)));
        /* засветка: глаз ещё не привык к свету — светлые места «выгорают» */
        if (uGlare > 0.001) c = mix(c, 1.0 - (1.0 - c) * (1.0 - c), uGlare * smoothstep(0.25, 0.8, l));
        /* контузия: туннель и «серость» */
        if (uConc > 0.002) { c = mix(c, vec3(dot(c, vec3(0.33))), 0.4 * uConc); c *= mix(1.0 - 0.5 * uConc, 1.0, smoothstep(0.85, 0.2, length(q))); }
        /* грязь на объективе: комья по краям и брызги, края мутные */
        if (uMud > 0.002) {
          vec2 mp = vUv * vec2(asp, 1.0) * 5.0 + uMudS * 17.3;
          float m = vnoise(mp) * 0.6 + vnoise(mp * 2.3 + 3.1) * 0.3 + vnoise(mp * 6.1) * 0.1;
          float edge = smoothstep(0.25, 0.75, length(q));
          float k = smoothstep(0.62 - 0.32 * uMud * (0.4 + edge), 0.7 - 0.3 * uMud * (0.4 + edge), m);
          /* брызги: круглые капли разного размера (а не квадраты сетки) */
          vec2 cp = vUv * uRes / 13.0 + uMudS * 31.0, ci = floor(cp), cf = fract(cp) - 0.5;
          vec2 off = vec2(hash(ci + 7.1), hash(ci + 3.3)) - 0.5;
          float rad = 0.1 + 0.32 * hash(ci + 1.7);
          float sp2 = step(0.972 - 0.03 * uMud, hash(ci)) * (1.0 - smoothstep(rad * 0.6, rad, length(cf - off * 0.45)));
          k = max(k, sp2 * uMud);
          vec3 mud = vec3(0.075, 0.06, 0.045) * (0.7 + 0.6 * vnoise(mp * 9.0));
          c = mix(c, mud + c * 0.08, clamp(k, 0.0, 1.0) * 0.95);
        }
        vec2 px = vUv * uRes;
        float n = hash(px + fract(uTime * 7.31) * 131.0) + hash(px * 0.5 + fract(uTime * 3.7) * 71.0) - 1.0;
        c += n * uGrain * (0.35 + 0.65 * (1.0 - abs(l * 2.0 - 1.0)));
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`
  };

  /* v6: лучи света (god rays) — пост-эффект «Volumetric Light Scattering as
     a Post-Process» (K. Mitchell, GPU Gems 3, гл. 13): радиальное размытие
     к экранной позиции солнца. Источник — яркие просветы неба между
     стволами и кронами (порог по яркости), поэтому лучи «режутся» стволами.
     Число выборок — define NS (Высокая 40, Средняя 24, на Низкой выключено). */
  const RAYS_SHADER = {
    defines: { NS: 40 },
    uniforms: {
      tDiffuse: { value: null }, uSun: { value: new root.THREE.Vector2(0.5, 0.8) }, uStr: { value: 0 }, uThr: { value: 0.62 },
      uAspect: { value: 1.7 }, uCol: { value: new root.THREE.Vector3(1, 0.9, 0.75) }, uDecay: { value: 0.965 }
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse;
      uniform vec2 uSun; uniform float uStr, uThr, uAspect, uDecay; uniform vec3 uCol;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        if (uStr > 0.002) {
          vec2 d = uSun - vUv;
          float dist = length(d * vec2(uAspect, 1.0));
          vec2 st = d / float(NS) * 0.9;
          float j = fract(sin(dot(vUv * 1000.0, vec2(12.9898, 78.233))) * 43758.5453);
          vec2 uv = vUv + st * j;
          float w = 1.0, acc = 0.0;
          for (int i = 0; i < NS; i++) {
            uv += st;
            vec3 s = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
            float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
            acc += smoothstep(uThr, uThr + 0.25, l) * w;
            w *= uDecay;
          }
          acc /= float(NS);
          c += uCol * acc * uStr * exp(-dist * 1.5) * (1.0 - 0.5 * dot(c, vec3(0.33)));
        }
        gl_FragColor = vec4(c, 1.0);
      }`
  };

  /* v6: параметрический 3D LUT 32³ (как .cube из DaVinci). Операции в
     display-пространстве: сдвиг тона зелени к оливе/бирюзе и её
     насыщенность, split-toning теней и светов, мягкая S-кривая. */
  function buildLut(THREE, P, tex) {
    const N = 32, data = tex ? tex.image.data : new Uint8Array(N * N * N * 4);
    const sh = P.shadow || [1, 1, 1], hi = P.high || [1, 1, 1];
    for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
      let R = r / (N - 1), G = g / (N - 1), B = b / (N - 1);
      /* HSV */
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B), dl = mx - mn;
      let h = 0;
      if (dl > 1e-5) { h = mx === R ? ((G - B) / dl) % 6 : mx === G ? (B - R) / dl + 2 : (R - G) / dl + 4; h *= 60; if (h < 0) h += 360; }
      let sat = mx > 0 ? dl / mx : 0, val = mx;
      const gw = Math.max(0, 1 - Math.abs(h - 105) / 65);          // «зелёная» зона 40–170°
      h += (P.greenHue || 0) * gw;
      sat *= (1 + ((P.greenSat || 1) - 1) * gw) * (P.sat || 1);
      sat = Math.min(1, sat);
      /* обратно в RGB */
      const C = val * sat, X = C * (1 - Math.abs(((h / 60) % 2) - 1)), m = val - C;
      const hh = ((h % 360) + 360) % 360;
      let rr, gg, bb;
      if (hh < 60) { rr = C; gg = X; bb = 0; } else if (hh < 120) { rr = X; gg = C; bb = 0; } else if (hh < 180) { rr = 0; gg = C; bb = X; }
      else if (hh < 240) { rr = 0; gg = X; bb = C; } else if (hh < 300) { rr = X; gg = 0; bb = C; } else { rr = C; gg = 0; bb = X; }
      R = rr + m; G = gg + m; B = bb + m;
      const L = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      const t = Math.min(1, Math.max(0, (L - 0.08) / 0.7)), ts = t * t * (3 - 2 * t);
      R *= sh[0] + (hi[0] - sh[0]) * ts; G *= sh[1] + (hi[1] - sh[1]) * ts; B *= sh[2] + (hi[2] - sh[2]) * ts;
      const cv = P.curve || 0, sc = (x) => { x = Math.min(1, Math.max(0, x)); return x + cv * (x * x * (3 - 2 * x) - x); };
      R = sc(R); G = sc(G); B = sc(B);
      const o = ((b * N + g) * N + r) * 4;
      data[o] = R * 255 + 0.5; data[o + 1] = G * 255 + 0.5; data[o + 2] = B * 255 + 0.5; data[o + 3] = 255;
    }
    if (tex) { tex.needsUpdate = true; return tex; }
    const t3 = new THREE.Data3DTexture(data, N, N, N);
    t3.format = THREE.RGBAFormat; t3.type = THREE.UnsignedByteType;
    t3.minFilter = t3.magFilter = THREE.LinearFilter;
    t3.wrapS = t3.wrapT = t3.wrapR = THREE.ClampToEdgeWrapping;
    t3.unpackAlignment = 1; t3.needsUpdate = true;
    return t3;
  }
  /* .cube (Adobe/Resolve): LUT_3D_SIZE N, строки «r g b», r меняется быстрее всего */
  function parseCube(THREE, text) {
    const lines = String(text).split(/\r?\n/);
    let N = 0; const v = [];
    for (const ln of lines) {
      const s = ln.trim();
      if (!s || s[0] === '#') continue;
      if (/^LUT_3D_SIZE/i.test(s)) { N = parseInt(s.split(/\s+/)[1], 10); continue; }
      if (/^[A-Z_]/i.test(s)) continue;
      const p = s.split(/\s+/).map(Number);
      if (p.length >= 3 && p.every(Number.isFinite)) v.push(p[0], p[1], p[2]);
    }
    if (!N || v.length < N * N * N * 3) throw new Error('bad .cube');
    const data = new Uint8Array(N * N * N * 4);
    for (let i = 0; i < N * N * N; i++) {
      data[i * 4] = Math.min(255, v[i * 3] * 255 + 0.5); data[i * 4 + 1] = Math.min(255, v[i * 3 + 1] * 255 + 0.5);
      data[i * 4 + 2] = Math.min(255, v[i * 3 + 2] * 255 + 0.5); data[i * 4 + 3] = 255;
    }
    const t3 = new THREE.Data3DTexture(data, N, N, N);
    t3.format = THREE.RGBAFormat; t3.minFilter = t3.magFilter = THREE.LinearFilter; t3.unpackAlignment = 1; t3.needsUpdate = true;
    return t3;
  }

  /* v10: сборка полигона — асинхронная: между тяжёлыми этапами (мир,
     импостеры, каждый боец) главный поток отдаёт кадр — заставка и полоса
     загрузки не замирают на десятки секунд, а этапы видны в процентах.
     Ожидания стоят только до регистрации обработчиков ввода (без TDZ). */
  const BOOT_STEPS = 9;
  const BOOTMARK = (l) => { const B = root.AEGIS_BOOT; if (B) B.t.push([l, Math.round(performance.now() - B.t0)]); };
  async function main() {
    const THREE = root.THREE;
    const BOOTST = root.AEGIS_BOOT = { n: 0, k: 0, t: [], t0: performance.now() };
    const bootYield = (label) => {
      BOOTST.n++; BOOTST.k = BOOTST.n / BOOT_STEPS; BOOTST.t.push([label, Math.round(performance.now() - BOOTST.t0)]);
      /* один кадр (rAF) + выход из задачи: браузер успевает отрисовать заставку */
      return new Promise((res) => {
        let done = false; const go = () => { if (!done) { done = true; setTimeout(res, 0); } };
        requestAnimationFrame(go); setTimeout(go, 50);
      });
    };
    /* Низовой туман: к FogExp2 добавлен слой, плотность которого спадает с
       высотой (интеграл вдоль луча от камеры до точки). Дымка стелется
       между стволами и в низинах, кроны выходят из неё тёмным силуэтом. */
    (function heightFog() {
      const SC = THREE.ShaderChunk;
      if (!SC || !SC.fog_fragment || SC.fog_fragment.indexOf('hfTau') >= 0) return;
      const v0 = 'varying float vFogDepth;', d0 = 'vFogDepth = - mvPosition.z;',
        f0 = 'float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );';
      if (SC.fog_pars_vertex.indexOf(v0) < 0 || SC.fog_vertex.indexOf(d0) < 0 ||
        SC.fog_pars_fragment.indexOf(v0) < 0 || SC.fog_fragment.indexOf(f0) < 0) return;
      SC.fog_pars_vertex = SC.fog_pars_vertex.replace(v0, v0 + '\n\tvarying vec3 vFogWorld;');
      SC.fog_vertex = SC.fog_vertex.replace(d0, d0 + '\n\tvFogWorld = cameraPosition + transpose( mat3( viewMatrix ) ) * mvPosition.xyz;');
      /* v6: «живой» туман. Время и плотность низового слоя приходят через
         неиспользуемые для FogExp2 uniform fogNear/fogFar (см. LivingFog):
         fogNear = -(1 + 1000·HF_A·1000 + t), fogFar = плотность. Низовой слой
         рвётся на медленно плывущие по ветру клочья (2 октавы value-noise),
         в низинах (меньше y) он гуще сам по себе — экспонента по высоте. */
      SC.fog_pars_fragment = SC.fog_pars_fragment
        .replace(v0, v0 + `
	varying vec3 vFogWorld;
	#define HF_A 0.016
	#define HF_B 0.55
	float lfHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
	float lfNoise( vec3 x ) {
		vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
		return mix( mix( mix( lfHash( i ), lfHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( lfHash( i + vec3( 0, 1, 0 ) ), lfHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
			mix( mix( lfHash( i + vec3( 0, 0, 1 ) ), lfHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( lfHash( i + vec3( 0, 1, 1 ) ), lfHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
	}`)
        .replace('uniform float fogDensity;', 'uniform float fogDensity;\n\t\tuniform float fogNear;\n\t\tuniform float fogFar;');
      SC.fog_fragment = SC.fog_fragment.replace(f0, `bool lfOn = fogNear < -0.5;
		float lfN = - fogNear - 1.0;
		float lfD = lfOn ? fogFar : fogDensity;
		float lfA = lfOn ? floor( lfN / 1000.0 ) * 1e-3 : HF_A;
		float lfT = lfOn ? mod( lfN, 1000.0 ) : 0.0;
		float hfL = length( vFogWorld - cameraPosition );
		float hfDy = vFogWorld.y - cameraPosition.y;
		float hfE0 = exp( - HF_B * cameraPosition.y );
		float hfE = abs( hfDy ) < 0.02 ? hfE0 : ( hfE0 - exp( - HF_B * vFogWorld.y ) ) / ( HF_B * hfDy );
		if ( lfOn ) {
			vec3 lfP = mix( cameraPosition, vFogWorld, min( 1.0, 9.0 / max( hfL, 1e-3 ) ) * 0.5 + 0.25 );
			vec3 q = vec3( lfP.x * 0.07 - lfT * 0.045, lfP.y * 0.25 - lfT * 0.012, lfP.z * 0.07 - lfT * 0.03 );
			float n = lfNoise( q ) * 0.65 + lfNoise( q * 2.7 + 3.1 ) * 0.35;
			/* v7: рваные слои — плотные клочья и чистые промежутки между ними */
			lfA *= 0.12 + 2.6 * n * n;
			#ifdef GLOOM
			/* в низинах и у воды туман гуще (карта крон, канал B) */
			lfA *= 0.5 + 1.7 * texture2D( uCanopy, lfP.xz * 0.00390625 + 0.5 ).b;
			#endif
		}
		float hfTau = lfD * lfD * vFogDepth * vFogDepth + lfA * hfL * min( hfE, 4.0 );
		float fogFactor = 1.0 - exp( - hfTau );
		#ifdef GLOOM
		/* v7: свет в дымке — вспышки выстрелов и осветительные ракеты:
		   интеграл 1/(h²+t²) вдоль луча от камеры до точки */
		vec3 fogC = fogColor;
		{
			vec3 rd = vFogWorld - cameraPosition; float Lr = max( length( rd ), 1e-3 ); rd /= Lr;
			if ( uFogL0.w > 0.0 ) {
				vec3 lp = uFogL0.xyz - cameraPosition; float t0 = dot( lp, rd ); float h = sqrt( max( dot( lp, lp ) - t0 * t0, 0.09 ) );
				fogC += uFogC0.rgb * uFogL0.w * ( atan( ( Lr - t0 ) / h ) + atan( t0 / h ) ) / h;
			}
			if ( uFogL1.w > 0.0 ) {
				vec3 lp = uFogL1.xyz - cameraPosition; float t0 = dot( lp, rd ); float h = sqrt( max( dot( lp, lp ) - t0 * t0, 1.0 ) );
				fogC += uFogC1.rgb * uFogL1.w * ( atan( ( Lr - t0 ) / h ) + atan( t0 / h ) ) / h;
			}
		}
		#define fogColor fogC
		#endif`);
      /* после смешивания — снять подмену цвета тумана */
      SC.fog_fragment = SC.fog_fragment + '\n#ifdef GLOOM\n#undef fogColor\n#endif\n';
    })();
    const clamp = U.clamp;
    const AE = root.AEGIS || null;
    const SET = (AE && AE.loadSettings()) || { quality: 'medium', sens: 1, volume: 0.8, fps: false, binds: {} };
    root.AEGIS_SETTINGS=SET;

    /* ====================================================== рендерер === */
    /* antialias: false — сглаживание делает постобработка (MSAA целей / SMAA), MSAA холста только тратил память и заливку */
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    /* v21: проверка ошибок шейдеров (getProgramInfoLog и т.п. на каждой новой
       программе — синхронное ожидание драйвера) — только в режиме ?dev */
    if (!/[?&]dev\b/.test(location.search)) renderer.debug.checkShaderErrors = false;
    /* 1.5 вместо 2: на HiDPI экранах постобработка в 4K съедает бюджет 60 fps */
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    /* v8: потеря WebGL-контекста (сброс драйвера, нехватка видеопамяти,
       фоновая вкладка на ноутбуке/планшете) — вместо чёрного замершего кадра
       понятное сообщение; браузер вернул контекст — перезапуск страницы
       (сцена из сотен буферов и шейдеров надёжнее строится заново) */
    try {
      const cv = renderer.domElement;
      cv.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        try { if (typeof S !== 'undefined' && S) S.paused = true; } catch (er) { /* */ }
        if (document.getElementById('ctxLost')) return;
        const d = document.createElement('div');
        d.id = 'ctxLost';
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(6,8,9,.92);color:#d8dcd6;font:15px/1.5 system-ui,sans-serif;text-align:center;padding:24px';
        d.innerHTML = '<b style="font-size:18px">Видеокарта сбросила графику</b><span>Обычно это нехватка видеопамяти или сбой драйвера. Попробуйте графику «Низкая» в настройках.</span><button style="padding:9px 22px;font:inherit;background:#2b3a30;color:#e6ebe4;border:1px solid #4a5f50;border-radius:6px;cursor:pointer">Перезапустить</button>';
        d.querySelector('button').onclick = () => location.reload();
        document.body.appendChild(d);
        console.warn('AEGIS: WebGL context lost');
      }, false);
      cv.addEventListener('webglcontextrestored', () => { setTimeout(() => location.reload(), 400); }, false);
    } catch (e) { /* */ }
    /* v6: AgX (Blender 4 / three r160+) вместо ACES: светлые участки не
       уходят в кислотный жёлто-зелёный, тени не «давятся», хвоя сохраняет
       оттенки. Контраст и цвет добирает грейд + LUT. */
    renderer.toneMapping = THREE.AgXToneMapping !== undefined ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    /* «Низкая»: обычный PCF дешевле мягкого (тип меняется только при запуске) */
    if(root.GGPUCache)root.GGPUCache.init(renderer);
    renderer.shadowMap.type = SET.quality === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.02, 400);

    /* ================================================ свет и дымка === */
    /* Пасмурный сосновый лес: вся заливка — от HDRI «Misty Pines» (Poly
       Haven, CC0), фон — то же фото, у которого всё ниже ~15° растворено в
       цвете тумана. Туман тех же тонов, поэтому 3D-стволы на 30–80 м
       уходят в ту же молочную дымку, что и стволы на фото. Прямого солнца
       нет: слабый холодный направленный свет нужен только для мягких
       контактных теней. Числа собраны в LOOK, чтобы подбирать их из
       консоли через __GAME.look({...}). */
    const LOOK = {
      exposure: 0.82,
      env: 0.82,             // scene.environmentIntensity
      mist: 0.12,            // яркость дымки/фона относительно фото: мрачный пасмурный лес
      fogDensity: 0.022,
      sun: 0.38, sunElev: 52, sunAzim: 28,
      hemi: 0.0,
      ao: 1.0,
      sat: 0.76, contrast: 1.12, vignette: 0.48, grain: 0.045,
      shadowTint: [0.88, 0.95, 1.0], highTint: [0.98, 1.0, 0.96], lift: 0.012
    };
    renderer.toneMappingExposure = LOOK.exposure;
    /* v7: адаптация глаза. Яркость сцены оценивается без чтения кадра с
       видеокарты: сомкнутость полога над камерой (карта GGloom) и взгляд в
       небо. Глаз привыкает к свету быстро (≈0,5 с), к темноте — медленно
       (≈3 с): из тёмного леса на поляну — засветка, обратно — лес сначала
       «чёрный», потом проступает. Компенсация частичная (показатель 0,5). */
    const EYE = { on: 1, L: 1, m: 1, glare: 0 };
    const _eyeD = new THREE.Vector3();

    const pmrem = new THREE.PMREMGenerator(renderer);
    let envOK = false;
    const hdr = GA && GA.data.env_hdr;
    if (hdr && hdr.data) {
      try {
        const t = new THREE.DataTexture(hdr.data, hdr.width, hdr.height, THREE.RGBAFormat, hdr.type);
        t.colorSpace = THREE.LinearSRGBColorSpace;
        t.mapping = THREE.EquirectangularReflectionMapping;
        t.minFilter = t.magFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        t.flipY = true;
        t.needsUpdate = true;
        scene.environment = pmrem.fromEquirectangular(t).texture;
        t.dispose();
        envOK = true;
      } catch (e) { console.warn('HDRI environment failed:', e && e.message); }
    }
    if (!envOK) {
      /* запасной вариант без HDRI: ровная серо-зелёная заливка */
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x8f9690);
      scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    }
    pmrem.dispose();
    scene.environmentIntensity = LOOK.env;

    const fogColor = new THREE.Color();
    /* FogExp2, который несёт время и плотность низового слоя (см. heightFog) */
    class LivingFog extends THREE.FogExp2 {
      constructor(c, d) { super(c, d); this.isFog = true; this.hf = 16; this.t = 0; this.pack(); }
      get density() { return this.far; }
      set density(v) { this.far = v; }
      pack() { this.near = -(1 + Math.round(this.hf) * 1000 + (this.t % 999)); }
    }
    scene.fog = new LivingFog(fogColor, LOOK.fogDensity);
    scene.fog.color = fogColor;        // FogExp2 копирует цвет: без этого дымка оставалась белой и не следовала LOOK.mist
    /* v12: фон — процедурное пасмурное небо вместо фото-панорамы. На фото
       были чужие (плоские, неподвижные) кроны: при взгляде вверх они
       «висели» за настоящими 3D-соснами картинкой. Теперь силуэты крон дают
       только 3D-деревья, а фон — само небо (распределение яркости CIE для
       сплошной облачности: зенит ≈ в 2–3 раза ярче горизонта) с мягкой
       неоднородностью слоя туч. Всё, что ниже горизонта, — ровно цвет
       дымки, поэтому дальние стволы растворяются в ней без шва. Хранится
       так же, как прежнее фото (linear/8 в sRGB), — остальной конвейер
       (тучи в шейдере фона, backgroundIntensity, туман) не меняется. */
    function proceduralSky(L) {
      const W = 1024, H = 512, cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d'), im = g.createImageData(W, H), d = im.data;
      const mist = ENV_MIST.map((v) => v / ENV_BG_SCALE);           // linear
      const toS = (x) => { x = Math.max(0, Math.min(1, x)); return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; };
      const nz = U.noise2D ? U.noise2D(4242) : null;
      for (let y = 0; y < H; y++) {
        const el = (0.5 - (y + 0.5) / H) * Math.PI;                  // высота над горизонтом, рад
        const se = Math.sin(Math.max(0, el));
        /* CIE overcast: L ∝ (1 + 2 sin θ) / 3 — к зениту небо светлее;
           у самого горизонта — ровно цвет дымки (без шва с туманом) */
        const m0 = el <= 0 ? 1 : 1 + 1.15 * (1 - Math.exp(-el / 0.3));
        const hz = el <= 0 ? 1 : Math.exp(-el / 0.06);
        for (let x = 0; x < W; x++) {
          let n = 0;
          if (nz && el > 0) {
            const a = x / W * Math.PI * 2, r = 1 / (se + 0.12);
            const px = Math.cos(a) * r * 2.2, pz = Math.sin(a) * r * 2.2;
            n = (nz(px, pz) - 0.5) * 0.10 + (nz(px * 2.7 + 9, pz * 2.7) - 0.5) * 0.05;
          }
          const m = m0 * (1 + n * (1 - hz));
          const o = (y * W + x) * 4;
          /* зенит чуть холоднее горизонта */
          const cool = el > 0 ? Math.min(1, el / 1.2) : 0;
          if (L && L.skyZ) {
            /* ясное небо: у горизонта — дымка, к зениту — синева (без шва с туманом) */
            const z = el > 0 ? 1 - Math.exp(-el / 0.32) : 0, H_ = L.skyH, Z_ = L.skyZ, mm = el <= 0 ? 1 : 1 + 0.35 * (1 - hz);
            for (let c = 0; c < 3; c++) d[o + c] = toS(mist[c] * mm * (H_[c] + (Z_[c] - H_[c]) * z) * (1 + n * 0.25)) * 255;
          } else {
          d[o] = toS(mist[0] * m * (1 - 0.05 * cool)) * 255;
          d[o + 1] = toS(mist[1] * m * (1 - 0.02 * cool)) * 255;
          d[o + 2] = toS(mist[2] * m * (1 + 0.02 * cool)) * 255;
          }
          d[o + 3] = 255;
        }
      }
      g.putImageData(im, 0, 0);
      return cv;
    }
    let bgTex = null;
    if (envOK) {
      bgTex = new THREE.CanvasTexture(proceduralSky());
      bgTex.mapping = THREE.EquirectangularReflectionMapping;
      bgTex.colorSpace = THREE.SRGBColorSpace;
      bgTex.generateMipmaps = false;         // фон 4k только увеличивается
      bgTex.minFilter = THREE.LinearFilter;
      bgTex.needsUpdate = true;
      scene.background = bgTex;
    } else {
      scene.background = fogColor;
    }

    /* =========================================================== свет == */
    const sunDir = new THREE.Vector3();
    const sun = new THREE.DirectionalLight(0xdfe5e8, LOOK.sun);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    (function () {
      const c = sun.shadow.camera;
      c.near = 1; c.far = 140;
      c.left = -26; c.right = 26; c.top = 26; c.bottom = -26;
      c.updateProjectionMatrix();
    })();
    scene.add(sun);
    scene.add(sun.target);
    /* без HDRI полусферный свет возвращает прежнюю серую заливку */
    const hemi = new THREE.HemisphereLight(0xa9b0aa, 0x3c3a32, envOK ? LOOK.hemi : 0.85);
    scene.add(hemi);

    function applyLook() {
      renderer.toneMappingExposure = LOOK.exposure * EYE.m;
      scene.environmentIntensity = LOOK.env;
      const k = envOK ? LOOK.mist : 0.25;
      const mt = LOOK.mistTint || [1, 1, 1];
      fogColor.setRGB(ENV_MIST[0] * k * mt[0], ENV_MIST[1] * k * mt[1], ENV_MIST[2] * k * mt[2]);
      if (scene.fog && scene.fog.pack) { scene.fog.hf = LOOK.hf || 16; scene.fog.pack(); }
      if (LOOK.sunCol) sun.color.setRGB(LOOK.sunCol[0], LOOK.sunCol[1], LOOK.sunCol[2]);
      if (scene.fog) scene.fog.density = LOOK.fogDensity;
      if (bgTex) scene.backgroundIntensity = ENV_BG_SCALE * k;
      sunDir.setFromSphericalCoords(1, Math.PI / 2 - LOOK.sunElev * Math.PI / 180, LOOK.sunAzim * Math.PI / 180);
      sun.position.copy(sunDir).multiplyScalar(60);
      sun.intensity = LOOK.sun;
      if (envOK) hemi.intensity = LOOK.hemi;
      hemi.visible = hemi.intensity > 0;
      if (POST) POST.apply(LOOK);
      /* v9: общий свет для дыма выстрелов (WK.ShotFX) — в тёмном лесу и ночью он не «светится» */
      try { if (fx && fx.sfx) { const am = U.clamp((LOOK.env || 0.6) * 0.62 + Math.min(1.5, LOOK.sun || 0) * 0.1, 0.05, 0.85); fx.sfx.setAmbient(am, am * 1.01, am * 1.04); } } catch (e) { /* fx ещё не создан */ }
    }

    /* ============================================== постобработка === */
    /* RenderPass → GTAO (половинное разрешение) → OutputPass (ACES + sRGB)
       → [SMAA, если нет MSAA] → грейд: цвет, виньетка, зерно. Если какой-то
       аддон не загрузился или композер упал — рисуем напрямую. */
    /* v10: out — пикселей холста на CSS-пиксель, inn — внутреннее разрешение
       сцены; root.AEGIS_RS = inn/out — для шейдеров с размерами в пикселях */
    const RES = { out: renderer.getPixelRatio(), inn: renderer.getPixelRatio() };
    root.AEGIS_RS = 1;
    let POST = makePost();
    function makePost() {
      const A = GA && GA.data.post_addons;
      if (!A || !A.EffectComposer || !A.RenderPass || !A.OutputPass || !A.ShaderPass) return null;
      try {
        const composer = new A.EffectComposer(renderer);
        /* MSAA в целевых буферах: сглаживает и геометрию, и альфа-карточки
           хвои (alphaToCoverage работает только с мультисэмплингом) */
        /* ?dev — облегчённый кадр для съёмки проверок (без MSAA, AO и SMAA) */
        const DEV = typeof location !== 'undefined' && /[?&]dev\b/.test(location.search);
        const samples = DEV ? 0 : Math.min(4, renderer.capabilities.maxSamples || 0);
        composer.renderTarget1.samples = composer.renderTarget2.samples = samples;
        composer.addPass(new A.RenderPass(scene, camera));
        let gtao = null;
        if (A.GTAOPass && !DEV) {
          gtao = new A.GTAOPass(scene, camera, 512, 512, undefined,
            { radius: 0.55, distanceExponent: 1.5, thickness: 1.2, distanceFallOff: 1.0, scale: 1.0, samples: 12 },
            { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
          const gSize = gtao.setSize.bind(gtao);
          gtao.setSize = (w, h) => gSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
          /* В G-буфер AO не пишем альфа-карточки (хвоя, трава: override-
             материал не знает их альфы и дал бы тёмные прямоугольники) и
             прозрачные эффекты (вспышки, трассеры, дым). */
          /* Оптимизация: один обход только видимых веток (скрытые и так не
             рисуются), запоминаем лишь то, что спрятали, и возвращаем по
             списку — вместо двух полных обходов сцены с Map на каждый кадр. */
          const hidden = [];
          gtao.overrideVisibility = function () {
            hidden.length = 0;
            this.scene.traverseVisible((o) => {
              if (o.isPoints || o.isLine || o.isSprite || o.userData.noAO ||
                (o.material && !Array.isArray(o.material) && (o.material.transparent || o.material.depthWrite === false))) hidden.push(o);
            });
            for (let i = 0; i < hidden.length; i++) hidden[i].visible = false;
          };
          gtao.restoreVisibility = function () {
            for (let i = 0; i < hidden.length; i++) hidden[i].visible = true;
            hidden.length = 0;
          };
          /* v10: G-буфер AO больше не рисуется отдельным проходом по сцене
             (это было ещё ~250 вызовов и 2+ млн треугольников за кадр):
             берём буфер глубины основного прохода (DepthTexture на целях
             композера, после MSAA — resolve), нормали GTAO восстанавливает
             из глубины (так делают UE/Unity URP SSAO «Depth only»). Заодно
             AO теперь совпадает с тем, что видно: раньше кроны и трава в
             G-буфер не попадали и на хвое проступали тёмные «дыры» от AO
             того, что за ней. */
          if (THREE.DepthTexture) {
            composer.renderTarget1.depthTexture = new THREE.DepthTexture(1, 1);
            composer.renderTarget2.depthTexture = new THREE.DepthTexture(1, 1);
            gtao.setGBuffer(composer.renderTarget1.depthTexture);
          }
          /* второй проход по сцене не должен перерисовывать карту теней */
          const gRender = gtao.render.bind(gtao);
          gtao.render = function (r, wb, rb, dt, mask) {
            const dtx = rb && rb.depthTexture;
            if (dtx && !gtao._renderGBuffer && gtao.depthTexture !== dtx) {
              gtao.depthTexture = dtx;
              gtao.gtaoMaterial.uniforms.tDepth.value = dtx;
              gtao.pdMaterial.uniforms.tDepth.value = dtx;
            }
            const au = r.shadowMap.autoUpdate, nu = r.shadowMap.needsUpdate, mw = scene.matrixWorldAutoUpdate;
            r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false;
            /* матрицы сцены уже пересчитаны проходом RenderPass этого кадра */
            scene.matrixWorldAutoUpdate = false;
            try { gRender(r, wb, rb, dt, mask); } finally { r.shadowMap.autoUpdate = au; r.shadowMap.needsUpdate = nu; scene.matrixWorldAutoUpdate = mw; }
          };
          composer.addPass(gtao);
        }
        composer.addPass(new A.OutputPass());
        /* v6: лучи — после тонмаппинга, до SMAA и грейда */
        const rays = new A.ShaderPass(RAYS_SHADER);
        rays.enabled = false;
        composer.addPass(rays);
        let smaa = null;
        if (samples < 2 && A.SMAAPass && !DEV) { smaa = new A.SMAAPass(512, 512); composer.addPass(smaa); }
        const grade = new A.ShaderPass(GRADE_SHADER);
        composer.addPass(grade);
        /* линза бодикама (game/bodycam.js): включается от первого лица */
        const lens = root.GBodycam ? new A.ShaderPass(root.GBodycam.LENS_SHADER) : null;
        if (lens) { lens.enabled = true; composer.addPass(lens); }
        const post = {
          composer, gtao, grade, smaa, lens, rays,
          apply(L) {
            if (gtao) gtao.blendIntensity = L.ao;
            const u = grade.uniforms;
            u.uSat.value = L.sat; u.uContrast.value = L.contrast; u.uVig.value = L.vignette;
            u.uGrain.value = L.grain; u.uLift.value = L.lift; post.grainBase = L.grain;
            u.uShadowTint.value.fromArray(L.shadowTint); u.uHighTint.value.fromArray(L.highTint);
          },
          /* v10: кадр считается во внутреннем разрешении (RES.inn), а холст —
             в родном (RES.out). Последний проход (линза) апскейлит бикубиком
             Catmull-Rom + адаптивная резкость (как AMD FSR 1: EASU + RCAS)
             вместо растягивания холста браузером (билинейно — «мыло»). */
          resize(w, h) {
            const ip = RES.inn;
            composer.setPixelRatio(ip);
            composer.setSize(w, h);
            /* размер реальной цели (округление как в EffectComposer) */
            const iw = Math.floor(w * ip), ih = Math.floor(h * ip);
            grade.uniforms.uRes.value.set(iw, ih);
            if (lens) {
              lens.uniforms.uRes.value.set(iw, ih);
              lens.uniforms.uOut.value.set(Math.floor(w * RES.out), Math.floor(h * RES.out));
              lens.uniforms.uAspect.value = w / h;
            }
          }
        };
        post.resize(window.innerWidth, window.innerHeight);
        return post;
      } catch (e) {
        console.warn('post-processing disabled:', e && e.message);
        return null;
      }
    }
    applyLook();

    /* ================================================== v6: погода ===
       Четыре пресета: пасмурно (по умолчанию), утро с низким солнцем,
       дождь, густой туман. Каждый — набор LOOK + LUT + лучи + дождь +
       ветер + звук. Смена — плавная только у дождя/намокания, свет
       переключается сразу (меню). */
    /* v7: все пресеты перекрашены в «мрачный лес» (референсы — «Иди и
       смотри», S.T.A.L.K.E.R., Hunt: Showdown, Metro Exodus, BF1 «Аргонский
       лес», Hell Let Loose «Хюртген»): зелень на 30–40 % беднее (LUT
       greenSat 0.55–0.65), тени холодные сине-зелёные, лёгкий bleach bypass,
       общая яркость ниже. gl — параметры GGloom: canopy — сумрак под кронами,
       cloud — тени туч по земле, wet — сырость материалов, sky — [плотность
       туч, разрывы у солнца, мрачность], bleach, adapt — адаптация глаза.
       Добавлены «Сумерки» и «Ночь» (осветительные ракеты). */
    /* v12: ЦВЕТ. Прежние пресеты получали «мрачность» обесцвечиванием:
       зелень −40 % в LUT × насыщенность 0,74 в грейде × bleach bypass 0,22
       × светлая молочная дымка — в сумме картинка уходила в серый. В
       реальном пасмурном лесу (и в Hunt: Showdown, Tarkov «Лес», Arma
       Reforger) цвет при облачности как раз НАСЫЩЕННЕЕ, чем на солнце (нет
       бликов и пересвеченных пятен), а мрачность даёт низкий ключ: мало
       света под пологом, тёмные средние тона, плотные тени, тёмная
       холодная дымка вдали. Поэтому: насыщенность ≈ 0,95–1, зелень почти
       без потерь (оливково-зелёная хвоя, рыже-бурая кора, бурая подстилка),
       экспозиция ниже, дымка темнее и с зелёно-сизым оттенком, bleach —
       лишь след. Ночь и сумерки по-прежнему беднее цветом (глаз в темноте
       хуже различает цвет — эффект Пуркинье), но не серые. */
    /* v24: ясная погода стала ясной. Прежде небо было тёмно-синим (горизонт ≈0,1
       в линейных единицах — темнее освещённой солнцем травы ≈0,15–0,2), а низовой
       туман hf 40 закрывал цель на 100 м на ~80 %. Теперь горизонт ≈0,22 (как в
       жизни — чуть ярче травы), дымка того же цвета, плотность 0,0036 и низовой
       слой hf 4: цель на 100 м — ~20 % дымки, на 200 м — ~45 %. Облака — светлые
       кучевые (gl.clear), солнце с ореолом; клочья тумана реже (gl.wisp).
       v21: ночь убрана совсем (по запросу) — только ясное утро и ясный день; старый ключ night ведёт в день.
       Только ясная погода: утро, день. Дождь, гроза, туман, пасмурно и
       сумерки убраны вместе с их покадровой работой (капли, мокрые материалы,
       петли шума дождя). sky — цвет неба: горизонт и зенит, множители к дымке. */
    const WEATHERS = {
      morning: { name: 'Ясное утро',
        look: { exposure: 0.98, env: 0.56, mist: 0.064, fogDensity: 0.0044, hf: 9, sun: 2.4, sunElev: 15, sunAzim: 112, sunCol: [1.0, 0.8, 0.58],
          mistTint: [1.06, 0.98, 0.88], sat: 1.04, contrast: 1.1, lift: 0.0, shadowTint: [0.92, 0.97, 1.06], highTint: [1.05, 1.0, 0.92], vignette: 0.24, grain: 0.02,
          skyH: [1.1, 0.98, 0.86], skyZ: [0.4, 0.6, 1.16] },
        lut: { greenHue: -2, greenSat: 0.98, sat: 1.01, shadow: [0.93, 0.98, 1.06], high: [1.06, 1.0, 0.9], curve: 0.25 }, lutK: 1,
        gl: { canopy: 0.85, cloud: 0.1, wet: 0.12, sky: [0.42, 1.0, 0], clear: 1, wisp: 0.4, bleach: 0.02, adapt: 1 },
        rays: 0.75, raysThr: 0.55, raysCol: [1.0, 0.82, 0.6], rain: 0, wind: 0.5 },
      day: { name: 'Солнечный день',
        look: { exposure: 0.95, env: 0.66, mist: 0.07, fogDensity: 0.0036, hf: 4, sun: 2.8, sunElev: 52, sunAzim: 145, sunCol: [1.0, 0.95, 0.87],
          mistTint: [0.93, 0.98, 1.06], sat: 1.06, contrast: 1.08, lift: 0.0, shadowTint: [0.94, 0.98, 1.05], highTint: [1.03, 1.0, 0.95], vignette: 0.2, grain: 0.016,
          skyH: [0.95, 1.0, 1.08], skyZ: [0.3, 0.52, 1.24] },
        lut: { greenHue: 0, greenSat: 1.0, sat: 1.03, shadow: [0.95, 0.99, 1.05], high: [1.04, 1.0, 0.94], curve: 0.22 }, lutK: 1,
        gl: { canopy: 0.8, cloud: 0.06, wet: 0.08, sky: [0.36, 1.0, 0], clear: 1, wisp: 0.12, bleach: 0.02, adapt: 1 },
        rays: 0.35, raysThr: 0.6, raysCol: [1.0, 0.95, 0.85], rain: 0, wind: 0.5 }
    };
    WEATHERS.overcast = WEATHERS.rain = WEATHERS.fog = WEATHERS.dusk = WEATHERS.night = undefined;
    const WX = { key: 'day', P: null, lut: null, scars: null, rain: null, t: 0, world: null, audio: null };
    WX.set = (key) => {
      const P = WEATHERS[key] || WEATHERS.day;
      WX.key = WEATHERS[key] ? key : 'day'; WX.P = P;
      Object.assign(LOOK, P.look);
      if (bgTex && P.look.skyZ && WX._skyFor !== WX.key) { WX._skyFor = WX.key; bgTex.image = proceduralSky(P.look); bgTex.needsUpdate = true; }
      applyLook();
      if (POST) {
        WX.lut = buildLut(THREE, P.lut, WX.lut && WX.lut.isData3DTexture && WX.lut.image.width === 32 ? WX.lut : null);
        const u = POST.grade.uniforms; u.uLut.value = WX.lut; u.uLutK.value = P.lutK; u.uLutN.value = 32;
        const r = POST.rays.uniforms; r.uThr.value = P.raysThr; r.uCol.value.fromArray(P.raysCol);
      }
      WX.applyGloom(P);
      if (WX.audio) WX.audio.wind = P.wind;
      /* v19: записанный фон по карте и погоде (28b_audio_samples.js) */
      if (WX.audio && WX.audio.setScene) try { WX.audio.setScene({ map: WX.world && WX.world.mapId, wx: WX.key, rain: P.rain || 0 }); } catch (e) { /* звук не критичен */ }
      if (WX.world && WX.world.env && WX.world.env.uniforms && WX.world.env.uniforms.uWindStr) WX.world.env.uniforms.uWindStr.value = P.wind;
      if(root.GBallistics){const temp=(root.GRecoil&&root.GRecoil.AMBIENT&&root.GRecoil.AMBIENT[WX.key])??9;Object.assign(root.GBallistics.AIR,root.GBallistics.atmosphere(temp));}
      renderer.shadowMap.needsUpdate = true;
      return WX.key;
    };
    /* v7: параметры мрачного леса в шейдеры (GGloom) и грейд */
    WX.applyGloom = (P) => {
      const GG = root.GGloom, g = P.gl || {};
      if (GG) {
        GG.P.x = g.canopy ?? 1; GG.P.y = g.cloud ?? 0.25; GG.P.w = g.wet ?? 0.3;
        const sk = g.sky || [0.8, 0.4, 0.5];
        GG.SKY.y = sk[0]; GG.SKY.z = sk[1]; GG.SKY.w = sk[2];
        GG.SKYD.x = sunDir.x; GG.SKYD.y = sunDir.y; GG.SKYD.z = sunDir.z;
        GG.SKYD.w = g.clear ? 0 : 1;      // v24: 0 — ясно (белые кучевые, диск солнца), 1 — прежние серые тучи
      }
      if (POST) POST.grade.uniforms.uBleach.value = g.bleach || 0;
      if (WX.world && WX.world.groundUniforms && WX.world.groundUniforms.uGloom) WX.world.groundUniforms.uGloom.value = g.ground ?? 1;
      EYE.on = g.adapt ?? 1;
      WX.flaresAuto = !!P.flares; if (WX.flares) WX.flares.auto = WX.flaresAuto;
      WX.storm = !!P.storm;
      if (WX.gw) try { WX.gw.setWeather(WX.key, P); } catch (e) { console.warn('gloom weather', e && e.message); }
    };
    WX.loadCube = (text) => {
      if (!POST) return false;
      const t = parseCube(THREE, text);
      const u = POST.grade.uniforms; u.uLut.value = t; u.uLutK.value = 1; u.uLutN.value = t.image.width;
      WX.lut = t; return true;
    };
    const _wxV = new THREE.Vector3(), _wxF = new THREE.Vector3();
    /* v25: состояние для далёкого боя: пауза/меню — тишина; физика готова — можно ставить воронки */
    function warState() {
      try {
        const set = root.AEGIS_SETTINGS || {};
        return { paused: !!S.paused || set.farBattle === false, battle: !!S.started, physReady: !!(squad.length && squad[0].ctrl && squad[0].ctrl._physicsWorld === world) };
      } catch (e) { return { paused: true, battle: false, physReady: false }; }
    }
    WX.frame = (dt) => {
      if (!(dt > 0)) dt = 0.016;
      WX.t += dt;
      if (scene.fog && scene.fog.pack) { scene.fog.t = WX.t; scene.fog.pack(); }
      /* v7: время/ветер мрачного леса, вспышка выстрела в дымке, ракеты, клочья тумана */
      const GG = root.GGloom;
      if (GG) {
        GG.P.z = WX.t; GG.SKY.x = WX.t;
        const wk = (WX.P && WX.P.wind) || 1;
        GG.W.x = 0.6 * wk; GG.W.y = 0.35 * wk;
        GG.SKYD.x = sunDir.x; GG.SKYD.y = sunDir.y; GG.SKYD.z = sunDir.z;
        const lf = fx && fx.lastFlash;
        const age = lf ? (performance.now() - lf.t) / 1000 : 9;
        if (age < 0.12 && fx.flashRig) {
          const p = fx.flashRig.position;
          GG.L0.x = p.x; GG.L0.y = p.y; GG.L0.z = p.z;
          GG.L0.w = 0.05 * lf.power * Math.exp(-age / 0.025) * (0.6 + 0.6 * (LOOK.fogDensity / 0.02));
        } else GG.L0.w = 0;
      }
      if (WX.gw) try { WX.gw.update(dt, WX.t); } catch (e) { console.warn('gloom world', e && e.message); WX.gw = null; }
      if (WX.war) try { WX.war.update(dt, WX.t, warState()); } catch (e) { console.warn('war atmos', e && e.message); WX.war = null; }
      /* подавление: близкие пролёты пуль — виньетка и обесцвечивание */
      if (POST) POST.grade.uniforms.uSup.value = WX.gw ? Math.min(1, WX.gw.sup * 0.85) : 0;
      if (WX.rain) try { WX.rain.update(dt, WX.t, WX.scars); } catch (e) { console.warn('rain', e && e.message); WX.rain = null; }
      if (POST && POST.rays) {
        const P = WX.P, low = QM.tierKey === 'low';
        let str = P ? P.rays : 0;
        if (str > 0 && !low) {
          camera.getWorldDirection(_wxF);
          const facing = _wxF.dot(sunDir);
          _wxV.copy(camera.position).addScaledVector(sunDir, 300).project(camera);
          str *= Math.max(0, Math.min(1, (facing - 0.05) / 0.45));
          if (_wxV.z > 1) str = 0;
          POST.rays.uniforms.uSun.value.set(_wxV.x * 0.5 + 0.5, _wxV.y * 0.5 + 0.5);
          POST.rays.uniforms.uAspect.value = camera.aspect;
          const ns = QM.tierKey === 'high' ? 40 : 24;
          if (POST.rays.material.defines.NS !== ns) { POST.rays.material.defines.NS = ns; POST.rays.material.needsUpdate = true; }
        } else str = 0;
        POST.rays.uniforms.uStr.value = str;
        POST.rays.enabled = str > 0.002;
      }
    };

    /* ============================================ качество и FPS === */
    /* Адаптивное качество. ВЫСОКОЕ — исходная картинка без изменений
       (MSAA 4×, GTAO 12 выборок, тени 2048 каждый кадр, до 1,5 dpr).
       СРЕДНЕЕ — AO 8 выборок, тени через кадр, до 1,25 dpr. НИЗКОЕ — без
       AO, MSAA 2×, тени 1024 через кадр, 1 dpr. АВТО выбирает стартовый
       уровень по видеокарте и дальше держит частоту кадров: сначала плавно
       снижает внутреннее разрешение (до 0,6), потом уровень; когда запас
       есть — возвращает обратно. Выбор сохраняется (F2). */
    /* AEGIS: качество — из настроек (Низкая / Средняя / Высокая), без F2.
       Внутри уровня держим частоту кадров: при просадке плавно снижаем
       внутреннее разрешение (до minScale), при запасе — возвращаем. */
    const QM = (function () {
      const TIERS = {
        ultra: {name:'Ультра-низкая',dpr:.85,ao:false,aoS:4,msaa:0,sh:512,shEvery:6,minScale:.65,grass:.35},
        high: { name: 'Высокая', dpr: 1.5, ao: true, aoS: 12, msaa: 4, sh: 2048, shEvery: 1, minScale: 0.75, grass: 1 },
        medium: { name: 'Средняя', dpr: 1.25, ao: true, aoS: 8, msaa: 2, sh: 2048, shEvery: 2, minScale: 0.7, grass: 1 },
        low: { name: 'Низкая', dpr: 1.0, ao: false, aoS: 8, msaa: 0, sh: 1024, shEvery: 3, minScale: 0.72, grass: 0.6 }
      };
      let gpu = '';
      try {
        const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
        gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
      } catch (e) { /* нет сведений */ }
      const Q = { tierKey: TIERS[SET.quality] ? SET.quality : 'medium', scale: 1, gpu, frame: 0, ema: 1 / 60, tGood: 0, tCheck: 0,
        fpsOn: !!SET.fps, fpsEl: document.getElementById('fps'), fpsT: 0, fpsN: 0, fps: 0 };
      Object.defineProperty(Q, 'T', { get: () => TIERS[Q.tierKey] });
      const devDpr = () => window.devicePixelRatio || 1;
      function applyRes() {
        const T = Q.T;
        /* v10: холст всегда в родном разрешении экрана (до 2 dpr) — его
           заполняет только последний дешёвый проход; сцена и постобработка
           считаются во внутреннем разрешении. Без композера (сбой
           постобработки) — по-старому, через dpr холста. */
        const inn = Math.max(0.5, Math.min(devDpr(), T.dpr) * Q.scale);
        const out = POST && POST.lens ? Math.min(devDpr(), 2) : inn;
        if (Math.abs(RES.inn - inn) < 0.01 && Math.abs(RES.out - out) < 0.01 && Math.abs(renderer.getPixelRatio() - out) < 0.01) return;
        RES.inn = inn; RES.out = out; root.AEGIS_RS = inn / out;
        renderer.setPixelRatio(out);
        renderer.setSize(window.innerWidth, window.innerHeight);
        if (POST) POST.resize(window.innerWidth, window.innerHeight);
      }
      Q.applyRes = applyRes;
      function apply() {
        root.AEGIS_QTIER = Q.tierKey;
        const T = Q.T;
        if (POST) {
          if (POST.gtao) {
            POST.gtao.enabled = T.ao;
            try { if (POST.gtao.updateGtaoMaterial) POST.gtao.updateGtaoMaterial({ samples: T.aoS }); } catch (e) { /* старый аддон */ }
          }
          if (POST.smaa) POST.smaa.enabled = T.msaa < 2 && Q.tierKey !== 'low' && Q.tierKey !== 'ultra';
          const cm = POST.composer, maxS = renderer.capabilities.maxSamples || 0;
          const ms = POST.msaa0 === 0 ? 0 : Math.min(T.msaa, maxS);
          if (cm.renderTarget1.samples !== ms) {
            cm.renderTarget1.samples = cm.renderTarget2.samples = ms;
            cm.renderTarget1.dispose(); cm.renderTarget2.dispose();
          }
          /* v9: без MSAA и SMAA — дешёвый FXAA внутри прохода грейда */
          if (POST.grade.uniforms.uFxaa) POST.grade.uniforms.uFxaa.value = (ms < 2 && !(POST.smaa && POST.smaa.enabled)) ? 1 : 0;
        }
        if (sun.shadow.mapSize.x !== T.sh) {
          sun.shadow.mapSize.set(T.sh, T.sh);
          if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
        }
        renderer.shadowMap.autoUpdate = T.shEvery <= 1;
        renderer.shadowMap.needsUpdate = true;
        if (Q.world && Q.world.setDetail) try { Q.world.setDetail(T.grass); } catch (e) { /* нет */ }
        if (Q.grass) Q.grass.setQuality(Q.tierKey);
        if (typeof WX !== 'undefined' && WX.rain) WX.rain.setQuality(Q.tierKey);
        if (typeof WX !== 'undefined' && WX.gw) try { WX.gw.setQuality(Q.tierKey); } catch (e) { /* */ }
        if (typeof WX !== 'undefined' && WX.zones) try { WX.zones.setQuality(Q.tierKey); } catch (e) { /* */ }
        if (Q.world && Q.world.groundQuality) try { Q.world.groundQuality(Q.tierKey); } catch (e) { /* нет */ }
        applyRes();
      }
      Q.apply = apply;
      Q.label = () => T_LABEL();
      const T_LABEL = () => Q.T.name + (Q.scale < 0.999 ? ' · ' + Math.round(Q.scale * 100) + '%' : '');
      Q.setTier = (key) => {
        if (!TIERS[key]) return;
        Q.tierKey = key; Q.scale = 1; Q.tGood = 0; Q.ema = 1 / 60;
        apply();
      };
      /* v19: stats-gl (vendor/stats-gl) рядом с текстовым оверлеем — графики FPS,
         CPU и GPU мс (GPU — через EXT_disjoint_timer_query, где драйвер даёт).
         Создаётся при первом включении оверлея; выключенный — скрыт. */
      const statsGL = (on) => {
        const SG = root.StatsGL;
        if (on && !Q.sgl && !Q.sglTried && SG) {
          Q.sglTried = true;
          try {
            const sg = new SG({ trackGPU: true, trackHz: false, logsPerSecond: 4, samplesLog: 60, samplesGraph: 12, precision: 1, horizontal: true, minimal: false, mode: 0 });
            sg.init(renderer);
            sg.dom.style.position = 'fixed'; sg.dom.style.left = 'auto'; sg.dom.style.top = 'auto';
            sg.dom.style.right = '10px'; sg.dom.style.bottom = '10px'; sg.dom.style.zIndex = '60';
            sg.dom.style.pointerEvents = 'none'; sg.dom.style.opacity = '0.88';
            document.body.appendChild(sg.dom);
            Q.sgl = sg;
          } catch (e) { console.warn('stats-gl', e && e.message); Q.sgl = null; }
        }
        if (Q.sgl) Q.sgl.dom.style.display = on ? '' : 'none';
      };
      Q.setFps = (on) => { Q.fpsOn = !!on; if (Q.fpsEl) Q.fpsEl.style.display = Q.fpsOn ? 'block' : 'none'; statsGL(Q.fpsOn); };
      Q.toggleFps = () => { Q.setFps(!Q.fpsOn); if (root.AEGIS_UI && root.AEGIS_UI.onFpsToggle) root.AEGIS_UI.onFpsToggle(Q.fpsOn); };
      Q.frame = (dt) => {
        Q.frame_ = (Q.frame_ || 0) + 1;
        if (Q.fpsOn) { if (!Q.sglTried) statsGL(true); if (Q.sgl) try { Q.sgl.update(); } catch (e) { /* не критично */ } }
        const inf = renderer.info;
        if (inf.autoReset) inf.autoReset = false;
        Q.calls = inf.render.calls; Q.tris = inf.render.triangles;
        inf.reset();
        const T = Q.T;
        if (T.shEvery > 1 && Q.frame_ % T.shEvery === 0) renderer.shadowMap.needsUpdate = true;
        if (!(dt > 0) || dt > 0.5) return;
        Q.ema += (dt - Q.ema) * 0.06;
        Q.fpsT += dt; Q.fpsN++;
        if (Q.fpsT >= 0.5) {
          Q.fps = Q.fpsN / Q.fpsT; Q.fpsT = 0; Q.fpsN = 0;
          if (Q.fpsOn && Q.fpsEl) {
            Q.fpsEl.textContent = Math.round(Q.fps) + ' FPS · ' + (Q.ema * 1000).toFixed(1) + ' мс\nГрафика: ' + T_LABEL() + '\nвызовов ' + Q.calls + ' · треуг. ' + (Q.tris / 1e6).toFixed(2) + ' М';
          }
        }
        Q.tCheck += dt;
        if (Q.tCheck < 1.2) return;
        Q.tCheck = 0;
        /* цель — 60 кадров/с: ниже 50 — снижаем разрешение, выше 58 три проверки подряд — поднимаем */
        if (Q.ema > 1 / 50) {
          Q.tGood = 0;
          if (Q.scale > T.minScale + 0.01) { Q.scale = Math.max(T.minScale, Q.scale - (Q.ema > 1 / 32 ? 0.15 : 0.08)); applyRes(); Q.tBad = 0; }
          /* v15: разрешение уже минимальное, а кадр всё ещё длиннее 22 мс
             ~5 с подряд — ступенью ниже (Высокая → Средняя → Низкая) на эту
             сессию; сохранённый выбор в настройках не меняется */
          else if (Q.ema > 1 / 45 && Q.tierKey !== 'low' && Q.tierKey !== 'ultra' && (Q.tBad = (Q.tBad || 0) + 1) >= 4) {
            Q.tBad = 0; Q.setTier(Q.tierKey === 'high' ? 'medium' : 'low'); Q.auto = true;
          }
        } else if (Q.ema < 1 / 58) {
          Q.tGood++; Q.tBad = 0;
          if (Q.tGood >= 3 && Q.scale < 0.999) { Q.tGood = 0; Q.scale = Math.min(1, Q.scale + 0.08); applyRes(); }
        } else Q.tGood = 0;
      };
      return Q;
    })();
    if (POST) POST.msaa0 = POST.composer.renderTarget1.samples;
    root.AEGIS_CAMERA = camera;   /* v15: для LOD рэгдоллов (23_game_damage) */
    QM.apply();
    QM.setFps(QM.fpsOn);
    window.__toggleFps = QM.toggleFps;

    /* Единая точка рендера кадра (вызывается из tick). */
    function eyeAdapt(dt) {
      const GG = root.GGloom;
      if (!GG || !(dt > 0)) return;
      const cn = GG.canopyAt(camera.position.x, camera.position.z) * (GG.P.x || 0);
      camera.getWorldDirection(_eyeD);
      const sky = U.clamp01(_eyeD.y * 1.6 + 0.25) * (1 - cn);
      const Ls = Math.max(0.2, (1 - 0.6 * U.clamp01(cn)) * (1 + 0.3 * sky));
      if (EYE.snap) { EYE.L = Ls; EYE.snap = false; }
      const tau = Ls > EYE.L ? 0.55 : 2.8;
      EYE.L += (Ls - EYE.L) * (1 - Math.exp(-Math.min(dt, 0.1) / tau));
      const m = EYE.on > 0 ? U.clamp(Math.pow(1 / EYE.L, 0.5 * EYE.on), 0.85, 1.5) : 1;
      /* «засветка»: адаптация отстаёт от реальной яркости */
      EYE.glare = U.clamp01((Ls / EYE.L - 1.12) * 0.9) * EYE.on;
      EYE.m = m;
      /* молния: короткая вспышка всей сцены */
      const lf = WX.gw ? WX.gw.flash : 0;
      renderer.toneMappingExposure = LOOK.exposure * m * (1 + EYE.glare * 0.25) * (1 + lf * 1.8);
      if (POST) POST.grade.uniforms.uGlare.value = EYE.glare * 0.55;
    }
    WX.eye = EYE;
    /* v21: «мелочь вдали не рисуем» (screen-size culling — как уровень «Culled» у
       LODGroup в Unity и Min Screen Size / Cull Distance Volume в UE, у GTA V трава и
       цветы дальше порога не рисуются вовсе): статичный меш карты, экранный радиус
       которого меньше TINY.px пикселя, уходит на слой 29 — его не видят ни камера, ни
       карта теней, а пуля (GTrace по visible) и физика Rapier — видят, как раньше.
       Список проверяется порциями (1/6 за кадр); смена зума (прицел) — сразу весь. */
    const TINY = root.AEGIS_TINY = { on: !/[?&]tiny=0\b/.test(location.search), px: 1.0, list: null, i: 0, hid: 0, K: 0 };
    const _tc = new THREE.Vector3();
    function tinyCull() {
      const w = QM.world;
      if (!w || !w.props) return;
      if (!TINY.list) {
        TINY.list = [];
        w.props.traverse((o) => {
          if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.geometry || o.frustumCulled === false) return;
          if ((o.userData && (o.userData.traceOnly || o.userData.ground || o.userData.batch)) || o.layers.mask !== 1) return;
          const g = o.geometry;
          if (!g.boundingSphere) g.computeBoundingSphere();
          if (g.boundingSphere && g.boundingSphere.radius > 0) TINY.list.push({ o, hid: false });
        });
      }
      const L = TINY.list, n = L.length;
      if (!n) return;
      if (!TINY.on) { if (TINY.hid) { for (const e of L) if (e.hid) { e.hid = false; e.o.layers.set(0); } TINY.hid = 0; } return; }
      const K = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
      const full = Math.abs(K - TINY.K) > TINY.K * 0.08;
      if (full) TINY.K = K;
      const cnt = full ? n : Math.ceil(n / 6), cp = camera.position, px = TINY.px;
      for (let k = 0; k < cnt; k++) {
        TINY.i = (TINY.i + 1) % n;
        const e = L[TINY.i], o = e.o, bs = o.geometry.boundingSphere;
        _tc.copy(bs.center).applyMatrix4(o.matrixWorld);
        const r = bs.radius * o.matrixWorld.getMaxScaleOnAxis(), d = _tc.distanceTo(cp);
        const hide = d > r * 4 && r * K < px * d;
        if (hide !== e.hid) { e.hid = hide; o.layers.set(hide ? 29 : 0); TINY.hid += hide ? 1 : -1; }
      }
    }
    function renderFrame(dt) {
      QM.frame(dt);
      WX.frame(dt);
      eyeAdapt(dt);
      if (WX.world && WX.world.antsMat) WX.world.antsMat.uniforms.uVH.value = renderer.domElement.height * root.AEGIS_RS;
      if (QM.grass) try { QM.grass.update(camera, dt); } catch (e) { console.warn('grass', e && e.message); QM.grass = null; }
      /* v21: отсечение леса по кадру (и по тени) перед рендером — клетки 16 м
         вне пирамиды камеры не рисуются ни в кадре, ни в карте теней */
      if (QM.world && QM.world.native && QM.world.native.preRender) {
        try { QM.world.native.preRender(camera, sunDir, sun.shadow && sun.shadow.camera ? sun.shadow.camera.right : 30); }
        catch (e) { console.warn('preRender', e && e.message); QM.world.native.preRender = null; }
      }
      if (QM.batch) try { QM.batch.update(); } catch (e) { console.warn('batch', e && e.message); try { QM.batch.dispose(); } catch (e2) { /* */ } QM.batch = null; }
      try { tinyCull(); } catch (e) { console.warn('tinyCull', e && e.message); TINY.on = false; }
      if (POST) {
        try {
          POST.grade.uniforms.uTime.value = (POST.grade.uniforms.uTime.value + (dt || 0.016)) % 1000;
          POST.composer.render(dt);
          return;
        } catch (e) {
          console.warn('post-processing failed, falling back to direct render:', e && e.message);
          POST = null;
        }
      }
      renderer.render(scene, camera);
    }

    /* ========================================================== мир ==== */
    /* v9: рендерер нужен миру при сборке — упаковка текстур земли на GPU */
    root.__AEGIS_RENDERER = renderer;
    await bootYield('post');
    const world = root.GMaps && root.GMaps.id ? await root.GMaps.build(THREE, scene, renderer, camera, SET.quality, async name=>{BOOTMARK('map '+name);await new Promise(r=>setTimeout(r,0));}) : WORLD.build(THREE, scene);
    await bootYield('world');
    if(root.GTeams&&world.mapId)root.GTeams.prepareWorld(THREE,scene,world);
    if(root.GNavigation){await root.GNavigation.prepare(world);await bootYield('navmesh');}
    QM.world = world;
    try { if (root.AEGIS_TUNE) root.AEGIS_TUNE.tuneTextures(THREE, renderer, scene, QM.tierKey); } catch (e) { console.warn('tune', e && e.message); }
    try { if (world.setDetail) world.setDetail(QM.T.grass); } catch (e) { /* нет */ }
    /* v6: геометрическая трава вблизи (js/polygon/17b_grass.js) */
    let GRASS = null;
    try { GRASS = !world.mapId && root.GGrass ? root.GGrass.create(THREE, scene, world) : null; } catch (e) { console.warn('grass blades:', e && e.message); }
    QM.grass = GRASS;
    /* v6: дальние сосны — октаэдрические импостеры (запекаются один раз) */
    try { if (world.makeImpostors) world.makeImpostors(renderer); }
    catch (e) { console.warn('impostors:', e && e.message); for (const f of (world.impostorFallback || [])) f.visible = true; }
    await bootYield('impostors');
    /* v6: дождь и погода */
    WX.rain = null; // осадков нет: сетка капель, мокрые материалы и звук дождя не создаются
    WX.world = world;
    /* v7: карта крон для сумрака под пологом, тумана в низинах и адаптации глаза */
    try { if (root.GGloom) root.GGloom.buildCanopy(world); } catch (e) { console.warn('canopy:', e && e.message); }
    if (WX.rain) WX.rain.setQuality(QM.tierKey);
    if (GRASS) GRASS.setQuality(QM.tierKey);
    try { if (world.groundQuality) world.groundQuality(QM.tierKey); } catch (e) { /* нет */ }
    await bootYield('weather');
    /* v24: статический батчинг окружения (js/polygon/29d_batch.js) — рендер-копии мелких
       неподвижных мешей карты одной клеткой/материалом; оригиналы остаются для пуль и физики */
    QM.batch = null;
    if (root.GBatch && world.props && !/[?&]batch=0\b/.test(location.search)) {
      try { QM.batch = root.GBatch.create(THREE, scene, [world.props]); TINY.list = null; }
      catch (e) { console.warn('batch', e && e.message); QM.batch = null; }
    }
    const fx = FX.create(THREE, scene);
    fx.setImpactWorld(['ground','house','props','fence','range','garden','v8props'].map(k => world[k]));
    /* v9: эффекты выстрела из оружейной (weapons.zip → AEGIS_WK.ShotFX) */
    let SFX = null;
    try {
      const WKs = root.AEGIS_WK;
      if (WKs && WKs.ShotFX) {
        SFX = new WKs.ShotFX(scene, { maxSmoke: SET.quality === 'low' ? 220 : 360, maxFire: 120, lite: SET.quality === 'low' });
        SFX.floorAt = (x, z) => (world.heightAt ? world.heightAt(x, z) : 0);
      }
    } catch (e) { console.warn('ShotFX', e && e.message); SFX = null; }
    fx.sfx = SFX;
    applyLook();
    const audio = AUDIO.create();
    WX.audio = audio;
    /* v7: детали и жизнь мрачного леса (js/polygon/17d_gloom_world.js) */
    try {
      WX.gw = !world.mapId && root.GGloomWorld ? root.GGloomWorld.create(THREE, { scene, world, camera, audio, fx }) : null;
      if (WX.gw) { WX.gw.setQuality(QM.tierKey); WX.gw.foliageAA(!!(POST && POST.msaa0 > 0)); }
    } catch (e) { console.warn('gloom world:', e && e.message); WX.gw = null; }
    /* v8: новые зоны — овраг с ручьём, болото, гарь, вырубка, следы войны (17e) */
    try {
      WX.zones = !world.mapId && root.GZones ? root.GZones.create(THREE, { scene, world, camera, audio, fx }) : null;
      if (WX.zones) WX.zones.setQuality(QM.tierKey);
    } catch (e) { console.warn('zones:', e && e.message, e && e.stack); WX.zones = null; }
    /* v25: «рядом идёт война» — дымы на горизонте, старые воронки, далёкий бой (17f_war_atmos.js) */
    try {
      WX.war = root.GWarAtmos ? root.GWarAtmos.create(THREE, { scene, world, camera, audio, sunDir, sunColor: sun.color, sunK: () => sun.intensity / 2.8, fogColor, quality: QM.tierKey, craters: !!world.mapId }) : null;
    } catch (e) { console.warn('war atmos:', e && e.message); WX.war = null; }
    /* бой на карте: случайная погода (17c_weather.js), сохранённая в настройках — только для полигона */
    WX.set(world.mapId && root.GWeather && root.GWeather.pickBattle ? root.GWeather.pickBattle(world.mapId) : (SET.weather || 'day'));

    /* ====================================================== бойцы ====== */
    /* AEGIS: четыре генерала. Изначально без оружия, руки по швам; оружие
       и снаряжение — из лоадаута генерала (экран «Оружие»). Повязка на
       левом плече: «Дельта» — красная, «Альфа» — чёрная. */
    const LOADOUTS = AE ? AE.loadLoadouts() : {};
    /* v26: образы из редактора «Внешний вид» (js/app/looks.js) — форма, броня,
       головной убор, маскировка — до сборки бойцов; цвета повязок команд — оттуда же */
    let LOOKS = null;
    try { LOOKS = root.GLooks ? root.GLooks.load() : null; if (LOOKS && CHAR.applyLooks) CHAR.applyLooks(LOOKS.units); }
    catch (e) { console.warn('looks:', e && e.message); }
    const BAND_HEX = (root.GLooks && root.GLooks.BANDS) || { red: { hex: '#9a1612' }, black: { hex: '#0d0e10' } };
    const BAND_MAT = {};
    for (const k in BAND_HEX) BAND_MAT[k] = new THREE.MeshStandardMaterial({ color: new THREE.Color(BAND_HEX[k].hex), roughness: k === 'black' ? 0.9 : 0.86, metalness: 0, side: THREE.DoubleSide });
    if (!BAND_MAT.red) BAND_MAT.red = new THREE.MeshStandardMaterial({ color: 0x9a1612, roughness: 0.86, metalness: 0, side: THREE.DoubleSide });
    if (!BAND_MAT.black) BAND_MAT.black = new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    const teamOf = (sp) => sp.team || (AE && AE.GEN[sp.key] && AE.GEN[sp.key].team) || (sp.key.indexOf('delta') === 0 ? 'delta' : 'alpha');
    const teamBand = (team) => {
      const b = LOOKS && LOOKS.team && LOOKS.team[team] && LOOKS.team[team].band;
      return BAND_MAT[b] ? b : team === 'delta' ? 'red' : 'black';
    };
    function addArmband(ch, band) {
      const sh = ch.bone('shoulderL'), el = ch.bone('elbowL');
      if (!sh || !el) return null;
      const k = ch.scale || 1;
      const len = el.position.length();
      const g = new THREE.CylinderGeometry(0.0655 * k, 0.0625 * k, 0.085 * k, 22, 1, true);
      const m = new THREE.Mesh(g, BAND_MAT[band] || BAND_MAT.black);
      m.name = 'armband';
      m.castShadow = true; m.receiveShadow = true;
      const ax = el.position.clone().normalize();
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax);
      m.position.copy(ax).multiplyScalar(len * 0.36);
      sh.add(m);
      return m;
    }
    /* генерал без сохранённого снаряжения не должен стоять «без патронов»: ИИ-генералам — штатный комплект */
    function aiGeneralLoadout(key, saved) {
      const has = saved && saved.slots && saved.slots.some(x => x && x.t === 'gun');
      if (has || !world.mapId || !AE || !AE.GEN[key] || (root.GMaps && root.GMaps.readTransfer && (root.GMaps.readTransfer() || {}).key === key)) return saved;
      const gun = key.indexOf('alpha') === 0 ? (key.endsWith('2') ? 'scar' : 'm416') : (key.endsWith('2') ? 'akm' : 'ak74');
      return AE.normLoadout({ slots: [{ t: 'gun', id: gun }, { t: 'ammo', w: 'primary' }, { t: 'ammo', w: 'primary' }, { t: 'grenade', g: 'm67' }, { t: 'grenade', g: 'm84' }, { t: 'grenade', g: 'smoke' }], cfg: {} });
    }
    /* v22: снаряжение бойцов-ботов — как у генералов: оружие с обвесом, 2 слота патронов, гранаты (M67, M84/дымовая).
       Обвес — тот, что игрок собрал для этого образца в оружейной у генералов своей команды; иначе — штатный
       боевой комплект (коллиматор/оптика, ЛЦУ или фонарь, рукоять). Переселившись в бота, игрок получает его снаряжение. */
    const BOT_KIT = {
      ak74: [{ handguard: 'hg_b10', sidemount: 'side_mount', optic: 'pk120', tacRight: 'peq15', under: 'rk6' }, { handguard: 'hg_zhukov', cover: 'cover_tws', optic: 'okp7d', tacRight: 'perst4', tacLeft: 'klesch', under: 'rk6' }],
      akm: [{ handguard: 'hg_zhukov', cover: 'cover_tws', optic: 'kobra', tacLeft: 'klesch', tacRight: 'perst4', under: 'rk6' }, { handguard: 'hg_b10', sidemount: 'side_mount', optic: 'pk120', tacLeft: 'klesch', under: 'rk6' }],
      m416: [{ optic: 'compm4', tacRight: 'peq15', tacLeft: 'm600', under: 'bcm_vg' }, { optic: 'exps3', tacRight: 'peq16', under: 'afg2' }],
      scar: [{ optic: 'acog', tacRight: 'dbal', under: 'bcm_vg' }],
      mp5a3: [{ handguard: 'hg_bt', claw: 'claw_bt', optic: 't2_low', tacRight: 'm300', under: 'afg2' }],
      svd: [{ handguard: 'hg_rail', tacRight: 'peq15' }],
      m870: [{ rail: 'rail_mesa', optic: 't2_low', forend: 'fe_mlok', tacRight: 'm300' }]
    };
    const keyHash = (k) => { let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; return h; };
    function botCfg(key, team, gun) {
      for (const gk of Object.keys(LOADOUTS || {})) {
        const G = AE.GEN[gk];
        if (!G || G.team !== team) continue;
        const c = LOADOUTS[gk] && LOADOUTS[gk].cfg && LOADOUTS[gk].cfg[gun];
        if (c) return JSON.parse(JSON.stringify(c));
      }
      const v = BOT_KIT[gun];
      return v ? Object.assign({}, v[keyHash(key) % v.length]) : null;
    }
    function npcLoadout(sp) {
      const gun = root.GAudioDist ? root.GAudioDist.npcGun(sp.key) : 'ak74';
      const h = keyHash(sp.key);
      const g2 = h % 3 === 0 ? 'smoke' : 'm84';
      const L = AE.normLoadout({ slots: [{ t: 'gun', id: gun }, { t: 'ammo', w: 'primary' }, { t: 'ammo', w: 'primary' }, { t: 'grenade', g: 'm67' }, { t: 'grenade', g: g2 }, h % 4 === 1 ? { t: 'grenade', g: 'smoke' } : null], cfg: {} });
      const c = world.mapId ? botCfg(sp.key, sp.team || (sp.key.indexOf('delta') === 0 ? 'delta' : 'alpha'), gun) : null;
      if (c) { L.cfg = L.cfg || {}; L.cfg[gun] = c; }
      return L;
    }
    const squad = [];
    for (const sp of ((root.GTeams && world.mapId && root.GTeams.rosterFor(world.mapId, world)) || world.spawns || SPAWN)) {
      const ch = CHAR.build(THREE, sp.preset || sp.key);
      const GEN = AE ? AE.GEN[sp.key] : null;
      if(sp.npc)ch.preset=Object.assign({},ch.preset,{name:"Боец "+(sp.team==='alpha'?'Альфы':'Дельты'),callsign:sp.key});
      if (GEN) {
        ch.preset = Object.assign({}, ch.preset, { name: GEN.short, callsign: GEN.call, general: GEN });
      }
      const gy = world.heightAt ? world.heightAt(sp.x, sp.z) : 0;
      ch.root.position.set(sp.x, gy, sp.z);
      ch.root.rotation.y = sp.yaw;
      scene.add(ch.root);
      const band = addArmband(ch, teamBand(teamOf(sp)));
      /* бойцы — половина сумрака и без «сырости»: силуэт должен читаться */
      if (root.GGloom) root.GGloom.markTree(ch.root, 0.5, 0);

      const rig = new RIG.Rig(THREE, ch);
      squad.push({
        key: sp.key, char: ch, rig, gun: null, wspec: null, spawn: sp, gen: GEN, band,
        L: sp.npc ? npcLoadout(sp) : aiGeneralLoadout(sp.key, LOADOUTS[sp.key]) || (AE ? AE.emptyLoadout() : { slots: [], cfg: {} }),
        npc: !!sp.npc,
        inv: { primary: null, pistol: null }, slot: -1, used: {},
        ctrl: PLAYER.create(THREE, { world, audio, fx, trait: GEN && GEN.trait }),
        idleSeed: Math.random() * 100,
        active: false
      });
      const last = squad[squad.length - 1];
      last.ctrl.pos.set(sp.x, gy, sp.z);
      last.ctrl.yaw = sp.yaw;
      last.ctrl.lagYaw = sp.yaw;
      last.ctrl.lagPitch = last.ctrl.pitch;
      last.idleYaw = sp.yaw;
      last.ctrl.setWeapon(null);
      /* v6: шаги бойца, идущего самостоятельно (уход от гранаты) — с его места */
      last.ctrl.onAiStep = (vol, run, foot) => {
        if (last._audFar) return;
        if (last.sfx && last.sfx.B) last.sfx.footstep(run > 0.5, vol * 0.7);
        else { /* v10: F здесь вне области видимости (ReferenceError) — берём из отладочного объекта */
          const F_ = root.__GAME && root.__GAME._F;
          if (audio && audio.stepAt && F_ && F_.spatialFrom) audio.stepAt(F_.spatialFrom(last.char.root.position), vol * 0.6, run, foot); }
      };
      await bootYield('soldier ' + sp.key);
    }

    /* ================================================= состояние игры = */
    const S = {
      mode: 'free',            // free | embodied | dead
      activeIdx: -1,
      candidate: -1,
      selected: -1,            // выбранный генерал (меню «Оружие» / «В бой»)
      holdF: 0,
      score: 0,
      free: {
        pos: new THREE.Vector3(-1.2, 1.9, 9.6),
        yaw: 0.02, pitch: -0.06,
        vel: new THREE.Vector3()
      },
      pointerLocked: false,
      inputOn: true,           // ввод разрешён (нет открытых окон интерфейса)
      started: true,
      time: 0
    };
    /* мост к интерфейсу (js/app/ui.js) */
    const UI = () => root.AEGIS_UI || null;
    const uiCall = (fn, ...a) => { const u = UI(); if (u && typeof u[fn] === 'function') { try { return u[fn](...a); } catch (e) { console.warn('UI.' + fn, e); } } return undefined; };
    /* арсенал (оружие, гранаты, слоты) собирается в finishLoop, где есть бодикам */
    const ARS = { action: () => false, onEmbody: () => {}, onDisembody: () => {}, rebuild: () => {} };

    if(world.mapId){const requested=root.GMaps.readTransfer()?.key || 'alpha_1';const a=squad.find(x=>x.key===requested)||squad[0];S.free.pos.set(a.ctrl.pos.x,a.ctrl.pos.y+2,a.ctrl.pos.z+2);S.free.yaw=a.ctrl.yaw;}

    /* ====================================================== ввод ====== */
    const input = {
      fwd: 0, back: 0, left: 0, right: 0, up: 0, down: 0,
      sprint: false, sneak: false, crouch: false, ads: false, leanL: false, leanR: false, proneTog: 0, jump: 0
    };

    const dom = renderer.domElement;
    const el = (id) => document.getElementById(id);
    const ui = {
      ammoN: el('ammoN'), ammoR: el('ammoR'), mode: el('mode'), ammo: el('ammo'), ammoCal: el('ammoCal'), ammoType: el('ammoType'),
      whoName: el('whoName'), whoSide: el('whoSide'), who: el('who'),
      prompt: el('prompt'), promptLbl: el('promptLbl'), promptSub: el('promptSub'), promptKey: el('promptKey'),
      promptFill: document.querySelector('#prompt .fill'),
      scoreN: el('scoreN'), stamina: el('stamina'),
      staminaBar: document.querySelector('#stamina i'),
      hitmark: el('hitmark'), vig: el('vig'), loading: el('loading')
    };

    /* ------------------------------------------- раскладка клавиш ----- */
    /* Действие -> код клавиши (AEGIS.ACTIONS), обратная карта — для поиска.
       Мышь: Mouse0 (ЛКМ), Mouse1 (колесо), Mouse2 (ПКМ). Esc — всегда пауза. */
    let BINDS = Object.assign({}, (AE && AE.DEFAULT_BINDS) || {}, SET.binds || {});
    let CODE2ACT = {};
    function rebuildBinds() {
      CODE2ACT = {};
      for (const k of Object.keys(BINDS)) if (BINDS[k]) CODE2ACT[BINDS[k]] = k;
    }
    rebuildBinds();
    const HELD_ACT = { fwd: 1, back: 1, left: 1, right: 1, sprint: 1, sneak: 1, crouch: 1, leanL: 1, leanR: 1, ads: 1, fire: 1, use: 1, jump: 1, swap: 1 };
    const heldNow = {};
    /* ---------------------------------------------- v19: фоторежим --- */
    /* F9 (или AEGIS_PHOTO.save()) — снимок для заставки и скриншотов.
       Интерфейс в кадр не попадает: HUD — это DOM поверх холста. Сцена
       считается без адаптивного снижения разрешения в (w·ss)×(h·ss) пикселей
       и уменьшается до w×h с качественной фильтрацией: хвоя, сетки и края
       перестают рябить. MSAA на время снимка выключается — сглаживает сам
       запас пикселей, а видеопамяти нужно в разы меньше. */
    function photo(o) {
      o = o || {};
      const W = Math.max(320, Math.round(o.w || 2560)), H = Math.max(180, Math.round(o.h || 1440));
      const gl = renderer.getContext();
      const lim = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096, 8192);
      const ss = Math.max(1, Math.min(o.ss || 1.5, lim / W, lim / H));
      const RW = Math.round(W * ss), RH = Math.round(H * ss);
      const cw = window.innerWidth, ch = window.innerHeight;
      const sv = { inn: RES.inn, out: RES.out, rs: root.AEGIS_RS, pr: renderer.getPixelRatio(), asp: camera.aspect };
      const cm = POST && POST.composer, ms0 = cm ? cm.renderTarget1.samples : 0;
      const fxU = POST && POST.grade.uniforms.uFxaa, fx0 = fxU ? fxU.value : 0;
      const setMs = (n) => {
        if (!cm || cm.renderTarget1.samples === n) return;
        cm.renderTarget1.samples = cm.renderTarget2.samples = n;
        cm.renderTarget1.dispose(); cm.renderTarget2.dispose();
      };
      let out = null;
      try {
        setMs(0);
        if (fxU && ss < 1.99) fxU.value = 1;
        RES.inn = 1; RES.out = 1; root.AEGIS_RS = 1;
        renderer.setPixelRatio(1);
        renderer.setSize(RW, RH, false);
        camera.aspect = W / H; camera.updateProjectionMatrix();
        if (POST) POST.resize(RW, RH);
        renderer.shadowMap.needsUpdate = true;
        renderFrame(0);   // dt = 0: без адаптации глаза и без смены разрешения посреди снимка
        out = document.createElement('canvas'); out.width = W; out.height = H;
        const x = out.getContext('2d');
        x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
        x.drawImage(renderer.domElement, 0, 0, RW, RH, 0, 0, W, H);
      } catch (e) { console.warn('photo', e && e.message); out = null; }
      finally {
        setMs(ms0);
        if (fxU) fxU.value = fx0;
        RES.inn = sv.inn; RES.out = sv.out; root.AEGIS_RS = sv.rs;
        renderer.setPixelRatio(sv.pr);
        renderer.setSize(cw, ch);
        camera.aspect = sv.asp; camera.updateProjectionMatrix();
        if (POST) POST.resize(cw, ch);
        renderer.shadowMap.needsUpdate = true;
      }
      return out;
    }
    let photoBusy = false;
    function photoNote(t) {
      let n = document.getElementById('photoNote');
      if (!n) {
        n = document.createElement('div'); n.id = 'photoNote';
        n.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:80;pointer-events:none;' +
          'background:rgba(10,12,9,.82);color:#e8eadf;font:13px/1.35 system-ui,sans-serif;padding:7px 12px;border-radius:6px;transition:opacity .4s';
        document.body.appendChild(n);
      }
      n.textContent = t; n.style.opacity = '1';
      clearTimeout(n._t); n._t = setTimeout(() => { n.style.opacity = '0'; }, 3200);
    }
    function savePhoto(o) {
      if (photoBusy) return;
      photoBusy = true;
      const c = photo(o);
      if (!c) { photoBusy = false; photoNote('Снимок не получился'); return; }
      const d = new Date(), p2 = (v) => String(v).padStart(2, '0');
      const name = 'aegis_' + (world.mapId || 'polygon') + '_' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) +
        '_' + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds()) + '.jpg';
      c.toBlob((b) => {
        photoBusy = false;
        if (!b) { photoNote('Снимок не получился'); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        photoNote('Снимок ' + c.width + '×' + c.height + ' сохранён в «Загрузки»: ' + name);
      }, 'image/jpeg', (o && o.q) || 0.92);
    }
    root.AEGIS_PHOTO = { photo, save: savePhoto };
    function releaseAll() {
      for (const k of ['fwd', 'back', 'left', 'right']) input[k] = 0;
      input.sneak = input.sprint = input.crouch = input.ads = input.leanL = input.leanR = false;
      S.fDown = false; S.spaceUp = false; S.uDown = false;
      for (const k of Object.keys(heldNow)) delete heldNow[k];
      const a = active(); if (a) a.ctrl.pullTrigger(false);
      if (root.GMG && root.GMG.trigger) root.GMG.trigger(false);
    }
    const MOVE_ACT = { fwd: 1, back: 1, left: 1, right: 1, jump: 1, crouch: 1 };
    /* одно действие: down — нажата/отпущена, rep — автоповтор клавиши */
    function doAction(act, down, rep) {
      if (HELD_ACT[act]) { if (down) heldNow[act] = 1; else delete heldNow[act]; }
      switch (act) {
        case 'fwd': case 'back': case 'left': case 'right': input[act] = down ? 1 : 0; break;
        case 'sprint': input.sprint = down; break;
        case 'sneak': input.sneak = down; break;
        case 'crouch': if(SET.crouchMode==='toggle'){if(down&&!rep)input.crouch=!input.crouch;}else input.crouch=down; break;
        case 'zeroUp': if(down&&!rep&&C0.zeroChange)C0.zeroChange(1); break;
        case 'zeroDown': if(down&&!rep&&C0.zeroChange)C0.zeroChange(-1); break;
        case 'leanL': input.leanL = down; break;
        case 'leanR': input.leanR = down; break;
        case 'jump': S.spaceUp = down; if (down && !rep) input.jump++; break;
        case 'prone': if (down && !rep && active()) input.proneTog++; break;
        case 'use': if (!rep) { if (down) S.fT0 = performance.now(); else if (S.fDown && performance.now() - (S.fT0 || 0) < 250) S.fTap = performance.now(); S.fDown = down; } break;
        case 'menu': if (down && !rep) uiCall('onMenuKey'); break;
        /* v22: переход в союзника (удерживать), обыск тела, своё снаряжение (js/app/loot.js) */
        case 'swap': if (!rep) S.uDown = down; break;
        case 'loot': if (down && !rep && root.GLoot) root.GLoot.toggle('body'); break;
        case 'inventory': if (down && !rep && root.GLoot) { root.GLoot.toggle('self'); S.tutInv = (S.tutInv || 0) + 1; } break;
        case 'reset': if (down && !rep && C0.reviveAll) C0.reviveAll(); break;
        case 'fps': if (down && !rep) QM.toggleFps(); break;
        case 'photo': if (down && !rep) savePhoto(); break;
        default: ARS.action(act, down, rep); break;
      }
      if (down && MOVE_ACT[act] && S.mode === 'free') uiCall('onFreeMove');
    }
    const blocked = () => !S.inputOn;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'F3' || (e.code === 'Space' && e.target === document.body)) e.preventDefault();
      if (e.code === 'Escape') { if (!e.repeat) uiCall('onEscape'); return; }
      if (blocked()) return;
      const act = CODE2ACT[e.code];
      if (!act) return;
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      e.preventDefault();
      doAction(act, true, e.repeat);
    });
    window.addEventListener('keyup', (e) => {
      const act = CODE2ACT[e.code];
      if (act && (heldNow[act] || !blocked())) doAction(act, false, false);
    });
    window.addEventListener('blur', releaseAll);

    dom.addEventListener('mousedown', (e) => {
      if (blocked()) return;
      if (!S.pointerLocked) {
        /* первый щелчок по сцене только захватывает курсор */
        try { const r = dom.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (er) { /* нет */ }
        uiCall('onSceneClick', e);
        return;
      }
      const act = CODE2ACT['Mouse' + e.button];
      if (act) doAction(act, true, false);
    });
    window.addEventListener('mouseup', (e) => {
      const act = CODE2ACT['Mouse' + e.button];
      if (act && heldNow[act]) doAction(act, false, false);
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    /* колесо: прокрутка вверх и вниз работают как назначаемые клавиши (приближение в прицеле) */
    let wheelT = 0;
    window.addEventListener('wheel', (e) => {
      if (!S.pointerLocked || blocked() || !e.deltaY) return;
      e.preventDefault();
      const now = performance.now();
      if (now - wheelT < 45) return;   // тачпады шлют десятки событий на один жест
      wheelT = now;
      const act = CODE2ACT[e.deltaY < 0 ? 'WheelUp' : 'WheelDown'];
      if (act) { doAction(act, true, false); doAction(act, false, false); }
    }, { passive: false });
    /* нажатие колеса не включает автопрокрутку браузера */
    dom.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });

    let SENS = 0.00155 * (SET.sens || 1);
    window.addEventListener('mousemove', (e) => {
      if (!S.pointerLocked || blocked()) return;
      const dx = e.movementX || 0, dy = (e.movementY || 0)*(SET.invertY?-1:1);
      /* выбросы при захвате курсора (Chrome иногда шлёт сотни пикселей) */
      if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return;
      const a = active();
      if(a){const ad=a.ctrl.ads||0,mag=Math.max(1,Math.tan((SET.fov||88)*Math.PI/360)/Math.tan(camera.fov*Math.PI/360));const group=mag<1.5?'ads1':mag<3?'ads2':mag<6?'ads4':'ads8';const scale=(1-ad)+ad*(SET[group]||1)/mag;a.ctrl.look(dx,dy,SENS*scale/(1-ad*.55));}
      else if (!S.death) {
        S.free.yaw -= dx * SENS;
        S.free.pitch = clamp(S.free.pitch - dy * SENS, -1.4, 1.4);
        if (Math.abs(dx) + Math.abs(dy) > 2) uiCall('onFreeLook');
      }
    });

    document.addEventListener('pointerlockchange', () => {
      const was = S.pointerLocked;
      S.pointerLocked = document.pointerLockElement === dom;
      if (!S.pointerLocked) {
        const a = active();
        a && a.ctrl.pullTrigger(false);
        if (root.GMG && root.GMG.trigger) root.GMG.trigger(false);
        input.ads = false;
        delete heldNow.fire; delete heldNow.ads;
        if (was) uiCall('onLockLost');
      }
    });
    function lockPointer() {
      if (S.pointerLocked) return;
      try { const r = dom.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (er) { /* нет */ }
    }
    function unlockPointer() { if (document.pointerLockElement) document.exitPointerLock(); }

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      if (POST) POST.resize(window.innerWidth, window.innerHeight);
    });

    /* --------------------------------------------------- вспомогательное */
    const active = () => (S.activeIdx >= 0 ? squad[S.activeIdx] : null);

    /* Свободная камера летает между бойцами: плавный разгон, без коллизий
       с травой, но с ограничением по высоте и границам участка. */
    function updateFree(dt) {
      const f = S.free;
      const speed = (input.sprint ? 9.5 : 4.2);
      let wx = 0, wz = 0, wy = 0;
      if (input.fwd) wz -= 1;
      if (input.back) wz += 1;
      if (input.left) wx -= 1;
      if (input.right) wx += 1;
      if (input.crouch) wy -= 1;              // Ctrl/C — вниз
      if (S.spaceUp) wy += 1;                 // пробел — вверх
      /* Летим туда, куда смотрим: строим базис камеры из её же кватерниона,
         а не вручную из синусов. Ручная раскладка раньше путала знак yaw
         (W уводил назад) и дробила pitch на отдельные слагаемые. */
      const want = new THREE.Vector3();
      const len = Math.hypot(wx, wz);
      if (len > 0) {
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(f.pitch, f.yaw, 0, 'YXZ'));
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
        want.addScaledVector(fwd, (-wz / len) * speed)
          .addScaledVector(right, (wx / len) * speed);
      }
      want.y += wy * speed * 0.9;
      f.vel.lerp(want, 1 - Math.exp(-9 * dt));
      f.pos.addScaledVector(f.vel, dt);
      const gy = world.heightAt ? world.heightAt(f.pos.x, f.pos.z) : 0;
      f.pos.y = clamp(f.pos.y, gy + 0.45, 22);
      /* облёт — с запасом над минным полем по периметру */
      const MFb = world.minefield, FX = MFb ? MFb.XF + MFb.depth + 6 : 28, FZ = MFb ? MFb.ZF + MFb.depth + 6 : 33;
      f.pos.x = clamp(f.pos.x, world.bounds?world.bounds.x0:-FX, world.bounds?world.bounds.x1:FX);
      f.pos.z = clamp(f.pos.z, world.bounds?world.bounds.z0:-FZ, world.bounds?world.bounds.z1:FZ);
    }

    /* ================================================== выбор бойца === */
    /* Кандидат — ближайший боец в конусе взгляда на дистанции USE_RANGE.
       В режиме управления кандидатом может быть только ДРУГОЙ боец. */
    const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
    function findCandidate() {
      const eye = camera.getWorldPosition(_v1);
      const dir = camera.getWorldDirection(_v2);
      let best = -1, bestScore = -1;
      for (let i = 0; i < squad.length; i++) {
        if (i === S.activeIdx || squad[i].npc) continue;
        const s = squad[i];
        if (s.dead) continue;
        const p = s.ctrl.pos;
        const dx = p.x - eye.x, dz = p.z - eye.z;
        const dy = (p.y + 1.1) - eye.y;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > USE_RANGE) continue;
        const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / (dist || 1);
        if (dot < 0.35) continue;             // нужно смотреть примерно на него
        const score = dot / Math.max(0.4, dist);
        if (score > bestScore) { bestScore = score; best = i; }
      }
      return best;
    }

    function embody(idx) {
      const t = squad[idx];
      if (!t) return;
      if (t.dead) {  return; }
      const prev = active();
      if (prev) {
        ARS.onDisembody(prev);
        prev.active = false;
        prev.ctrl.pullTrigger(false);
        prev.ctrl.ads = 0;
      }
      S.activeIdx = idx;
      S.selected = idx;
      const a = squad[idx];
      a.active = true;
      audio.resume();
      audio.ui(true);
      audio.gearRattle(1);
      const P = a.char.preset;
      ui.who.className = P.faction;
      ui.whoName.textContent = P.name;
      ui.whoSide.textContent = (P.faction === 'delta' ? 'Дельта' : 'Альфа') + ' · «' + P.callsign + '»';
      { const tr = a.gen && a.gen.trait, we = el('whoTrait'); if (we) we.textContent = tr ? tr.icon + ' ' + tr.name : ''; if (we && tr) we.title = tr.lines.join(' · '); }
      S.mode = 'embodied';
      ARS.onEmbody(a);
      uiCall('onEmbody', a.key);
    }

    function disembody() {
      const a = active();
      if (!a) return;
      if (audio.motion) audio.motion(0);
      ARS.onDisembody(a);
      /* Свободная камера появляется там, где стоял боец, чуть позади. */
      const f = S.free;
      f.yaw = a.ctrl.yaw;
      f.pitch = clamp(a.ctrl.pitch, -0.6, 0.4);
      const back = 1.5;
      f.pos.set(
        a.ctrl.pos.x + Math.sin(f.yaw) * back,
        a.ctrl.pos.y + 1.72,
        a.ctrl.pos.z + Math.cos(f.yaw) * back
      );
      f.vel.set(0, 0, 0);
      a.active = false;
      a.ctrl.pullTrigger(false);
      a.ctrl.ads = 0; a.ctrl.adsWant = false;
      S.activeIdx = -1;
      S.mode = 'free';
      audio.ui(false);
      ui.who.className = '';
      ui.whoName.textContent = '—';
      ui.whoSide.textContent = 'Свободная камера';
      { const we = el('whoTrait'); if (we) we.textContent = ''; }
      uiCall('onDisembody', a.key);
    }

    /* Удержание F: заполняем индикатор, по завершении — переключение. */
    function updateUse(dt) {
      /* в бою из тела не выйти и в чужое не вселиться: F — двери, пулемёт, ящик */
      const battle = !!world.mapId;
      const cand = battle ? -1 : findCandidate();
      S.candidate = cand;
      const inRange = cand >= 0;
      const canExit = S.mode === 'embodied' && !battle;
      const keyLbl = AE ? AE.keyName(BINDS.use) : 'F';

      let showPrompt = false, lbl = '', sub = '', pressKey = '';
      if (inRange) {
        showPrompt = true;
        lbl = 'Вселиться: ' + squad[cand].char.preset.name;
        sub = 'удерживайте ' + keyLbl;
      }

      /* короткое нажатие F у двери/ящика (js/app/crates.js); подсказка перекрывает «вселиться» */
      if (root.GMG && world.mapId) try { root.GMG.update(dt, { C: C0, world, camera, THREE, active }); } catch (e) { if (!S._mgWarn) { S._mgWarn = 1; console.warn('mg', e && e.message); } }
      const ex = root.GCrates ? root.GCrates.update(dt, S, world, S.mode === 'embodied' ? active() : null) : null;
      if (ex) { showPrompt = true; lbl = ex.lbl; sub = ex.sub; }
      /* v22: в бою — перейти в союзника рядом (подойти, смотреть на него, удерживать U) и обратно в прежнего бойца */
      let fillK = S.holdF / HOLD_TIME;
      if (battle && S.mode === 'embodied') {
        const a = active(), keyU = AE ? AE.keyName(BINDS.swap) : 'U';
        let mate = -1;
        if (a && !a.dead) {
          let bd = 3.2;
          const fx = -Math.sin(a.ctrl.yaw), fz = -Math.cos(a.ctrl.yaw);
          for (let i = 0; i < squad.length; i++) {
            const q = squad[i];
            if (q === a || q.dead || q.out || q.rd || (q.hp !== undefined && q.hp <= 0) || !q.ctrl || (q.team || q.char.preset.faction) !== (a.team || a.char.preset.faction)) continue;
            const dx = q.ctrl.pos.x - a.ctrl.pos.x, dz = q.ctrl.pos.z - a.ctrl.pos.z, d = Math.hypot(dx, dz);
            if (d > bd || Math.abs(q.ctrl.pos.y - a.ctrl.pos.y) > 1.6) continue;
            if (d > 1.3 && (dx * fx + dz * fz) / Math.max(0.1, d) < 0.5) continue;
            bd = d; mate = i;
          }
        }
        const bi = S.swapBack, back = Number.isInteger(bi) && bi >= 0 && bi !== S.activeIdx && squad[bi] && !squad[bi].dead && !squad[bi].out ? bi : -1;
        if (mate >= 0 && !ex) { showPrompt = true; lbl = 'Управлять: ' + squad[mate].char.preset.name; sub = 'удерживайте ' + keyU; }
        else if (back >= 0 && S.uDown) { showPrompt = true; lbl = 'Вернуться: ' + squad[back].char.preset.name; sub = 'удерживайте ' + keyU; }
        if (S.uDown && (mate >= 0 || back >= 0)) {
          S.holdU = (S.holdU || 0) + dt;
          if (S.holdU >= HOLD_TIME) {
            S.holdU = 0; S.uDown = false;
            const to = mate >= 0 ? mate : back;
            if (root.GMG && a && root.GMG.isMounted(a)) try { root.GMG.dismount(a); } catch (e) { /* */ }
            S.swapBack = S.activeIdx;
            embody(to);
          }
        } else S.holdU = Math.max(0, (S.holdU || 0) - dt * 2.4);
        if ((S.holdU || 0) > S.holdF) fillK = S.holdU / HOLD_TIME;
      }
      /* v22: убитый или предметы на земле рядом — подсказка обыска (Y) */
      if (!showPrompt && S.mode === 'embodied' && C0.LOOT) {
        S._lootT = (S._lootT || 0) - dt;
        if (S._lootT <= 0) { S._lootT = 0.15; try { S._lootNear = C0.LOOT.near(); } catch (e) { S._lootNear = null; } }
        const n = S._lootNear;
        if (n) { showPrompt = true; pressKey = AE ? AE.keyName(BINDS.loot) : 'Y'; lbl = n.kind === 'body' ? 'Обыскать: ' + n.s.char.preset.name : 'Предметы на земле'; sub = 'нажмите ' + pressKey + ' — открыть снаряжение'; fillK = 0; }
      }
      /* v26: у подсказки «нажать» (обыск) — своя клавиша и яркая рамка; раньше в рамке была F (клавиша
         удержания), а сама подсказка не выделялась — её почти не было видно */
      if (ui.promptKey) { const kk = pressKey || keyLbl; if (ui.promptKey.textContent !== kk) ui.promptKey.textContent = kk; }
      ui.prompt.classList.toggle('press', !!pressKey);
      if (S.fDown && (inRange || canExit)) {
        S.holdF += dt;
        if (S.holdF >= HOLD_TIME) {
          S.holdF = 0;
          S.fDown = false;
          if (inRange) embody(cand); else disembody();
        }
      } else {
        S.holdF = Math.max(0, S.holdF - dt * 2.4);
      }

      const exiting = !showPrompt && canExit && S.holdF > 0.02;
      ui.prompt.classList.toggle('on', (showPrompt || exiting) && S.inputOn);
      if (showPrompt || exiting) {
        if (exiting) { lbl = 'Выйти из тела'; sub = 'удерживайте ' + keyLbl; }
        ui.promptLbl.textContent = lbl;
        ui.promptSub.textContent = sub;
        ui.promptFill.style.transform = 'scaleY(' + Math.min(1, fillK).toFixed(3) + ')';
      }
    }

    const C0 = {
      THREE, renderer, scene, camera, world, fx, audio, squad, sun, sunDir, renderFrame, getPost: () => POST,
      /* v26: образы и повязки (редактор «Внешний вид») — для смены вида на лету (finishLoop: reskin) */
      looksCtx: { get: () => LOOKS, set: (v) => { LOOKS = v; }, BAND_MAT, teamBand, teamOf },
      S, input, ui, active, updateFree, updateUse, ARS, uiCall, QM, SET, GRASS, WX,
      lockPointer, unlockPointer, releaseAll,
      getSens: () => SENS,
      setSens: (k) => { SENS = 0.00155 * clamp(+k || 1, 0.2, 3); },
      setBinds: (b) => { BINDS = Object.assign({}, (AE && AE.DEFAULT_BINDS) || {}, b || {}); rebuildBinds(); releaseAll(); },
      getBinds: () => BINDS,
      embodyFn: embody, disembodyFn: disembody
    };
    BOOTMARK('preLoop');
    const G = startLoop(C0);
    {
      const GA_ = self.GAssets, miss = [];
      if (GA_ && !GA_.data.soldier) miss.push('модель бойца');
      if (GA_ && !GA_.data.vm_hands) miss.push('перчатки');
      if (miss.length) {
        console.warn('assets missing:', miss.join(', '));
      }
    }
    G.batch = () => (QM.batch ? Object.assign({ live: QM.batch.groups.filter((g) => g.alive).length, entries: QM.batch.entries.length }, QM.batch.stats) : null);
    G.look = (o) => { Object.assign(LOOK, o || {}); applyLook(); return Object.assign({}, LOOK, { post: !!POST }); };
    G.post = () => POST;
    return G;
  }

  /* ==================================================== ОСНОВНОЙ ЦИКЛ = */
  function startLoop(C) {
    const { THREE, renderer, scene, camera, world, fx, audio, squad, sun,
      S, input, ui, active, updateFree, updateUse } = C;
    const clamp = U.clamp;
    /* v9: эффекты выстрела оружейной (см. main: fx.sfx) */
    const SFX = fx.sfx || null;
    const _sfxD = new THREE.Vector3(), _sfxD2 = new THREE.Vector3(), _sfxE = new THREE.Vector3();
    const _sfxQ = new THREE.Quaternion(), _sfxQH = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);

    /* ------------------------------------------------- поза бойца ----- */
    /* Кости расставляются каждый кадр «с нуля»: базовая стойка + дельты от
       движения, приседа, наклона и дыхания. Затем руки решаются IK. */
    const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

    /* ------------------------------------------ попадания по бойцам --- */
    /* game/damage.js: анатомические зоны, плиты и шлем, кровь, реакция на
       удар и рэгдолл. Звук события — с места события: задержка по скорости
       звука, глушение верха с расстоянием и панорама относительно камеры. */
    const GDM = root.GDamage || null;
    /* game/blood.js: брызги, взвесь, капли, пятна и лужи под телом */
    /* game/flags.js: флаги команд и флаг на рубеже — ткань на ветру */
    const FLAGS = root.GFlags ? root.GFlags.create(THREE, { scene, quality:C.SET.quality, groundAt: (x, z) => world.heightAt ? world.heightAt(x, z) : 0, colliders: world.colliders }) : null;
    if (FLAGS) {
      if(!world.mapId) for (const f of TEAM_FLAGS) FLAGS.add(Object.assign({}, f));
      for (const f of (world.flags || [])) FLAGS.add(Object.assign({}, f));
    }
    const BLOOD = root.GBlood ? root.GBlood.create(THREE, { scene, camera, renderer, groundAt: (x, z) => squad[0].ctrl.groundAt(x, z) }) : null;
    /* game/blast.js: подрывы мин — вспышка, столб грунта и дыма, комья, воронка */
    /* game/gore.js: отрыв конечностей и ошмётки */
    const GORE = root.GGore && BLOOD ? root.GGore.create(THREE, { scene, blood: BLOOD, groundAt: (x, z) => squad[0].ctrl.groundAt(x, z) }) : null;
    /* v6: следы боя и отклик леса на попадания (js/polygon/26b_scars.js) */
    let SCARS = null;
    try { SCARS = root.GScars ? root.GScars.create(THREE, { scene, world, camera, renderer }) : null; } catch (e) { console.warn('scars:', e && e.message); }
    C.SCARS = SCARS;
    if (C.WX) C.WX.scars = SCARS;
    const BLAST = root.GBlast ? root.GBlast.create(THREE, { scene, camera, renderer, fx, groundAt: (x, z) => squad[0].ctrl.groundAt(x, z) }) : null;
    /* v7: взрыв пугает ворон на сотню метров, рядом — подавляет */
    if (BLAST && BLAST.explode) {
      const ex0 = BLAST.explode;
      BLAST.explode = function (p, kind, opt) {
        try {
          if (C.WX.gw && p) {
            C.WX.gw.scare(p, kind === 'ozm_pop' ? 0.6 : 3);
            const d = camera.position.distanceTo(p);
            if (d < 25 && kind !== 'ozm_pop') C.WX.gw.sup = Math.min(1, C.WX.gw.sup + 0.9 * (1 - d / 25));
          }
        } catch (e) { /* */ }
        return ex0.apply(this, arguments);
      };
    }
    const _spA = new THREE.Vector3(), _spR = new THREE.Vector3();
    function spatialFrom(pos) {
      const d = camera.position.distanceTo(pos);
      _spA.copy(pos).sub(camera.position);
      _spR.set(1, 0, 0).applyQuaternion(camera.quaternion);
      const pan = d > 0.05 ? clamp(_spA.dot(_spR) / d, -1, 1) * 0.7 : 0;
      return { pan, gain: clamp(2.2 / Math.max(2.2, d), 0.05, 1), lp: clamp(15000 / (1 + d * 0.07), 1500, 15000), delay: d / 343, dist: d };
    }
    if (C.WX && C.WX.gw) C.WX.gw.spatialFrom = spatialFrom;
    if (C.WX && C.WX.zones) C.WX.zones.spatialFrom = spatialFrom;
    const DMG = GDM ? GDM.create(THREE, {
      fx, blood: BLOOD, gore: GORE, scene, colliders: world.colliders, v8props: world.v8props,
      isFirstPerson: () => S.activeIdx >= 0 && !S.tp && !S.spectate,
      sound: (kind, pos, v, who) => {
        if (!audio.bodyHit) return;
        /* v8: тело/автомат упали в воду — всплеск, рябь, плеск вместо удара о грунт */
        if ((kind === 'fall' || kind === 'gun') && pos && SCARS && SCARS.waterC) {
          let wc = null; try { wc = SCARS.waterC(pos.x, pos.z); } catch (e) { /* */ }
          if (wc) {
            try { SCARS.splash(pos.x, wc.h0 - wc.D * 0.5 + 0.01, pos.z, kind === 'fall' ? 1.6 + (v || 0) : 0.8, false); } catch (e) { /* */ }
            if (audio.waterHit) audio.waterHit(spatialFrom(pos));
            return;
          }
        }
        /* тело и автомат о грунт — записями из банка бойца */
        if (who && who.sfx && VOX.ok && (kind === 'fall' || kind === 'gun')) {
          if (kind === 'fall') who.sfx.fallImpact(v); else who.sfx.gunImpact();
          return;
        }
        const sp = spatialFrom(pos);
        if (kind === 'fall') audio.bodyFall(sp, v);
        else if (kind === 'gun') audio.gunDrop(sp);
        else audio.bodyHit(kind, sp);
      },
      /* добили лежащего в агонии: голос обрывается, последний выдох */
      onFinish: (s) => {
        if (s.sfx && VOX.ok) { try { s.sfx.stopAll(); s.sfx.down('dead', undefined, { ext: true }); } catch (e) { /* */ } }
      },
      /* v14: потерял сознание в агонии — крик обрывается, остаётся редкое
         агональное дыхание */
      onUncon: (s) => { if (s.sfx && VOX.ok) try { s.sfx.setDownMode('unc'); } catch (e) { /* */ } },
      onDeath: (s, zone) => {
        if (s.sfx && VOX.ok) s.sfx.down(/^(cns|fatal|bleed)$/.test(s.deathKind || '') ? 'dead' : s.deathKind === 'neck' ? 'choke' : s.deathKind === 'para' ? (s.dmg && s.dmg.ph && s.dmg.ph.apnea ? 'unc' : 'quiet') : 'auto', undefined, { ext: true });
        const nm = s.char.preset.name;
        /* управляемый боец: вместо плашки — экран гибели (finishLoop) */
        if (s.active && C.onPlayerDeath) { C.onPlayerDeath(s, zone); return; }
        /* плашки о гибели бойцов («Дружественный огонь · …») убраны — экран остаётся чистым */
        /* управляемый боец: камера остаётся с телом, через 5 с — возрождение */
        if (s.active) { if (C.onPlayerDeath) C.onPlayerDeath(s, zone); else if (C.disembodyFn) C.disembodyFn(); }
      }
    }) : null;
    if (DMG) for (const s of squad) DMG.attach(s);
    /* возрождение / сброс — голос и дыхание с нуля */
    if (DMG) { const rv = DMG.revive; DMG.revive = (s) => { rv(s); if (s.sfx) s.sfx.stopAll(); }; }

    /* ------------------------------------- голоса, шаги, снаряжение --- */
    /* audio/soldier_sfx.js: один SoldierSFX на бойца (банки общие). Шаги
       — по фазе походки (камера и звук на одной фазе), режим (покой /
       шаг / бег) — по скорости: от него усталость, дыхание на бегу и
       отдышка. Свой боец звучит «с груди», чужие — с места: панорама,
       громкость и глушение верха по расстоянию (spatialFrom). Тракт
       бодикама даёт общий мастер audio.js, поэтому свой бодикам у
       движка выключен. */
    const SFXM = root.GSoldierSFX || null;
    const SFXK = { delta_1: 'd1', delta_2: 'd2', alpha_1: 'a1', alpha_2: 'a2' };
    const VOX = { loading: false, ok: false };
    const _vxp = new THREE.Vector3();
    function voxInit() {
      if (!SFXM || VOX.loading || !audio.ctx || !audio.dry) return;
      VOX.loading = true;
      const ac = audio.ctx;
      SFXM.loadBanks(ac).then((B) => {
        for (const s of squad) {
          const e = new SFXM.SoldierSFX(ac, null, { lite: true });
          e.B = B;
          e.setSoldier(SFXK[s.key] || 'd1');
          e.setBodycam(false, 0);
          e.extSteps = true;
          const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 16000; lp.Q.value = 0.5;
          const g = ac.createGain(); g.gain.value = 0;
          const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
          e.out.connect(lp); lp.connect(g);
          if (pan) { g.connect(pan); pan.connect(audio.dry); } else g.connect(audio.dry);
          if (audio.conv) { const wet = ac.createGain(); wet.gain.value = 0.16; g.connect(wet); wet.connect(audio.conv); }
          e._sp = { lp, g, pan };
          s.sfx = e; s.ctrl.sfx = e;
        }
        VOX.ok = true;
      }).catch((err) => { console.warn('soldier sfx', err); });
    }
    /* Параметры звука бойцов: не чаще 20 раз в секунду и только при заметном
       изменении — по 4 автоматизации на каждого из 64 бойцов в каждом кадре
       забивали очередь аудиопотока. Дальше VOX_FAR м боец не слышен: его
       шаги и дыхание не планируются вовсе. */
    const VOX_FAR = 55;
    let voxT = 0;
    function voxUpdate() {
      if (!VOX.ok) { voxInit(); return; }
      const t = audio.ctx.currentTime;
      const params = t - voxT >= 0.05; if (params) voxT = t;
      const vv = C.SET.voices === undefined ? 1 : C.SET.voices;
      for (const s of squad) {
        const e = s.sfx;
        if (!e) continue;
        const me = s.active && !S.spectate;
        if (params) {
          if (s.rd) { const p = s.rd.p, ci = DMG.PI.chest; _vxp.set(p[ci * 3], p[ci * 3 + 1], p[ci * 3 + 2]); }
          else _vxp.copy(s.ctrl.pos).y += 1.3;
          const sp = me ? null : spatialFrom(_vxp);
          const far = !me && sp.dist > VOX_FAR;
          s._audFar = far;
          const gv = far ? 0 : me ? 0.9 : 0.9 * sp.gain, lpv = me ? 16000 : sp.lp, pv = me ? 0 : sp.pan;
          const o = e._last || (e._last = { v: -1, g: -1, lp: -1, p: -9 });
          if (o.v !== vv) { o.v = vv; e.voiceBus.gain.setTargetAtTime(vv, t, .05); }
          if (Math.abs(o.g - gv) > 0.004) { o.g = gv; e._sp.g.gain.setTargetAtTime(gv, t, 0.05); }
          if (Math.abs(o.lp - lpv) > lpv * 0.04) { o.lp = lpv; e._sp.lp.frequency.setTargetAtTime(lpv, t, 0.05); }
          if (e._sp.pan && Math.abs(o.p - pv) > 0.02) { o.p = pv; e._sp.pan.pan.setTargetAtTime(pv, t, 0.05); }
        }
        if (s._audFar) continue;
        if (!s.dead && !e.downed) {
          const c = s.ctrl, v = c.speed || 0;
          const mode = v < 0.35 ? 'idle' : ((c.sprint || 0) > 0.5 || v > 3.6) ? 'run' : 'walk';
          e.setMove(mode);
          const inj = !!((s.dmg && s.dmg.ph && s.dmg.ph.shock > 0.4) || c.injLeg);
          if (inj !== e.injured) e.setInjured(inj);
        }
        e.update();
      }
    }
    /* Попадание засчитано: метка, подпись зоны, событие для остальных
       бойцов (life.js: испуг, взгляд на раненого, затем на стрелка). */
    /* Кровь на объективе бодикама: близкое попадание или своё ранение —
       капли и мазки по краям кадра, стекают и бледнеют за ~4 с. */
    const bloodScr = document.getElementById('bloodScr');
    let bloodT = null;
    function screenBlood(k) {
      return;   /* реализм: кровь на объективе отключена */
      if (!bloodScr) return;
      const W = 480, H = Math.round(480 * window.innerHeight / Math.max(1, window.innerWidth));
      if (bloodScr.width !== W || bloodScr.height !== H) { bloodScr.width = W; bloodScr.height = H; }
      const g = bloodScr.getContext('2d');
      const prevOp = +getComputedStyle(bloodScr).opacity || 0;
      if (prevOp < 0.05) g.clearRect(0, 0, W, H);
      const n = Math.round(10 + 34 * k);
      for (let i = 0; i < n; i++) {
        /* к краям кадра гуще */
        const a = Math.random() * Math.PI * 2, rr = Math.pow(Math.random(), 0.45) * 0.72;
        const x = W * (0.5 + Math.cos(a) * rr * 0.75), y = H * (0.5 + Math.sin(a) * rr * 0.75);
        const r = (Math.random() < 0.15 ? 9 + Math.random() * 16 : 1.5 + Math.random() * 6) * (0.6 + k * 0.6);
        const al = 0.55 + Math.random() * 0.4;
        g.fillStyle = 'rgba(' + (70 + Math.random() * 40 | 0) + ',4,3,' + al.toFixed(2) + ')';
        g.beginPath(); g.ellipse(x, y, r, r * (0.7 + Math.random() * 0.5), Math.random() * 3, 0, Math.PI * 2); g.fill();
        if (r > 5 && Math.random() < 0.6) {
          /* потёк вниз */
          const L = r * (2 + Math.random() * 5);
          g.fillRect(x - r * 0.18, y, r * 0.36, L);
          g.beginPath(); g.arc(x, y + L, r * 0.3, 0, Math.PI * 2); g.fill();
        }
      }
      bloodScr.style.transition = 'none';
      bloodScr.style.opacity = String(Math.min(1, 0.55 + k * 0.5));
      void bloodScr.offsetWidth;
      clearTimeout(bloodT);
      bloodT = setTimeout(() => { bloodScr.style.transition = 'opacity 4.2s ease-in'; bloodScr.style.opacity = '0'; }, 900);
    }
    function onSoldierHit(s, res, fromPos) {
      if (!res) return;
      /* брызги на объектив: в упор (до 2,5 м от камеры) или своё ранение */
      if (res.world && S.activeIdx >= 0 && !S.tp && !S.spectate) {
        const d = camera.position.distanceTo(res.world);
        if (res.s && res.s.active && res.zone !== 'plate' && res.zone !== 'helmet') screenBlood(0.8);
        else if (d < 2.5 && res.zone !== 'plate') screenBlood(Math.min(1, (2.5 - d) / 1.6 + (res.severed ? 0.5 : 0)));
      }
      ui.hitmark.classList.remove('on');
      void ui.hitmark.offsetWidth;
      ui.hitmark.classList.add('on');
      if (!res.died && !res.s.dead && res.s.sfx && VOX.ok) {
        /* боль: удар по плите/шлему — тупой (вскрик), ранение — крик тем
           сильнее, чем тяжелее */
        const blunt = res.zone === 'plate' || res.zone === 'helmet';
        res.s.sfx.hit(blunt ? 0.28 + Math.random() * 0.15 : clamp(0.4 + (res.dmg || 0) / 70, 0.45, 1));
      }
      if (!res.died && !res.s.dead) {
        /* итог попадания: броня (пробита/держит, вероятность пробития),
           сосуд, перелом, остаток здоровья */
        let note = '';
        if (res.armor) note += ' · ' + res.armor.name + (res.armor.pen ? ' пробита' : ' держит') + ' (' + Math.round(res.armor.p * 100) + '%)';
        if (res.ricochet) note += ' · рикошет';
        if (res.vessel) note += ' · ' + res.vessel;
        if (res.fracture) note += ' · перелом';
        void note; /* плашка «Попадание · …» убрана */
      }
      const from = fromPos || (s ? eyePosition(s) : camera.position.clone());
      (C.lifeEvents || (C.lifeEvents = [])).push({ type: 'hit', victim: res.s, pos: res.world.clone(), from, zone: res.zone, died: res.died });
    }

    /* ------------------------------------------------ ноги в приседе --- */
    /* Аналитическая IK «бедро — колено — голеностоп» с чистым шарниром:
       ось колена — нормаль к плоскости ноги, заданной полюсом, поэтому
       колено гнётся строго в своей плоскости и надколенник смотрит на
       полюс (у плеч так же сделано в rig.js). Цели — в системе бойца
       (root): вперёд -Z, вправо +X; ориентация стопы и пальцев — явно.

       С колена (НСД «изготовка с колена», TC 3-22.9 kneeling): правое
       колено на грунте впереди-справа от сустава бедра, правая голень
       уходит назад почти по грунту, стопа стоит на подушечке с
       подогнутыми пальцами, пятка вверх — на неё почти садится таз;
       левая стопа впереди на всей подошве, голень почти вертикальна.
       Гусиный шаг: стопа в опоре стоит на грунте и уезжает назад со
       скоростью хода, в переносе выносится вперёд по дуге с подъёмом
       ~8 см; перекат с пятки на носок, пятка отрывается в конце опоры.
       Результат смешивается с обычной походкой по степени приседа. */
    const CL = {
      a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(),
      e: new THREE.Vector3(), f: new THREE.Vector3(), g: new THREE.Vector3(), h: new THREE.Vector3(),
      x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(),
      m: new THREE.Matrix4(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), q3: new THREE.Quaternion(),
      eu: new THREE.Euler(0, 0, 0, 'YXZ'), fk: {}, ik: {}, bones: ['hip', 'knee', 'ankle', 'toe']
    };
    function setBoneWorldBasis(bone, X, Y) {
      CL.z.crossVectors(X, Y);
      CL.m.makeBasis(X, Y, CL.z);
      const wq = CL.q.setFromRotationMatrix(CL.m);
      const pq = bone.parent.getWorldQuaternion(CL.q2);
      bone.quaternion.copy(pq.invert().multiply(wq));
      bone.updateMatrixWorld(true);
    }
    /* H, A, P — мир: сустав бедра, цель голеностопа, полюс колена */
    function legIK(hip, knee, ankle, A, P) {
      const H = hip.getWorldPosition(CL.a);
      const Kc = knee.getWorldPosition(CL.b), Ac = ankle.getWorldPosition(CL.c);
      const T = H.distanceTo(Kc), Sh = Kc.distanceTo(Ac);
      const dir = CL.d.subVectors(A, H);
      let d = dir.length();
      dir.divideScalar(d || 1);
      d = clamp(d, Math.abs(T - Sh) + 1e-3, (T + Sh) * 0.9995);
      const pd = CL.e.subVectors(P, H);
      pd.addScaledVector(dir, -pd.dot(dir));
      if (pd.lengthSq() < 1e-10) pd.set(0, 0, -1).addScaledVector(dir, -dir.z);
      pd.normalize();
      const ca = clamp((T * T + d * d - Sh * Sh) / (2 * T * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
      const K = CL.f.copy(H).addScaledVector(dir, T * ca).addScaledVector(pd, T * sa);
      const Aw = CL.g.copy(H).addScaledVector(dir, d);
      /* ось шарнира: нормаль к плоскости ноги */
      const X = CL.h.crossVectors(dir, pd).normalize();
      const Y1 = CL.x.subVectors(H, K).normalize();          // кость смотрит по -Y
      const X1 = CL.y.copy(X).addScaledVector(Y1, -X.dot(Y1)).normalize();
      setBoneWorldBasis(hip, X1, Y1);
      const Y2 = CL.x.subVectors(K, Aw).normalize();
      const X2 = CL.y.copy(X).addScaledVector(Y2, -X.dot(Y2)).normalize();
      setBoneWorldBasis(knee, X2, Y2);
    }
    function crouchLegs(s, CP, kC, plant) {
      const c = s.ctrl, ch = s.char, M = ch.metrics, R = ch.root, b = (n) => ch.bone(n);
      const LOCO = root.GLoco, S = CP.S, m = CP.m, kn = 1 - m;
      const sst = (e0, e1, x) => U.smoothstep(clamp((x - e0) / (e1 - e0), 0, 1));
      for (const SS of ['R', 'L']) for (const n of CL.bones) {
        const key = n + SS;
        (CL.fk[key] || (CL.fk[key] = new THREE.Quaternion())).copy(b(key).quaternion);
      }
      R.updateMatrixWorld(true);
      const y0 = c.pos.y;
      const _w = new THREE.Vector3();
      const gy = (lx, lz) => { R.localToWorld(_w.set(lx, 0, lz)); return c.groundAt(_w.x, _w.z) - y0; };
      /* скорость хода в системе бойца */
      const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
      const vx = c.vel.x * cy - c.vel.z * sy, vz = c.vel.x * sy + c.vel.z * cy;
      const spd = Math.hypot(vx, vz);
      const ux = spd > 0.05 ? vx / spd : 0, uz = spd > 0.05 ? vz / spd : -1;
      const freq = LOCO.cadence(c.speed, 0, 1);
      const beta = 0.62;                                  // доля опоры в цикле
      const Lst = Math.min(0.62 * S, spd * beta / Math.max(0.5, freq));
      const ankY = M.ankleY, foot = M.foot;
      const rA = ch.rest.ankleR, rT = ch.rest.toeR;
      const t2aY = rA[1] - rT[1], t2aZ = rA[2] - rT[2];     // носок -> голеностоп
      const rootQ = R.getWorldQuaternion(CL.q3);
      const A = new THREE.Vector3(), P = new THREE.Vector3(), Hr = new THREE.Vector3();
      for (const SS of ['R', 'L']) {
        const side = SS === 'R' ? 1 : -1;
        const hip = b('hip' + SS), knee = b('knee' + SS), ankle = b('ankle' + SS), toe = b('toe' + SS);
        R.worldToLocal(hip.getWorldPosition(Hr));
        const T = M.thigh, Sh = M.shin;
        /* ---------------------------------------------- с колена --- */
        let kax, kay, kaz, kpx, kpy, kpz, kPit, kYaw, kToe, kPlant;
        if (side > 0) {
          /* колено на грунте впереди-справа от сустава */
          const yK = gy(Hr.x + 0.05 * S, Hr.z - 0.28 * S) + 0.072 * S;
          const dv = Hr.y - yK;
          const dh = dv < T ? Math.sqrt(T * T - dv * dv) : 0;
          const Kx = Hr.x + 0.17 * dh, Kz = Hr.z - 0.985 * dh, Ky = dv < T ? yK : Hr.y - T;
          /* голень назад и чуть внутрь, подушечка стопы на грунте */
          const yA = gy(Kx - 0.05 * S, Kz + 0.43 * S) + 0.191 * S;
          const dvA = yA - Ky;
          const dhA = Math.abs(dvA) < Sh ? Math.sqrt(Sh * Sh - dvA * dvA) : 0;
          kax = Kx - 0.11 * dhA; kay = yA; kaz = Kz + 0.994 * dhA;
          /* полюс — за коленом по биссектрисе: колено встаёт ровно в K */
          kpx = Kx + (Kx - (Hr.x + kax) * 0.5) * 1.5; kpy = Ky + (Ky - (Hr.y + kay) * 0.5) * 1.5; kpz = Kz + (Kz - (Hr.z + kaz) * 0.5) * 1.5;
          kPit = -1.25; kYaw = -0.11; kToe = 1.2; kPlant = 0;
        } else {
          /* левая стопа впереди, на всей подошве; на переходе — шаг */
          kax = Hr.x - 0.012 * S; kaz = Hr.z - 0.40 * S;
          kay = gy(kax, kaz) + ankY + 0.065 * S * Math.sin(Math.PI * kC) * kn;
          kpx = Hr.x - 0.07 * S; kpy = Hr.y + 0.30; kpz = Hr.z - 0.75;
          kPit = 0; kYaw = 0.14; kToe = 0; kPlant = 1 - Math.sin(Math.PI * kC);
        }
        /* -------------------------------------------- гусиный шаг --- */
        const ph = c.stepPhase + (side > 0 ? 0 : 0.5), p = ph - Math.floor(ph);
        let o, lift = 0, wPit, wToe, wPlant;
        if (p < beta) {
          const u = p / beta;
          o = Lst * (0.5 - u);
          wPit = 0.20 * (1 - sst(0, 0.22, u)) - 0.50 * sst(0.58, 1, u);
          wToe = 0.50 * sst(0.58, 1, u);
          wPlant = 1 - sst(0.85, 1, u);
        } else {
          const w = (p - beta) / (1 - beta);
          const sm = w * w * w * (w * (w * 6 - 15) + 10);
          o = Lst * (sm - 0.5);
          lift = 0.085 * S * Math.sin(Math.PI * Math.min(1, w * 1.06)) * U.clamp01(spd / 0.5);
          wPit = -0.50 * (1 - sst(0, 0.40, w)) + 0.20 * sst(0.55, 1, w);
          wToe = 0.50 * (1 - sst(0, 0.35, w));
          wPlant = sst(0.9, 1, w);
        }
        const wYaw = -side * 0.07;
        let wax = side * (M.hipX + 0.03 * S) + ux * o * 0.8, waz = -0.05 * S + uz * o;
        if (side * wax < 0.045 * S) wax = side * 0.045 * S;          // ноги не перекрещиваются вбок
        let way = gy(wax, waz) + ankY + lift;
        /* перекат: пятка вверх — поворот вокруг подушечки, носок вверх —
           вокруг пятки; голеностоп смещается вдоль стопы */
        let dAlong = 0;
        if (wPit < 0) {
          const cs = Math.cos(wPit), sn = Math.sin(wPit);
          way += (t2aY * cs - t2aZ * sn) - t2aY;
          dAlong = (t2aY * sn + t2aZ * cs) - t2aZ;
        } else if (wPit > 0) {
          const hz = -0.31 * foot, cs = Math.cos(wPit), sn = Math.sin(wPit);
          way += (ankY * cs - hz * sn) - ankY;
          dAlong = (ankY * sn + hz * cs) - hz;
        }
        wax += dAlong * Math.sin(wYaw); waz += dAlong * Math.cos(wYaw);
        const wpx = (Hr.x + wax) * 0.5 + side * 0.04, wpy = Hr.y - 0.20, wpz = Math.min(Hr.z, waz) - 0.7;
        /* ---------------------------------------------- смесь --- */
        A.set(U.lerp(kax, wax, m), U.lerp(kay, way, m), U.lerp(kaz, waz, m));
        P.set(U.lerp(kpx, wpx, m), U.lerp(kpy, wpy, m), U.lerp(kpz, wpz, m));
        R.localToWorld(A); R.localToWorld(P);
        legIK(hip, knee, ankle, A, P);
        /* стопа: поворот в системе бойца (курс, затем наклон носка) */
        CL.eu.set(U.lerp(kPit, wPit, m), U.lerp(kYaw, wYaw, m), 0, 'YXZ');
        const fq = CL.q2.copy(rootQ).multiply(CL.q.setFromEuler(CL.eu));
        const kq = knee.getWorldQuaternion(new THREE.Quaternion());
        ankle.quaternion.copy(kq.invert().multiply(fq));
        toe.rotation.set(U.lerp(kToe, wToe, m), 0, 0);
        /* смесь с обычной походкой */
        for (const n of CL.bones) {
          const bn = b(n + SS);
          const ikq = (CL.ik[n + SS] || (CL.ik[n + SS] = new THREE.Quaternion())).copy(bn.quaternion);
          bn.quaternion.copy(CL.fk[n + SS]).slerp(ikq, kC);
        }
        plant[SS] = U.lerp(plant[SS], U.lerp(kPlant, wPlant, m), kC);
      }
      R.updateMatrixWorld(true);
    }

    /* Поза лёжа. Корпус поворачивается вокруг таза: в начале — с колена
       (присед уже выполнен), к концу таз уходит назад и ложится на грунт,
       грудь на локтях, голова поднята к линии взгляда. На ходу — «по-
       пластунски»: поочерёдно подтягивается согнутая в колене нога,
       таз и плечи покачиваются. */
    const _pr = { Y: new THREE.Vector3(0, 1, 0), q: new THREE.Quaternion(), e: new THREE.Euler(), v: new THREE.Vector3(), h: new THREE.Vector3(), f: new THREE.Vector3() };
    function proneOverlay(s, b, c, CP, e, plant, hips) {
      const PR = root.GLoco.PRONE, ch = s.char;
      const mv = U.clamp01(c.speed / 0.35) * e;
      const ph = c.stepPhase * Math.PI * 2;
      const L = (bn, x, y, z) => {
        const r = b(bn).rotation;
        r.x = U.lerp(r.x, x, e); r.y = U.lerp(r.y, y, e); r.z = U.lerp(r.z, z, e);
      };
      const sw = Math.sin(ph) * mv;
      L('hips', 0.0, sw * 0.10, sw * 0.06);
      L('spine', 0.17, -sw * 0.08, -sw * 0.05);
      L('chest', 0.21 - c.ads * 0.04, -0.06 - sw * 0.06, 0.02);
      const pit = clamp(c.pitch, -0.5, 0.6);
      L('neck', 0.52 + pit * 0.35, 0, 0);
      L('head', 0.50 + pit * 0.55, 0, 0);
      for (const side of [1, -1]) {
        const SS = side > 0 ? 'R' : 'L';
        const u = Math.max(0, Math.sin(ph + (side > 0 ? 0 : Math.PI))) * mv;
        L('hip' + SS, 0.05 + 0.95 * u, side * (0.52 - 0.25 * u), side * (0.16 + 0.42 * u));
        L('knee' + SS, -(0.10 + 1.35 * u), 0, 0);
        L('ankle' + SS, -0.80 + 0.35 * u, side * 0.12, 0);
        L('toe' + SS, 0.25, 0, 0);
        plant[SS] = (plant[SS] === undefined ? 1 : plant[SS]) * (1 - e);
      }
      /* корень: наклон вперёд на 90° и перенос так, чтобы таз лёг в
         точку hipBack позади бойца на высоте hipUp */
      const kPitch = U.smoothstep(U.clamp01((e - 0.05) / 0.9));
      hips.position.x = U.lerp(hips.position.x, 0, e);
      hips.position.z = U.lerp(hips.position.z, 0, e);
      const hp = _pr.v.copy(hips.position);
      _pr.e.set(-Math.PI / 2 * kPitch, c.yaw, 0, 'YXZ');
      ch.root.rotation.copy(_pr.e);
      _pr.q.setFromEuler(_pr.e);
      _pr.f.set(-Math.sin(c.yaw), 0, -Math.cos(c.yaw));
      /* таз стоя/с колена — над точкой бойца; лёжа — позади, у грунта */
      const kBack = U.smoothstep(U.clamp01((e - 0.25) / 0.75));
      const H = _pr.h.set(c.pos.x, c.pos.y + hp.y, c.pos.z);
      const hpW = _pr.v.copy(hips.position).applyAxisAngle(_pr.Y, c.yaw);
      H.x += hpW.x * (1 - kBack); H.z += hpW.z * (1 - kBack);
      H.addScaledVector(_pr.f, -PR.hipBack * kBack);
      H.y = U.lerp(H.y, c.pos.y + PR.hipUp, kBack);
      ch.root.position.copy(H).sub(hp.copy(hips.position).applyQuaternion(_pr.q));
    }

    function poseSoldier(s, dt, isActive, t) {
      const pose = root.GAnimator.pose(s, dt, isActive, t, DMG);
      root.GStumble?.record(s,dt);
      return pose;
    }

    /* --------------------------------------- размещение оружия -------- */
    /* Оружие висит на «виртуальном плече»: точка перед грудью, которая
       следует за взглядом с запаздыванием. Это и есть бодикам-механика:
       ствол всегда чуть отстаёт от поворота головы и качается на шаге. */
    /* Позы оружия — смещение узла оружия от глаз в системе взгляда (м).
       Начало координат модели АК — у затыльника, ствол уходит в -Z, поэтому
       чем меньше |z|, тем ближе оружие прижато к стрелку. Значения подобраны
       так, чтобы приклад лёг в плечо, а цевьё осталось в зоне досягаемости
       опорной руки (проверяется автотестом gripCheck). */
    /* Оружие держится ДАЛЬШЕ от груди, чем было: при z = -0,085 приклад
       упирался в бойца, правая кисть уезжала к плечу и локоть складывался
       до 39°, чего у человека быть не может. Вынос вперёд даёт рабочие
       70–95° в локте (проверяется gripCheck). */
    /* Положение «наготове». Глубина (z) ограничена длиной опорной руки:
       при z ниже -0,13 кисть не достаёт до цевья (расчёт в комментарии к
       bladed stance). Высота -0,30 уводит оружие из поля зрения: при -0,20
       ствол и предплечье перекрывали пол-экрана. */
    const HIP_POSE = {
      pos: new THREE.Vector3(0.125, -0.300, -0.105),
      rot: new THREE.Euler(-0.05, -0.18, 0.06)
    };
    const ADS_POSE = {
      pos: new THREE.Vector3(0, -0.030, -0.060),
      rot: new THREE.Euler(0, 0, 0)
    };
    const PRONE_POSE = {
      pos: new THREE.Vector3(0.085, -0.115, -0.115),
      rot: new THREE.Euler(0.0, -0.06, 0.02)
    };
    const RELOAD_POSE = {
      /* v13: на 9 см дальше от груди — левой кисти со стороны (подсумок,
         горловина, рукоятка затвора) есть место, предплечье не входит в плитник */
      pos: new THREE.Vector3(0.135, -0.365, -0.180),
      /* v14: дуло — вперёд и чуть вниз (≈10°), как учат («муззл в сторону
         цели/в землю перед собой»); было +17° вверх от линии бедра — при
         взгляде со стороны ствол смотрел в небо */
      rot: new THREE.Euler(0.02, -0.42, 0.28)
    };
    /* Строй «на ремне» задаётся не от глаз, а от ГРУДИ — как на референсе:
       автомат лежит поперёк корпуса по диагонали, приклад у правой грудной,
       ствол смотрит к левому колену, правый бок оружия — наружу.
       Точки — места кистей в системе покоя бойца (м): правая на рукоятке
       на уровне нижних рёбер, левая на цевье у пряжки ремня. Оружие ставится
       так, чтобы его точки хвата легли ровно в них, поэтому поза не зависит
       от цевья и длины оружия. out — куда смотрит правый бок оружия. */
    /* right — место ПРАВОГО ЗАПЯСТЬЯ: кисть охватывает пистолетную
       рукоятку, запястье — за ней (см. hands.js).
       Хват рукоятки задаёт продолжение кисти назад-вверх, вдоль приклада.
       При прежней крутой диагонали (ствол на 48° вниз, рукоятка у рёбер)
       оно смотрело вертикально вверх, локоть же висит у бока — запястье
       выламывалось на 94°. Сейчас рукоятка ниже, у пояса, ствол опущен на
       ~28° вниз-влево-вперёд, приклад у правой грудной: предплечье идёт
       вдоль кисти, излом запястья ~23° (правая) и ~21° (левая). */
    /* Строй: «низкая готовность» (compressed low ready). Рукоятка у нижнего
       края плитника, в 30 см перед грудью, приклад поджат к правому боку
       плитника под плечом, ствол смотрит вперёд-вниз-влево под ~35° —
       автомат держат, а не прижимают к животу. */
    /* v14: низкая готовность как на фото подразделений: рукоятка у правого
       бедра (на уровне ремня), приклад вдоль правого бока, ствол вперёд-
       влево и вниз ~35°; правый локоть опущен вдоль корпуса, а не торчит
       в сторону («куриное крыло» — кисть была у живота, на 12 см выше и
       на 6 см дальше вперёд: при длине плеча и предплечья локоть уходил
       наружу на 53°, теперь ~19°). */
    /* Поза покоя: локти вдоль корпуса, автомат по диагонали вниз.
       Проверена отдельно на четырёх размерах бойца. Для фиксированной
       передней рукоятки правое запястье немного выше и дальше от плитника:
       левую кисть нельзя «сдвинуть к магазину» вместе с рукояткой. */
    const SLING = {
      right: new THREE.Vector3(0.159, 1.050, -0.220),
      barrel: new THREE.Vector3(-0.640, -0.600, -0.640),
      out: new THREE.Vector3(0.675, -0.065, -0.735)
    };
    const PISTOL_CARRY = {right:new THREE.Vector3(.12,1.15,-.32),barrel:new THREE.Vector3(0,-.48,-.88),out:new THREE.Vector3(1,0,0)};
    const SLING_FIXED = {
      right: new THREE.Vector3(0.160, 1.120, -0.300),
      barrel: new THREE.Vector3(-0.900, -0.550, -0.150),
      out: new THREE.Vector3(0.675, -0.065, -0.735)
    };
    /* Бег: автомат прижат к груди стволом вниз — дуло смотрит в землю
       перед левой ногой, приклад у правой грудной. Так бегут с оружием
       (low ready): ствол никуда не направлен и не мешает ногам. */
    const SPRINT = {
      right: new THREE.Vector3(0.145, 1.220, -0.285),
      barrel: new THREE.Vector3(-0.18, -0.58, -0.80),
      out: new THREE.Vector3(0.94, 0.08, -0.28)
    };
    /* С колена, оружие не вскинуто: рукоятка перед правым бедром, цевьё
       между коленями, ствол вперёд-влево и вниз под ~22° — дуло в 0,7 м
       впереди на высоте ~0,3 м, а не в земле у ботинка. */
    /* v16: на колене правый локоть торчал вбок на 33° (кисть стояла
       перед бедром выставленной ноги, автомат был развёрнут стволом почти
       прямо вперёд — правой руке приходилось обходить бедро снаружи).
       Теперь рукоятка у правого бока на уровне ремня, ствол вперёд-влево
       (~42°) и вниз (~16°) — поперёк выставленного колена, как в «low
       ready» с колена: отведение плеча 33° → 15°, излом кисти 43° → 21°,
       оружие не входит ни в корпус, ни в бедро (замеры на 4 бойцах). */
    const KNEEL = {
      right: new THREE.Vector3(0.191, 1.066, -0.236),
      barrel: new THREE.Vector3(-0.640, -0.276, -0.717),
      out: new THREE.Vector3(0.735, 0.054, -0.676)
    };
    root.__AEGIS_CARRY = { SLING, SPRINT, KNEEL };
    const _mixSpec = { right: new THREE.Vector3(), barrel: new THREE.Vector3(), out: new THREE.Vector3() };
    function mixSpec(A, B, k) {
      _mixSpec.right.lerpVectors(A.right, B.right, k);
      _mixSpec.barrel.lerpVectors(A.barrel, B.barrel, k);
      _mixSpec.out.lerpVectors(A.out, B.out, k);
      return _mixSpec;
    }
    const _sl = {
      m: new THREE.Matrix4(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(),
      a: new THREE.Vector3(), c: new THREE.Vector3(), r: new THREE.Vector3()
    };
    /* Точка хвата в системе узла оружия (w.root) — та же, что берёт риг. */
    function gripLocal(w, G, side, out) {
      const node = w.gun.getObjectByName(G.node) || w.gun;
      w.root.updateMatrixWorld(true);
      const inv = _sl.m.copy(w.root.matrixWorld).invert();
      out.setFromMatrixPosition(node.matrixWorld).applyMatrix4(inv);
      const rel = _sl.q2.copy(w.root.getWorldQuaternion(_sl.q)).invert()
        .multiply(w.gun.getWorldQuaternion(new THREE.Quaternion()));
      return out.add(_sl.a.set(G.offset[0] * side, G.offset[1], G.offset[2]).applyQuaternion(rel));
    }
    /* Точка правого запястья в системе w.root — та же, что ставит риг. */
    /* Точка правого запястья в системе w.root — по хвату спеки оружия. */
    const _wl = new THREE.Matrix4();
    function wristLocal(s, out) {
      const w = s.gun, sp = s.wspec;
      if (!sp || !sp.rightGrip || !s.char.hands) return gripLocal(w, RIG.GRIP.right, 1, out);
      w.root.updateMatrixWorld(true);
      const gw = _wl.copy(w.gun.matrixWorld).multiply(sp.rightGrip);
      return out.setFromMatrixPosition(gw).applyMatrix4(_sl.m.copy(w.root.matrixWorld).invert());
    }
    function slingCarry(s, spec) {
      const SP = spec || SLING;
      const w = s.gun, chest = s.char.bone('chest'), rest = s.char.rest.chest;
      /* v20: к этому моменту поддерево груди уже пересчитано позой (проверено:
         0 расхождений на 5584 вызовах) — достаточно цепочки предков, без
         ~120 костей рук и пальцев */
      chest.updateWorldMatrix(true, false);
      const R = SP.right;
      const KS = s.char.scale || 1;
      const RH = chest.localToWorld(_sl.c.set(R.x * KS - rest[0], R.y * KS - rest[1], R.z * KS - rest[2])).clone();
      const cq = chest.getWorldQuaternion(new THREE.Quaternion());
      const rL = wristLocal(s, _sl.r);
      /* базис (ствол, правый бок) оружия -> тот же базис в системе груди */
      const basis = (f, x) => {
        f.normalize();
        x.addScaledVector(f, -x.dot(f)).normalize();
        return new THREE.Matrix4().makeBasis(f, x, new THREE.Vector3().crossVectors(f, x));
      };
      const Bl = basis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0));
      const Bw = basis(SP.barrel.clone().applyQuaternion(cq), SP.out.clone().applyQuaternion(cq));
      const quat = new THREE.Quaternion().setFromRotationMatrix(Bw.multiply(Bl.invert()));
      const pos = RH.sub(rL.clone().applyQuaternion(quat));
      return { pos, quat };
    }

    /* v25: «автомат на ремень». Спокойный боец со стороны (не управляемый,
       без тревоги, не на колене, не бежит, не перезаряжается) через
       несколько секунд вешает длинноствольное оружие на правое плечо
       стволом вверх, магазином назад; правая кисть держит ремень у груди.
       Так делает не каждый: привычка от idleSeed — примерно половина.
       Ход: с ремня поднять оружие стволом вверх перед правым плечом (PORT,
       кисти на оружии), обвести снаружи плеча за спину (ствол поворачивается
       вокруг вертикали, магазин всё время смотрит наружу дуги), отпустить.
       Обратно — те же фазы быстрее. Точки — в системе покоя бойца
       (x вправо, y вверх, −z вперёд), как у SLING. */
    const PORT = {
      right: new THREE.Vector3(0.190, 0.985, -0.300),
      barrel: new THREE.Vector3(0.06, 1, 0.10),
      out: new THREE.Vector3(1, 0, 0)
    };
    const SHOULDER = {
      at: new THREE.Vector3(0.215, 1.370, 0.150),    // точка ствола на доле frac от дульного среза
      barrel: new THREE.Vector3(0.06, 1, 0.07),
      out: new THREE.Vector3(-1, 0, 0.04),
      frac: 0.40,
      top: new THREE.Vector3(0.165, 1.548, -0.012),   // ремень через трапецию
      side: new THREE.Vector3(0.205, 1.120, 0.020)    // ремень под мышкой к затыльнику
    };
    root.__AEGIS_CARRY.PORT = PORT; root.__AEGIS_CARRY.SHOULDER = SHOULDER;
    const _sh = { f: new THREE.Vector3(), Al: new THREE.Vector3(), At: new THREE.Vector3(), Ap: new THREE.Vector3(),
      A: new THREE.Vector3(), rt: new THREE.Vector3(), up: new THREE.Vector3(), cq: new THREE.Quaternion(),
      qS: new THREE.Quaternion(), qb: new THREE.Quaternion(), q: new THREE.Quaternion(), qy: new THREE.Quaternion(),
      m: new THREE.Matrix4(), Bl: null, x: new THREE.Vector3(), z: new THREE.Vector3() };
    /* поворот оружия: ствол (−Z узла) по f, правый бок (+X узла) по x — в системе груди cq */
    function carryQuat(cq, f, x, out) {
      const F = _sh.z.copy(f).applyQuaternion(cq).normalize();
      const X = _sh.x.copy(x).applyQuaternion(cq);
      X.addScaledVector(F, -X.dot(F)).normalize();
      /* −Y узла = F × X (см. basis в slingCarry) */
      const Y = new THREE.Vector3().crossVectors(X, F);
      return out.setFromRotationMatrix(_sh.m.makeBasis(X, Y, F.negate()));
    }
    /* габарит оружия вдоль ствола в системе w.root — один раз на экземпляр */
    function gunBox(w) {
      if (w._shBox) return w._shBox;
      w.root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(w.root.matrixWorld).invert(), bb = new THREE.Box3(), tb = new THREE.Box3(), m4 = new THREE.Matrix4();
      w.gun.traverse((m) => {
        if (!m.isMesh || !m.geometry || m.userData.lodProxy) return;
        const g = m.userData.lodBase || m.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        tb.copy(g.boundingBox).applyMatrix4(m4.multiplyMatrices(inv, m.matrixWorld)); bb.union(tb);
      });
      const mz = w.gun.localToWorld(w.muzzleLocal.clone()).applyMatrix4(inv);
      const zm = Math.min(mz.z, bb.isEmpty() ? mz.z : bb.min.z), zb = bb.isEmpty() ? 0.25 : bb.max.z;
      return (w._shBox = { zm, zb, y0: mz.y, len: Math.max(0.3, zb - zm) });
    }
    function shoulderStep(s, dt, isActive, pose) {
      const c = s.ctrl, sp = s.wspec, F0 = root.__SH_FORCE;
      if (c._balanceBusy || (s._balance && (s._balance.down || s._balance.recovering))) { if (s._shK) shoulderReset(s); return 0; }
      const pref = F0 !== undefined ? F0 : ((((s.idleSeed || 0) * 7.31) % 1) < 0.5 ? 1 : 0);
      const calm = !isActive && !!pref && !!sp && sp.fam !== 'pistol' && !!s.gun && !s.dead && !s.hr && !s.rd &&
        (c.ready || 0) < 0.06 && !((c.aiReady || 0) > 0) && c.reload < 0 && !((c.crouch || 0) > 0.1) && !((c.prone || 0) > 0.05) &&
        !c.vault && !((c.sprint || 0) > 0.15) && !(s.thr && (s.thr.mode || s.thr.cover > 0.3)) && !s._tacHands &&
        !(s.life && s.life.alert > 0.12) && !(c.pump >= 0) && !c.treating && !c.dragging &&
        !(pose && pose.crouch && pose.crouch.k > 0.1) && !(root.GMG && root.GMG.isMounted && root.GMG.isMounted(s));
      s._shT = calm ? (s._shT || 0) + dt : 0;
      const go = calm && s._shT > (F0 ? 0 : 4);
      s._shK = U.clamp01((s._shK || 0) + (go ? dt / 1.4 : -dt / 0.55));
      if (s._shK <= 0) { s._shB = 0; s._shHR = 0; s._shHL = 0; }
      return s._shK;
    }
    function shoulderCarry(s, u, c) {
      const w = s.gun, chest = s.char.bone('chest'), rest = s.char.rest.chest, KS = s.char.scale || 1;
      const a = U.smoothstep(U.clamp01(u / 0.45)), b = U.smoothstep(U.clamp01((u - 0.45) / 0.55));
      s._shB = b;
      s._shHL = U.smoothstep(U.clamp01(b / 0.45));
      s._shHR = U.smoothstep(U.clamp01((b - 0.25) / 0.55));
      const port = slingCarry(s, PORT);
      if (b <= 0) {
        w.root.position.lerp(port.pos, a);
        w.root.quaternion.slerp(port.quat, a);
        return;
      }
      const B = gunBox(w);
      const cq = chest.getWorldQuaternion(_sh.cq);
      /* шаг: оружие на ремне качается маятником */
      const spd = Math.min(1, (s.motion?.speed ?? c.speed ?? 0) / 2);
      const ph = (s.motion?.phase ?? c.stepPhase ?? 0) * Math.PI * 2;
      const f = _sh.f.copy(SHOULDER.barrel);
      f.x += Math.sin(ph) * 0.05 * spd; f.z += Math.cos(ph * 2) * 0.035 * spd;
      const qS = carryQuat(cq, f, SHOULDER.out, _sh.qS);
      const Al = _sh.Al.set(0, B.y0, B.zm + SHOULDER.frac * B.len);
      const T = SHOULDER.at;
      const At = chest.localToWorld(_sh.At.set(T.x * KS - rest[0], T.y * KS - rest[1], T.z * KS - rest[2]));
      const Ap = _sh.Ap.copy(Al).applyQuaternion(port.quat).add(port.pos);
      const rt = _sh.rt.set(1, 0, 0).applyQuaternion(cq), up = _sh.up.set(0, 1, 0).applyQuaternion(cq);
      const A = _sh.A.lerpVectors(Ap, At, b).addScaledVector(rt, 0.2 * KS * Math.sin(Math.PI * b));
      const qb = _sh.qb.setFromAxisAngle(up, Math.PI).multiply(qS);
      const q = _sh.q.slerpQuaternions(port.quat, qb, b).premultiply(_sh.qy.setFromAxisAngle(up, -Math.PI * b));
      w.root.quaternion.copy(q);
      w.root.position.copy(A).sub(Al.applyQuaternion(q));
      if (root.__SH_DBG) s._shDbg = { At: At.toArray(), A: A.toArray(), pos: w.root.position.toArray(), b };
    }
    /* Руки: удержание оружия (IK) -> правая кисть на ремне, левая по шву.
       Смешение по костям рук, веса _shHR/_shHL. */
    const SH_BONES = ['clav', 'shoulder', 'armTwist', 'elbow', 'foreTwist', 'wrist'];
    function shoulderArmsBegin(s) {
      const sv = s._shSave || (s._shSave = { clav: { R: new THREE.Quaternion(), L: new THREE.Quaternion() },
        R: SH_BONES.map(() => new THREE.Quaternion()), L: SH_BONES.map(() => new THREE.Quaternion()) });
      for (const SS of ['R', 'L']) { const cb = s.char.bone('clav' + SS); if (cb) sv.clav[SS].copy(cb.quaternion); }
    }
    function shoulderArmsEnd(s, full, poseDt, t) {
      const sv = s._shSave, hR = s._shHR || 0, hL = s._shHL || 0, rig = s.rig;
      if (!full) for (const SS of ['R', 'L']) SH_BONES.forEach((n, j) => { const b = s.char.bone(n + SS); if (b) sv[SS][j].copy(b.quaternion); });
      for (const SS of ['R', 'L']) { const cb = s.char.bone('clav' + SS); if (cb) { cb.quaternion.copy(sv.clav[SS]); cb.updateMatrixWorld(true); } }
      const c = s.ctrl, sp = Math.min(1.5, (s.motion?.speed ?? c.speed ?? 0) / 2.5);
      s._armSwing = U.damp(s._armSwing || 0, Math.sin((s.motion?.phase ?? c.stepPhase ?? 0) * Math.PI * 2) * sp, 18, poseDt);
      rig.strapK = 1;
      rig.relaxArms(s._armSwing, Math.sin(t * 0.9 + s.idleSeed) * 0.02, s.motion?.run ?? root.GAnimator.runK(c), s.motion);
      rig.strapK = 0;
      if (!full) {
        for (const SS of ['R', 'L']) {
          const h = SS === 'R' ? hR : hL;
          if (h >= 0.999) continue;
          SH_BONES.forEach((n, j) => { const b = s.char.bone(n + SS); if (b) b.quaternion.slerpQuaternions(sv[SS][j], b.quaternion.clone(), h); });
          const cb = s.char.bone('clav' + SS); if (cb) cb.updateMatrixWorld(true);
          const H = s.char.hands && s.char.hands[SS], HP = rig.handPoses && rig.handPoses[SS];
          if (H && HP && h < 0.5) H.setPose(HP);
        }
      }
      shoulderStrap(s, (s._shB || 0) > 0.55);
    }
    /* Ремень: лента из пяти точек — передняя антабка, трапеция, кулак,
       бок под мышкой, задняя антабка. Одна сетка на оружие, в системе w.root. */
    const _st = { p: [0, 1, 2, 3, 4].map(() => new THREE.Vector3()), n: new THREE.Vector3(), tg: new THREE.Vector3(), bn: new THREE.Vector3(),
      c: new THREE.Vector3(), inv: new THREE.Matrix4(), v: new THREE.Vector3(), mat: null };
    function shoulderStrap(s, on, noFist) {
      const w = s.gun;
      if (!w) return;
      let st = w._strap;
      if (!on) { if (st) st.visible = false; return; }
      if (!st) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
        g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
        const idx = []; for (let i = 0; i < 4; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        g.setIndex(idx);
        _st.mat = _st.mat || new THREE.MeshStandardMaterial({ color: 0x3b3a2c, roughness: 0.93, metalness: 0, side: THREE.DoubleSide });
        st = w._strap = new THREE.Mesh(g, _st.mat);
        st.name = 'shoulderStrap'; st.frustumCulled = false; st.castShadow = false; st.receiveShadow = true;
        st.userData.lodProxy = true; st.userData.noTrace = true; st.userData.noImpact = true; st.userData.noBatch = true;
        w.root.add(st);
      }
      st.visible = true;
      const B = gunBox(w), chest = s.char.bone('chest'), rest = s.char.rest.chest, KS = s.char.scale || 1;
      w.root.updateMatrixWorld(true);
      const inv = _st.inv.copy(w.root.matrixWorld).invert();
      const toLoc = (v) => v.applyMatrix4(inv);
      const P = _st.p;
      /* антабки: слева по ходу ствола (наружу от бойца), у мушки и у затыльника */
      P[0].set(-0.024, B.y0 - 0.006, B.zm + 0.2 * B.len);
      const cs = (v, o) => toLoc(chest.localToWorld(o.set(v.x * KS - rest[0], v.y * KS - rest[1], v.z * KS - rest[2])));
      cs(SHOULDER.top, P[1]);
      /* кулак: от запястья вдоль кисти (−X кости у правой) */
      cs(SHOULDER.side, P[3]);
      if (noFist) P[2].lerpVectors(P[1], P[3], 0.5);   /* v25: руки заняты (перелаз) — ремень прямо по груди */
      else {
        const wr = s.char.bone('wristR');
        wr.updateWorldMatrix(true, false);
        const wp = wr.getWorldPosition(_st.v), hx = _st.c.set(-1, 0, 0).transformDirection(wr.matrixWorld);
        P[2].copy(wp).addScaledVector(hx, 0.07 * KS); toLoc(P[2]);
      }
      P[4].set(-0.026, B.y0 - 0.035, B.zb - 0.12 * B.len);
      const pos = st.geometry.attributes.position, nor = st.geometry.attributes.normal;
      /* нормаль ленты — от оси корпуса наружу; ширина — поперёк */
      const cc = toLoc(chest.getWorldPosition(_st.c));
      const HW = 0.016 * KS;
      for (let i = 0; i < 5; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(4, i + 1)];
        const tg = _st.tg.subVectors(b, a).normalize();
        const n = _st.n.subVectors(P[i], cc); n.addScaledVector(tg, -n.dot(tg));
        if (n.lengthSq() < 1e-8) n.set(1, 0, 0); n.normalize();
        const bn = _st.bn.crossVectors(tg, n).normalize();
        pos.setXYZ(i * 2, P[i].x + bn.x * HW, P[i].y + bn.y * HW, P[i].z + bn.z * HW);
        pos.setXYZ(i * 2 + 1, P[i].x - bn.x * HW, P[i].y - bn.y * HW, P[i].z - bn.z * HW);
        nor.setXYZ(i * 2, n.x, n.y, n.z); nor.setXYZ(i * 2 + 1, n.x, n.y, n.z);
      }
      pos.needsUpdate = true; nor.needsUpdate = true;
    }
    function shoulderReset(s) {
      s._shK = 0; s._shT = 0; s._shB = 0; s._shHR = 0; s._shHL = 0;
      if (s.gun && s.gun._strap) s.gun._strap.visible = false;
    }
    /* v25: перелаз через высокую ограду — обе руки заняты кромкой, оружие
       закинуто за правое плечо стволом вверх (поза SHOULDER, ремень через
       трапецию, без кулака). Раньше оно висело поперёк груди стволом вперёд
       и на подтягивании протыкало доски. Вход/выход — плавно по доле перелаза. */
    function climbSling(s) {
      const w = s.gun, v = s.ctrl.vault;
      if (!w || !v || !v.dur) return;
      const u = U.clamp01(v.t / v.dur);
      const k = U.smoothstep(U.clamp01((u - 0.02) / 0.12)) * (1 - U.smoothstep(U.clamp01((u - 0.86) / 0.1)));
      if (k <= 0) { if (w._strap) w._strap.visible = false; return; }
      const chest = s.char.bone('chest'), rest = s.char.rest.chest, KS = s.char.scale || 1, B = gunBox(w);
      chest.updateWorldMatrix(true, false);
      const cq = chest.getWorldQuaternion(_sh.cq);
      const qS = carryQuat(cq, SHOULDER.barrel, SHOULDER.out, _sh.qS);
      const T = SHOULDER.at;
      const At = chest.localToWorld(_sh.At.set(T.x * KS - rest[0], T.y * KS - rest[1], T.z * KS - rest[2]));
      const Al = _sh.Al.set(0, B.y0, B.zm + SHOULDER.frac * B.len).applyQuaternion(qS);
      const P = _sh.Ap.copy(At).sub(Al);
      /* по дуге снаружи плеча: от груди вбок и за спину */
      const rt = _sh.rt.set(1, 0, 0).applyQuaternion(cq);
      w.root.position.lerp(P, k).addScaledVector(rt, 0.16 * KS * Math.sin(Math.PI * Math.min(1, k)) * (k < 1 ? 1 : 0));
      w.root.quaternion.slerp(qS, k);
      w.root.updateMatrixWorld(true);
      shoulderStrap(s, k > 0.6, true);
    }

    /* Ось прицеливания АК-74 по обмеру модели: целик и мушка на y=116 мм.
       Чтобы в прицеле мушка легла в прорезь, глаз ставится на продолжение
       этой линии позади целика. */
    const IRON = {
      rear: new THREE.Vector3(0, 0.116, -0.2485),
      front: new THREE.Vector3(0, 0.116, -0.626),
      /* Вынос глаза за целик, м. Реальный вынос на АК — около 0,30 м. */
      relief: 0.300,
      /* Небольшой подъём глаза над прицельной линией: щека лежит на гребне
         приклада, а взгляд идёт чуть сверху через прорезь целика. */
      rise: 0.010
    };
    /* Дистанция сведения ствола с линией взгляда, м. Соответствует
       постоянному прицелу АК-74: на этой дальности пуля идёт точно в точку
       прицеливания. */
    const CONVERGE = 100;

    function placeWeapon(s, dt, isActive, camPos, camQuat, pose) {
      const c = s.ctrl, w = s.gun;
      const moveAmt = pose.moveAmt;

      /* Инерция наводки: сглаженные yaw/pitch отстают от реальных. */
      c.lagYaw = U.dampAngle(c.lagYaw, c.yaw, U.lerp(11, 20, c.ads), dt);
      c.lagPitch = U.damp(c.lagPitch, c.pitch, U.lerp(12, 22, c.ads), dt);

      /* смесь póz: бедро -> прицел, плюс спринт и перезарядка */
      const kAds = U.smoothstep(c.ads);
      const kSprint = U.smoothstep(c.sprint);
      const kReload = c.reload >= 0 ? U.smoothstep(U.clamp01(c.reload / 0.25)) *
        U.smoothstep(U.clamp01((((c.reloadPlan && c.reloadPlan.dur) || (c.reloadWasEmpty ? 3.05 : 2.45)) - c.reload) / 0.3)) : 0;

      /* Неуправляемый боец стоит в положении «на ремне», управляемый —
         держит оружие наготове. Переход плавный: сглаженная величина ready
         живёт в контроллере и меняется при захвате/освобождении. */
      /* боец со стороны поднимает оружие сам, когда встревожен (life.js) */
      c.ready = U.damp(c.ready === undefined ? (isActive ? 1 : 0) : c.ready,
        isActive ? 1 : Math.max(c.aiReady || 0, c.reload >= 0 ? 1 : 0), isActive ? 6 : (c.reload >= 0 ? 6 : 3.4), dt);
      /* v13: на перезарядке боец со стороны поднимает оружие к груди —
         горловина в рабочей зоне, левой кисти есть куда вставлять магазин */
      const kReady = U.smoothstep(c.ready);
      /* строй «на ремне» подмешивается в конце (slingCarry), от груди */
      const p = new THREE.Vector3().copy(HIP_POSE.pos);
      const r = new THREE.Euler(HIP_POSE.rot.x, HIP_POSE.rot.y, HIP_POSE.rot.z);
      const mixPose = (target, k) => {
        if (k <= 0.001) return;
        p.lerp(target.pos, k);
        r.x = U.lerp(r.x, target.rot.x, k);
        r.y = U.lerp(r.y, target.rot.y, k);
        r.z = U.lerp(r.z, target.rot.z, k);
      };
      mixPose(ADS_POSE, kAds);
      /* спринт больше не крутит оружие от глаз (дуло уходило вправо):
         его поза — от груди, см. SPRINT ниже */
      mixPose(RELOAD_POSE, kReload * (1 - kAds));
      /* лёжа оружие выше: иначе «бедро» уходит в грунт */
      mixPose(PRONE_POSE, (s._proneK || 0) * (1 - kAds) * (1 - kReload));

      /* покачивание от шага: оружие ходит по «восьмёрке» */
      const bob = U.lerp(0.9, 0.22, kAds) * (1 - kSprint * 0.3);
      p.x += Math.sin(c.bobPhase) * 0.017 * moveAmt * bob;
      p.y += Math.sin(c.bobPhase * 2 + 0.5) * 0.013 * moveAmt * bob;
      p.z += Math.sin(c.bobPhase * 2) * 0.008 * moveAmt * bob;

      /* дыхание: медленное плавание ствола, заметное в прицеле */
      const brAmp = U.lerp(0.0016, 0.0075, 1 - c.stamina / c.PHYS.staminaMax) * U.lerp(1, 1.5, kAds);
      p.x += Math.sin(c.breathT * 0.9) * brAmp;
      p.y += Math.sin(c.breathT * 1.5 + 1.1) * brAmp * 1.3;

      /* инерция поворота: ствол «отстаёт» и качается */
      const lagY = U.wrapPI(c.lagYaw - c.yaw);
      const lagP = c.lagPitch - c.pitch;
      r.y += clamp(lagY * U.lerp(1.5, 0.45, kAds), -0.5, 0.5);
      r.x += clamp(-lagP * U.lerp(1.2, 0.35, kAds), -0.4, 0.4);
      r.z += clamp(lagY * U.lerp(1.1, 0.25, kAds), -0.35, 0.35);
      p.x += clamp(-lagY * 0.10, -0.05, 0.05);
      p.y += clamp(lagP * 0.06, -0.04, 0.04);

      /* наклон корпуса Q/E */
      r.z += c.lean * 0.10;
      p.x += c.lean * 0.035;

      /* осмотр оружия (V): поворот в руках */
      if (c.inspect >= 0) {
        const u = U.clamp01(c.inspect / 2.3);
        const env = Math.sin(Math.PI * u);
        r.y += env * 0.95;
        r.z += env * 0.55;
        r.x += env * 0.30;
        p.y += env * 0.045;
        p.z += env * 0.075;
      }

      /* В прицеле «характерные» углы удержания почти полностью гасятся:
         приклад в плече, щека на гребне — оружие жёстко зафиксировано.
         Остаётся лишь малая доля, чтобы дыхание и шаг всё же читались. */
      if (kAds > 0.001) {
        const keep = U.lerp(1, 0.10, kAds);
        r.x *= keep; r.y *= keep; r.z *= keep;
      }

      /* --- итоговый трансформ в мировых координатах --- */
      /* База: точка глаз бойца с его ориентацией взгляда. */
      /* «низкая готовность»: ствол опущен на ~25–30° от линии взгляда */
      const dipP = isActive ? 0 : (c.aimDip || 0);
      const eyeQ = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(c.pitch - dipP, c.yaw, c.lean * -0.10, 'YXZ'));
      const eyePos = eyePosition(s);

      /* Базис УДЕРЖАНИЯ отличается от базиса ВЗГЛЯДА.

         Раньше оружие подвешивалось прямо к взгляду, поэтому при наклоне
         головы вниз оно ныряло внутрь бойца: игрок смотрел под ноги и видел
         ствол, торчащий из собственной груди.

         У человека так не бывает: голова поворачивается в шее свободно, а
         оружие держат РУКИ, привязанные к корпусу. Корпус доворачивается
         вслед за взглядом лишь частично и в ограниченном диапазоне. Поэтому
         от бедра берём долю наклона, а в прицеле — полный: там щека на
         прикладе, и голова с оружием действительно составляют одно целое. */
      const carryPitch = U.lerp(
        clamp(c.pitch * 0.42, -0.42, 0.34), c.pitch, U.smoothstep(kAds)) - dipP * 0.35;
      const holdBaseQ = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(carryPitch, c.yaw, c.lean * -0.10, 'YXZ'));

      /* Сведение оружия.
         Ствол вынесен вправо-вниз от глаза, поэтому если просто повернуть
         его параллельно взгляду, пули уйдут мимо точки прицеливания. Как и
         на реальном оружии, ось канала ствола сводится со линией взгляда на
         дистанции пристрелки: тогда куда смотрю — туда и попадаю, а сама
         модель остаётся правдоподобно смещённой.

         Углы позы (r) после этого — только «характер» удержания: увод от
         инерции, покачивание, наклон. Разворот на 15° вбок, из-за которого
         пули летели криво, больше не применяется к оси ствола. */

      /* Ориентация удержания. В прицеле углы «характера» гасятся: оружие
         должно встать ровно по линии взгляда, иначе целик уедет вбок. */
      const holdQ = holdBaseQ.clone().multiply(new THREE.Quaternion().setFromEuler(
        new THREE.Euler(r.x, r.y, r.z, 'YXZ')));
      w.root.quaternion.copy(holdQ);

      /* Положение. От бедра — заданное смещение от глаза. В прицеле
         считаем иначе: берём точку выноса глаза на оси целик-мушка и
         двигаем оружие так, чтобы она совпала с глазом. Смещение
         поворачивается УЖЕ СОБРАННЫМ кватернионом оружия — раньше здесь
         стоял кватернион взгляда, и остаточный поворот позы уводил целик
         в сторону (те самые 1,9°). */
      /* Точка подвеса тоже считается в базисе удержания: иначе оружие
         осталось бы висеть перед глазами и «ездило» бы по экрану. */
      const hipPos = eyePos.clone().add(p.clone().applyQuaternion(holdBaseQ));
      let worldPos = hipPos;
      if (kAds > 0.001) {
        const axis = new THREE.Vector3().subVectors(IRON.rear, IRON.front).normalize();
        const eyeLocal = IRON.rear.clone().addScaledVector(axis, IRON.relief);
        eyeLocal.y += IRON.rise;
        const adsPos = eyePos.clone()
          .sub(eyeLocal.clone().applyQuaternion(w.root.quaternion));
        if(s.wspec?.fam==='pistol'&&s.wspec.rightGrip){
          // A handgun has no shoulder stock: the rifle eye-relief transform
          // puts its grip beside the face and folds the forearm through the vest.
          // Anchor the actual trigger wrist in front of the chest instead.
          w.root.updateMatrixWorld(true);
          const gripWorld=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(w.gun.matrixWorld,s.wspec.rightGrip));
          const gripOffset=gripWorld.sub(w.root.position);
          adsPos.copy(eyePos).add(new THREE.Vector3(.015,-.12,-.46).applyQuaternion(eyeQ)).sub(gripOffset);
        }
        worldPos = hipPos.lerp(adsPos, kAds);
      }
      w.root.position.copy(worldPos);
      w.root.updateMatrixWorld(true);

      /* ...а затем доворачиваем оружие так, чтобы ствол смотрел в точку
         сведения на линии взгляда. Доворот считается от фактического
         положения дульного среза, поэтому работает при любой позе. */
      const conv = !isActive && s.combatAim?.point
        ? new THREE.Vector3().copy(s.combatAim.point)
        : eyePos.clone().addScaledVector(
          new THREE.Vector3(0, 0, -1).applyQuaternion(eyeQ), CONVERGE);
      const muzzleW = w.gun.localToWorld(w.muzzleLocal.clone());
      const wantDir = conv.clone().sub(muzzleW).normalize();
      const curDir = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(w.gun.getWorldQuaternion(new THREE.Quaternion())).normalize();
      /* от бедра сводим лишь частично: оружие у пояса и не должно выглядеть
         «вклеенным» в центр экрана, а в прицеле — точно по оси */
      const aimK = U.lerp(0.82, 1.0, kAds) * kReady;
      const align = new THREE.Quaternion().setFromUnitVectors(curDir, wantDir);
      if (aimK < 1) {
        align.slerp(new THREE.Quaternion(), 1 - aimK);
      }
      /* Предел доворота от бедра.

         Сведение тянет ствол в точку прицеливания, и без ограничителя оно
         возвращало ровно ту проблему, ради которой оружие сняли со взгляда:
         глядя под ноги, боец доворачивал ствол на 70° вниз и загонял его
         себе в грудь. Человек так не делает — он опускает голову, а оружие
         остаётся перед корпусом. Поэтому от бедра доворот ограничен 14°;
         в прицеле ограничение снимается, там ствол обязан стоять точно по
         линии прицеливания. */
      const maxTurn = U.lerp(0.25, Math.PI, U.smoothstep(kAds));
      const turn = 2 * Math.acos(clamp(Math.abs(align.w), -1, 1));
      if (turn > maxTurn) align.slerp(new THREE.Quaternion(), 1 - maxTurn / turn);
      w.root.quaternion.premultiply(align);

      if (kReady < 0.999) {
        const kKn = pose && pose.crouch ? pose.crouch.k * (1 - pose.crouch.m) : 0;
        const carry = s.wspec?.fam==='pistol'?PISTOL_CARRY:s.wspec && s.wspec.foregrip ? SLING_FIXED : SLING;
        const sc = slingCarry(s, kKn > 0.001 ? mixSpec(carry, KNEEL, kKn) : carry);
        w.root.position.lerp(sc.pos, 1 - kReady);
        w.root.quaternion.slerp(sc.quat, 1 - kReady);
      }
      /* бег: ствол вниз, автомат пружинит в такт шагам */
      const kSpr = kSprint * (1 - kAds) * kReady * (1 - kReload);
      if (kSpr > 0.001) {
        const sc = slingCarry(s, SPRINT);
        const ph = c.bobPhase;
        sc.quat.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
          Math.sin(ph * 2 + 0.6) * 0.045, Math.sin(ph + 0.3) * 0.035, Math.sin(ph) * 0.03)));
        sc.pos.y += Math.sin(ph * 2 + 1.1) * 0.012;
        w.root.position.lerp(sc.pos, kSpr);
        w.root.quaternion.slerp(sc.quat, kSpr);
      }

      /* v25: «автомат на ремень» — см. shoulderCarry */
      const kSh = shoulderStep(s, dt, isActive, pose);
      if (kSh > 0.001) shoulderCarry(s, kSh, c);
      /* жесты с оружием (перехват, осмотр, ремень): смещение в системе
         корпуса и поворот вокруг узла оружия — руки идут следом через IK */
      if (!isActive && s.life && kSh < 0.999) {
        const LO = s.life.out, gk = 1 - kSh;
        if (LO.gunP.lengthSq() > 1e-10 || LO.gunR.lengthSq() > 1e-10) {
          w.root.position.add(_v.copy(LO.gunP).multiplyScalar(gk).applyQuaternion(s.char.root.quaternion));
          w.root.quaternion.multiply(_q.setFromEuler(new THREE.Euler(LO.gunR.x * gk, LO.gunR.y * gk, LO.gunR.z * gk, 'YXZ')));
        }
      }
      /* удар пули (damage.js): оружие поворачивается вместе с корпусом
         вокруг поясницы и проседает с тазом — руки не вытягиваются к
         оставшемуся на месте автомату; попадание в руку роняет ствол */
      if (s.hr && s.hr.o) {
        const J = s.hr.o;
        const piv = s.char.bone('spine').getWorldPosition(new THREE.Vector3());
        const rq = s.char.root.quaternion;
        const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(J.bx * 0.85, J.tw * 0.9, J.rl * 0.8, 'YXZ'));
        const Qw = rq.clone().multiply(dq).multiply(rq.clone().invert());
        w.root.position.sub(piv).applyQuaternion(Qw).add(piv);
        w.root.position.y -= J.dip;
        w.root.quaternion.premultiply(Qw);
        if (Math.abs(J.gun) > 1e-4) {
          w.root.position.y -= J.gun * 0.12;
          w.root.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), -J.gun * 1.3));
        }
      }
      /* Отдача самого оружия: отход назад по оси ствола, подброс и увод.
         Это видимая часть; вторая часть отдачи уходит в угол взгляда
         (см. P.fire) — именно она сбивает прицел при очереди. */
      /* v7: баллистическая тень — положение ствола по старой модели отдачи;
         по нему shootRay считает направление пули (баланс не меняется) */
      (w._balPos || (w._balPos = new THREE.Vector3())).copy(w.root.position);
      (w._balQ || (w._balQ = new THREE.Quaternion())).copy(w.root.quaternion);
      w._balRec = w._balRec || [0, 0, 0, 0];
      w._balRec[0] = c.recoilBack.x; w._balRec[1] = c.recoil.x * 0.85; w._balRec[2] = c.recoilYaw.x * 0.6; w._balRec[3] = c.recoilYaw.x * 1.1;
      if (!w._gl && root.GGloom) { root.GGloom.markTree(w.root, 0.6, 0.25); w._gl = 1; }
      const VR = c.vr ? c.vr.out : null;
      if (VR) {
        /* слой 2–3 (GRecoil): плечо стрелка уходит назад вместе с оружием
           (руки на IK держатся за рукоятки), само оружие — фазы выстрела;
           удары затворной рамы в крайних точках дают мелкую дрожь */
        const cs = c.vr.mech.carrierShake || 0;
        w.root.position.add(_v.set(0, 0, VR.sh).applyQuaternion(w.root.quaternion));
        w.recoilRig.position.set(0, VR.up + VR.hop, VR.back + cs * 0.0015);
        w.tiltRig.rotation.set(VR.pitch + (c.jolt ? c.jolt.x * 0.85 : 0) + cs * 0.0025, VR.yaw, VR.roll + VR.yaw * 0.5);
        /* механика со стороны (боты, вид от третьего лица): затворная рама /
           кожух-затвор ходят на каждый выстрел */
      } else {
        w.recoilRig.position.set(0, 0, c.recoilBack.x);
        w.tiltRig.rotation.set(c.recoil.x * 0.85, c.recoilYaw.x * 0.6, c.recoilYaw.x * 1.1);
      }
      npcMechanics(s);
      w.root.updateMatrixWorld(true);
    }

    /* Third-person mechanics use the controller's simulation clocks and the
       same weapon-specific tracks as first-person. Never change ammo here. */
    function npcMechanics(s) {
      const c=s.ctrl,w=s.gun,GN=root.GGuns;if(!w||!GN?.setMech)return;
      const plan=c.reload>=0&&c.reloadPlan,tr=plan&&plan.track,t=plan?c.reload*(plan.speed||1):0;
      const tri=(a,b,d)=>t<=a||t>=d?0:t<b?(t-a)/(b-a):1-(t-b)/(d-b);
      const release=tr&&(tr.events||[]).find(e=>e[1]==='release');
      const locked=c.boltOpen&&!(release&&t>=release[0]);
      const m={slide:locked?1:c.vr?.mech.slide||0,trigger:c.triggerHeld&&c.reload<0&&c.sprint<.3&&c.fireMode!=='safe'?1:0,pump:0,handle:0,handleLock:0};
      if(tr?.rack)m.slide=Math.max(m.slide,tri(...tr.rack));
      if(tr?.hk){const h=tr.hk,r=t<h.slap?1:Math.max(0,1-(t-h.slap)/.06);
        m.handle=U.clamp01((t-h.back[0])/(h.back[1]-h.back[0]))*r;
        m.handleLock=U.clamp01((t-h.lock[0])/(h.lock[1]-h.lock[0]))*(t<h.slap?1:0);m.slide=Math.max(m.slide,m.handle);}
      if(c.pump>=0){const a=(c.WPN?.pumpT||[.16,.30,.46]),p=c.pump;
        m.pump=p<a[0]-.1?0:p<a[0]?U.smoothstep((p-a[0]+.1)/.1):p<a[1]-.1?1:p<a[1]?1-U.smoothstep((p-a[1]+.1)/.1):0;}
      if(tr?.pump)m.pump=Math.max(m.pump,tri(...tr.pump));
      s._tpPump=m.pump;GN.setMech(w,m);
    }

    /* Позиция глаз бойца: следует из позы, а не задаётся отдельно —
       иначе камера «плавает» относительно модели. */
    function eyePosition(s) {
      const c = s.ctrl, M = s.char.metrics;
      const moveAmt = U.clamp01(c.speed / c.PHYS.sprint);
      /* Высота глаз берётся из скелета конкретного бойца, а не константой:
         операторы разного роста, и фиксированные 1,655 м ставили камеру
         кому-то в лоб, а кому-то в горло. */
      const standEye = M.eyeY;
      /* присед: высота и вынос глаз — из профиля позы (с колена / гусиный
         шаг), снятого по костям глаз модели */
      const CP = root.GLoco.crouchProfile(c, M);
      const eyeY = U.lerp(U.lerp(standEye, CP.eyeY, CP.k), CP.pEyeY, CP.pk);
      const bobY = Math.sin(c.bobPhase * 2) * U.lerp(0.009, 0.030, moveAmt);
      const bobX = Math.sin(c.bobPhase) * U.lerp(0.005, 0.022, moveAmt);
      const lean = c.lean * 0.30;
      const sinY = Math.sin(c.yaw), cosY = Math.cos(c.yaw);
      /* Наклон Q/E уводит голову вбок ОТНОСИТЕЛЬНО взгляда: вправо от
         направления движения — это ось right = (cos yaw, -sin yaw). */
      const side = bobX + lean;
      /* Глаз лежит на ПЕРЕДНЕЙ поверхности головы, а не в центре черепа.
         Без этого выноса камера стоит внутри головы, и собственные плечи
         занимают нижнюю половину кадра. */
      let fwd = U.lerp(M.headRZ + 0.012 + CP.eyeFwd * CP.k, CP.pEyeFwd, CP.pk);
      /* v22: на спине с приподнятым корпусом глаза выше, чем лёжа на животе; в перекате — у земли и смещаются вбок */
      let eyeS = eyeY, sideR = 0;
      if (c.supine && CP.pk > 0) {
        const ph = c.rollPh || 0, fr = ph - Math.floor(ph), mid = Math.sin(fr * Math.PI);
        eyeS = U.lerp(eyeY, U.lerp(0.6, 0.27, mid), CP.pk);
        fwd = U.lerp(fwd, -0.02, CP.pk);
        sideR = Math.sin(fr * Math.PI * 2) * 0.06 * CP.pk;
      }
      return new THREE.Vector3(
        c.pos.x + (side + sideR) * cosY - Math.sin(c.yaw) * fwd,
        c.pos.y + eyeS + bobY - Math.abs(c.lean) * 0.055,
        c.pos.z - (side + sideR) * sinY - Math.cos(c.yaw) * fwd
      );
    }

    /* ------------------------------------------------- баллистика ----- */
    /* Хитскан с поправкой: луч из дульного среза, разброс по текущему
       spread, дальше проверка мишеней и статики. Пуля 5,45×39 на 30 м
       летит 35 мс — визуально это мгновенно, поэтому трассер рисуем сразу. */
    const ray = new THREE.Raycaster();
    ray.far = 220;
    const hitTargets = [];
    /* Начальная скорость пули 5,45×39, м/с. Используется и для падения
       пули, и для скорости трассера. */
    const MUZZLE_VEL = 880;
    /* Сопротивление и атмосфера общие с оружейной, параметры зависят от
       патрона. Хорда 1/120 с содержит четыре подшага интегратора 1/480 с.
       Broadphase выбирает меши, затем выполняется точный raycast.
       Возвращаются остаточная скорость, путь/время и проходы препятствий.
       Расчёт выстрела синхронный; визуальный трассер следует временам пути. */
    const BALL = root.GBallistics;
    const air = BALL.AIR;
    let traceIndex = root.GTrace.create(THREE,['ground','house','props','fence','range','garden','v8props'].map(k=>world[k]).filter(Boolean),world.targets.map(t=>t.board));
    C.traceStats=()=>traceIndex.stats();
    // Perception uses the same solid scenery as movement. Triangle/material tracing
    // remains authoritative for bullets, penetration and the exact diagnostic mode.
    C.traceRay=(r)=>{if(!traceIndex)traceIndex=root.GTrace.create(THREE,['ground','house','props','fence','range','garden','v8props'].map(k=>world[k]).filter(Boolean),world.targets.map(t=>t.board));return traceIndex.nearest(r,null,true);};
    C.worldVisibleExact=(from,to)=>{const start=performance.now();const d=new THREE.Vector3().subVectors(to,from),len=d.length();if(len<.01)return true;const r=new THREE.Raycaster(from,d.divideScalar(len),.1,Math.max(.1,len-.3));const h=traceIndex.nearest(r);root.GPerf?.record('visibility-exact',performance.now()-start);return !h;};
    /* v20: луч для отсечения перекрытых бойцов (js/app/teams.js): только
       статика, последние 0,3 м у цели не считаются (своё укрытие вплотную) */
    const _ocD=new THREE.Vector3();
    C.occludedRay=(from,to)=>{const d=_ocD.subVectors(to,from),len=d.length();if(len<1)return false;d.divideScalar(len);return root.GPhysics.get(world).blocked(from,d,len-.3);};
    /* v22: noSmoke — проверка без дымовых завес (траектория гранаты); иначе сквозь плотный дым не видно */
    C.worldVisible=(from,to,noSmoke)=>{
      const start=performance.now(),d=new THREE.Vector3().subVectors(to,from),len=d.length();if(len<.12)return true;
      if(!noSmoke&&root.GSmoke&&root.GSmoke.blocks(from,to))return false;
      d.divideScalar(len);const origin=new THREE.Vector3().copy(from).addScaledVector(d,.08);
      /* v22: sight() — сквозь жердевую ограду видно (зазоры между жердями) */
      const ph=root.GPhysics.get(world),hit=ph.sight?ph.sight(origin,d,Math.max(.01,len-.20)):ph.ray(origin,d,Math.max(.01,len-.20));
      root.GPerf?.record('visibility-rapier',performance.now()-start);return !hit;
    };
    root.AEGIS_WIND = (x,y,z,t) => BALL.windAt(x,y,z,t===undefined?S.time:t,(C.WX.P && C.WX.P.wind)||0,root.GGloom?root.GGloom.canopyAt(x,z):0,world.heightAt?world.heightAt(x,z):0);
    function barrier(hit,dir,spec,speed,ammo,v0) {
      if(hit.object===world.ground)return null;
      const ud=hit.object.userData||{},name=hit.object.name||'';
      const mat=ud.mat||(/sandbag/i.test(name)?'sand':/tire/i.test(name)?'rubber':/rock|berm|earth/i.test(name)?'rock':/wood|tree|log|plank|crate|stake|post|board|house|fence/i.test(name)?'wood':'metal');
      if(!['wood','metal','steel','sand','soil','rubber','glass'].includes(mat))return null;
      let thickness=hit.exitDistance!==undefined ? hit.exitDistance-hit.distance : null;
      const normal=hit.face?hit.face.normal.clone().transformDirection(hit.object.matrixWorld):dir.clone().negate();
      const inc=Math.max(.08,Math.abs(normal.dot(dir)));
      /* v22: двери (Ангар) — тонкое дерево: толщина полотна по нормали, пробиваются любым патроном */
      if(ud.door&&ud.thick)thickness=ud.thick/inc;
      if(thickness===null && /barrel|ammo_can|sign_plate|warning.*plate|crate/i.test(name))thickness=(/crate/i.test(name)?.02:/ammo_can/i.test(name)?.001:.0015)/inc;
      if(thickness===null&&hit.object.isMesh){const obj=hit.object,mats=Array.isArray(obj.material)?obj.material:[obj.material],old=mats.map(m=>m.side);const rr=new THREE.Raycaster(hit.point.clone().addScaledVector(dir,.0001),dir,.00001,2);rr.layers.enableAll();let h;
        try{mats.forEach(m=>m.side=THREE.BackSide);h=rr.intersectObject(obj,false)[0];}finally{mats.forEach((m,i)=>m.side=old[i]);}if(h)thickness=h.distance+.0001;
      }
      if(!(thickness>0))return null;
      const res=BALL.penetrate(spec,speed,mat,thickness,(ammo&&ammo.pen)||1,v0);
      return res.pass?{...res,thickness,mat,exit:hit.point.clone().addScaledVector(dir,thickness+.002)}:null;
    }
    function traceBullet(origin, dir, objs, targets, shooter, v0, ammo) {
      const spec=BALL.spec((ammo&&ammo.cal)||(shooter&&shooter.gun?shooter.gun.stats.cal:'545'),ammo&&ammo.id);
      if(C.combat&&shooter)C.combat.hear(origin,shooter,S.time,65);
      const pos=origin.clone(),vel=dir.clone().multiplyScalar(v0||MUZZLE_VEL),path=[{p:pos.clone(),t:0}],passes=[];
      const end=new THREE.Vector3(),seg=new THREE.Vector3(),chord=new THREE.Vector3(),right=new THREE.Vector3().crossVectors(dir,new THREE.Vector3(0,1,0)).normalize();
      if(!traceIndex)traceIndex=root.GTrace.create(THREE,['ground','house','props','fence','range','garden','v8props'].map(k=>world[k]).filter(Boolean),world.targets.map(t=>t.board));
      C.traceStats=()=>traceIndex.stats();
      let tumble=1,ignore=null,flight=0;
      /* v21: выше всей статики (верх индекса) и выше всех бойцов пуля уже ни во что
         не попадёт — дальше считаем только баллистику (трассер долетает как раньше) */
      const topY=traceIndex.topY?traceIndex.topY():Infinity;let sqTop=-Infinity;for(const q of squad)if(q.ctrl&&q.ctrl.pos.y>sqTop)sqTop=q.ctrl.pos.y;sqTop+=2.6;
      for(let n=0;n<480;n++){
        end.copy(pos);const dt=1/120;
        for(let k=0;k<4;k++){BALL.advance(end,vel,spec,dt/4,root.AEGIS_WIND(end.x,end.y,end.z,S.time+flight),air,tumble);flight+=dt/4;}
        end.addScaledVector(right,BALL.spin(spec,flight)-BALL.spin(spec,flight-dt));
        seg.subVectors(end,pos);const len=seg.length();if(len<1e-6)break;chord.copy(seg).divideScalar(len);ray.set(pos,chord);ray.far=len;
        const hiS=pos.y>topY&&end.y>topY,hiQ=pos.y>sqTop&&end.y>sqTop;
        const t0=targets.length?ray.intersectObjects(targets,false)[0]:null,w0=hiS?null:traceIndex.nearest(ray,ignore,true);ignore=null;
        let h0=null;if(DMG&&!hiQ)for(const q of squad){if(q===shooter||!q.dmg)continue;const qp=q.ctrl.pos;if(Math.hypot(qp.x-pos.x,qp.z-pos.z)>len+2)continue;const h=DMG.raySoldier(q,pos,chord,len);if(h&&(!h0||h.t<h0.t))h0=h;}
        let hit=null,isTarget=false,soldier=null;
        if(h0&&(!t0||h0.t<t0.distance)&&(!w0||h0.t<w0.distance)){soldier=h0;hit={point:pos.clone().addScaledVector(chord,h0.t),distance:h0.t};}
        else if(t0&&(!w0||t0.distance<=w0.distance)){hit=t0;isTarget=true;}else hit=w0;
        const actual=hit?hit.point:end;const contactTime=hit?flight-dt*(1-hit.distance/len):flight;path.push({p:actual.clone(),t:contactTime});
        if(C.tactics)C.tactics.nearSegment(pos,actual,shooter,S.time);
        const speed=vel.length();
        if(hit){const through=!soldier&&!isTarget&&passes.length<4?barrier(hit,chord,spec,speed,ammo,v0||MUZZLE_VEL):null;
          if(through){passes.push({hit,...through});pos.copy(through.exit);vel.multiplyScalar(through.speed/speed);coneDir(vel.clone().normalize(),through.deflect,chord);vel.copy(chord).multiplyScalar(through.speed);tumble=through.tumble;ignore=null;flight=contactTime+through.thickness/through.speed;path.push({p:pos.clone(),t:flight});continue;}
          return {hit,target:isTarget,soldier,dir:chord.clone(),speed,path,passes,flight};
        }
        pos.copy(end);if(pos.y < -35 || origin.distanceToSquared(pos)>1200*1200||speed<40)break;
      }
      return {hit:null,target:false,end:pos,path,passes,flight};
    }
    function zeroOf(s){const w=s.gun,AM=C.ammoFor(s),si=w.sightIdx||0;w.zeroRanges=w.zeroRanges||{};const Z=w.zeroRanges[si]||(w.fam==='pistol'||w.fam==='pump'?25:100),sight=w.sights[si];
      const spec=BALL.spec(w.stats.cal,AM&&AM.id),v=(w.stats.v0||880)*((AM&&AM.vK)||1);
      return BALL.zero(spec,v,sight&&sight.eyeG?Math.max(0,sight.eyeG.y):.05,sight&&sight.eyeG?sight.eyeG.x:0,Z,air);
    }
    C.zeroChange=(delta)=>{const s=active();if(!s||!s.gun)return;const w=s.gun,si=w.sightIdx||0,Z=zeroOf(s).Z,ranges=w.fam==='pistol'||w.fam==='pump'?[25,50,75,100,150,200]:[50,100,150,200,300,400,500,600,800];w.zeroRanges[si]=ranges[Math.max(0,Math.min(ranges.length-1,ranges.indexOf(Z)+delta))];C.zeroHudUntil=S.time+6;};
    C.ballisticsInfo=s=>{if(!s||!s.gun)return null;const sol=zeroOf(s),am=C.ammoFor(s),sp=BALL.spec(s.gun.stats.cal,am&&am.id);const key=[sp.name,sol.Z,sol.v0,sol.h,sol.z,air.rho,air.sound].join('|');if(!s._bdc||s._bdcKey!==key){s._bdcKey=key;s._bdc={zero:sol.Z,ammo:sp.name,holds:BALL.holdovers(sp,sol.v0,sol,[100,200,300,400,600,800],air)};}return s._bdc;};

    /* Выстрел управляемого генерала: дульный срез собранного оружия (с
       ДТК/глушителем), направление — ось ствола, разброс — по контроллеру.
       Дробь — несколько картечин с разлётом снопа. Тип патрона (N) задаёт
       пробитие и поражающее действие; скорость — от ствола и патрона. */
    const _sq = new THREE.Quaternion(), _sd = new THREE.Vector3(), _su = new THREE.Vector3(0, 1, 0), _ss = new THREE.Vector3(), _su2 = new THREE.Vector3();
    function coneDir(base, sp, out) {
      out.copy(base);
      if (!(sp > 0)) return out;
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * sp;
      _ss.crossVectors(base, _su);
      if (_ss.lengthSq() < 1e-8) _ss.set(1, 0, 0);
      _ss.normalize();
      _su2.crossVectors(_ss, base).normalize();
      return out.addScaledVector(_ss, Math.cos(a) * rr).addScaledVector(_su2, Math.sin(a) * rr).normalize();
    }
    function ejectFrom(w) {
      if (!w || !w.gun) return;
      w.root.updateMatrixWorld(true);
      const q = w.gun.getWorldQuaternion(new THREE.Quaternion());
      const ejPos = w.gun.localToWorld(w.ejectLocal.clone());
      const ejDir = (w.ejectDir ? w.ejectDir.clone() : new THREE.Vector3(0.86, 0.46, 0.22)).normalize().applyQuaternion(q);
      fx.ejectCase(ejPos, ejDir, new THREE.Vector3(0, 1, 0));
    }
    C.ejectFrom = ejectFrom;
    /* газы у земли: пыль/брызги и примятая трава под стволом лежащего стрелка */
    function muzzleGround(o, d, w) {
      const gy = world.heightAt ? world.heightAt(o.x + d.x * 0.5, o.z + d.z * 0.5) : 0;
      if (o.y - gy > 0.55) return;
      const p = new THREE.Vector3(o.x + d.x * 0.45, gy + 0.03, o.z + d.z * 0.45);
      const k = U.clamp01((0.55 - (o.y - gy)) / 0.4) * (w.stats.muzzleKind === 'brake' ? 1.6 : 1);
      if (SCARS && SCARS.muzzleBlast) SCARS.muzzleBlast(p, d, k, world.wetAt ? world.wetAt(p.x, p.z) : 0);
      else fx.smoke(p, 3, new THREE.Vector3(d.x * 0.6, 0.5, d.z * 0.6), 0.12);
      if (world.env && world.env.stamp) world.env.stamp(p.x, p.z, 0.8 + k * 0.4, 0.5 * k, d.x, d.z);
    }
    function shootRay(s) {
      const c = s.ctrl, w = s.gun;
      if (!w) return;
      w.root.updateMatrixWorld(true);
      /* видимая вспышка — от видимого ствола */
      const originV = w.gun.localToWorld(w.muzzleLocal.clone());
      const wqV = w.gun.getWorldQuaternion(new THREE.Quaternion());
      /* v7: направление пули — по «баллистической тени» (старая модель
         отдачи), а не по новой видимой анимации: баланс прежний */
      let origin = originV, wq = wqV;
      if (w._balRec && w._balPos && !(s === active() && root.GBodycam && !S.tp && !S.spectate)) {
        const sp = w.root.position.clone(), sq = w.root.quaternion.clone();
        const rp = w.recoilRig.position.clone(), tr = w.tiltRig.rotation.clone();
        w.root.position.copy(w._balPos); w.root.quaternion.copy(w._balQ);
        w.recoilRig.position.set(0, 0, w._balRec[0]); w.tiltRig.rotation.set(w._balRec[1], w._balRec[2], w._balRec[3]);
        w.root.updateMatrixWorld(true);
        origin = w.gun.localToWorld(w.muzzleLocal.clone());
        wq = w.gun.getWorldQuaternion(_sq);
        w.root.position.copy(sp); w.root.quaternion.copy(sq); w.recoilRig.position.copy(rp); w.tiltRig.rotation.copy(tr);
        w.root.updateMatrixWorld(true);
      } else if (w._fpBal && !(s === active() && root.GBodycam && !S.tp && !S.spectate)) {
        /* от первого лица: тень считает бодикам (21_game_bodycam) */
        origin = w._fpBal.origin.clone(); wq = _sq.copy(w._fpBal.q);
      } else wq = _sq.copy(wqV);
      /* v9: от первого лица пуля летит по ВИДИМОМУ стволу — туда, где стоит
         марка коллиматора (раньше — по «тени» старых пружин: точка и
         попадание расходились на очереди) */
      const zsol = zeroOf(s);
      const dir0 = new THREE.Vector3(Math.tan(zsol.wind),Math.tan(zsol.elev),-1).normalize().applyQuaternion(wq).normalize();
      /* v8: перегретый ствол уводит среднюю точку попадания вверх (до ~0,9 мрад) */
      if (c.vr && c.vr.heatPOI) { const pz = c.vr.heatPOI(); if (pz > 0) { dir0.y += pz * Math.hypot(dir0.x, dir0.z); dir0.normalize(); } }
      c._v8last = S.time;
      /* v8: дульная волна соседа по камере (рядом со стреляющим) */
      if (C.V8 && s !== active()) try { C.V8.nearShot(originV, !!active() && !S.spectate, { supp: !!w.stats.suppressed }); } catch (e) { /* */ }
      const AM = (C.ammoFor && C.ammoFor(s)) || null;
      const v0 = (w.stats.v0 || MUZZLE_VEL) * ((AM && AM.vK) || 1);
      const pellets = (AM && AM.pellets) || 1;

      /* вспышка (у глушителя — едва заметная) и гильза */
      fx.flashRig.position.copy(originV);
      fx.flashRig.quaternion.copy(wqV);
      /* v9: пламя, искры, дым и дульная волна — из оружейной (WK.ShotFX);
         свой модуль даёт только свет вспышки в сцене */
      const sfxOn = SFX && camera.position.distanceToSquared(originV) < 90 * 90;
      fx.muzzleFlash(w.stats.suppressed ? 0.18 : (w.fam === 'pistol' ? 0.7 : 1), w.stats.muzzleKind, sfxOn);
      if (sfxOn) {
        const bore = _sfxD.set(0, 0, -1).applyQuaternion(wqV);
        _sfxQ.copy(wqV).multiply(_sfxQH);
        try {
          SFX.muzzleFlash(originV, bore, w.stats.fxKind || w.stats.muzzleKind || 'bare', w.stats.fxSize || 1, _sfxQ,
            { flash: w.stats.fxFlash !== undefined ? w.stats.fxFlash : 1, first: w.stats.suppressed && S.time - (w._sfxPrev || -9) > 3, smoke: (w.stats.fxSmoke || 1) * (C.QM && C.QM.tierKey === 'low' ? 0.8 : 1) });
          w._sfxPrev = S.time;
          /* газы из окна выброса (у своего оружия видно в кадре) */
          if (s === active() && w.ejectLocal && w.fam !== 'pump') {
            const ep = w.gun.localToWorld(_sfxE.copy(w.ejectLocal));
            const ed = _sfxD2.copy(w.ejectDir || _sfxD2.set(1, 0.4, 0)).applyQuaternion(wqV).normalize();
            SFX.portSmoke(ep, ed, w.stats.suppressed ? 2.2 : 1);
          }
        } catch (e) { /* эффект не критичен */ }
      } else fx.smoke(originV, 2, dir0.clone().multiplyScalar(1.4), w.fam === 'pump' ? 0.11 : 0.07);
      /* гильза вылетает, когда рама/кожух в крайней задней точке
         (≈38 % цикла автоматики), а не в момент выстрела; у помпы — при
         отходе цевья назад (событие pumpBack) */
      if (w.fam !== 'pump') {
        if (c.vr) c.vr.onEject = () => { if (s.gun === w) ejectFrom(w); };
        else ejectFrom(w);
      }
      /* лёжа: пороховые газы поднимают пыль и прибивают траву у дульного среза */
      if ((c.prone || 0) > 0.6 && !w.stats.suppressed) muzzleGround(originV, dir0, w);
      if (C.gunSound) C.gunSound(s, 'shot'); else audio.shot({ vol: 1 });

      hitTargets.length = 0;
      for (const t of world.targets) if (t.state !== 'down') hitTargets.push(t.board);
      const objs = [world.ground];
      for (const k of ['house', 'props', 'fence', 'range', 'garden', 'v8props']) if (world[k]) objs.push(world[k]);

      const dmgK = (AM && AM.dmg) || 1;
      const hitTargetsDone = new Set();
      for (let pI = 0; pI < pellets; pI++) {
        const dir = coneDir(dir0, c.spread, new THREE.Vector3());
        if (pellets > 1) coneDir(dir.clone(), (AM.spread || 0.025), dir);
        let hit = null, hitKind = 'ground', hitTarget = null;
        const shot = traceBullet(origin, dir, objs, hitTargets, s, v0, AM);
        for (const pass of shot.passes || []) {
          const ph = pass.hit;
          fx.impact(ph.point, fx.hitNormal(ph, dir), pass.mat, null, ph.object, dir, ph.instanceId,ph);
          /* v22: пробитая дверь/доска получает пробоину, пуля летит дальше */
          if (world.bulletHit && ph.object !== world.ground) try { world.bulletHit(ph.point, dir, 1); } catch (e) { /* */ }
        }
        if (shot.hit) {
          hit = shot.hit;
          if (shot.soldier) hitKind = 'soldier';
          else if (shot.target) {
            hitKind = 'target';
            hitTarget = world.targets.find((x) => x.board === hit.object);
          } else {
            const n = (hit.object.name || '') + '|' + ((hit.object.parent && hit.object.parent.name) || '');
            const um = hit.object.userData && hit.object.userData.mat;
            if (hit.object === world.ground) hitKind = 'ground';
            else if (um) hitKind = um;
            else if (/sandbag|berm|earth|rock|water|tire/i.test(n)) hitKind = 'ground';
            else if (/fence|house|props|log|tree|bush|plank|wood|crate|stake|post|board/i.test(n)) hitKind = 'wood';
            else hitKind = 'metal';
          }
        }
        const end = hit ? hit.point : (shot.end || origin.clone().addScaledVector(dir, 140));
        if (pI === 0) (C.lifeEvents || (C.lifeEvents = [])).push({ type: 'shot', from: origin.clone(), to: origin.clone(), shooter: s });
        /* v7: вороны взлетают, пули рядом с камерой — «crack» и подавление */
        if (pI === 0 && C.WX.gw) try {
          const act = active();
          C.WX.gw.ctrl = act ? act.ctrl : null;
          C.WX.gw.onShot(origin, end, { active: s === act && !S.spectate, v0, supp: !!w.stats.suppressed });
        } catch (e) { /* необязательно */ }
        if (pI < 3) fx.tracer(origin.clone().addScaledVector(dir, 0.35), end, pellets > 1 ? 0.5 : 1, v0, shot.path);
        if (hit && shot.soldier) {
          onSoldierHit(s, DMG.hit(shot.soldier, shot.dir, s, S.time, { v: shot.speed, ammo: AM ? AM.id : null, dist: origin.distanceTo(hit.point), dmgScale: dmgK, silent: pI > 0 }));
        } else if (hit) {
          const nrm = fx.hitNormal(hit, shot.dir || dir);
          /* v8: материалы — вода (ручей, болото, воронки), песок мешков, камень, металл */
          let v8k = null, v8p = hit.point;
          if (hitKind === 'ground' && SCARS && SCARS.waterC) {
            const wc = SCARS.waterC(hit.point.x, hit.point.z);
            if (wc) {
              const lvl = wc.h0 - (wc.D || 0) * 0.5;
              if (hit.point.y < lvl + 0.05) {
                v8k = 'water';
                if (dir.y < -0.02) v8p = hit.point.clone().addScaledVector(dir, (lvl - hit.point.y) / dir.y);
                else v8p = hit.point.clone().setY(lvl);
              }
            }
          }
          if (!v8k && (hitKind === 'sand' || hitKind === 'rock' || hitKind === 'metal' || hitKind === 'water')) v8k = hitKind;
          if (hitKind === 'sand' || hitKind === 'rock') hitKind = 'ground';
          if (hitKind === 'water') hitKind = 'ground';
          const ud = hit.object.userData || {};
          C.lastHit = { kind: hitKind, v8: v8k, name: hit.object.name || '', y: +hit.point.y.toFixed(2), d: +origin.distanceTo(hit.point).toFixed(2) };
          if (ud.onHit) try { ud.onHit(hit, dir, s); } catch (e) { /* */ }
          if (world.bulletHit && hit.object !== world.ground && !hitTarget) try { world.bulletHit(hit.point, dir, 1); } catch (e) { console.warn('bulletHit', e && e.message); }
          if (hitTarget) {
            if (!hitTargetsDone.has(hitTarget)) { hitTargetsDone.add(hitTarget); registerTargetHit(s, hitTarget, hit, nrm, dir); }
            else fx.impact(hit.point, nrm, 'target', hitTarget.hinge, hit.object, dir, hit.instanceId,hit);
          } else if (v8k === 'water') {
            if (C.V8 && pI < 4) try { C.V8.impact('water', v8p, nrm, dir, {}); } catch (e) { /* */ }
          } else if (pI < 6 || Math.random() < 0.4) {
            fx.impact(hit.point, nrm, hitKind, null, hit.object, dir, hit.instanceId,hit);
          }
          if (v8k && v8k !== 'water' && C.V8 && pI < 3) try { C.V8.impact(v8k, hit.point, nrm, dir, { big: !!ud.big }); } catch (e) { /* */ }
          if (SCARS && pI < 4 && v8k !== 'water') try {
            const tr = hit.tree || ud.tree;
            if (tr) SCARS.treeHit(tr, hit.point, dir);
            else if (hit.object === world.ground || ud.ground) SCARS.groundHit(hit.point, nrm, dir);
          } catch (e) { /* эффекты необязательны */ }
        }
      }
    }

    /* Выстрел стационарного пулемёта: та же баллистика, урон по бойцам и разрушение карты, что у винтовки */
    /* v21: дальность до точки прицеливания по линии прицела наводчика (статичный мир Rapier);
       луч стартует в 2,5 м — за своим станком и мешками */
    /* v21: та же трассировка, что у пули (кроны, стены, предметы карты и бойцы) — пули сводятся точно в
       то, что под перекрестием, а не в землю за бойцом; запасной путь — статичный мир Rapier */
    const _mgRay = new THREE.Raycaster();
    C.mgAimDist = function (o, d) {
      const st0 = o.clone().addScaledVector(d, 2.5);
      try {
        _mgRay.set(st0, d); _mgRay.near = 0; _mgRay.far = 900;
        const w = traceIndex.nearest(_mgRay, null, true);
        let D = w ? w.distance : 900;
        if (DMG) for (const q of squad) { if (!q.dmg) continue; const h = DMG.raySoldier(q, st0, d, D); if (h && h.t < D) D = h.t; }
        return D < 900 ? 2.5 + D : 0;
      } catch (e) { /* ниже — Rapier */ }
      const ph = root.GPhysics && root.GPhysics.get(world);
      if (!ph || !ph.ray) return 0;
      try { const h = ph.ray(st0, d, 900, false); return h ? 2.5 + h.timeOfImpact : 0; } catch (e) { return 0; }
    };
    /* v22: материал попадания — как у винтовочной пули (userData.mat, имя меша), а не «камень» на всё */
    function mgHitKind(o) {
      if (!o || o === world.ground) return 'ground';
      const um = o.userData && o.userData.mat;
      if (um) return um;
      const n = (o.name || '') + '|' + ((o.parent && o.parent.name) || '');
      if (/sandbag|berm|earth|rock|water|tire/i.test(n)) return 'ground';
      if (/fence|house|props|log|tree|bush|plank|wood|crate|stake|post|board/i.test(n)) return 'wood';
      return 'metal';
    }
    /* o.tracer — трассер из ленты (каждый 4-й), звук и дым выстрела — в 31b_mg_fx.js */
    C.fireMG = function (from, dir, shooter, o) {
      o = o || {};
      const objs = [world.ground];
      for (const k of ['house', 'props', 'fence', 'range', 'garden', 'v8props']) if (world[k]) objs.push(world[k]);
      /* v21: M2HB стреляет .50 BMG (12,7×99, M33 Ball: 42 г, ~890 м/с), а не 7,62×54R */
      const shot = traceBullet(from, dir.clone().normalize(), objs, [], shooter || null, 890, { id: 'M33', cal: '127x99', pen: 5 });
      const end = shot.hit ? shot.hit.point : (shot.end || from.clone().addScaledVector(dir, 150));
      fx.tracer(from.clone().addScaledVector(dir, 0.4), end, 1, 890, shot.path, o.tracer === undefined ? undefined : !!o.tracer);
      /* выстрел слышат бойцы (реакция ИИ) и вороны; пуля рядом с камерой — «crack» */
      (C.lifeEvents || (C.lifeEvents = [])).push({ type: 'shot', from: from.clone(), to: from.clone(), shooter: shooter || null });
      if (C.WX && C.WX.gw) try { const act = active(); C.WX.gw.ctrl = act ? act.ctrl : null; C.WX.gw.onShot(from, end, { active: !!shooter && shooter === act && !S.spectate, v0: 890, supp: false }); } catch (e) { /* */ }
      for (const pass of shot.passes || []) {
        const ph = pass.hit;
        try { fx.impact(ph.point, fx.hitNormal(ph, dir), pass.mat, null, ph.object, dir, ph.instanceId, ph); } catch (e) { /* */ }
        if (world.bulletHit && ph.object !== world.ground) try { world.bulletHit(ph.point, dir, 2); } catch (e) { /* */ }
      }
      if (shot.hit && !shot.soldier) {
        const h = shot.hit, nrm = fx.hitNormal(h, shot.dir || dir);
        let kind = mgHitKind(h.object);
        const v8k = kind === 'sand' || kind === 'rock' || kind === 'metal' || kind === 'water' ? kind : null;
        if (kind === 'sand' || kind === 'rock' || kind === 'water') kind = 'ground';
        const ud = h.object.userData || {};
        if (ud.onHit) try { ud.onHit(h, dir, shooter || null); } catch (e) { /* */ }
        if (h.object !== world.ground && world.bulletHit) try { world.bulletHit(h.point, dir, 2); } catch (e) { /* */ }
        fx.impact(h.point, nrm, kind, null, h.object, dir, h.instanceId, h);
        /* крупный калибр: второй всплеск грунта/щепы и пыль поверх */
        if (v8k && C.V8) try { C.V8.impact(v8k, h.point, nrm, dir, { big: true }); } catch (e) { /* */ }
        else if (kind === 'ground' && fx.smoke) try { fx.smoke(h.point.clone().addScaledVector(nrm, 0.08), 2, nrm.clone().multiplyScalar(0.6), 0.22, 0x8a7a62, 0.55, 0.05); } catch (e) { /* */ }
      }
      if (shot.soldier) {
        const res = DMG.hit(shot.soldier, shot.dir, shooter || null, S.time, { v: shot.speed, ammo: null, dist: from.distanceTo(end) });
        onSoldierHit(shooter || null, res, from.clone());
      }
      /* без 31b_mg_fx.js — старый общий звук выстрела */
      if (!root.GMGFX && audio.shot) audio.shot({ vol: 1 });
      return shot;
    };

    function testFire(from, dir, shooter, to) {
      to = to || {};
      const objs = [world.ground];
      for (const k of ['house', 'props', 'fence', 'range', 'garden','v8props']) if (world[k]) objs.push(world[k]);
      const shot = traceBullet(from, dir.clone().normalize(), objs, [], shooter || null, to.v||880, {id:to.ammo||"7N6",pen:to.pen||1});
      fx.tracer(from.clone(), shot.hit ? shot.hit.point : from.clone().addScaledVector(dir, 60), 1, MUZZLE_VEL);
      if (!shot.soldier) return { hit: !!shot.hit, soldier: null };
      const res = DMG.hit(shot.soldier, shot.dir, shooter || null, S.time, { v: to.v || shot.speed, ammo: to.ammo || null, dist: from.distanceTo(shot.hit.point) });
      onSoldierHit(shooter || null, res, from.clone());
      return { zone: res.zone, died: res.died, who: res.s.char.preset.name, organs: res.organs, name: res.name, lossF: res.lossF, legDown: !!res.s.ctrl.legDown, limp: res.s.ctrl.limp || 0, ricochet: res.ricochet, armor: res.armor, penetrated: res.penetrated, severed: res.severed, vessel: res.vessel, fracture: res.fracture };
    }

    /* Попадание в мишень: очко, пробоина, падение рамы. */
    function registerTargetHit(s, tg, hit, nrm, direction) {
      const local = tg.hinge.worldToLocal(hit.point.clone());
      fx.impact(hit.point, nrm, 'target', tg.hinge, hit.object, direction, hit.instanceId,hit);
      tg.hits++;
      s.ctrl.hits++;
      S.score++;
      ui.scoreN.textContent = String(S.score);
      audio.targetHit(tg.dist, false);
      /* Точность: считаем зону по расстоянию до центра мишени. */
      const cx = local.x, cy = local.y - tg.H * 0.52;
      const rr = Math.hypot(cx, cy);
      const zone = rr < 0.045 ? 10 : rr < 0.09 ? 9 : rr < 0.135 ? 8 : rr < 0.18 ? 7 : 6;
      ui.hitmark.classList.remove('on');
      void ui.hitmark.offsetWidth;
      ui.hitmark.classList.add('on');
      void zone;
      /* мишень падает */
      tg.state = 'falling';
      tg.t = 0;
      audio.targetFall(tg.dist);
    }

    /* Мишени: падение и подъём. */
    function updateTargets(dt) {
      for (const t of world.targets) {
        if (t.state === 'falling') {
          t.t += dt;
          const u = U.clamp01(t.t / 0.34);
          t.hinge.rotation.x = -U.smoothstep(u) * (Math.PI / 2) * 0.96;
          if (u >= 1) { t.state = 'down'; t.t = 0; }
        } else if (t.state === 'down') {
          t.t += dt;
          if (t.t > 2.6) { t.state = 'rising'; t.t = 0; }
        } else if (t.state === 'rising') {
          t.t += dt;
          const u = U.clamp01(t.t / 0.55);
          /* подъём с лёгким «перелётом» — пружина возврата */
          const e = U.smoothstep(u);
          const over = Math.sin(u * Math.PI) * 0.10 * (1 - u);
          t.hinge.rotation.x = -(1 - e) * (Math.PI / 2) * 0.96 + over;
          if (u >= 1) { t.state = 'up'; t.hinge.rotation.x = 0; }
        }
      }
    }

    /* Теперь, когда трассировка пули собрана, подключаем её к контроллерам:
       каждый выстрел бойца рождает луч, вспышку, гильзу и звук. */
    for (const s of squad) s.ctrl.onFire = () => shootRay(s);
    /* v22: падение с высоты (вышка, крыша, лестница): ушиб, переломы ног, гибель — DMG.fall.
       Боты получают травму только от высокого падения (> ~3,7 м): спуски навигации ниже. */
    for (const s of squad) s.ctrl.onHardLand = (v) => {
      if (!DMG || !DMG.fall || s.dead || (s.npc && v < 8.5)) return;
      const r = DMG.fall(s, v);
      if (r && s.active && r.text && !r.died) C.caption = { text: r.text, until: S.time + 3.5 };
    };
    C.shootRay = shootRay;

    BOOTMARK('preFinish');
    return finishLoop(C, {
      poseSoldier, placeWeapon, eyePosition, shootRay, updateTargets, SLING, shoulderArmsBegin, shoulderArmsEnd, shoulderReset, climbSling,
      /* баллистика нужна отладочным хукам в finishLoop */
      MUZZLE_VEL, DMG, testFire, spatialFrom, BLOOD, BLAST, GORE, voxUpdate, FLAGS, SCARS
    });
  }

  /* ================================================ КАМЕРА И КАДР ===== */
  function finishLoop(C, F) {
    const { THREE, renderer, scene, camera, world, fx, audio, squad, sun,
      S, input, ui, active, updateFree, updateUse } = C;
    const clamp = U.clamp;

    /* Нагрудная камера и руки рига от первого лица (game/bodycam.js). */
    /* v16: луч для увода оружия от первого лица (bodycam → viewmodel
       tuck): аналитически по коллайдерам мира (сетка player.js), грунту
       и капсулам других бойцов (живых и лежащих) — без Raycaster по
       мешам: 5 лучей за кадр стоят доли миллисекунды и на слабом ПК. */
    const _fr = { distance: 0 }, _frA = new THREE.Vector3(), _frB = new THREE.Vector3();
    const FR_SEG = [['hips', 'chest', 0.17], ['chest', 'head', 0.13], ['hips', 'kneeR', 0.1], ['hips', 'kneeL', 0.1], ['shoulderR', 'wristR', 0.07], ['shoulderL', 'wristL', 0.07]];
    function segRay(o, d, len, a, b, r) {
      /* ближайшее сближение луча o + d·t (t∈[0,len]) с отрезком a–b; попадание, если ближе r */
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, wx = o.x - a.x, wy = o.y - a.y, wz = o.z - a.z;
      const A = 1, B = d.x * ux + d.y * uy + d.z * uz, C = ux * ux + uy * uy + uz * uz, D = d.x * wx + d.y * wy + d.z * wz, E = ux * wx + uy * wy + uz * wz;
      const den = A * C - B * B;
      let t = den > 1e-8 ? (B * E - C * D) / den : 0, u = C > 1e-8 ? (E + B * t) / C : 0;
      u = Math.max(0, Math.min(1, u)); t = Math.max(0, Math.min(len, B * u - D));
      const px = o.x + d.x * t - (a.x + ux * u), py = o.y + d.y * t - (a.y + uy * u), pz = o.z + d.z * t - (a.z + uz * u);
      const q2 = px * px + py * py + pz * pz;
      if (q2 > r * r) return 1e9;
      return Math.max(0, t - Math.sqrt(Math.max(0, r * r - q2)));
    }
    function fpRay(o, d, len, self, noGround) {
      const me = self || active();
      let best = len;
      // Rapier respects the lower face of roofs/platforms. The old ground-to-top
      // boxes treated an overhead roof as a wall around the gun, forcing permanent tuck.
      const physics = root.GPhysics?.get(world);
      if (physics) {
        const hit=physics.ray(o,d,len,!!noGround);
        if(hit)best=Math.min(best,hit.timeOfImpact);
      } else {
      /* коллайдеры (боксы и цилиндры — от грунта до верха) */
      const c0 = me && me.ctrl;
      if (c0 && c0.nearCols) {
        const mx = o.x + d.x * len * 0.5, mz = o.z + d.z * len * 0.5;
        const near = c0.nearCols(mx, mz, len * 0.5 + 0.2);
        for (let i = 0; i < near.length; i++) {
          const c = near[i], top = c0.topOf ? c0.topOf(c) : (c.h || 2);
          let t0 = 0, t1 = best;
          if (c.type === 'box') {
            for (const [oo, dd, lo, hi] of [[o.x, d.x, c.x0, c.x1], [o.z, d.z, c.z0, c.z1], [o.y, d.y, c.y0 ?? c._y0 ?? -1e3, top]]) {
              if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) { t0 = 1e9; break; } continue; }
              let ta = (lo - oo) / dd, tb = (hi - oo) / dd;
              if (ta > tb) { const q = ta; ta = tb; tb = q; }
              t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
              if (t0 > t1) { t0 = 1e9; break; }
            }
          } else if (c.type === 'cyl') {
            const ex = o.x - c.x, ez = o.z - c.z, a = d.x * d.x + d.z * d.z, b = ex * d.x + ez * d.z, cc = ex * ex + ez * ez - c.r * c.r;
            if (cc <= 0) t0 = 0;
            else if (a < 1e-9) t0 = 1e9;
            else { const disc = b * b - a * cc; t0 = disc < 0 || b > 0 ? 1e9 : (-b - Math.sqrt(disc)) / a; }
            if (t0 < 1e9 && o.y + d.y * t0 > top) t0 = 1e9;
          } else continue;
          if (t0 < best) best = t0;
        }
      }
      /* грунт: 6 точек вдоль луча */
      if (world.heightAt && !noGround) for (let k = 1; k <= 6; k++) {
        const t = best * k / 6;
        if (o.y + d.y * t < world.heightAt(o.x + d.x * t, o.z + d.z * t) + 0.03) { best = t; break; }
      }
      }
      /* люди: капсулы корпуса, бёдер и рук */
      for (const s of squad) {
        if (s === me || !s.char) continue;
        const p = s.char.root.position;
        if (Math.abs(p.x - o.x) > best + 1 || Math.abs(p.z - o.z) > best + 1) continue;
        for (const [na, nb, r] of FR_SEG) {
          const ba = s.char.bone(na), bb = s.char.bone(nb);
          if (!ba || !bb) continue;
          ba.getWorldPosition(_frA); bb.getWorldPosition(_frB);
          const t = segRay(o, d, best, _frA, _frB, r);
          if (t < best) best = t;
        }
      }
      if (best >= len) return null;
      _fr.distance = best;
      return _fr;
    }
    const BC = root.GBodycam ? root.GBodycam.create({ scene, camera, raycast: fpRay }) : null;
    const _sfxM9 = new THREE.Vector3();
    const AE = root.AEGIS || null, GN = root.GGuns || null, GR = root.GGrenades || null, WK = root.AEGIS_WK || null;
    const ARS = C.ARS, uiCall = C.uiCall;
    /* полевая медицина: здоровье на экране, жгут и перевязка (game/medic) */
    const MED = root.GMedic ? root.GMedic.create({ audio, AE }) : null;
    if (MED) MED.mountHUD(document.getElementById('hud'));
    if (MED) MED.onDone = (s) => { if (s.active) S.tutHealed = (S.tutHealed || 0) + 1; };
    /* v8: нагрев ствола, марево, ударная волна, грязь на объективе, контузия,
       рикошеты, вода/песок, дыхание паром (js/polygon/29b_v8fx.js) */
    let V8 = null;
    try {
      V8 = root.GV8 ? root.GV8.create(THREE, { scene, camera, world, fx, audio,
        getScars: () => F.SCARS, getPost: () => (C.getPost ? C.getPost() : null), spatialFrom: (p) => F.spatialFrom(p),
        kick: (k) => { const a = active(); if (BC && a && !S.tp && !S.spectate) BC.kick(k, Math.random() < 0.5 ? -1 : 1); } }) : null;
    } catch (e) { console.warn('v8fx:', e && e.message); }
    C.V8 = V8;
    const fpNow = () => !!(active() && BC && !S.tp && !S.spectate);
    const keyOf = (id) => (AE ? AE.keyName((C.getBinds ? C.getBinds() : {})[id]) : id);
    /* кисти рэгдолла: расслабленные */
    if (F.DMG && GR) F.DMG.handSpec = { hands: { open: GR.HANDS.OPEN, support: GR.HANDS.RELAX } };
    const _gw = new THREE.Matrix4();
    /* Досягаемость опорной руки. Поза оружия (ремень, бег, колено, жесты,
       удар пули) ставит автомат от ПРАВОЙ кисти; левая кисть идёт к цевью
       уже потом. Если цевьё дальше, чем дотягивается рука, двухзвенная IK
       упиралась в прямой локоть (175°), и кисть висела в 10 см от цевья —
       «держит что-то в воздухе». Как в риге оружия у живых аниматоров
       (weapon IK: оружие — от правой кисти, левая — к оружию, а не
       наоборот), здесь оружие доворачивается вокруг правого запястья на
       наименьший угол, при котором точка хвата ложится в сферу досягаемости
       левого плеча с согнутым локтем (~155°). Поправка сглаживается, чтобы
       оружие не дёргалось при смене позы. */
    const _rf = { R: new THREE.Vector3(), Lp: new THREE.Vector3(), Sh: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(),
      q: new THREE.Quaternion(), m: new THREE.Matrix4(), t: new THREE.Vector3() };
    /* v16: опорная кисть «на ремне» перехватывает оружие ближе к себе —
       у горловины магазина (как держат автомат в покое: ладонь на заднем
       краю цевья, перед магазином). Хват прицела (дальний, у мушки) от
       стоящего в снаряжении бойца требовал почти прямой руки, и оружие
       разворачивалось поперёк корпуса, а локти расходились «крыльями».
       Сдвиг плавный, по готовности: вскинул — кисть уходит вперёд. */
    const _lgT = new THREE.Matrix4(), _lgP = new THREE.Vector3();
    const lgOf = (s) => (s._lg && s._lgFor === s.wspec ? s._lg : s.wspec.leftGrip);
    function leftGripOf(s, dt) {
      const sp = s.wspec, c = s.ctrl;
      const L = s._lg || (s._lg = new THREE.Matrix4());
      s._lgFor = sp;
      if (!sp || !sp.leftGrip) return L.identity();
      /* Фиксированную переднюю рукоятку нельзя сдвигать вместе с кистью.
         Перехват назад разрешён только вдоль обычного цевья. */
      let max = sp._lslide;
      if (max === undefined) {
        max = 0;
        const seat = s.gun && s.gun.magSeat;
        if (seat && !sp.foregrip && sp.fam !== 'pistol' && sp.fam !== 'pump' && sp.fam !== 'grenade') {
          _lgP.setFromMatrixPosition(sp.leftGrip);
          max = U.clamp(seat.z - 0.02 - _lgP.z, 0, 0.11);
        }
        sp._lslide = max;
      }
      const kr = U.smoothstep(c.ready === undefined ? 1 : c.ready);
      const k = max * (1 - kr) * (c.reload >= 0 ? 0 : 1);
      s._lgK = U.damp(s._lgK === undefined ? k : s._lgK, k, 8, dt || 1 / 60);
      L.copy(sp.fam==='pump'&&sp.leftGrip0?sp.leftGrip0:sp.leftGrip);
      const pump=sp.fam==='pump'?((s.gun.anim?.pumpTravel||92)*.001*(s._tpPump||0)):0;
      return L.premultiply(_lgT.makeTranslation(0,0,s._lgK+pump));
    }
    function reachFix(s, dt) {
      const sp = s.wspec, w = s.gun;
      if (!sp || !sp.leftGrip || !sp.rightGrip || !s.char.hands || !w) return;
      const LG = leftGripOf(s, dt);
      const rest = s.char.rest, shL = s.char.bone('shoulderL');
      if (!shL || !rest.shoulderL || !rest.elbowL || !rest.wristL) return;
      const d3 = (a, b) => Math.hypot(rest[a][0] - rest[b][0], rest[a][1] - rest[b][1], rest[a][2] - rest[b][2]);
      const reach = (d3('shoulderL', 'elbowL') + d3('elbowL', 'wristL')) * 0.955;
      w.root.updateMatrixWorld(true);
      _rf.m.multiplyMatrices(w.gun.matrixWorld, sp.rightGrip); _rf.R.setFromMatrixPosition(_rf.m);
      _rf.m.multiplyMatrices(w.gun.matrixWorld, LG); _rf.Lp.setFromMatrixPosition(_rf.m);
      /* Без вымышленного запаса ключицы: при приседе он разрешал цель
         за пределами реального вылета руки. */
      shL.getWorldPosition(_rf.Sh);
      const st = s._reach || (s._reach = { q: new THREE.Quaternion() });
      const rr = _rf.Lp.distanceTo(_rf.R);
      /* У компактного оружия две сферы могут вовсе не пересекаться:
         одной ротацией вокруг правой кисти левую руку тогда не подвести.
         Сначала слегка подтягиваем оружие к левому плечу (обе кисти
         остаются на своём хвате), затем решаем прежний поворот. */
      const separation = _rf.R.distanceTo(_rf.Sh);
      if (separation > reach + rr - 0.003) {
        _rf.t.subVectors(_rf.Sh, _rf.R).setLength(Math.min(0.12, separation - reach - rr + 0.003));
        w.root.position.add(_rf.t); _rf.R.add(_rf.t); _rf.Lp.add(_rf.t);
        w.root.updateMatrixWorld(true);
      }
      let want = null;
      if (_rf.Lp.distanceTo(_rf.Sh) > reach && rr > 1e-3) {
        /* ближайшая к текущей точке хвата точка пересечения двух сфер:
           |X - плечо| = reach и |X - правое запястье| = rr (оружие жёсткое) */
        const X = _rf.a.copy(_rf.Lp);
        for (let k = 0; k < 6; k++) {
          X.sub(_rf.Sh).setLength(reach).add(_rf.Sh);
          X.sub(_rf.R).setLength(rr).add(_rf.R);
        }
        want = _rf.q.setFromUnitVectors(_rf.b.copy(_rf.Lp).sub(_rf.R).normalize(), X.sub(_rf.R).normalize());
      } else want = _rf.q.identity();
      /* быстро догоняет (руке нельзя «отставать» от цевья), но без скачка */
      st.q.slerp(want, 1 - Math.exp(-dt * 18));
      if (1 - Math.abs(st.q.w) < 1e-7) return;
      /* поворот вокруг правого запястья */
      w.root.position.sub(_rf.R).applyQuaternion(st.q).add(_rf.R);
      w.root.quaternion.premultiply(st.q);
      w.root.updateMatrixWorld(true);
    }
    /* Кисти GLB у бойцов со стороны: хват из спеки их оружия. */
    /* v13: оружие не прижимается к корпусу так, что предплечье некуда
       деть. Если линия «кисть → плечо» у самой кисти уходит в плитник
       (боец с колена наготове, корпус наклонён вперёд), оружие отводится
       вперёд по курсу ровно на столько, сколько не хватает (до 12 см,
       плавно). Иначе ни один локоть не убирал предплечье из груди. */
    const _gcI = new THREE.Matrix4(), _gcM = new THREE.Matrix4(), _gcP = new THREE.Vector3(), _gcH = new THREE.Vector3(), _gcS = new THREE.Vector3(), _gcT = new THREE.Vector3();
    function gunClear(s, dt) {
      const sp = s.wspec, w = s.gun, RR = RIG && RIG.Rig, c = s.ctrl;
      /* только «наготове от бедра»: на ремне, в прицеле и на перезарядке
         положение оружия и так подобрано */
      const kW = U.smoothstep(U.clamp01(((c.ready || 0) - 0.4) / 0.5)) * (1 - U.smoothstep(c.ads || 0)) * (c.reload >= 0 ? 0 : 1);
      const st = s._gc || (s._gc = { v: 0 });
      if (kW < 0.01) { st.v = 0; return; }
      if (!sp || !w || !RR || !RR.torsoModel || !s.char.hands) return;
      const T = RR.torsoModel(s.char);
      if (!T) return;
      const chest = s.char.bone('chest');
      _gcI.copy(chest.matrixWorld).invert();
      w.gun.updateMatrixWorld(true);
      const fx = -Math.sin(s.ctrl.yaw), fz = -Math.cos(s.ctrl.yaw);
      let need = 0;
      for (const [grip, SS] of [[sp.rightGrip, 'R'], [lgOf(s), 'L']]) {
        _gcH.setFromMatrixPosition(_gcM.multiplyMatrices(w.gun.matrixWorld, grip));
        s.char.bone('shoulder' + SS).getWorldPosition(_gcS);
        for (const t of [0.12, 0.28, 0.42]) {
          _gcP.copy(_gcH).lerp(_gcS, t);
          /* сколько нужно сдвинуть вперёд, чтобы точка вышла из корпуса */
          let sum = 0;
          for (let k = 0; k < 3; k++) {
            const pen = RR.torsoPen(T, _gcI, _gcP, 0.045, _gcT);
            if (pen < 0.015) break;
            const dd = (pen - 0.01) * 1.1;
            _gcP.x += fx * dd; _gcP.z += fz * dd; sum += dd;
          }
          need = Math.max(need, sum);
        }
      }
      need = Math.min(0.12, Math.max(0, need)) * kW;
      st.v = need > st.v ? U.damp(st.v, need, 18, dt) : U.damp(st.v, need, 4, dt);
      if (st.v < 0.002) return;
      w.root.position.x += fx * st.v; w.root.position.z += fz * st.v;
      w.root.updateMatrixWorld(true);
    }
    /* v16: оружие бойца со стороны тоже не проходит сквозь стену, дерево
       или товарища: луч от затыльника вдоль ствола (fpRay); если дуло
       упирается — ствол уводится вниз вокруг затыльника (до 60°) и
       чуть подтягивается к себе; руки идут следом через IK (npcHands). */
    const _goB = new THREE.Vector3(), _goM = new THREE.Vector3(), _goD = new THREE.Vector3(), _goA = new THREE.Vector3(), _goQ = new THREE.Quaternion(), _goUp = new THREE.Vector3(0, 1, 0);
    function gunObst(s, dt) {
      const w = s.gun, st = s._go || (s._go = { v: 0 });
      if (!w || !w.muzzleLocal || s.dead) { st.v = 0; return; }
      w.root.updateMatrixWorld(true);
      _goB.setFromMatrixPosition(w.root.matrixWorld);
      w.gun.localToWorld(_goM.copy(w.muzzleLocal));
      _goD.subVectors(_goM, _goB);
      const L = _goD.length();
      if (L < 0.2) return;
      _goD.divideScalar(L);
      /* луч — со смещением 5 см вперёд от затыльника: сам боец не мешает */
      const h = fpRay(_goB.addScaledVector(_goD, 0.05), _goD, L + 0.03, s, true);
      const need = h ? U.clamp01((L + 0.03 - h.distance) / (L * 0.55)) : 0;
      st.v = need > st.v ? U.damp(st.v, need, 14, dt) : U.damp(st.v, need, 5, dt);
      if (st.v < 0.01) return;
      _goA.crossVectors(_goD, _goUp);
      if (_goA.lengthSq() < 1e-6) return;
      _goA.normalize();
      w.root.quaternion.premultiply(_goQ.setFromAxisAngle(_goA, -st.v * 1.05));
      w.root.position.addScaledVector(_goD, -0.06 * st.v);
      w.root.updateMatrixWorld(true);
    }
    /* v25: у бойцов от третьего лица указательный вне спуска не торчит
       прямой «спицей»: лежит вдоль скобы, чуть согнут в суставах. Только для
       хвата с прямым пальцем (у гранаты палец уже обхватывает корпус). */
    function tpIndexed(sp) {
      const H = sp.hands;
      if (H._tpIdx && H._tpIdxOf === H.indexed) return H._tpIdx;
      const VM = root.GVM, ix = H.indexed && H.indexed.index;
      H._tpIdxOf = H.indexed;
      if (!VM || !ix || ix[1] > 0.12 || ix[2] > 0.3) return (H._tpIdx = H.indexed);
      const q = VM.clonePose(H.indexed);
      q.index = [ix[0], 0.14, 0.34, 0.16, -0.04];
      return (H._tpIdx = q);
    }
    function npcHands(s) {
      const sp = s.wspec;
      if (!sp || !s.char.hands || !s.gun) { s.rig.handTargets = null; return; }
      const H = s.rig.handTargets || (s.rig.handTargets = { R: new THREE.Matrix4(), L: new THREE.Matrix4() });
      s.gun.gun.updateMatrixWorld(true);
      _gw.copy(s.gun.gun.matrixWorld);
      H.R.multiplyMatrices(_gw, sp.rightGrip);
      H.L.multiplyMatrices(_gw, lgOf(s));
      s.rig.handPoses = { R: tpIndexed(sp), L: sp.hands.support };
      s.rig.triggerPose=sp.hands.trigger; s._tpBound=1;
      tpReload(s, H);
      const plan=s.ctrl.reload>=0&&s.ctrl.reloadPlan,release=plan?.track?.magRelease;
      if(release&&release[0]>=0&&sp.hands.magRelease&&root.GVM){
        const t=s.ctrl.reload*(plan.speed||1),[a,b]=release;
        const k=U.smoothstep(U.clamp01((t-a)/.07))*(1-U.smoothstep(U.clamp01((t-b+.1)/.1)));
        s._tpReleasePose=s._tpReleasePose||root.GVM.clonePose(sp.hands.indexed);
        root.GVM.lerpPose(tpIndexed(sp),sp.hands.magRelease,k,s._tpReleasePose);s.rig.handPoses.R=s._tpReleasePose;
      }
      /* v23: перелаз без упора (низкая преграда) — оружие остаётся в руках */
      const vHands=!!s.ctrl.vault&&!s.ctrl.vault.handsOff;
      /* v25: оружие на плече — подгонка хвата не двигает его к кистям */
      if(!s._tacHands&&!vHands&&!(s._shB>0)) finalHandContacts(s,H);
      if(s._tacHands||vHands){s.rig.triggerPose=null;s.rig.handPoses={R:sp.hands.support,L:sp.hands.support};const chest=s.char.bone('chest');const q=chest.getWorldQuaternion(new THREE.Quaternion());const p=chest.getWorldPosition(new THREE.Vector3());s.gun.root.position.copy(p).add(new THREE.Vector3(.12,-.12,.20).applyQuaternion(q));s.gun.root.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(.15,0,2.9)));s.gun.root.updateMatrixWorld(true);if(vHands&&s.ctrl.vault.style==='climbOver')F.climbSling(s);if(s._tacHands)for(const side of ['R','L']){const p=s._tacHands[side];H[side].setPosition(p.x,p.y,p.z);}}

    }

    /* v13: перезарядка генерала со стороны — по ТОЙ ЖЕ дорожке, что и у
       рук от первого лица (spec.tactical / spec.empty: ключи левой кисти
       grip → mag → pouch → mag → grip, события grabOld/magOut/drop/pouch/
       grab/magIn/seat). Раньше у бойца со стороны оружие только опускалось,
       а кисть оставалась на цевье и магазин не двигался. Теперь левая кисть
       берёт магазин, вынимает его (АК — «выкатывает» вперёд-вниз), бросает
       (магазин падает телом), идёт к подсумку на груди (точка подсумка —
       как у камеры от первого лица, от глаз бойца), достаёт новый, вводит
       передним зубом и досылает, при пустом — передёргивает затвор.
       Магазин в руке — копия положения кисти: rel = seat⁻¹·кисть·magInHand. */
    const _tpA = new THREE.Matrix4(), _tpB = new THREE.Matrix4(), _tpE = new THREE.Matrix4(), _tpS = new THREE.Matrix4(), _tpO = new THREE.Matrix4(),
      _tpPa = new THREE.Vector3(), _tpPb = new THREE.Vector3(), _tpQa = new THREE.Quaternion(), _tpQb = new THREE.Quaternion(), _tpSc = new THREE.Vector3(),
      _tpY = new THREE.Quaternion(), _tpV = new THREE.Vector3(), _tpQ = new THREE.Quaternion(), _tpEu = new THREE.Euler(), _tpI = new THREE.Matrix4(), _tpOne = new THREE.Vector3(1, 1, 1);
    let TP_KEEP = 0.24, TP_FWD = 0.10;   // v14: автомат при смене магазина на 10 см от груди (подбор: меньше всего касаний плеча о плитник)
    const _tpPo = new THREE.Matrix4(), _tpPoff = new THREE.Matrix4().makeTranslation(0.01, -0.035, -0.085);
    function tpFrame(s, k, out) {
      const sp = s.wspec;
      switch (k.at) {
        case 'grip': return out.multiplyMatrices(_gw, lgOf(s));
        case 'gun': return out.multiplyMatrices(_gw, k.gun);
        /* v14: подсумок со стороны — на ПОВЕРХНОСТИ плитника. Точка от первого
           лица (5 см перед глазами) у тела оказывалась внутри плитоноски:
           решатель локтя выводил руку «крылом» вбок, кисть лезла сквозь
           жилет. Подсумки на передней панели — ниже и на 8 см дальше. */
        case 'pouch': return out.multiplyMatrices(_tpE, _tpPo.multiplyMatrices(_tpPoff, sp.pouch));
        case 'mag': {
          const m = k.mag || [0, 0, 0];
          _tpO.compose(_tpV.set(k.clear || 0, m[0], m[1]), _tpQ.setFromEuler(_tpEu.set(m[2], 0, 0)), _tpOne);
          return out.multiplyMatrices(_tpS, _tpO).multiply(_tpI.copy(sp.magInHand).invert());
        }
        default: return out.multiplyMatrices(_gw, sp.leftGrip);
      }
    }
    function tpReload(s, H) {
      const c = s.ctrl, w = s.gun, sp = s.wspec, R = c.reloadPlan;
      const st = s._tpr || (s._tpr = { on: false, mag: 'gun', t: 0, pose: null });
      const tr = R && c.reload >= 0 ? R.track : null;
      if (!tr || !tr.left || !tr.left.length || !sp.magInHand) {
        if(w._tpShell)w._tpShell.visible=false;
        if (st.on) { st.on = false; st.mag = 'gun'; if (w.magObj && GN) GN.setMag(w, null, true); }
        return;
      }
      const t = c.reload * (R.speed || 1);
      if (!st.on || st.track!==tr || t<st.t) { st.on = true; st.track=tr;st.t = 0; st.mag = 'gun';st.shell=false; }
      /* события дорожки между прошлым и текущим кадром */
      for (const [te, e] of tr.events || []) {
        if (!(te > st.t && te <= t)) continue;
        st.ev = e; st.evN = (st.evN || 0) + 1;   // для лаборатории: пошаговый разбор
        if (e === 'grabOld' || e === 'grab') st.mag = 'hand';
        else if (e === 'drop') { if (w.magObj && !s.active) dropMag(s, null); st.mag = 'none'; }
        else if (e === 'seat') st.mag = 'gun';
        else if(e==='grabShell')st.shell=true;else if(e==='shellIn')st.shell=false;
      }
      st.t = t;
      /* подсумок — от глаз бойца, только по курсу (не по тангажу) */
      _tpY.setFromEuler(_tpEu.set(0, c.yaw, 0, 'YXZ'));
      _tpE.compose(F.eyePosition(s), _tpY, _tpOne);
      const s0 = w.magSeat;
      _tpS.copy(_gw).multiply(_tpO.makeTranslation(s0.x, s0.y, s0.z));
      const keys = tr.left, n = keys.length;
      let i = 0;
      while (i < n - 2 && t > keys[i + 1].t) i++;
      const a = keys[i], b = keys[Math.min(i + 1, n - 1)];
      const u = b.t > a.t ? U.clamp01((t - a.t) / (b.t - a.t)) : 1, e = U.smoothstep(u);
      /* досылание (кисть на рукоятке затвора поверх ствольной коробки):
         оружие уходит на 7 см вперёд — предплечье не ложится в плитник */
      const kG = (a.at === 'gun' ? 1 - e : 0) + (b.at === 'gun' ? e : 0);
      /* и вся смена магазина — ещё на 6 см от груди: горловина там, где
         левой руке не нужно прижимать локоть к плитнику */
      const dur = tr.duration || R.dur || 2;
      const kW = U.smoothstep(U.clamp01(t / 0.35)) * U.smoothstep(U.clamp01((dur - t) / 0.35));
      const fwd = TP_FWD * kW + 0.07 * kG;
      if (fwd > 0.001) {
        w.root.position.x -= Math.sin(c.yaw) * fwd; w.root.position.z -= Math.cos(c.yaw) * fwd;
        w.root.position.y += 0.02 * kG;
        /* мировые матрицы оружия пересчитает рендер; здесь — тот же сдвиг
           готовой матрицей (без обхода всего дерева модели каждый кадр) */
        _gw.premultiply(_tpI.makeTranslation(-Math.sin(c.yaw) * fwd, 0.02 * kG, -Math.cos(c.yaw) * fwd));
        H.R.multiplyMatrices(_gw, sp.rightGrip);
        _tpS.copy(_gw).multiply(_tpO.makeTranslation(s0.x, s0.y, s0.z));
      }
      tpFrame(s, a, _tpA).decompose(_tpPa, _tpQa, _tpSc);
      tpFrame(s, b, _tpB).decompose(_tpPb, _tpQb, _tpSc);
      const dist = _tpPa.distanceTo(_tpPb);
      _tpPa.lerp(_tpPb, e);
      const contact = a.at === b.at && (a.at === 'mag' || a.at === 'gun' || a.at === 'grip');
      if (!contact) _tpPa.y -= Math.sin(u * Math.PI) ** 2 * Math.min(0.035, dist * 0.12);
      if ((a.at === 'mag' && b.at === 'gun') || (a.at === 'gun' && b.at === 'mag')) {
        _tpPa.add(_tpV.set(-0.8, 0.6, 0).transformDirection(_gw)
          .multiplyScalar(0.045 * Math.sin(u * Math.PI) ** 2));
      }
      /* от подсумка к горловине и обратно кисть идёт дугой ОТ груди: по
         прямой локоть прижимался и плечо входило в плитник */
      if (a.at === 'pouch' || b.at === 'pouch') {
        const fb = Math.sin(u * Math.PI) * Math.min(0.09, dist * 0.45);
        _tpPa.x -= Math.sin(c.yaw) * fb; _tpPa.z -= Math.cos(c.yaw) * fb;
      }
      /* v14: кисть не заходит в плитник: в зоне груди/живота (от 15 до
         65 см ниже глаз) цель держится не ближе 24 см перед глазами по
         курсу — после сброса магазина рука раньше проваливалась в корпус */
      {
        const ex = _tpE.elements[12], ey = _tpE.elements[13], ez = _tpE.elements[14];
        const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
        const dy = _tpPa.y - ey, fwd = (_tpPa.x - ex) * fx + (_tpPa.z - ez) * fz;
        const freeA=a.at==='pouch'?1:0,freeB=b.at==='pouch'?1:0;
        const KO = (freeA*(1-e)+freeB*e)*TP_KEEP * U.smoothstep(U.clamp01((-dy - 0.1) / 0.08)) * U.smoothstep(U.clamp01((0.7 + dy) / 0.08));
        if (fwd < KO) { _tpPa.x += fx * (KO - fwd); _tpPa.z += fz * (KO - fwd); }
      }
      s._tpBound=((a.at==='pouch'?0:1)*(1-e)+(b.at==='pouch'?0:1)*e);
      const turn = u * u * u * (u * (u * 6 - 15) + 10);
      H.L.compose(_tpPa, _tpQa.slerp(_tpQb, turn), _tpOne);
      const VM = root.GVM;
      if (VM && VM.lerpPose && sp.hands[a.pose] && sp.hands[b.pose]) {
        st.pose = st.pose || VM.clonePose(sp.hands.support);
        VM.lerpPose(sp.hands[a.pose], sp.hands[b.pose], e, st.pose);
        s.rig.handPoses = { R: tpIndexed(sp), L: st.pose };
      }
      if (!w.magObj || !GN) return;
      if (st.mag === 'hand') {
        _tpB.copy(_tpS).invert().multiply(H.L).multiply(sp.magInHand);
        GN.setMag(w, _tpB, true);
      } else GN.setMag(w, null, st.mag !== 'none');
    }

    /* Solve the final, animated contact pair, not the static support grip.
       Weapon-bound targets move rigidly with the gun; a pouch hand stays in
       body space. This runs AFTER recoil/reload offsets and before arm IK. */
    function finalHandContacts(s,H){
      const RR=RIG?.Rig,T=RR?.torsoModel(s.char);if(!T)return;
      const V=THREE.Vector3, inv=new THREE.Matrix4().copy(s.char.bone('chest').matrixWorld).invert(),tmp=new V();
      if(s._handContactFor!==s.wspec){s._handContactOffset=null;s._handContactFor=s.wspec;}
      const rest=s.char.rest, bound=s._tpBound??1, targets={}, shoulders={}, lengths={}, armLengths={}, handAxes={};
      for(const side of ['R','L']){
        targets[side]=new V().setFromMatrixPosition(H[side]);shoulders[side]=s.char.bone('shoulder'+side).getWorldPosition(new V());
        const dist=(a,b)=>Math.hypot(...rest[a].map((v,i)=>v-rest[b][i]));
        armLengths[side]=[dist('shoulder'+side,'elbow'+side),dist('elbow'+side,'wrist'+side)];
        lengths[side]=(armLengths[side][0]+armLengths[side][1])*.965;
        const hq=new THREE.Quaternion().setFromRotationMatrix(H[side]);
        handAxes[side]=new V(side==='R'?1:-1,0,0).applyQuaternion(root.GAK.wristQuat(hq,side,new THREE.Quaternion()));
      }
      const optimalElbow=new V(),circleCenter=new V(),pole=new V(),sample=new V();
      const contactRotation=s.char.bone('chest').getWorldQuaternion(new THREE.Quaternion());
      const prior=(s._handContactOffset||new V()).clone();
      if(s._handContactRotation)prior.applyQuaternion(s._handContactRotation.clone().invert()).applyQuaternion(contactRotation);
      s._handContactRotation=contactRotation.clone();
      const point=new V(),near=new V(),previous=prior,offset=previous.clone().multiplyScalar(Math.exp(-5*(s.rig.poseDt||1/60))),candidate=new V();
      const cost=(d)=>{let value=d.lengthSq()*.035+d.y*d.y*.3+d.distanceToSquared(previous)*.08;
        for(const side of ['R','L']){const k=side==='R'?1:bound;
          point.copy(targets[side]).addScaledVector(d,k);
          value+=Math.max(0,point.distanceTo(shoulders[side])-lengths[side])**2*100;
          const direction=near.copy(point).sub(shoulders[side]),armD=direction.length(),[a,b]=armLengths[side];
          if(armD>.001){const axial=U.clamp((armD*armD+b*b-a*a)/(2*armD*b),-1,1),alpha=Math.acos(U.clamp(direction.multiplyScalar(1/armD).dot(handAxes[side]),-1,1));
            const minBend=Math.abs(alpha-Math.acos(axial));value+=Math.max(0,minBend-1.10)**2*.15;
            const ca=U.clamp((a*a+armD*armD-b*b)/(2*a*armD),-1,1),radius=a*Math.sqrt(Math.max(0,1-ca*ca));
            circleCenter.copy(shoulders[side]).addScaledVector(direction,a*ca);
            pole.copy(point).addScaledVector(handAxes[side],-b).sub(circleCenter);pole.addScaledVector(direction,-pole.dot(direction));
            if(pole.lengthSq()>1e-8){pole.normalize();optimalElbow.copy(circleCenter).addScaledVector(pole,radius);
              let penetration=RR.torsoPen(T,inv,optimalElbow,.04,tmp);
              sample.copy(optimalElbow).lerp(point,.5);penetration=Math.max(penetration,RR.torsoPen(T,inv,sample,.04,tmp));
              value+=penetration*penetration*60;}
          }
          value+=RR.torsoPen(T,inv,point,.039,tmp)**2*100;
          for(const f of [.12,.28]){near.copy(point).lerp(shoulders[side],f);value+=RR.torsoPen(T,inv,near,.04,tmp)**2*35;}
        }return value;};
      offset.y=U.clamp(offset.y,-(s.ctrl.ads>.5?.02:.06),s.ctrl.ads>.5?.02:.06);
      // Cache a deterministic local-space solution while the geometric input
      // is unchanged. Otherwise regularization against last frame feeds the
      // coordinate search back into itself, producing a stationary limit cycle.
      const input=[];
      for(const side of ['R','L']){
        for(const v of [targets[side],shoulders[side]])input.push(...v.clone().applyMatrix4(inv).toArray());
        input.push(...handAxes[side].clone().applyQuaternion(contactRotation.clone().invert()).toArray());
      }input.push(bound);
      const held=s._handContactGoal, reuse=held&&held.spec===s.wspec&&held.input.length===input.length&&input.every((v,i)=>Math.abs(v-held.input[i])<.0002);
      if(reuse)offset.copy(held.local).applyQuaternion(contactRotation);
      let score=cost(offset);
      if(!reuse&&score>1e-5)for(const step of [.08,.04,.02,.01,.005])for(let pass=0;pass<3;pass++){
        let best=score;const chosen=offset.clone();
        for(const axis of ['x','y','z'])for(const sign of [-1,1]){candidate.copy(offset);candidate[axis]+=step*sign;
          if(candidate.length()>.24||Math.abs(candidate.y)>(s.ctrl.ads>.5?.02:s.ctrl.reload>=0?.09:.06))continue;const v=cost(candidate);if(v<best){best=v;chosen.copy(candidate);}}
        if(best>=score-1e-9)break;offset.copy(chosen);score=best;
      }
      if(!reuse)s._handContactGoal={spec:s.wspec,input,local:offset.clone().applyQuaternion(contactRotation.clone().invert())};
      const contactDt=Math.min(.1,Math.max(1/240,s.rig.poseDt||1/60));
      const difference=offset.clone().sub(previous);
      // Continuous, actor-local solver output: 2 mm hysteresis removes the
      // coordinate-search grid chatter; capped exponential response keeps recoil.
      if(difference.length()<.002)offset.copy(previous);
      else {difference.multiplyScalar(1-Math.exp(-contactDt*12));difference.clampLength(0,contactDt*.7);offset.copy(previous).add(difference);}
      // A held control cannot lag beyond the arm's true reach. Project the
      // common weapon correction into BOTH reach spheres after damping.
      for(let pass=0;pass<8;pass++)for(const side of ['R','L']){
        if(side==='L'&&bound<.999)continue;
        point.copy(targets[side]).add(offset);near.copy(point).sub(shoulders[side]);
        const d=near.length(),limit=(armLengths[side][0]+armLengths[side][1])*.985;
        if(d>limit)offset.addScaledVector(near,(limit-d)/d);
      }
      s._handContactOffset=offset.clone();
      if(offset.lengthSq()>1e-10){s.gun.root.position.add(offset);s.gun.root.updateMatrixWorld(true);
        _gw.copy(s.gun.gun.matrixWorld);const shift=new THREE.Matrix4().makeTranslation(offset.x,offset.y,offset.z);
        H.R.premultiply(shift);H.L.elements[12]+=offset.x*bound;H.L.elements[13]+=offset.y*bound;H.L.elements[14]+=offset.z*bound;
        _tpS.premultiply(shift);
      }
      // Free transit is allowed to avoid the vest, never a charging/foreend contact.
      if(bound<.999){point.setFromMatrixPosition(H.L);const forward=new V(-Math.sin(s.ctrl.yaw),0,-Math.cos(s.ctrl.yaw));
        for(let i=0;i<8;i++){const depth=RR.torsoPen(T,inv,point,.04,tmp);if(depth<.002)break;point.addScaledVector(forward,Math.min(.025,depth+.002)*(1-bound));}
        const reach=point.clone().sub(shoulders.L);if(reach.length()>lengths.L)point.copy(shoulders.L).add(reach.setLength(lengths.L));H.L.setPosition(point);
      }
      if(bound<.999){
        // Only an unbound transit/pouch hand may change its wrist orientation.
        // The held magazine/shell follows this same final target, not a stale key.
        const q=new THREE.Quaternion(),scale=new V(),p=new V();H.L.decompose(p,q,scale);
        const axis=new V(-1,0,0).applyQuaternion(root.GAK.wristQuat(q,'L',new THREE.Quaternion()));
        const direction=p.clone().sub(shoulders.L).normalize();
        const correction=new THREE.Quaternion().setFromUnitVectors(axis,direction);
        correction.slerp(new THREE.Quaternion(),bound);q.premultiply(correction);H.L.compose(p,q,scale);
      }
      if(s.wspec.fam==='pump'){
        const w=s.gun;
        if(!w._tpShell&&s._tpr?.shell){
          const shell=new THREE.Group();shell.name='tp-shell-12g';
          const body=new THREE.Mesh(new THREE.CylinderGeometry(.009,.009,.048,12),new THREE.MeshStandardMaterial({color:0x9d3426,roughness:.6}));
          const rim=new THREE.Mesh(new THREE.CylinderGeometry(.0095,.0095,.008,12),new THREE.MeshStandardMaterial({color:0xb49a50,metalness:.7,roughness:.35}));rim.position.y=-.028;shell.add(body,rim);
          w._tpShell=shell;w.root.add(shell);
        }
        if(w._tpShell){w._tpShell.visible=!!(s._tpr?.on&&s._tpr.shell&&s.ctrl.reload>=0);
          if(w._tpShell.visible){const m=new THREE.Matrix4().copy(w.root.matrixWorld).invert().multiply(H.L).multiply(new THREE.Matrix4().makeTranslation(0,-.015,-.035));m.decompose(w._tpShell.position,w._tpShell.quaternion,w._tpShell.scale);}}
      }
      if(s._tpr?.on&&s._tpr.mag==='hand'&&s.gun.magObj){_tpB.copy(_tpS).invert().multiply(H.L).multiply(s.wspec.magInHand);GN.setMag(s.gun,_tpB,true);}
    }

    /* ================================================== АРСЕНАЛ ======== */
    /* Снаряжение генерала — 6 слотов (AEGIS.put/clear): основное оружие,
       пистолет, патроны к ним, гранаты. Оружие собирается по настройке из
       оружейной (L.cfg[id]); у каждого — своё состояние патронов. В руках у
       генерала со стороны — основное оружие (если есть), иначе руки по швам. */
    /* патроны всех калибров — в таблицу поражения */
    const GDM = root.GDamage || null;
    if (GN && GDM) for (const cal of Object.keys(GN.AMMO)) for (const a of GN.AMMO[cal]) {
      if (!GDM.AMMO[a.id]) GDM.AMMO[a.id] = { name: a.name, v0: 880 * (a.vK || 1), pen: a.pen };
    }
    if (GR) try { GR.init(renderer, C.SET.quality); } catch (e) { console.warn('grenades init', e); }
    const gAt0 = (x, z) => squad[0].ctrl.groundAt(x, z);
    const GSIM = GR ? GR.createSim({
      scene, world, heightAt: gAt0, colliders: world.colliders,
      onBounce: (g, v, surf) => { if (audio.grenade && v > 0.6) audio.grenade('bounce', F.spatialFrom(g.pos), Math.min(1.2, v / 6)); },
      onDetonate: (g) => grenadeBlast(g),
      onDebris: (d, v) => { if (audio.grenade && d.sound) audio.grenade(d.sound === 'hard' ? 'hard' : 'spoon', F.spatialFrom(d.obj.position), Math.min(1, v / 4)); }
    }) : null;
    C.GSIM = GSIM;
    /* v22: дымовые завесы (js/polygon/26c_smoke.js) */
    if (root.GSmoke) try { root.GSmoke.init({ THREE, scene, audio, sun, groundAt: gAt0, atlas: F.BLAST && F.BLAST.atlas, quality: C.SET.quality }); } catch (e) { console.warn('smoke init', e && e.message); }
    if (root.GPhysics) fx.setCasePhysics(root.GPhysics.get(world));
    fx.groundAt = gAt0;   // v6: гильзы падают на рельеф, а не на y = 0

    function cfgFor(s, id) {
      let cfg = s.L && s.L.cfg ? s.L.cfg[id] : null;
      if (!cfg) { try { cfg = JSON.parse(localStorage.getItem('aegis.gs.' + s.key + '.' + id) || 'null'); } catch (e) { cfg = null; } }
      return cfg || null;
    }
    function freshState(inv, L) {
      const cap = inv.w.stats.magCap || 30;
      inv.st = { mag: Math.max(0, cap - 1), chamber: 1, reserve: AE ? AE.ammoOf(L, inv.kind) : 0, fireMode: inv.st ? inv.st.fireMode : null, boltOpen: false };
    }
    function disposeInv(s) {
      for (const k of ['primary', 'pistol']) {
        const it = s.inv[k];
        if (!it) continue;
        if (it.w.root.parent) it.w.root.parent.remove(it.w.root);
        try { GN.dispose(it.w); } catch (e) { /* уже освобождено */ }
        s.inv[k] = null;
      }
      s.gun = null; s.wspec = null; s.cur = null;
    }
    function buildInv(s) {
      disposeInv(s);
      const L = s.L;
      if (GN && AE) for (const kind of ['primary', 'pistol']) {
        const id = AE.weaponOf(L, kind);
        if (!id) continue;
        let w;
        try { w = GN.build(id, cfgFor(s, id), { noShadow: C.SET.quality === 'low' }); }
        catch (e) { console.warn('сборка ' + id, e); continue; }
        const spec = GN.createSpec(w);
        w.root.visible = false;
        scene.add(w.root);
        const types = w.ammoTypes || [];
        let ai = types.findIndex((t) => t.id === '7N10');
        if (ai < 0) ai = 0;
        const inv = { kind, id, w, spec, ammoI: ai, light: false, laser: false, bipod: false, ga: undefined, st: null };
        freshState(inv, L);
        s.inv[kind] = inv;
      }
      s.used = {};
      s.slot = -1;
      s.cur = null;
      npcGun(s);
    }
    /* генерал со стороны: основное оружие в руках (на ремне / наготове) */
    function npcGun(s) {
      const P = s.inv.primary;
      for (const k of ['primary', 'pistol']) if (s.inv[k]) s.inv[k].w.root.visible = false;
      s.gun = P ? P.w : null;
      s.wspec = P ? P.spec : null;
      if (P) {
        P.w.root.visible = true;
        s.ctrl.setWeapon(P.w, P.st);
        s.ctrl.trackFor = trackFor(s);
      } else s.ctrl.setWeapon(null);
    }
    function trackFor(s) {
      return (kind, n, pumpAfter) => {
        const sp = s.wspec;
        if (!sp) return null;
        if (kind === 'tube') return sp.pumpTrack ? sp.pumpTrack(n, pumpAfter) : sp.tactical;
        /* v8: устранение задержки: двойная подача — полная «пустая»
           перезарядка (магазин вон, передёрнуть, магазин на место);
           недосыл/«труба» — «хлопнул по магазину — передёрнул» */
        if (kind === 'clear_double') return sp.empty || sp.tactical;
        if (kind === 'clear') return sp._clear || (sp._clear = clearTrack(sp));
        return kind === 'empty' ? sp.empty : sp.tactical;
      };
    }
    /* «хлопнул-передёрнул» (tap-rack) из дорожки «пустой» перезарядки:
       ладонь бьёт по магазину снизу, затем — та же рука на затвор, что и
       в конце пустой перезарядки (рукоятка АК, рукоятка AR, затвор MP5/Glock) */
    function clearTrack(sp) {
      const E = sp.empty || sp.tactical;
      if (!E) return null;
      const evs = E.events || [];
      let tc = Infinity;
      for (const [t, e] of evs) if (/chargeBack|hkLock|release|boltCatch/.test(e)) tc = Math.min(tc, t);
      if (!isFinite(tc)) tc = E.duration * 0.6;
      const t0 = Math.max(0, tc - 0.32), sh = 0.42 - t0;
      const keep = (arr) => (arr || []).filter((k) => (k[0] !== undefined ? k[0] : k.t) >= t0);
      const shiftV = (arr) => keep(arr).map((k) => [k[0] + sh, k[1]]);
      const left = [{ t: 0, at: 'grip', pose: 'support' },
        { t: 0.16, at: 'mag', mag: [0, 0, 0], pose: 'mag' },
        { t: 0.24, at: 'mag', mag: [0, 0.006, 0], pose: 'mag' },
        { t: 0.3, at: 'mag', mag: [0, 0, 0], pose: 'open' }];
      for (const k of (E.left || [])) if (k.t >= t0) left.push(Object.assign({}, k, { t: k.t + sh }));
      const dur = E.duration - t0 + 0.42;
      const tr = {
        duration: dur,
        gunPos: [[0, [0, 0, 0]], [0.2, [-0.01, 0.025, -0.01]], [0.34, [-0.012, 0.03, -0.02]], ...shiftV(E.gunPos)],
        gunRot: [[0, [0, 0, 0]], [0.2, [5, 3, -10]], [0.34, [6, 4, -14]], ...shiftV(E.gunRot)],
        left,
        events: [[0.22, 'seat'], ...keep(E.events).map(([t, e]) => [t + sh, e])],
        magRelease: [-9, -8]
      };
      if (E.rack) tr.rack = E.rack.map((t) => t + sh);
      if (E.pump) tr.pump = E.pump.map((t) => t + sh);
      if (tr.gunPos[tr.gunPos.length - 1][0] < dur) tr.gunPos.push([dur, [0, 0, 0]]);
      if (tr.gunRot[tr.gunRot.length - 1][0] < dur) tr.gunRot.push([dur, [0, 0, 0]]);
      return tr;
    }
    /* v22: копия снаряжения бойца (слоты + настройки обвеса) — для перехода игрока в другое тело */
    function carryLoadout(src) {
      const L = JSON.parse(JSON.stringify(src.L));
      L.cfg = L.cfg || {};
      for (const x of L.slots) if (x && x.t === 'gun' && !L.cfg[x.id]) { const c = cfgFor(src, x.id); if (c) L.cfg[x.id] = JSON.parse(JSON.stringify(c)); }
      return L;
    }
    C.carryLoadout = carryLoadout;
    function resetInvState(s) {
      /* v22: пополнение/новая жизнь — слоты патронов снова полные */
      if (s.L && s.L.slots) for (const x of s.L.slots) if (x && x.t === 'ammo') delete x.n;
      for (const k of ['primary', 'pistol']) if (s.inv[k]) { freshState(s.inv[k], s.L); s.inv[k].bipod = false; }
      s.used = {};
    }
    const curInv = (s) => (s && s.cur && s.cur.kind === 'gun' ? s.cur.inv : null);

    /* ---------------------------------------------- звук оружия --- */
    function gunAudio(inv) {
      if (inv.ga !== undefined && inv.ga !== null) return inv.ga;
      if (!WK || !audio.ctx || !audio.gunBus) return null;
      inv.ga = null;
      try {
        const def = WK.DEFS[inv.id];
        const GA = WK.AUDIO_FAMILY[WK.FAMILY[inv.id]].GunAudio;
        const g = new GA();
        g.wid = inv.id;
        g.profile = Object.assign({}, def.audio || {}, { rpm: def.base.rpm, family: def.family || (inv.id.indexOf('ak') === 0 ? 'ak' : inv.id) });
        const mi = inv.w.asm && inv.w.asm.info('muzzle');
        const mz = mi && mi.muzzle;
        g.muzzle = mz ? mz.kind : 'bare';
        if (mz && mz.kind === 'supp') {
          const part = inv.w.asm.installed.get('muzzle');
          const st = part && part.part && part.part.stats;
          g.voice = Object.assign({ len: (st && st.length) || 170, loud: (st && st.loud !== undefined) ? st.loud : -27 }, mz.voice || {});
        }
        g.init(audio.ctx, audio.gunBus);
        inv.ga = g;
      } catch (e) { console.warn('звук ' + inv.id, e); inv.ga = null; }
      return inv.ga;
    }
    const call = (g, names, ...a) => { if (!g) return false; for (const n of names) if (typeof g[n] === 'function') { try { g[n](...a); } catch (e) { /* звук не критичен */ } return true; } return false; };
    /* Detached magazine: visual clone, Rapier cuboid inertia/collisions.
       At most 8 bodies; sleeping bodies stay registered so lost support can wake them. */
    const MAGS = [];
    const _mgV = new THREE.Vector3(), _mgQ = new THREE.Quaternion(), _mgS = new THREE.Vector3();
    function removeMag(M) {
      M.physics.removeObject(M);
      scene.remove(M.o);
    }
    function dropMag(s, snd) {
      const w = s.gun;
      if (!w || !w.magObj) return false;
      try {
        w.magObj.updateMatrixWorld(true);
        const m = w.magObj.clone(true);
        /* модель оружия в своих единицах — масштаб берём из мировой матрицы */
        w.magObj.matrixWorld.decompose(_mgV, _mgQ, _mgS);
        m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.copy(_mgS); m.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(m);
        if (box.isEmpty()) return false;
        const c = box.getCenter(new THREE.Vector3()), hs = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
        if (hs.x > 0.3 || hs.y > 0.3 || hs.z > 0.3) return false;
        /* узел-обёртка: начало координат — в центре масс магазина */
        const body = new THREE.Group();
        m.position.copy(c).negate();
        body.add(m);
        body.quaternion.copy(_mgQ);
        body.position.copy(c).applyQuaternion(_mgQ).add(_mgV);
        m.traverse((o) => { if (o.isMesh) { o.castShadow = C.SET.quality !== 'low'; o.receiveShadow = true; } });
        scene.add(body);
        const cv = s.ctrl.vel || { x: 0, y: 0, z: 0 };
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(_mgQ); fwd.y = 0;
        if (fwd.lengthSq() > 1e-6) fwd.normalize();
        const M = { o: body,
          v: new THREE.Vector3(cv.x * 0.9 + fwd.x * 0.35, -0.6 + Math.min(0, cv.y || 0), cv.z * 0.9 + fwd.z * 0.35),
          w: new THREE.Vector3((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 7),
          rest: 0, t: 0, snd, physics: root.GPhysics.get(world), seenImpact: 0 };
        const halfExtents = new THREE.Vector3(Math.max(.006, hs.x), Math.max(.006, hs.y), Math.max(.006, hs.z));
        M.physics.dynamicObject(M, {
          pos: body.position, q: body.quaternion, vel: M.v, spin: M.w,
          halfExtents, mass: .33, friction: .65, restitution: .18,
          drag: .08, angularDamping: .3, contactAngularDamping: 4,
          settleRadius: halfExtents.length(), softCcdPrediction: .15,
          collisionGroups: 0x00100001, kind: 'magazine', reportContacts: true,
        });
        MAGS.push(M);
        while (MAGS.length > 8) removeMag(MAGS.shift());
        return true;
      } catch (e) { return false; }
    }
    function magsStep(dt) {
      for (let i = MAGS.length - 1; i >= 0; i--) {
        const M = MAGS[i];
        const registered = M.physics.objects.get(M);
        if (M.rest > .4 && registered?.body.isSleeping()) continue;
        M.rest = 0;
        M.t += dt;
        const o = M.physics.readObject(M, M.o.position, M.o.quaternion, M.v);
        if (!o || M.t > 20 || M.o.position.y < -50) {
          removeMag(M); MAGS.splice(i, 1); continue;
        }
        if (o.impacts > M.seenImpact) {
          M.seenImpact = o.impacts;
          if (M.snd && o.impactSpeed > .5) {
            const snd = M.snd; M.snd = null; snd();
          }
        }
        if (o.body.isSleeping()) {
          M.o.position.copy(o.curr); M.o.quaternion.copy(o.currQ);
          M.rest = .5;
        }
      }
    }
    C.magsStep = magsStep; C.MAGS = MAGS; C.dropMag = dropMag;
    /* выстрелы ботов: сэмплы их оружия + расстояние/перекрытие/ангар (19b_audio_distance) */
    const ADIST = root.GAudioDist ? root.GAudioDist.bind(audio) : null;
    audio.dist = ADIST;   /* v25: далёкий бой (17f_war_atmos.js) играет через тот же банк записей */
    const _adE = new THREE.Vector3(), _adS = new THREE.Vector3();
    function aiShotSound(s) {
      if (!ADIST || !s.char || !s.gun) return false;
      const inv = (s.inv.primary && s.inv.primary.w === s.gun) ? s.inv.primary : (s.inv.pistol && s.inv.pistol.w === s.gun) ? s.inv.pistol : (s.inv.primary || s.inv.pistol);
      const id = (inv && inv.id) || s.gun.id;
      if (!id) return false;
      const p = s.char.root.position;
      ADIST.listen(camera.position, camera.quaternion);
      return ADIST.shot({
        id, key: s.key, x: p.x, y: p.y + ((s.ctrl.prone || 0) > 0.6 ? 0.4 : 1.3), z: p.z,
        supp: !!(s.gun.stats && s.gun.stats.suppressed), indoor: world.mapId === 'angar_map', quality: C.SET.quality,
        occluded: () => { _adE.copy(camera.position); _adS.set(p.x, p.y + 1.3, p.z); return !C.worldVisible(_adE, _adS); }
      });
    }
    C.gunSound = (s, ev) => {
      if (ev === 'shot' && s && !s.active && aiShotSound(s)) return;
      const inv = curInv(s);
      const g = inv ? gunAudio(inv) : null;
      if (ev === 'shot') { if (!call(g, ['shot'])) audio.shot({ vol: 1 }); return; }
      if (!g) { if (ev === 'dryFire') audio.dryFire && audio.dryFire(); else if (ev === 'selector') audio.selector && audio.selector(); return; }
      switch (ev) {
        case 'dryFire': call(g, ['dryFire']); break;
        case 'selector': call(g, ['selector', 'click']); break;
        case 'pumpBack': call(g, ['pumpBack', 'chargeBack']); if (s.gun && s.gun.fam === 'pump' && C.ejectFrom) C.ejectFrom(s.gun); break; /* v10: ejectFrom — из другой области видимости (ReferenceError при передёргивании помпы) */
        case 'pumpFwd': call(g, ['pumpForward', 'chargeRelease']); break;
        case 'magOut': call(g, ['magOut']); break;
        case 'drop': if (!dropMag(s, () => call(g, ['magDropGround']))) call(g, ['magDropGround']); break;
        case 'pouch': case 'grab': case 'grabShell': call(g, ['pouch', 'tug', 'click']); break;
        case 'magIn': call(g, ['magInsert', 'magIn']); break;
        case 'seat': call(g, ['magIn']); break;
        case 'chargeBack': s._charged = true; call(g, ['chargeBack']); break;
        case 'release': if (s._charged) call(g, ['chargeRelease']); else call(g, ['boltCatch', 'chargeRelease']); s._charged = false; break;
        case 'hkLock': call(g, ['hkLock', 'chargeRelease']); break;
        case 'shellIn': call(g, ['shellLoad', 'magIn']); break;
        case 'light': call(g, ['lightSwitch', 'click']); break;
        case 'bipod': call(g, ['bipod', 'click']); break;
        /* v8 хардкор: заклинило — глухой металлический стук затвора */
        case 'jam': if (audio.metalTick) try { audio.metalTick(null, 0.6); } catch (e) { /* */ } break;
        default: break;
      }
    };
    for (const s of squad) s.ctrl.onEvent = (name) => { if (s.active) C.gunSound(s, name); };
    if (BC) BC.onTrackEvent = (e) => { const a = active(); if (a) C.gunSound(a, e); };

    /* тип патрона текущего оружия -> таблица поражения */
    C.ammoFor = (s) => {
      const inv = curInv(s) || (s.inv.primary && s.gun === s.inv.primary.w ? s.inv.primary : null);
      if (!inv || !inv.w.ammoTypes || !inv.w.ammoTypes.length) return null;
      const A = inv.w.ammoTypes[inv.ammoI % inv.w.ammoTypes.length];
      if (GDM && GDM.AMMO[A.id]) GDM.AMMO[A.id].v0 = (inv.w.stats.v0 || 880) * (A.vK || 1);
      return A;
    };

    /* ---------------------------------------- фонарь и ЛЦУ (общие) --- */
    /* Один прожектор и один луч на сцене: переезжают на оружие в руках.
       Свет не добавляется/удаляется (это перекомпилировало бы шейдеры) —
       только интенсивность. */
    const TAC = { spot: null, tgt: null, beam: null, dot: null, ray: new THREE.Raycaster(), host: null };
    TAC.spot = new THREE.SpotLight(0xfff1dc, 0, 55, 0.30, 0.5, 1.4);
    TAC.spot.castShadow = false;
    TAC.tgt = new THREE.Object3D();
    TAC.spot.target = TAC.tgt;
    scene.add(TAC.spot); scene.add(TAC.tgt);
    {
      /* v21: ЛЦУ по физике видимого лазера (AN/PEQ-15: 5 мВт, 635 нм, расходимость 0,5 мрад,
         «>25 м при прямом солнце»). Луч сам по себе не светится — его видно только по свету,
         рассеянному дымкой воздуха к глазу:
           яркость полоски L = β·p(θ)·Φ / ширина,
         β — коэффициент рассеяния дымки (из плотности тумана сцены), p(θ) — индикатриса аэрозоля
         (два члена Хеньи — Гринстейна: 0,96·HG(0,72) + 0,04·HG(−0,45), лидарное отношение ≈ 45 ср),
         Φ — световой поток (5 мВт · 683 лм/Вт · V(λ)). Следствия, как в жизни: у самого модуля
         луч — едва заметная нить, вдаль он гаснет (ширина в пикселях растёт ∝ расстоянию, яркость
         падает ∝ 1/d), со стороны стрелка (рассеяние назад) он в десятки раз слабее, чем для того,
         на кого он направлен (рассеяние вперёд), в тени и при утренней дымке заметнее, на солнце —
         почти не виден. Тоньше пикселя луч не рисуется: полоска шириной ~2 px несёт ту же
         энергию (покрытие), а не «толстый неоновый шнур», как раньше.
         Пятно — гауссов профиль TEM00 диаметром 3 мм + 0,5 мрад·d, освещённость E = 2Φ/(πw²),
         яркость ρE/π — в тех же единицах, что и солнце сцены, поэтому на освещённой стене оно
         бледнеет, а в тени горит; на косой поверхности вытягивается в эллипс, мерцает спеклом. */
      const N = 40, pos = [], side = [], along = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const t = Math.pow(i / N, 2.6);                     // вершины гуще у стрелка
        for (const sd of [-1, 1]) { pos.push(0, 0, 0); side.push(sd); along.push(t); }
        if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      bg.setAttribute('side', new THREE.Float32BufferAttribute(side, 1));
      bg.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
      bg.setIndex(idx);
      const U0 = { uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3(0, 0, -1) }, uPix: { value: 0.001 },
        uColor: { value: new THREE.Color(1, 0.02, 0.01) }, uYc: { value: 0.23 }, uLen: { value: 1 }, uOp: { value: 1 },
        uD0: { value: 0.003 }, uDiv: { value: 0.0005 }, uPhi: { value: 2e-5 }, uBeta: { value: 0.012 }, uFog: { value: 0.006 }, uGain: { value: 130 },
        /* v22: игровой минимум видимости луча днём (физическая модель на солнце давала ~0) */
        uMinC: { value: 0 }, uMinPx: { value: 0.95 } };
      const HG = `float hg(float g, float c) { float g2 = g * g; return (1.0 - g2) / (12.566371 * pow(max(1e-5, 1.0 + g2 - 2.0 * g * c), 1.5)); }`;
      TAC.beam = new THREE.Mesh(bg, new THREE.ShaderMaterial({
        uniforms: U0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: true,
        vertexShader: `attribute float side; attribute float along; uniform vec3 uA, uB; uniform float uPix, uLen, uD0, uDiv, uMinPx;
          varying float vS, vT, vHW, vCos, vDc;
          void main() {
            vec3 P = mix(uA, uB, along);
            vec3 dir = normalize(uB - uA);
            vec3 toCam = cameraPosition - P;
            float d = max(length(toCam), 1e-4);
            vec3 off = normalize(cross(dir, toCam / d));
            float t = along * uLen;
            /* физический диаметр пучка или ~2 px (тоньше пикселя не растеризуется) */
            float hw = max(0.5 * (uD0 + uDiv * t), uMinPx * d * uPix);
            vS = side; vT = t; vHW = hw; vCos = dot(dir, toCam / d); vDc = d;
            gl_Position = projectionMatrix * viewMatrix * vec4(P + off * side * hw, 1.0);
          }`,
        fragmentShader: `uniform vec3 uColor; uniform float uYc, uOp, uPhi, uBeta, uFog, uGain, uMinC, uPix; varying float vS, vT, vHW, vCos, vDc;
          ${HG}
          void main() {
            float x = abs(vS);
            float prof = exp(-x * x * 4.5) * 2.4;              /* профиль поперёк полоски, среднее = 1 */
            float ph = 0.96 * hg(0.72, vCos) + 0.04 * hg(-0.45, vCos);
            float Tb = exp(-uBeta * vT);                         /* ослабление от модуля до точки */
            float Tc = exp(-uFog * uFog * vDc * vDc);            /* дымка сцены между точкой и глазом */
            float L = uGain * uBeta * ph * uPhi * Tb * Tc / (2.0 * vHW) * smoothstep(0.0, 0.006, vT) * uOp;
            /* v22: днём — не меньше игрового минимума: тонкая красная нить видна на солнце
               (энергия на пиксель экрана постоянна: широкая у объектива полоска — тусклее) */
            float cover = min(1.0, 1.7 * vDc * uPix / (2.0 * vHW));
            float m = uMinC * cover * exp(-vT / 75.0) * (0.6 + 0.4 * smoothstep(-0.3, 0.8, vCos)) * smoothstep(0.05, 0.6, vT) * uOp;
            gl_FragColor = vec4(uColor * max(L / uYc, m) * prof, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`
      }));
      TAC.beam.visible = false; TAC.beam.userData.noAO = true; TAC.beam.frustumCulled = false; TAC.beam.renderOrder = 5;
      /* v26: «сердцевина» луча с обычным (не аддитивным) смешиванием. Аддитивный красный на светлом
         фоне (небо, песок, стена на солнце) ничего не меняет — красный канал там и так у предела,
         поэтому днём луча не было видно совсем. Сердцевина — насыщенная нить ~2 px, плотнее у модуля,
         гаснет к 40–60 м; ночью она едва заметна и луч, как раньше, «светится» по физике дымки.
         Настоящий 5-мВт луч на солнце почти не виден — это игровая условность, как в большинстве шутеров. */
      U0.uCoreA = { value: 0 };
      TAC.core = new THREE.Mesh(bg, new THREE.ShaderMaterial({
        uniforms: U0, transparent: true, depthWrite: false, toneMapped: false,
        vertexShader: TAC.beam.material.vertexShader,
        fragmentShader: `uniform vec3 uColor; uniform float uCoreA, uOp; varying float vS, vT, vHW, vCos, vDc;
          void main() {
            float x = abs(vS);
            float prof = exp(-x * x * 3.0);
            float a = uCoreA * prof * uOp * smoothstep(0.05, 0.5, vT) * (0.3 + 0.7 * exp(-vT / 32.0)) * (0.75 + 0.25 * smoothstep(-0.3, 0.8, vCos));
            gl_FragColor = vec4(uColor, a);
          }`
      }));
      TAC.core.visible = false; TAC.core.userData.noAO = true; TAC.core.frustumCulled = false; TAC.core.renderOrder = 4;
      const dg = new THREE.PlaneGeometry(1, 1);
      TAC.DU = { uP: { value: new THREE.Vector3() }, uN: { value: new THREE.Vector3(0, 1, 0) }, uAx: { value: new THREE.Vector3(1, 0, 0) },
        uEl: { value: 1 }, uRs: { value: 0.005 }, uPk: { value: 0.03 }, uSeed: { value: 0 }, uRePx: { value: 1.1 },
        uPix: U0.uPix, uColor: U0.uColor, uYc: U0.uYc, uFog: U0.uFog };
      TAC.dot = new THREE.Mesh(dg, new THREE.ShaderMaterial({
        uniforms: TAC.DU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: true,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
        vertexShader: `uniform vec3 uP, uN, uAx; uniform float uEl, uRs, uPix, uRePx; varying vec2 vQ; varying float vRe, vPx, vDc;
          void main() {
            vec3 n = normalize(uN), ta = uAx - n * dot(uAx, n);
            /* луч по нормали (пятно на груди бойца): касательная из любой оси, иначе NaN и пятна нет */
            if (dot(ta, ta) < 1e-6) ta = abs(n.y) < 0.9 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0));
            vec3 t = normalize(ta), b = cross(n, t);
            float dc = length(cameraPosition - uP), px = dc * uPix;
            float re = max(uRs, uRePx * px);                    /* радиус 1/e² или ~1 px (днём ~2 px) */
            float R = max(3.0 * re, 7.0 * px);
            vec2 q = position.xy * 2.0 * R * vec2(uEl, 1.0);   /* эллипс вдоль наклона луча */
            vQ = vec2(q.x / uEl, q.y); vRe = re; vPx = px; vDc = dc;
            gl_Position = projectionMatrix * viewMatrix * vec4(uP + n * min(0.01, dc * 0.0006) + t * q.x + b * q.y, 1.0);
          }`,
        fragmentShader: `uniform vec3 uColor; uniform float uYc, uPk, uSeed, uFog; varying vec2 vQ; varying float vRe, vPx, vDc;
          float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
          void main() {
            float r = length(vQ);
            float core = exp(-2.0 * r * r / (vRe * vRe));
            /* спекл: зернистость когерентного пятна, «кипит» при движении ствола */
            float sp = 0.78 + 0.44 * h21(floor(gl_FragCoord.xy * 0.7) + uSeed);
            /* ореол рассеяния в объективе/глазу (у бодикамеры пятно «расплывается» на 3–5 px) */
            float halo = 0.10 * exp(-r / (1.6 * vPx)) + 0.02 * exp(-r / (4.0 * vPx));
            float L = uPk * (core * sp + halo) * exp(-uFog * uFog * vDc * vDc);
            gl_FragColor = vec4(uColor * (L / uYc), 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`
      }));
      TAC.dot.visible = false; TAC.dot.userData.noAO = true; TAC.dot.frustumCulled = false; TAC.dot.renderOrder = 6;
      TAC.U = U0;
      scene.add(TAC.beam); scene.add(TAC.dot); scene.add(TAC.core);
    }
    const _tp = new THREE.Vector3(), _td = new THREE.Vector3(), _tq = new THREE.Quaternion(), _tz = new THREE.Vector3();
    const LASER_ZERO = 25;
    function updateTac() {
      const a = active(), inv = a ? curInv(a) : null;
      const w = inv && !S.death ? inv.w : null;
      const lightOn = !!(w && inv.light && w.root.visible !== false);
      TAC.spot.intensity = lightOn ? 320 : 0;
      if (lightOn) {
        w.gun.updateMatrixWorld(true);
        const lp = (w.tac && w.tac.lights[0] && w.tac.lights[0].p) || w.lightLocal || w.muzzleLocal;
        w.gun.localToWorld(_tp.copy(lp));
        TAC.spot.position.copy(_tp);
        _td.set(0, 0, -1).applyQuaternion(w.gun.getWorldQuaternion(_tq));
        TAC.tgt.position.copy(_tp).addScaledVector(_td, 8);
        TAC.tgt.updateMatrixWorld();
      }
      const laserOn = !!(w && inv.laser && w.tac && w.tac.lasers.length);
      TAC.beam.visible = TAC.dot.visible = TAC.core.visible = laserOn;
      if (laserOn) {
        w.gun.updateMatrixWorld(true);
        w.gun.localToWorld(_tp.copy(w.tac.lasers[0].p));
        /* Пристрелка ЛЦУ, как на реальном оружии: луч сводится с осью
           канала ствола на 25 м (типовая пристрелка лазера на карабине).
           Раньше луч шёл просто параллельно стволу из точки модуля на
           боковой планке — на любой дальности пятно было в 4–5 см от
           точки попадания, а сам луч «смотрел мимо» прицела. */
        const bore = _td.set(0, 0, -1).applyQuaternion(w.gun.getWorldQuaternion(_tq));
        const zero = w.gun.localToWorld(_tz.copy(w.muzzleLocal)).addScaledVector(bore, LASER_ZERO);
        _td.copy(zero).sub(_tp).normalize();
        TAC.ray.set(_tp, _td); TAC.ray.far = 120;
        /* та же геометрия, что держит пулю: на картах house/range нет, и луч
           раньше проходил сквозь стены на все 120 м без пятна */
        let h = C.traceRay ? C.traceRay(TAC.ray) : null;
        if (!h) { const objs = [world.ground]; for (const t of world.targets) if (t.state !== 'down') objs.push(t.board); h = TAC.ray.intersectObjects(objs, true)[0] || null; }
        /* пятно ложится и на бойцов (раньше луч проходил сквозь них до стены) */
        let hs = null;
        const DMq = F.DMG || null;
        if (DMq) for (const q of squad) {
          if (q === a || q.dead || !q.dmg || !q.char || !q.char.root.visible) continue;
          const qp = q.ctrl.pos, ox = qp.x - _tp.x, oy = qp.y + 1 - _tp.y, oz = qp.z - _tp.z, tc = ox * _td.x + oy * _td.y + oz * _td.z;
          if (tc < 0 || tc > (h ? h.distance : 120) + 1) continue;
          if (ox * ox + oy * oy + oz * oz - tc * tc > 2.2) continue;
          const r = (DMq._rayRaw || DMq.raySoldier).call(DMq, q, _tp, _td, h ? h.distance : 120);
          if (r && (!hs || r.t < hs.t)) hs = r;
        }
        const len = hs ? hs.t : h ? h.distance : 120;
        const U0 = TAC.U, DU = TAC.DU, Ld = w.tac.lasers[0].data;
        U0.uA.value.copy(_tp);
        U0.uB.value.copy(_tp).addScaledVector(_td, len);
        U0.uLen.value = len;
        U0.uPix.value = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, renderer.domElement.height * root.AEGIS_RS);
        if (Ld && Ld.color !== undefined && TAC.col !== Ld.color) {
          TAC.col = Ld.color; const c = U0.uColor.value.setHex(Ld.color);
          c.multiplyScalar(1 / Math.max(0.2, c.r, c.g, c.b));
          U0.uYc.value = Math.max(0.05, 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
          /* 5 мВт; V(λ): красный 635 нм — 0,217, зелёный 520 нм — 0,71 */
          TAC.phiV = 0.005 * 683 * (c.g > c.r ? 0.71 : 0.217);
        }
        const phiV = TAC.phiV || 0.741, K_LUX = 3.0e-5;    /* люкс → единицы света сцены (солнце 2,7 ≈ 90 000 лк) */
        const fogD = scene.fog && scene.fog.density !== undefined ? scene.fog.density : 0.006;
        U0.uFog.value = fogD; U0.uBeta.value = 2 * fogD;   /* FogExp2: видимость ≈ 1,98/плотность → β ≈ 3,9/V */
        U0.uPhi.value = phiV * K_LUX;
        /* v22: днём луч должен читаться (по просьбе игроков): минимум яркости растёт с солнцем */
        const dayK = U.clamp01(((C.sun && C.sun.intensity) || 0) / 2.2);
        U0.uMinC.value = 0.35 + 2.6 * dayK; U0.uMinPx.value = 0.95 + 0.55 * dayK; DU.uRePx.value = 1.1 + 0.9 * dayK;
        /* v26: плотность сердцевины: днём заметная нить, ночью — едва (там светится сам луч); зелёный ярче */
        U0.uCoreA.value = (0.1 + 0.55 * dayK) * (TAC.phiV && TAC.phiV > 1.5 ? 1.25 : 1);
        const hit = hs || h;
        TAC.dot.visible = !!hit;
        if (hit) {
          const P = hs ? _tz.copy(_tp).addScaledVector(_td, hs.t) : h.point;
          let nrm = TAC.nrm || (TAC.nrm = new THREE.Vector3());
          if (!hs && h.face && h.object) nrm.copy(h.face.normal).transformDirection(h.object.matrixWorld);
          else nrm.copy(_td).negate();
          if (nrm.dot(_td) > 0) nrm.negate();
          const ci = Math.max(0.12, -nrm.dot(_td));
          const w2 = 0.5 * (U0.uD0.value + U0.uDiv.value * len);           /* радиус пучка 1/e², м */
          const Epk = 2 * phiV / (Math.PI * w2 * w2) * Math.exp(-U0.uBeta.value * len) * ci;   /* лк, пик TEM00 */
          DU.uPk.value = Math.max(0.3 * Epk / Math.PI * K_LUX, (0.1 + 0.9 * dayK) * U0.uYc.value);   /* ρ = 0,3; v22: днём пятно не тонет в солнце */
          DU.uRs.value = w2; DU.uEl.value = 1 / ci;
          DU.uP.value.copy(P); DU.uN.value.copy(nrm); DU.uAx.value.copy(_td);
          /* спекл меняется, когда пятно сдвигается на свой размер */
          const qk = Math.round(P.x / w2) * 7.1 + Math.round(P.y / w2) * 3.3 + Math.round(P.z / w2) * 1.7;
          if (qk !== TAC.qk) { TAC.qk = qk; DU.uSeed.value = (DU.uSeed.value + 17.13) % 997; }
        }
      }
    }

    /* ------------------------------------------- предметы в руках --- */
    const SLOTN = AE ? AE.SLOTS : 6;
    function showOnly(s, w) {
      for (const k of ['primary', 'pistol']) if (s.inv[k]) s.inv[k].w.root.visible = s.inv[k].w === w;
    }
    function applyBipod(s) {
      const inv = curInv(s);
      if (!inv || !s.ctrl.WPN) return;
      const W = s.ctrl.WPN;
      s.ctrl.bipod = !!inv.bipod;
      if (inv.bipod && !inv._bp) { W.recoilUp *= 0.55; W.recoilSide *= 0.6; W.kickPitch *= 0.5; inv._bp = true; }
    }
    function onItemSwap(s, item) {
      s.cur = item || null;
      if (item && item.kind === 'gun') {
        item.inv._bp = false;
        s.ctrl.setWeapon(item.w, item.inv.st);
        s.ctrl.trackFor = trackFor(s);
        s.gun = item.w; s.wspec = item.spec;
        showOnly(s, item.w);
        applyBipod(s);
        gunAudio(item.inv);
      } else {
        s.ctrl.setWeapon(null);
        s.gun = null; s.wspec = null;
        showOnly(s, null);
      }
      S.hudDirty = true;
    }
    function stash(s) {
      const inv = curInv(s);
      if (inv && s.ctrl.armed && s.ctrl.weapon === inv.w) inv.st = s.ctrl.weaponState();
    }
    function itemForSlot(s, i) {
      const it = s.L.slots[i];
      if (!it) return null;
      if (it.t === 'gun') {
        const inv = s.inv[AE.kindOf(it.id)];
        return inv ? { kind: 'gun', w: inv.w, spec: inv.spec, inv } : null;
      }
      if (it.t === 'grenade' && GR && !s.used[i]) return { kind: 'grenade', grenade: it.g, spec: GR.spec(it.g), slot: i };
      return null;
    }
    function equip(s, item, opt) {
      opt = opt || {};
      stash(s);
      s.ctrl.pullTrigger(false);
      if (s.ctrl.armed) { s.ctrl.setWeapon(null); }
      if (BC && s.active) BC.equip(item, { onSwap: (it) => onItemSwap(s, it), fast: !!opt.fast, instant: !!opt.instant });
      else onItemSwap(s, item);
    }
    function selectSlot(s, i, opt) {
      opt = opt || {};
      if (!s || i < 0 || i >= SLOTN) return false;
      /* v22: на лестнице руки заняты — оружие достаётся только после схода */
      if (s.ctrl && s.ctrl.ladder && !opt.force) { s._ladSlot = i; return false; }
      if (BC && BC.throwing) return false;
      const it = s.L.slots[i];
      if (!it) {  return false; }
      if (it.t === 'ammo') {
        const inv = s.inv[it.w];
        
        return false;
      }
      if (it.t === 'grenade' && s.used[i]) {  return false; }
      if (i === s.slot && !opt.force) {
        /* v20: одиночное нажатие слота, который уже в руках, больше НЕ убирает
           предмет. Раньше «1» после броска гранаты (оружие уже вернулось
           само), после перезарядки или у укрытия (ствол уведён вниз) убирало
           оружие — руки пустые, в кадре ни рук, ни оружия. Убрать предмет —
           двойное нажатие того же слота (≤0,35 с). */
        const tap = s._slotTap, now = performance.now();
        if (tap && tap.i === i && now - tap.t < 350) {
          s._slotTap = null;
          s.slot = -1;
          equip(s, null, opt);
          return true;
        }
        s._slotTap = { i, t: now };
        return false;
      }
      const item = itemForSlot(s, i);
      if (!item) return false;
      s.slot = i;
      equip(s, item, opt);
      return true;
    }
    /* M2HB: садясь за пулемёт, боец убирает своё оружие (анимация смены
       предмета), вставая — достаёт обратно */
    if (root.GMG) {
      root.GMG.onMount = (a) => { a._mgSlot = a.slot; a.ctrl.pullTrigger(false); C.input.ads = false; if (a.slot >= 0) { a.slot = -1; equip(a, null); } S.hudDirty = true; };
      root.GMG.onDismount = (a) => { a.ctrl.pullTrigger(false); const k = a._mgSlot; a._mgSlot = -1; if (!a.dead && k >= 0) selectSlot(a, k, { force: true }); S.hudDirty = true; };
    }
    function defaultSlot(s) {
      for (const kind of ['primary', 'pistol']) {
        const i = s.L.slots.findIndex((x) => x && x.t === 'gun' && AE.kindOf(x.id) === kind);
        if (i >= 0 && s.inv[kind]) return i;
      }
      return -1;
    }
    function grenadeSlot(s, kind) {
      for (let i = 0; i < SLOTN; i++) {
        const x = s.L.slots[i];
        if (x && x.t === 'grenade' && !s.used[i] && (!kind || x.g === kind)) return i;
      }
      return -1;
    }
    ARS.onEmbody = (s) => {
      const i = s.slot >= 0 && itemForSlot(s, s.slot) ? s.slot : defaultSlot(s);
      for (const k of ['primary', 'pistol']) if (s.inv[k]) s.inv[k].w.root.visible = false;
      if (s.inv.primary && s.ctrl.armed) s.inv.primary.st = s.ctrl.weaponState();
      s.ctrl.setWeapon(null);
      s.cur = null;
      if (BC) BC.equip(null, { instant: true });
      if (i >= 0) { s.slot = i; equip(s, itemForSlot(s, i), { instant: true }); }
      else { s.slot = -1; onItemSwap(s, null); }
      S.hudDirty = true;
    };
    ARS.onDisembody = (s) => {
      if (BC && BC.throwing) dropLive(s, BC.abortThrow());
      stash(s);
      S.quick = null;
      if (BC) BC.equip(null, { instant: true });
      s.cur = null;
      npcGun(s);
      S.hudDirty = true;
    };
    /* Граната с выдернутой чекой не брошена (гибель, выход) — падает под ноги */
    function dropLive(s, res) {
      if (!res || !res.live || !GSIM) return;
      const p = camera.position.clone();
      p.y -= 0.5;
      const ck = s._cook; s._cook = null;
      GSIM.add(res.kind, p, new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6), undefined, undefined, ck ? Math.max(0.05, ck.fuse - (S.time - ck.t0)) : undefined);
      if (s.slot >= 0) s.used[s.slot] = true;
    }
    /* передержал — граната рвётся в руке */
    function cookStep() {
      const a = active();
      if (!a || !a._cook || !GSIM || !BC) return;
      if (!BC.throwing) { a._cook = null; return; }
      if (S.time - a._cook.t0 < a._cook.fuse) return;
      a._cook = null;
      const res = BC.abortThrow();
      if (res && res.held) { try { GR.release(GSIM, res.held, new THREE.Vector3(0, -0.2, 0), 0.001); } catch (e) { GSIM.add(res.kind, camera.position.clone().add(new THREE.Vector3(0, -0.35, 0)), new THREE.Vector3(), undefined, undefined, 0.001); } }
      else if (res && res.kind) GSIM.add(res.kind, camera.position.clone().add(new THREE.Vector3(0, -0.35, 0)), new THREE.Vector3(), undefined, undefined, 0.001);
      if (a.slot >= 0) a.used[a.slot] = true;
      S.cookHold = null; S.hudDirty = true;
      if (BC.onThrowEnd) try { BC.onThrowEnd(); } catch (e) { /* */ }
    }
    ARS.onDeath = (s) => {
      if (BC && BC.throwing) dropLive(s, BC.abortThrow());
      stash(s);
      S.quick = null;
    };
    ARS.rebuild = (s, L) => {
      const wasActive = s.active;
      if (wasActive && BC) { if (BC.throwing) BC.abortThrow(); BC.equip(null, { instant: true }); }
      const keepSlot = s.slot;
      if (s.L && Array.isArray(s.L.pack) && L && !L.pack) L.pack = s.L.pack; /* v26: рюкзак не теряется при смене выкладки */
      s.L = L;
      buildInv(s);
      if (keepSlot >= 0 && itemForSlot(s, keepSlot)) s.slot = keepSlot;
      if (wasActive) ARS.onEmbody(s);
      S.hudDirty = true;
    };
    /* ===================================================== v22: ОБЫСК И СНАРЯЖЕНИЕ =====
       Предмет: { t:'gun', id, st:{mag,chamber,fireMode}, cfg } · { t:'ammo', w, cal, n } · { t:'grenade', g }.
       Свои слоты — из L и состояния оружия; тело убитого — свой контейнер s.loot (снаряжение бойца для новой
       жизни не трогаем); на земле — тайники S.drops (модель оружия / подсумок / граната у ног).
       Окно и перетаскивание — js/app/loot.js. */
    const LOOT_R = 2.3;
    const calOf = (L, w) => { const id = AE.weaponOf(L, w); return id ? AE.WEAPONS[id].cal : null; };
    /* v26: рюкзак — 8 ячеек запаса сверх разгрузки (6 слотов быстрого доступа). Что в рюкзаке — в бою не под
       рукой: патроны оттуда не идут в запас оружия, оружие не собирается; сначала переложить в разгрузку.
       Рюкзак живёт в s.L.pack (переживает смену выкладки в оружейной); у тела его содержимое видно при обыске. */
    const PACKN = 8;
    const packHash = (k) => { let h = 7; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; return h; };
    function packOf(s) {
      if (!s || !s.L) return [];
      let P = s.L.pack;
      if (!Array.isArray(P)) {
        P = new Array(PACKN).fill(null);
        if (AE) {
          const h = packHash(String(s.key || '')), id1 = AE.weaponOf(s.L, 'primary'), id2 = AE.weaponOf(s.L, 'pistol');
          if (id1) P[0] = { t: 'ammo', w: 'primary', cal: AE.WEAPONS[id1].cal, n: Math.round(AE.WEAPONS[id1].ammoSlot / 2) };
          if (id2) P[1] = { t: 'ammo', w: 'pistol', cal: AE.WEAPONS[id2].cal, n: AE.WEAPONS[id2].ammoSlot };
          if (s.npc && h % 3 === 0) P[2] = { t: 'grenade', g: h % 2 ? 'm67' : 'smoke' };
        }
        s.L.pack = P;
      }
      while (P.length < PACKN) P.push(null);
      return P;
    }
    function gunState(s, k) {
      const inv = s.inv[k];
      if (!inv) return null;
      if (s.ctrl && s.ctrl.armed && s.ctrl.weapon === inv.w) inv.st = s.ctrl.weaponState();
      return inv.st ? { mag: inv.st.mag, chamber: inv.st.chamber, fireMode: inv.st.fireMode, reserve: inv.st.reserve } : null;
    }
    function itemsOf(s) {
      const st = { primary: gunState(s, 'primary'), pistol: gunState(s, 'pistol') };
      const out = s.L.slots.map((x, i) => {
        if (!x) return null;
        if (x.t === 'gun') { const k = AE.kindOf(x.id), g = st[k]; return { t: 'gun', id: x.id, st: g ? { mag: g.mag, chamber: g.chamber, fireMode: g.fireMode } : null, cfg: cfgFor(s, x.id) }; }
        if (x.t === 'ammo') return { t: 'ammo', w: x.w, cal: x.cal || calOf(s.L, x.w), n: Number.isFinite(x.n) ? x.n : null };
        if (x.t === 'grenade') return s.used && s.used[i] ? null : { t: 'grenade', g: x.g };
        return null;
      });
      /* остаток запаса раскладывается по слотам патронов своего калибра (полные — первыми) */
      for (const k of ['primary', 'pistol']) {
        const id = AE.weaponOf(s.L, k); if (!id) continue;
        const W = AE.WEAPONS[id], mine = out.filter((x) => x && x.t === 'ammo' && x.w === k && x.cal === W.cal);
        let r = st[k] ? st[k].reserve : AE.ammoOf(s.L, k);
        for (const x of mine) { x.n = Math.max(0, Math.min(W.ammoSlot, r)); r -= x.n; }
      }
      for (const x of out) if (x && x.t === 'ammo' && x.n === null) { const id = AE.weaponOf(s.L, x.w); x.n = id ? AE.WEAPONS[id].ammoSlot : 0; }
      return out;
    }
    /* свои слоты из списка предметов: оружие пересобирается только если сменился образец или обвес */
    function commitItems(s, items) {
      const wasActive = s.active;
      if (wasActive && BC) { if (BC.throwing) dropLive(s, BC.abortThrow()); BC.equip(null, { instant: true }); }
      stash(s);
      const keepSlot = s.slot;
      const L = { slots: items.map((x) => !x ? null : x.t === 'gun' ? { t: 'gun', id: x.id } : x.t === 'ammo' ? { t: 'ammo', w: x.w, cal: x.cal || undefined, n: x.n } : { t: 'grenade', g: x.g }), cfg: Object.assign({}, s.L.cfg || {}), view: s.L.view, pack: s.L.pack };
      for (const x of items) if (x && x.t === 'gun' && x.cfg) L.cfg[x.id] = x.cfg;
      const sig = (k) => { const it = s.inv[k]; return it ? it.id + '|' + JSON.stringify(cfgFor(s, it.id) || null) : ''; };
      const old = { primary: sig('primary'), pistol: sig('pistol') };
      s.L = L;
      for (const k of ['primary', 'pistol']) {
        const id = AE.weaponOf(L, k), now = id ? id + '|' + JSON.stringify(cfgFor(s, id) || null) : '';
        if (now === old[k] && s.inv[k]) continue;
        const it = s.inv[k];
        if (it) { if (it.w.root.parent) it.w.root.parent.remove(it.w.root); try { GN.dispose(it.w); } catch (e) { /* */ } s.inv[k] = null; }
        if (!id || !GN) continue;
        let w;
        try { w = GN.build(id, cfgFor(s, id), { noShadow: C.SET.quality === 'low' }); } catch (e) { console.warn('сборка ' + id, e); continue; }
        const spec = GN.createSpec(w);
        w.root.visible = false; scene.add(w.root);
        const types = w.ammoTypes || []; let ai = types.findIndex((t) => t.id === '7N10'); if (ai < 0) ai = 0;
        const inv = { kind: k, id, w, spec, ammoI: ai, light: false, laser: false, bipod: false, ga: undefined, st: null };
        freshState(inv, L);
        s.inv[k] = inv;
      }
      for (const k of ['primary', 'pistol']) {
        const inv = s.inv[k]; if (!inv) continue;
        const it = items.find((x) => x && x.t === 'gun' && AE.kindOf(x.id) === k);
        if (it && it.st) { inv.st.mag = it.st.mag; inv.st.chamber = it.st.chamber; if (it.st.fireMode) inv.st.fireMode = it.st.fireMode; }
        inv.st.reserve = AE.ammoOf(L, k);
      }
      s.used = {};
      s.cur = null; s.gun = null; s.wspec = null;
      s.slot = keepSlot >= 0 && itemForSlot(s, keepSlot) ? keepSlot : -1;
      npcGun(s);
      if (wasActive) ARS.onEmbody(s);
      S.hudDirty = true;
    }
    /* тело: контейнер создаётся при первом обыске из его снаряжения (оружие — с патронами в магазине) */
    function lootOf(s) {
      if (!s.loot) s.loot = { kind: 'body', s, items: itemsOf(s).map((x) => (x && x.t === 'gun' ? Object.assign(x, { own: AE.kindOf(x.id) }) : x))
        .concat(packOf(s).map((x) => (x ? JSON.parse(JSON.stringify(x)) : null))) }; /* v26: + рюкзак убитого */
      return s.loot;
    }
    function bodyVisual(s) {
      if (!s.loot) return;
      for (const k of ['primary', 'pistol']) {
        const inv = s.inv[k]; if (!inv) continue;
        const has = s.loot.items.some((x) => x && x.t === 'gun' && x.own === k && x.id === inv.id);
        if (!has) inv.w.root.visible = false;
        else if (k === 'primary' && s.gun === inv.w) inv.w.root.visible = true;
      }
    }
    const _lpV = new THREE.Vector3();
    function bodyPos(s) { try { s.char.bone('hips').getWorldPosition(_lpV); return _lpV; } catch (e) { return s.ctrl.pos; } }
    S.drops = S.drops || [];
    function nearLoot(a) {
      if (!a || !a.ctrl) return null;
      const p = a.ctrl.pos;
      let best = null, bd = LOOT_R;
      for (const q of squad) {
        if (q === a || !q.dead || !q.L) continue;
        const b = bodyPos(q), d = Math.hypot(b.x - p.x, b.z - p.z);
        if (d < bd && Math.abs(b.y - p.y) < 1.6) { bd = d; best = { kind: 'body', s: q }; }
      }
      for (const D of S.drops) {
        const d = Math.hypot(D.pos.x - p.x, D.pos.z - p.z);
        if (d < bd && Math.abs(D.pos.y - p.y) < 1.6) { bd = d; best = { kind: 'ground', D }; }
      }
      return best;
    }
    /* все тела и тайники в радиусе обыска: сначала тела, ближние — первыми */
    function nearAll(a) {
      if (!a || !a.ctrl) return [];
      const p = a.ctrl.pos, out = [];
      for (const q of squad) {
        if (q === a || !q.dead || !q.L) continue;
        const b = bodyPos(q), d = Math.hypot(b.x - p.x, b.z - p.z);
        if (d < LOOT_R && Math.abs(b.y - p.y) < 1.6) out.push({ kind: 'body', s: q, d });
      }
      for (const D of S.drops) {
        const d = Math.hypot(D.pos.x - p.x, D.pos.z - p.z);
        if (d < LOOT_R && Math.abs(D.pos.y - p.y) < 1.6) out.push({ kind: 'ground', D, d });
      }
      out.sort((x, y) => (x.kind === y.kind ? x.d - y.d : x.kind === 'body' ? -1 : 1));
      return out;
    }
    /* предмет на земле: модель оружия, подсумок с магазинами, граната */
    let _pouchMat = null;
    function dropMesh(it) {
      if (it.t === 'gun' && GN) {
        try {
          const w = GN.build(it.id, it.cfg || null, { noShadow: C.SET.quality === 'low' });
          const g = new THREE.Group(); g.add(w.root); w.root.visible = true;
          w.root.rotation.set(0, 0, Math.PI / 2); w.root.position.set(0, 0.04, 0);
          g.userData.w = w;
          return g;
        } catch (e) { /* ниже — подсумок */ }
      }
      if (it.t === 'grenade' && GR) { try { const inst = GR.instance(it.g); inst.group.position.y = 0.035; inst.group.rotation.z = Math.PI / 2; const g = new THREE.Group(); g.add(inst.group); return g; } catch (e) { /* */ } }
      _pouchMat = _pouchMat || new THREE.MeshStandardMaterial({ color: 0x4d5137, roughness: 0.9, metalness: 0 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.13), _pouchMat);
      m.position.y = 0.035; m.castShadow = true; m.receiveShadow = true;
      const g = new THREE.Group(); g.add(m); return g;
    }
    function dropItem(a, it) {
      const p = a.ctrl.pos, yaw = a.ctrl.yaw;
      let D = S.drops.find((q) => Math.hypot(q.pos.x - p.x, q.pos.z - p.z) < 1.2 && q.items.some((x) => !x));
      if (!D) {
        const x = p.x - Math.sin(yaw) * 0.55 + (Math.random() - 0.5) * 0.2, z = p.z - Math.cos(yaw) * 0.55 + (Math.random() - 0.5) * 0.2;
        D = { kind: 'ground', pos: new THREE.Vector3(x, gAt0(x, z), z), items: new Array(SLOTN).fill(null), meshes: new Array(SLOTN).fill(null) };
        S.drops.push(D);
        while (S.drops.length > 24) { const o = S.drops.shift(); for (const m of o.meshes) if (m) dropDispose(m); }
      }
      const j = D.items.findIndex((x) => !x);
      D.items[j] = it;
      const m = dropMesh(it);
      const a0 = j / SLOTN * Math.PI * 2;
      m.position.set(D.pos.x + Math.cos(a0) * 0.18 * (j > 0 ? 1 : 0), D.pos.y, D.pos.z + Math.sin(a0) * 0.18 * (j > 0 ? 1 : 0));
      m.rotation.y = yaw + (Math.random() - 0.5) * 0.8;
      scene.add(m);
      D.meshes[j] = m;
      if (audio.gunDrop && it.t === 'gun') try { audio.gunDrop(F.spatialFrom(D.pos)); } catch (e) { /* */ }
      return D;
    }
    function dropDispose(m) { if (m.parent) m.parent.remove(m); if (m.userData.w) try { GN.dispose(m.userData.w); } catch (e) { /* */ } }
    function containerOf(side, ref) {
      if (side === 'self') return null;
      if (side === 'pack') return packOf(active());
      if (!ref) return null;
      return ref.kind === 'body' ? lootOf(ref.s).items : ref.D.items;
    }
    /* можно ли положить предмет в свои слоты: одно основное оружие и один пистолет */
    function selfFits(items, it, j) {
      if (!it || it.t !== 'gun') return true;
      const k = AE.kindOf(it.id);
      return !items.some((x, i) => i !== j && x && x.t === 'gun' && AE.kindOf(x.id) === k);
    }
    /* перенос: (откуда, i) → (куда, j); j < 0 — в первый подходящий слот; 'ground' — выбросить под ноги */
    function lootMove(a, ref, from, i, to, j) {
      if (!a || a.dead) return { ok: false, error: 'Нет бойца' };
      const self = itemsOf(a);
      const src = from === 'self' ? self : containerOf(from, ref);
      if (!src || !src[i]) return { ok: false, error: 'Слот пуст' };
      const it = src[i];
      if (to === 'ground') {
        src[i] = null;
        dropItem(a, it);
        if (from === 'self') commitItems(a, self); else if (from !== 'pack') syncContainer(ref, i);
        return { ok: true, note: 'Выброшено: ' + itemName(it) };
      }
      const dst = to === 'self' ? self : containerOf(to, ref);
      if (!dst) return { ok: false, error: 'Некуда положить' };
      if (j < 0) {
        if (to === 'self' && it.t === 'gun') { const k = AE.kindOf(it.id); j = dst.findIndex((x) => x && x.t === 'gun' && AE.kindOf(x.id) === k); }
        if (j < 0) j = dst.findIndex((x) => !x);
        /* v26: разгрузка полна — в рюкзак (оружие того же класса меняется местами выше) */
        if (j < 0 && to === 'self' && from !== 'pack' && from !== 'self') return lootMove(a, ref, from, i, 'pack', -1);
        if (j < 0) return { ok: false, error: to === 'pack' ? 'Рюкзак полон' : to === 'self' ? 'Все 6 подсумков разгрузки заняты' : 'Некуда положить' };
      }
      if (from === to && i === j) return { ok: true };
      /* своё второе оружие того же класса — меняем местами с ним, а не кладём рядом */
      if (to === 'self' && from !== 'self' && it.t === 'gun') {
        const k = AE.kindOf(it.id), c = dst.findIndex((x) => x && x.t === 'gun' && AE.kindOf(x.id) === k);
        if (c >= 0) j = c;
      }
      const back = dst[j];
      if (from === 'self' && to !== 'self' && back && !selfFits(src, back, i)) return { ok: false, error: 'Второе ' + (back.id && AE.kindOf(back.id) === 'pistol' ? 'пистолет' : 'основное оружие') + ' не взять' };
      if (to === 'self' && !selfFits(dst, it, j)) return { ok: false, error: (AE.kindOf(it.id) === 'pistol' ? 'Пистолет' : 'Основное оружие') + ' уже есть' };
      dst[j] = it; src[i] = back || null;
      if (from === 'self' || to === 'self') commitItems(a, self);
      if (from !== 'self' && from !== 'pack') syncContainer(ref, i);
      if (to !== 'self' && to !== 'pack') syncContainer(ref, j);
      if (audio.gearRattle) try { audio.gearRattle(0.6); } catch (e) { /* */ }
      const verb = to === 'self' ? (from === 'pack' ? 'В разгрузку: ' : 'Взято: ') : to === 'pack' ? (from === 'box' ? 'Взято в рюкзак: ' : 'В рюкзак: ') : 'Отдано: ';
      return { ok: true, note: verb + itemName(it), at: { side: to, i: j } };
    }
    function syncContainer(ref, i) {
      if (!ref) return;
      if (ref.kind === 'body') { bodyVisual(ref.s); return; }
      const D = ref.D;
      if (D.meshes[i] && !D.items[i]) { dropDispose(D.meshes[i]); D.meshes[i] = null; }
      if (D.items[i] && !D.meshes[i]) { const m = dropMesh(D.items[i]); m.position.copy(D.pos); scene.add(m); D.meshes[i] = m; }
      if (!D.items.some(Boolean)) { const k = S.drops.indexOf(D); if (k >= 0) S.drops.splice(k, 1); for (const m of D.meshes) if (m) dropDispose(m); }
    }
    function itemName(it) {
      if (!it) return '';
      if (it.t === 'gun') return AE.WEAPONS[it.id] ? AE.WEAPONS[it.id].name : it.id;
      if (it.t === 'ammo') { const W = Object.values(AE.WEAPONS).find((w) => w.cal === it.cal); return 'патроны ' + (W ? W.calName : '') + (Number.isFinite(it.n) ? ' (' + it.n + ')' : ''); }
      if (it.t === 'grenade') return AE.GRENADES[it.g] ? AE.GRENADES[it.g].name : it.g;
      return '';
    }
    /* описание предмета для окна: заголовок, подпись, подходит ли к своему оружию */
    function itemView(it, selfItems) {
      if (!it) return null;
      if (it.t === 'gun') {
        const W = AE.WEAPONS[it.id] || {}, cap = (() => { try { return GN.WP && GN.WP[it.id] ? null : null; } catch (e) { return null; } })();
        void cap;
        const m = it.st ? it.st.mag + (it.st.chamber ? 1 : 0) : null;
        return { title: W.name || it.id, short: W.name || it.id, count: it.st ? it.st.mag + (it.st.chamber ? '+1' : '') : '', sub: (W.kind === 'pistol' ? 'Пистолет' : W.cls || 'Оружие') + ' · ' + (W.calName || '') + (m !== null ? ' · в магазине ' + m : ''), icon: W.kind === 'pistol' ? 'pistol' : 'rifle' };
      }
      if (it.t === 'ammo') {
        const W = Object.values(AE.WEAPONS).find((w) => w.cal === it.cal);
        const mine = selfItems ? selfItems.find((x) => x && x.t === 'gun' && AE.kindOf(x.id) === it.w) : null;
        const fit = !mine || AE.WEAPONS[mine.id].cal === it.cal;
        return { title: 'Патроны ' + (W ? W.calName : ''), short: W ? W.calName.replace(' NATO', '') : 'Патроны', count: Number.isFinite(it.n) ? String(it.n) : '', sub: (Number.isFinite(it.n) ? it.n + ' шт.' : '') + (fit ? '' : ' · не подходят к ' + AE.WEAPONS[mine.id].name), icon: 'ammo', bad: !fit };
      }
      if (it.t === 'grenade') { const G = AE.GRENADES[it.g] || {}; return { title: G.name || it.g, short: G.name || it.g, count: '', sub: it.g === 'm67' ? 'Осколочная' : it.g === 'smoke' ? 'Дымовая' : 'Светошумовая', icon: it.g }; }
      return null;
    }
    C.LOOT = {
      near: () => nearLoot(active()),
      nearAll: () => nearAll(active()),
      same: (x, y) => !!(x && y && x.kind === y.kind && x.s === y.s && x.D === y.D),
      items: (side, ref) => {
        const a = active(); if (!a) return [];
        if (side === 'self') return itemsOf(a);
        const c = containerOf(side, ref); return c ? c.map((x) => (x && x.t === 'ammo' && !Number.isFinite(x.n) ? Object.assign({}, x, { n: (() => { const W = Object.values(AE.WEAPONS).find((w) => w.cal === x.cal); return W ? W.ammoSlot : null; })() }) : x)) : [];
      },
      view: itemView, name: itemName,
      rigN: SLOTN, packN: PACKN,
      /* v26: что надето (для шапки окна снаряжения): головной убор, броня, разгрузка, рюкзак */
      gear: () => {
        const a = active(), P = a && a.char && a.char.preset || {};
        const head = P.head || 'helmet', arm = P.armor || 'plate';
        const ARM = { plate: 'Плитоноска', slick: 'Облегчённая плитоноска', soft: 'Мягкий бронежилет', none: 'Без брони' };
        return { head, headName: ({ helmet: 'Шлем', boonie: 'Панама', none: 'Без убора' })[head] || 'Шлем', armor: ARM[arm] || 'Плитоноска',
          rig: arm === 'plate' ? '6 подсумков' : arm === 'slick' ? 'MOLLE без подсумков' : 'Без разгрузки', pack: 'Штурмовой · ' + PACKN };
      },
      move: (ref, from, i, to, j) => lootMove(active(), ref, from, i, to, j),
      title: (ref) => !ref ? '' : ref.kind === 'body' ? 'Обыск: ' + ref.s.char.preset.name + (ref.s.team ? ' · ' + (ref.s.team === 'delta' ? 'Дельта' : 'Альфа') : '') : 'На земле',
      valid: (ref) => { const a = active(); if (!a || a.dead || !ref) return false; const p = a.ctrl.pos, q = ref.kind === 'body' ? bodyPos(ref.s) : ref.D.pos; return Math.hypot(q.x - p.x, q.z - p.z) < LOOT_R + 0.6 && (ref.kind !== 'body' || ref.s.dead) && (ref.kind !== 'ground' || S.drops.includes(ref.D)); },
      who: () => { const a = active(); return a ? a.char.preset.name : ''; },
      setInput: (on) => { S.inputOn = !!on; if (!on) { C.releaseAll(); C.unlockPointer(); } else if (S.mode === 'embodied' && !S.paused) C.lockPointer(); },
      embodied: () => S.mode === 'embodied' && !!active() && !active().dead,
      binds: () => (C.getBinds ? C.getBinds() : {}), keyName: (c) => (AE ? AE.keyName(c) : c)
    };
    root.AEGIS_LOOT = C.LOOT;
    BOOTMARK('preInv');
    for (const s of squad) buildInv(s);
    BOOTMARK('inv');
    const transfer = root.GMaps && root.GMaps.readTransfer();
    if(transfer && transfer.snapshot && transfer.snapshot.actors){
      for(const [key,data] of Object.entries(transfer.snapshot.actors)){
        const s=squad.find(x=>x.key===key&&!x.npc);if(!s)continue;
        if(data.L){ARS.rebuild(s,AE.normLoadout(data.L));}
        /* В бой — с полным снаряжением: потраченное на базе (гранаты, патроны)
           не переносится, берётся только выбранная выкладка */
        if(world.mapId){s.used={};s.slot=-1;npcGun(s);continue;}
        s.used=Object.assign({},data.used||{});s.slot=Number.isInteger(data.slot)?data.slot:-1;
        for(const kind of ['primary','pistol']){const v=data.inv&&data.inv[kind],inv=s.inv[kind];if(v&&inv&&v.id===inv.id){inv.st=Object.assign({},inv.st,v.st);inv.ammoI=v.ammoI||0;}}
        npcGun(s);
      }
    }
    function levelSnapshot(){
      for(const s of squad)if(!s.npc){stash(s);if(s.ctrl.armed)for(const k of ['primary','pistol'])if(s.inv[k]&&s.ctrl.weapon===s.inv[k].w)s.inv[k].st=s.ctrl.weaponState();}
      const actors={};for(const s of squad)if(!s.npc){const inv={};for(const k of ['primary','pistol'])if(s.inv[k])inv[k]={id:s.inv[k].id,st:s.inv[k].st,ammoI:s.inv[k].ammoI};actors[s.key]={L:s.L,used:s.used,slot:s.slot,inv};}
      return JSON.parse(JSON.stringify({actors}));
    }

    /* бросок: скорость по взгляду камеры + скорость бойца */
    if (BC) {
      BC.onRelease = (cur, style, h) => {
        const a = active();
        if (!a || !GSIM || !cur) return;
        const fwd = camera.getWorldDirection(new THREE.Vector3());
        const over = style !== 'under';
        const v = fwd.clone();
        v.y += over ? 0.16 : 0.32;
        v.normalize().multiplyScalar(over ? 15 : 7.2);
        if (a.ctrl.vel) { v.x += a.ctrl.vel.x * 0.8; v.z += a.ctrl.vel.z * 0.8; }
        /* запал горит с момента, как выдернута чека: «приготовленная» граната
           рвётся раньше */
        const ck = a._cook; a._cook = null;
        GR.release(GSIM, h, v, ck ? Math.max(0.05, ck.fuse - (S.time - ck.t0)) : undefined);
        if (audio.grenade) audio.grenade('spoon', { pan: 0.3, gain: 0.8, lp: 15000, delay: 0, dist: 0.5 }, 1);
        if (cur.slot !== undefined && cur.slot >= 0) a.used[cur.slot] = true;
        (C.lifeEvents || (C.lifeEvents = [])).push({ type: 'shot', from: camera.position.clone(), to: camera.position.clone().addScaledVector(fwd, 10), shooter: a });
        S.hudDirty = true;
      };
      BC.cookHeld = (style) => !!(S.cookHold && S.cookHold[style === 'under' ? 'under' : 'over']);
      BC.onThrowEvent = (e, it) => {
        if (e === 'pinOut') { const a = active(); const g = it && it.grenade === 'm84' ? [1.3, 1.7] : it && it.grenade === 'smoke' ? [1.2, 2.0] : [4.0, 5.0];
          if (a) a._cook = { t0: S.time, fuse: g[0] + Math.random() * (g[1] - g[0]), kind: it && it.grenade }; }
        if (audio.grenade && (e === 'clip' || e === 'pin' || e === 'pinOut')) audio.grenade(e === 'pinOut' ? 'pin' : e, { pan: -0.2, gain: 0.9, lp: 15000, delay: 0, dist: 0.4 }, 1);
      };
      BC.onPinDrop = (o) => {
        if (!GSIM) return;
        try {
          const P2 = o.clone(true);
          o.matrixWorld.decompose(P2.position, P2.quaternion, P2.scale);
          GSIM.addDebris(P2, new THREE.Vector3((Math.random() - 0.5) * 0.4, -0.3, (Math.random() - 0.5) * 0.4), new THREE.Vector3(4, 2, 3), { r: 0.008, ttl: 40, sound: 'hard' });
        } catch (e) { /* без обломка */ }
      };
      BC.onThrowEnd = () => {
        const a = active();
        if (!a) return;
        const q = S.quick; S.quick = null;
        const kind = a.cur && a.cur.kind === 'grenade' ? a.cur.grenade : null;
        const same = q ? -1 : grenadeSlot(a, kind);
        let next = same;
        if (next < 0 && q && q.prev >= 0 && itemForSlot(a, q.prev)) next = q.prev;
        if (next < 0) next = defaultSlot(a);
        if (next >= 0) { a.slot = next; equip(a, itemForSlot(a, next), { fast: !!q, fromLowered: true }); }
        else { a.slot = -1; equip(a, null, { fromLowered: true }); }
      };
    }

    /* v26: короткая подсказка по центру сверху (смена прицела, марки, увеличителя) */
    function hudNote(t) {
      let n = document.getElementById('hudNote');
      if (!n) {
        n = document.createElement('div'); n.id = 'hudNote';
        document.body.appendChild(n);
      }
      n.textContent = t; n.classList.add('on');
      clearTimeout(n._t); n._t = setTimeout(() => n.classList.remove('on'), 1700);
    }
    C.hudNote = hudNote;
    /* действия снаряжения (вызываются раскладкой клавиш) */
    ARS.action = (act, down, rep) => {
      const a = active();
      if (!a || S.death) return false;
      const c = a.ctrl, inv = curInv(a);
      const gren = a.cur && a.cur.kind === 'grenade';
      /* за пулемётом руки на рукоятках M2HB: ЛКМ — его огонь, остальное оружие убрано */
      if (root.GMG && root.GMG.isMounted(a)) {
        /* v21: гашетка помнится в GMG — завершение смены оружия (setWeapon(null)) её больше не отпускает */
        if (act === 'fire') { c.pullTrigger(!!down); if (root.GMG.trigger) root.GMG.trigger(!!down); }
        if (act === 'ads') { C.input.ads = false; if (root.GMG.zoom && !rep) root.GMG.zoom(!!down, C.SET.adsMode === 'toggle'); }
        return true;
      }
      /* во время перевязки руки заняты */
      if (MED && MED.busy(a) && act !== 'heal') {
        if (act === 'fire' || act === 'ads') { c.pullTrigger(false); C.input.ads = false; return true; }
        if (/^(reload|inspect|grenade|slot\d|fireMode|ammoType|sight|magnifier|light|laser|bipod)$/.test(act)) return true;
      }
      if (act === 'heal') {
        if (!down || rep || !MED) return true;
        if (BC && BC.busy) return true;
        MED.start(a, MED.busy(a) ? null : (MED.targetAhead(a, squad, camera) || a));
        return true;
      }
      if (act === 'fire') {
        if (gren) { (S.cookHold || (S.cookHold = {})).over = !!down; if (down && BC && !BC.busy) BC.throwGrenade('over'); return true; }
        c.pullTrigger(!!down && !!inv);
        return true;
      }
      if (act === 'ads') {
        if (gren) { (S.cookHold || (S.cookHold = {})).under = !!down; if (down && BC && !BC.busy) BC.throwGrenade('under'); C.input.ads = false; return true; }
        if(C.SET.adsMode==='toggle'){if(down&&!rep)C.input.ads=!C.input.ads&&!!inv;}else C.input.ads=!!down&&!!inv;
        return true;
      }
      if (!down || rep) return true;
      const m = /^slot([1-6])$/.exec(act);
      if (m) { selectSlot(a, +m[1] - 1); return true; }
      switch (act) {
        case 'reload':
          if (!inv) break;
          c.startReload();
          break;
        case 'inspect': if (inv && c.startInspect) c.startInspect(); break;
        case 'zoomIn': case 'zoomOut': {
          /* как на стрельбище оружейной: у оптики с переменной кратностью меняется
             кратность, у коллиматора и механики поле зрения (до 2×), шаг 18% */
          if (!inv || !inv.w.sight) break;
          const w = inv.w, s = w.sight, k = act === 'zoomIn' ? 1.18 : 1 / 1.18;
          if (s.zoom) w.zoomCur = clamp((w.zoomCur || s.zoom[1]) * k, s.zoom[0], s.zoom[1]);
          else {
            const lo = (s.mag || 1) > 1.2 ? 0.75 : 1;
            let z = clamp((w.zoomMul || 1) * k, lo, 2);
            if (Math.abs(z - 1) < 0.05) z = 1;
            w.zoomMul = z;
          }
          break;
        }
        case 'sight': {
          if (!inv) break;
          const w = inv.w, n = w.sights ? w.sights.length : 0;
          if (n < 2) { hudNote(n ? 'Другого прицела нет' : 'Нет прицела'); break; }
          /* v26: увеличитель за коллиматором откидывается вбок (анимация кронштейна) и возвращается по кругу */
          const r = GN.nextSight ? GN.nextSight(w) : (GN.setSight(w, (w.sightIdx || 0) + 1), { sight: w.sight });
          w.zoomMul = 1;
          /* перекладка к другому прицелу: щека отрывается от приклада и встаёт заново */
          if (c.sightSwap) c.sightSwap();
          C.gunSound(a, r && r.flip ? 'bipod' : 'selector');
          hudNote('Прицел: ' + ((r && r.sight && r.sight.label) || '') + (r && r.flip === 'aside' ? ' · увеличитель откинут' : r && r.flip === 'back' ? '' : ''));
          HUD.retKey = '#';   /* перерисовать марку/маску (и снять её, если прицел без оверлея) */
          break;
        }
        case 'magnifier': {
          if (!inv || !GN.toggleMagnifier) break;
          S.tutSight = (S.tutSight || 0) + 1;
          const r = GN.toggleMagnifier(inv.w);
          if (!r) { hudNote('Увеличителя нет — поставьте его в оружейной'); break; }
          inv.w.zoomMul = 1;
          if (c.sightSwap) c.sightSwap();
          C.gunSound(a, 'bipod');
          hudNote(r.flip === 'aside' ? 'Увеличитель откинут · ' + r.sight.label : 'Прицел: ' + r.sight.label);
          HUD.retKey = '#';   /* перерисовать марку/маску (и снять её, если прицел без оверлея) */
          break;
        }
        case 'reticle': case 'retColor': {
          if (!inv || !GN.cycleReticle) break;
          S.tutSight = (S.tutSight || 0) + 1;
          const r = act === 'reticle' ? GN.cycleReticle(inv.w) : GN.cycleReticleColor(inv.w);
          if (!r) { hudNote(inv.w.sight && inv.w.sight.irons ? 'У механического прицела марки нет' : 'Нет прицела с подсветкой'); break; }
          C.gunSound(a, 'light');
          if (act === 'reticle') hudNote(r.one ? 'У этого прицела одна марка' : 'Марка: ' + r.name + ' (' + r.i + '/' + r.n + ')');
          else hudNote('Подсветка марки: ' + r.name);
          HUD.retKey = '#';   /* перерисовать марку/маску (и снять её, если прицел без оверлея) */
          break;
        }
        case 'fireMode': {
          if (!inv) break;
          c.cycleFireMode();
          S.hudDirty = true;
          
          break;
        }
        case 'ammoType': {
          if (!inv || !inv.w.ammoTypes || inv.w.ammoTypes.length < 2) break;
          inv.ammoI = (inv.ammoI + 1) % inv.w.ammoTypes.length;
          if (audio.ui) audio.ui(true);
          
          S.hudDirty = true;
          break;
        }
        case 'grenade': {
          if (BC && (BC.busy || BC.throwing)) break;
          if (gren) { BC.throwGrenade('over'); break; }
          const gi = grenadeSlot(a, null);
          if (gi < 0) break;
          S.quick = { prev: a.slot, armed: true };
          a.slot = gi;
          equip(a, itemForSlot(a, gi), { fast: true });
          break;
        }
        case 'wipe':
          /* v8: протереть объектив бодикама ладонью */
          if (V8 && V8.wipe()) { if (audio.gearRattle) audio.gearRattle(0.35); S.wipeT = 0.45; }
          break;
        case 'light':
          if (!inv) break;
          if (!inv.w.tac || !inv.w.tac.lights.length) break;
          inv.light = !inv.light;
          C.gunSound(a, 'light');
          break;
        case 'laser':
          if (!inv) break;
          if (!inv.w.tac || !inv.w.tac.lasers.length) break;
          inv.laser = !inv.laser;
          C.gunSound(a, 'light');
          break;
        case 'bipod':
          if (!inv) break;
          if (!inv.w.tac || !inv.w.tac.bipod) break;
          inv.bipod = !inv.bipod;
          if (!inv.bipod) { inv._bp = false; c.bipod = false; const st = c.weaponState(); c.setWeapon(inv.w, st); c.trackFor = trackFor(a); }
          else applyBipod(a);
          C.gunSound(a, 'bipod');
          
          break;
        default: return false;
      }
      return true;
    };
    const MODE_NAME = { safe: 'Предохранитель', auto: 'Автоматический', semi: 'Одиночный', burst: 'Очередь', pump: 'Помповый' };
    /* кадр арсенала: быстрая граната, фонарь/ЛЦУ, гранаты в полёте */
    function arsenalStep(dt) {
      const a = active();
      /* v26: день/ночь для яркости марки коллиматора (05b_guns), анимация откидного увеличителя */
      root.AEGIS_DAYK = U.clamp01(((C.sun && C.sun.intensity) || 0) / 2.2);
      if (a && GN && GN.tickFlip) { const iv = curInv(a); if (iv && iv.w && iv.w.mgFlip) GN.tickFlip(iv.w, dt); }
      if (a && S.quick && S.quick.armed && BC && BC.item && BC.item.kind === 'grenade' && !BC.busy) {
        S.quick.armed = false;
        BC.throwGrenade('over');
      }
      if (GSIM) GSIM.update(dt);
      if (root.GSmoke) root.GSmoke.update(dt, camera);
      /* v22: на лестнице оружие убирается (обе руки на перекладинах); сошёл с лестницы — оружие снова в руках */
      {
        const a = S.mode === 'embodied' ? active() : null;
        if (a && !a.dead && a.ctrl) {
          const onL = !!a.ctrl.ladder;
          if (onL && !a._ladHol) {
            a._ladHol = true; a._ladSlot = a.slot;
            if (a.ctrl.pullTrigger) a.ctrl.pullTrigger(false);
            input.ads = false;
            if (BC && BC.throwing) try { BC.abortThrow(); } catch (e) { /* */ }
            if (a.slot >= 0) { a.slot = -1; equip(a, null); }
            S.hudDirty = true;
          } else if (!onL && a._ladHol) {
            a._ladHol = false;
            const k = a._ladSlot; a._ladSlot = -1;
            if (k >= 0 && a.slot < 0 && !(root.GMG && root.GMG.isMounted(a))) selectSlot(a, k, { force: true });
            S.hudDirty = true;
          }
        }
      }
    }
    /* фонарь и ЛЦУ — ПОСЛЕ постановки оружия в кадре (иначе луч на кадр
       отставал от модуля и при повороте «отрывался» от оружия) */
    C.updateTac = updateTac;

    /* ------------------------------------------- разрыв гранаты --- */
    function grenadeBlast(g) {
      /* v22: дымовая — не взрыв: хлопок воспламенителя и облако, корпус лежит и дымит */
      if (g.kind === 'smoke') {
        if (root.GSmoke) try { root.GSmoke.start(g, { team: g.team || null }); } catch (e) { console.warn('smoke', e && e.message); }
        (C.lifeEvents || (C.lifeEvents = [])).push({ type: 'smoke', from: g.pos.clone(), to: g.pos.clone(), shooter: null });
        return;
      }
      const pos = g.pos.clone();
      const gy = gAt0(pos.x, pos.z);
      if (pos.y < gy + 0.03) pos.y = gy + 0.03;
      if (world.explode) try { world.explode(pos, g.kind === 'm84' ? { radius: 3.5, power: 0.35 } : { radius: 6, power: 1 }); } catch (e) { console.warn('world.explode', e && e.message); }
      if (g.kind === 'm84') {
        if (F.BLAST) F.BLAST.explode(pos, 'm84');
        if (audio.explosion) audio.explosion(F.spatialFrom(pos), 'm84');
        shock(pos, 0.7);
        flashbang(pos);
      } else {
        if (F.BLAST) F.BLAST.explode(pos, 'ozm_air', { fragDust: 45 });
        if (audio.explosion) audio.explosion(F.spatialFrom(pos), 'm67');
        shock(pos, 1.25);
        fragBurst(pos, { N: 1600, cause: 'Осколочное ранение · M67', R: 2.6 });
      }
    }
    C.grenadeBlast = grenadeBlast;
    /* ---------------------------------------- поведение бойцов (life.js) */
    const GLIFE = root.GLife || null;
    const _lv = { pos: new THREE.Vector3(), prev: new THREE.Vector3(), dir: new THREE.Vector3(), init: false, gun: new THREE.Vector3() };
    /* Кто «смотрит» на бойцов: управляемый боец (его глаза и ствол) или
       свободная камера. Плюс события кадра — выстрелы и попадания. */
    function lifeFrame(dt, t) {
      const a = active();
      if (a) _lv.pos.copy(F.eyePosition(a)); else _lv.pos.copy(camera.position);
      const spd = _lv.init ? _lv.prev.distanceTo(_lv.pos) / Math.max(dt, 1e-3) : 0;
      _lv.prev.copy(_lv.pos); _lv.init = true;
      if (a && a.gun) _lv.dir.set(0, 0, -1).applyQuaternion(a.gun.gun.getWorldQuaternion(new THREE.Quaternion()));
      else camera.getWorldDirection(_lv.dir);
      return { t, viewerPos: _lv.pos, viewerDir: _lv.dir, viewerArmed: !!(a && a.gun), viewerSelf: false,
        viewerSpeed: Math.min(spd, 6), events: C.lifeEvents ? C.lifeEvents.slice() : [] };
    }
    function npcLife(s, i, dt, env) {
      if (!GLIFE || s.dead) return;
      const L = s.life || (s.life = GLIFE.create(THREE, s));
      const c = s.ctrl;
      if (s.formYaw === undefined) s.formYaw = s.idleYaw;
      env.buddyOf = squad[i ^ 1] || null;
      env.gunPoint = s.gun ? s.gun.root.getWorldPosition(_lv.gun) : s.char.bone('chest').getWorldPosition(_lv.gun);
      const o = GLIFE.update(L, s, dt, env);
      c.aiReady = o.ready;
      c.aiCrouch = o.crouch || (s.stunT > 0 && S.time < s.stunT) || !!(s.thr && s.thr.crouch);
      if (s.thr && (s.thr.mode || s.thr.cover > 0.3)) c.aiReady = 0;
      c.aimDip = U.damp(c.aimDip || 0, o.ready ? 0.5 : 0, 4, dt);
      if (s.thr && s.thr.mode) { /* угроза важнее любопытства */ }
      else if (o.turnTo !== null && o.turnTo !== undefined) { s.idleYaw = o.turnTo; s.turnT = env.t; }
      /* спокойно дольше 10 с — обратно в строй */
      else if (s.idleYaw !== s.formYaw && o.alert < 0.1 && !L.focus && env.t - (s.turnT || 0) > 10) s.idleYaw = s.formYaw;
      /* разворот на месте — переступанием, а не вращением статуи */
      const dYaw = Math.abs(U.wrapPI(s.idleYaw - c.yaw));
      if (dYaw > 0.14) {
        c.speed = Math.max(c.speed, U.lerp(0.32, 0.62, Math.min(1, dYaw / 1.2)));
        const ph0 = c.stepPhase;
        c.stepPhase += dt * 1.8;
        /* касание стопы — тихий шаг с места бойца */
        if (Math.floor(ph0 * 2) !== Math.floor(c.stepPhase * 2) && audio && audio.stepAt && F.spatialFrom)
          if (!s._audFar) { if (s.sfx && s.sfx.B) s.sfx.footstep(false, 0.35); else audio.stepAt(F.spatialFrom(s.char.root.position), 0.3, 0, Math.floor(c.stepPhase * 2) % 2 ? -1 : 1); }
      }
    }
    /* ---------------------------------------------- v6: реакция на гранаты ---
       Боевой порядок («Grenade!», FM 3-21.8 / драфт SOP пехоты): заметив
       осколочную гранату ближе ~15 м, боец отворачивается и делает 2–4 рывка
       прочь, пока хватает времени до подрыва, затем падает ничком ногами к
       гранате (каска и плиты — к разрыву, ноги — меньшая площадь). У
       светошумовой времени нет (замедление 1,3–1,7 с): отвернуться, зажмуриться,
       закрыть глаза рукой, присесть. Реакция не мгновенная: 0,3–0,75 с на
       замеченную, +0,25 с — если граната только услышана (удар о землю). */
    const _thA = new THREE.Vector3(), _thB = new THREE.Vector3(), _thM = new THREE.Matrix4(), _thQ = new THREE.Quaternion(),
      _thQ2 = new THREE.Quaternion(), _thP = new THREE.Vector3(), _thS = new THREE.Vector3(), _thX = new THREE.Vector3(), _thY = new THREE.Vector3(), _thZ = new THREE.Vector3();
    function npcThreat(s, dt, t) {
      const c = s.ctrl;
      const T = s.thr || (s.thr = { mode: null, until: 0, cover: 0, shut: 0, yaw: null, fast: false, crouch: false, blind: 0 });
      let best = null, bestD = 1e9;
      if (GSIM) for (const g of GSIM.list) {
        if (g.done || g.kind === 'smoke') continue;
        const dx = g.pos.x - c.pos.x, dz = g.pos.z - c.pos.z, d = Math.hypot(dx, dz);
        if (d > (g.kind === 'm84' ? 13 : 15) || Math.abs(g.pos.y - c.pos.y) > 6) continue;
        const seen = g._seen || (g._seen = {});
        if (seen[s.key] === undefined) {
          const look = (dx * -Math.sin(c.yaw) + dz * -Math.cos(c.yaw)) / Math.max(0.1, d);
          const heard = g.bounceT >= 0 || g.ground;
          if (look > -0.05 || d < 2.5) seen[s.key] = t + 0.3 + Math.random() * 0.45;
          else if (heard) seen[s.key] = t + 0.55 + Math.random() * 0.45;
          else continue;
        }
        if (t < seen[s.key]) continue;
        const left = g.fuse - g.t;
        const danger = d - left * 2;            // ближе и скорее — опаснее
        if (danger < bestD) { bestD = danger; best = g; best._d = d; best._left = left; }
      }
      if (best) {
        if (!T.mode || T.mode === 'home') { if (!T.mode) { T.hx = c.pos.x; T.hz = c.pos.z; } }
        const away = Math.atan2(-(c.pos.x - best.pos.x), -(c.pos.z - best.pos.z));
        if (best.kind === 'm84') {
          T.mode = 'flash'; T.yaw = away + 0.25 * Math.sign(Math.sin(s.idleSeed)); T.fast = true; T.crouch = true;
          T.cover = U.damp(T.cover, 1, 7, dt);
          T.shut = U.damp(T.shut, best._left < 0.9 ? 1 : 0.6, 14, dt);
          c.aiWish = best._left > 0.6 && best._d < 6 ? (c._aw || (c._aw = new THREE.Vector2())).set(0, -1) : null;
          c.aiSprint = false; c.aiProne = undefined;
          T.until = t + Math.max(0, best._left) + 0.7;
        } else {
          T.mode = 'frag'; T.yaw = away; T.fast = true;
          const run = best._left > 1.45 && best._d < 12.5 && !(c.prone > 0.3);
          c.aiWish = run ? (c._aw || (c._aw = new THREE.Vector2())).set(0, -1) : null;
          c.aiSprint = run && best._d < 11;
          c.aiProne = !run;
          T.crouch = false; T.cover = U.damp(T.cover, 0, 5, dt); T.shut = U.damp(T.shut, run ? 0 : 0.5, 6, dt);
          T.until = t + Math.max(0, best._left) + 1.8 + Math.random() * 0.6;
        }
        /* бежать только если смотрит туда, куда бежит */
        if (c.aiWish && Math.abs(U.wrapPI(T.yaw - c.yaw)) > 0.9) c.aiWish = null;
      } else if (T.mode) {
        if (t < T.until) {
          /* после подрыва — ещё лежит/жмурится; ослеплённый — закрывает лицо */
          c.aiWish = null; c.aiSprint = false;
          T.cover = U.damp(T.cover, T.mode === 'flash' ? 1 : 0, 5, dt);
          T.shut = U.damp(T.shut, T.mode === 'flash' ? 0.9 : 0.3, 6, dt);
        } else if (T.mode !== 'home') { T.mode = 'home'; T.homeT = t; c.aiProne = false; T.crouch = false; T.fast = false; }
      }
      /* оглушение светошумовой: руки к лицу, щурится, мотает головой */
      if (s.stunT > 0 && S.time < s.stunT) {
        const k = U.clamp01((s.stunT - S.time) / 2);
        T.cover = U.damp(T.cover, T.blind > 0.5 ? 1 : 0.55 * k, 6, dt);
        T.shut = Math.max(T.shut * 0.9, (T.blind > 0.5 ? 0.75 : 0.4) + 0.25 * Math.sin(t * 9 + s.idleSeed));
        T.yaw = (T.yaw ?? s.idleYaw) + Math.sin(t * 1.7 + s.idleSeed) * 0.6 * dt;
      } else T.blind = 0;
      if (C.combat && T.mode === 'home') { T.mode=null;T.yaw=null;T.fast=false;T.crouch=false;c.aiWish=null;c.aiProne=undefined; }
      if (T.mode === 'home') {
        /* вернуться на своё место в строю — шагом */
        const hx = (T.hx ?? s.spawn.x) - c.pos.x, hz = (T.hz ?? s.spawn.z) - c.pos.z, hd = Math.hypot(hx, hz);
        T.cover = U.damp(T.cover, 0, 4, dt); T.shut = U.damp(T.shut, 0, 4, dt);
        if (c.prone > 0.05) c.aiWish = null;
        else if (hd > 0.45 && t - (T.homeT || t) < 14) {
          T.yaw = Math.atan2(-hx, -hz); T.fast = false;
          c.aiWish = Math.abs(U.wrapPI(T.yaw - c.yaw)) < 0.6 ? (c._aw || (c._aw = new THREE.Vector2())).set(0, -Math.min(1, hd / 0.8)) : null;
        } else {
          c.aiWish = null; c.aiProne = undefined; T.mode = null; T.yaw = null;
          s.idleYaw = s.formYaw;
        }
      }
      if (T.yaw !== null && T.mode) s.idleYaw = T.yaw;
      if (s.life) s.life.eyesShut = T.shut;
      return T;
    }
    /* левая кисть закрывает глаза: ладонь к лицу, пальцы к правому виску */
    function coverEyes(s) {
      const T = s.thr;
      if (!T || T.cover < 0.02 || !s.rig.handTargets) return;
      const ch = s.char, eR = ch.bone('eyeR'), eL = ch.bone('eyeL'), hd = ch.bone('head');
      if (!(eR && eL) && !hd) return;
      if (eR && eL) _thP.copy(eR.getWorldPosition(_thA)).add(eL.getWorldPosition(_thB)).multiplyScalar(0.5);
      else { hd.getWorldPosition(_thP); _thP.y += 0.08; }
      const y = s.ctrl.yaw;
      const fwd = _thZ.set(-Math.sin(y), 0, -Math.cos(y));
      const right = _thX.set(Math.cos(y), 0, -Math.sin(y));
      _thP.addScaledVector(fwd, 0.085).addScaledVector(right, -0.015).y -= 0.03;
      /* базис кисти как в gripMatrix(pos, distal, dorsal): z = −distal, y = dorsal */
      const distal = _thA.copy(right).multiplyScalar(0.82).add(_thB.set(0, 0.5, 0)).normalize();
      const z = distal.negate();
      const yv = _thY.copy(fwd); yv.addScaledVector(z, -yv.dot(z)).normalize();
      const x = _thB.crossVectors(yv, z);
      _thM.makeBasis(x, yv, z);
      _thQ.setFromRotationMatrix(_thM);
      const L = s.rig.handTargets.L;
      L.decompose(_thA, _thQ2, _thS);
      const k = U.smoothstep(Math.min(1, T.cover));
      _thA.lerp(_thP, k); _thQ2.slerp(_thQ, k);
      L.compose(_thA, _thQ2, _thS);
      if (k > 0.5 && s.rig.handPoses) s.rig.handPoses = { R: s.rig.handPoses.R, L: GR && GR.HANDS ? GR.HANDS.OPEN : s.rig.handPoses.L };
    }

    const bodycamMode = (i) => (BC && i === S.activeIdx ? (S.tp || S.spectate ? 'tp' : 'fp') : null);
    let lensAmt = 0;

    /* ------------------------------------------------------- камера --- */
    /* Три режима:
         free      — облёт полигона;
         embodied  — от глаз бойца (бодикам);
       Переход между ними плавный: камера «влетает» в глаза оператора. */
    const camRig = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 72, blend: 0 };
    /* Поле зрения. В прицеле оно сужается сильно: при 40° колодка целика,
       до которой 0,3 м, занимала пол-экрана. 22° дают привычную картинку —
       целик и мушка мелкие, цель видно. */
    const FOV_HIP = 74, FOV_ADS = 22;

    function updateCamera(dt) {
      /* внешняя камера для съёмки: управление бойцом при этом сохраняется */
      if (S.spectate) {
        camera.position.copy(S.spectate.pos);
        camera.quaternion.copy(S.spectate.quat);
        if (camera.fov !== S.spectate.fov) { camera.fov = S.spectate.fov; camera.updateProjectionMatrix(); }
        return;
      }
      /* управляемый боец погиб: камера с телом */
      if (S.death) { deathCam(dt); return; }
      const a = active();
      /* от первого лица камеру уже поставил бодикам */
      if (a && BC && !S.tp) {
        camRig.pos.copy(camera.position); camRig.quat.copy(camera.quaternion);
        camRig.fov = camera.fov; camRig.blend = 1; camRig.tp = 0;
        return;
      }
      if (a) {
        const c = a.ctrl;
        const eye = F.eyePosition(a);
        /* Отдача бьёт в камеру слабее, чем в оружие: голова гасит часть. */
        /* v7: камера со стороны идёт за видимой отдачей (GRecoil), а не за тенью */
        const recPitch = c.vr ? (c.vr.out.pitch * 0.30 + c.vr.out.nod * 0.25 + (c.jolt ? c.jolt.x * 0.3 : 0)) : c.recoil.x * 0.30;
        const recYaw = c.vr ? c.vr.out.yaw * 0.22 : c.recoilYaw.x * 0.22;
        /* Спринт: камера качается сильнее и уходит вбок. */
        const sp = U.smoothstep(c.sprint);
        const moveAmt = U.clamp01(c.speed / c.PHYS.sprint);
        const rollBob = Math.sin(c.bobPhase) * U.lerp(0.010, 0.032, moveAmt) * (1 - c.ads * 0.7);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
          c.pitch + recPitch + Math.sin(c.bobPhase * 2) * 0.006 * moveAmt,
          c.yaw + recYaw,
          -c.lean * 0.22 + rollBob + sp * Math.sin(c.bobPhase) * 0.035,
          'YXZ'));

        camRig.blend = U.damp(camRig.blend, 1, 9, dt);
        camRig.pos.lerp(eye, 1 - Math.exp(-26 * dt));
        camRig.quat.slerp(q, 1 - Math.exp(-30 * dt));
        /* в прицеле камера жёстко привязана: дрожь недопустима */
        if (c.ads > 0.6) { camRig.pos.copy(eye); camRig.quat.copy(q); }

        const wantFov = U.lerp(C.SET.fov||FOV_HIP, FOV_ADS, U.smoothstep(c.ads))
          * U.lerp(1, 1.055, sp);
        camRig.fov = U.damp(camRig.fov, wantFov, 12, dt);
        camRig.tp = 0;
      } else {
        const f = S.free;
        camRig.blend = U.damp(camRig.blend, 0, 9, dt);
        camRig.pos.lerp(f.pos, 1 - Math.exp(-20 * dt));
        camRig.quat.slerp(new THREE.Quaternion().setFromEuler(
          new THREE.Euler(f.pitch, f.yaw, 0, 'YXZ')), 1 - Math.exp(-18 * dt));
        camRig.fov = U.damp(camRig.fov, S.free.fov || 72, 10, dt);
      }
      camera.position.copy(camRig.pos);
      camera.quaternion.copy(camRig.quat);
      if (Math.abs(camera.fov - camRig.fov) > 0.01) {
        camera.fov = camRig.fov;
        camera.updateProjectionMatrix();
      }
    }

    /* Голова активного бойца прячется от собственной камеры: иначе в
       кадре торчит изнанка шлема или поля панамы. Остальное тело видно —
       как в бодикаме. */
    const HEAD_GROUPS = ['skin', 'helmet', 'hat', 'hatHard', 'maskHem', 'eye', 'hair', 'mask', 'headGear', 'headHard', 'headRubber', 'brow', 'lash', 'headset', 'cornea'];
    /* Мелкие детали (брови, ресницы, роговица, нашивка, мелочь на шлеме)
       дальше LOD_FAR м не различимы — их меши не рисуются: это экономит
       вызовы отрисовки, когда боец далеко. */
    const DETAIL_GROUPS = ['brow', 'lash', 'cornea', 'patch', 'headRubber', 'headGear'];
    const LOD_FAR = 18;
    const _lodV = new THREE.Vector3();
    /* v22: от первого лица видно своё тело ниже пояса — ноги и ботинки (взгляд вниз на вышке, у пулемёта, в окопе).
       Голова, торс, руки, разгрузка остаются скрыты: руки и оружие в кадре рисует бодикам. */
    const FP_KEEP = { pants: 1, boot: 1, bootSole: 1, bootLace: 1, bootHard: 1 };
    const fpLegs = (s) => C.SET.fpBody !== false && !s.dead && !S.death && s.ctrl && !((s.ctrl.prone || 0) > 0.3) && !s.ctrl.supine;
    /* v26: «летающие руки». К костям тела прикреплены не только скин-сетки из char.meshes, но и
       отдельные объекты: перчатки GLB (на запястьях), повязка на плече и т.п. От первого лица
       скрывались только сетки — перчатки и повязка своего же тела висели в воздухе перед камерой
       (в позе, где тело их оставило: у лица, над травой, у стены). Теперь всё, что висит на
       костях выше пояса, от первого лица скрывается и потом возвращается как было. */
    const FP_LEG_BONE = /^(hip|knee|ankle|toe)/;
    function fpAttach(s, on) {
      let M = s._fpAtt;
      if (!on) { if (M) { for (const [o, v] of M) o.visible = v; s._fpAtt = null; } return; }
      if (!M || ((s._fpAttN = (s._fpAttN || 0) + 1) % 90) === 0) {
        M = s._fpAtt || (s._fpAtt = new Map());
        s.char.root.traverse((b) => {
          if (!b.isBone || FP_LEG_BONE.test(b.name)) return;
          for (const o of b.children) if (!o.isBone && !M.has(o)) M.set(o, o.visible);
        });
      }
      for (const o of M.keys()) o.visible = false;
    }
    function updateSelfVisibility() {
      for (let i = 0; i < squad.length; i++) {
        const s = squad[i];
        const fpSelf = i === S.activeIdx && !S.spectate && !(S.tp && camRig.tp > 0.3) && !s.ctrl._balanceBusy && bodycamMode(i) === 'fp';
        if (fpSelf && fpLegs(s)) {
          if (!s._fpVis) { s._fpVis = {}; for (const g in s.char.meshes) if (s.char.meshes[g]) s._fpVis[g] = s.char.meshes[g].visible; }
          s.char.root.visible = true;
          for (const g in s.char.meshes) { const m = s.char.meshes[g]; if (m) m.visible = !!FP_KEEP[g] && s._fpVis[g] !== false; }
          fpAttach(s, true);
          continue;
        }
        if (s._fpAtt) fpAttach(s, false);
        if (s._fpVis) { for (const g in s._fpVis) if (s.char.meshes[g]) s.char.meshes[g].visible = s._fpVis[g]; s._fpVis = null; }
        const hide = (i === S.activeIdx && !s.ctrl._balanceBusy && !S.spectate && !(S.tp && camRig.tp > 0.3)) ||
          (!!S.death && S.death.i === i && S.death.fp && !S.spectate);
        for (const g of HEAD_GROUPS) if (s.char.meshes[g]) s.char.meshes[g].visible = !hide && !(g === 'helmet' && s.helmetOff);
        const far = s.char.root.getWorldPosition(_lodV).distanceTo(camera.position) > LOD_FAR;
        if (far) for (const g of DETAIL_GROUPS) if (s.char.meshes[g]) s.char.meshes[g].visible = false;
      }
    }

    /* --------------------------------------------------------- тени --- */
    /* Каскада нет: двигаем ортокамеру солнца за игроком, чтобы карта
       теней всегда покрывала окрестность с высоким разрешением. */
    function updateSun() {
      const p = camera.position;
      /* привязка к сетке текселей: края теней не «ползут» при ходьбе (js/app/render_tune.js) */
      if (root.AEGIS_TUNE) { root.AEGIS_TUNE.snapSun(sun, p.x, p.z, C.sunDir); return; }
      sun.position.set(p.x + C.sunDir.x * 40, C.sunDir.y * 40 + 6, p.z + C.sunDir.z * 40);
      sun.target.position.set(p.x, 0, p.z);
      sun.target.updateMatrixWorld();
    }

    /* --------------------------------------------------------- HUD ---- */
    /* DOM обновляется только при изменении значений: textContent и
       className каждый кадр заставляли браузер пересчитывать стили. */
    const HUD = {
      slots: document.getElementById('slots'), ret: document.getElementById('reticle'),
      cells: [], last: {}, retKey: '', embodied: null, slotKey: ''
    };
    const setTxt = (el, k, v) => { if (el && HUD.last[k] !== v) { HUD.last[k] = v; el.textContent = v; } };
    const setCls = (el, k, v) => { if (el && HUD.last['c' + k] !== v) { HUD.last['c' + k] = v; el.className = v; } };
    if (HUD.slots) {
      HUD.slots.innerHTML = '';
      for (let i = 0; i < SLOTN; i++) {
        const d = document.createElement('div');
        d.className = 'slot';
        d.innerHTML = '<b></b><span></span>';
        HUD.slots.appendChild(d);
        HUD.cells.push({ el: d, key: d.firstChild, name: d.lastChild });
      }
    }
    function updateSlots(a) {
      const B = C.getBinds ? C.getBinds() : {};
      const key = a ? [a.key, a.slot, JSON.stringify(a.used), JSON.stringify(a.L.slots), SLOTN].join('|') + Object.keys(B).filter((k) => /^slot/.test(k)).map((k) => B[k]).join(',') : '';
      if (key === HUD.slotKey) return;
      HUD.slotKey = key;
      if (!a) return;
      for (let i = 0; i < HUD.cells.length; i++) {
        const c = HUD.cells[i], it = a.L.slots[i];
        c.key.textContent = AE.keyName(B['slot' + (i + 1)]);
        c.name.textContent = it ? AE.describe(it, a.L).title : '—';
        c.el.className = 'slot' + (it ? '' : ' empty') + (i === a.slot ? ' on' : '') + (a.used[i] ? ' used' : '') + (it && it.t === 'ammo' ? ' ammo' : '');
      }
    }
    function updateReticle(a) {
      if (!HUD.ret) return;
      const sg = BC && a && !S.death ? BC.sight : null;
      let key = '';
      /* v9: у коллиматоров с маркой в линзе (05b_guns: lensReticle) DOM-точки нет */
      if (sg && sg.kind && sg.sight && !(sg.kind === 'dot' && sg.sight.lensRet) && (sg.kind === 'scope' ? sg.scope : sg.k > 0.6)) {
        const W = innerWidth, H = innerHeight;
        const rc = GN && GN.retColorOf ? GN.retColorOf(sg.sight) : '';
        if (sg.kind === 'scope') key = 's|' + (sg.sight.retId || '') + '|' + rc + '|' + (sg.sight.nv ? 'nv|' : '') + sg.fov.toFixed(2) + '|' + W + 'x' + H;
        else key = 'd|' + (sg.sight.retId || '') + '|' + rc + '|' + Math.round(sg.fov) + '|' + H;
        if (key !== HUD.retKey) {
          HUD.retKey = key;
          if (sg.kind === 'scope') {
            const zoom = sg.sight.zoom ? sg.sight.zoom[1] : (sg.sight.mag || 1);
            const r = Math.min(W, H) * 0.47;
            HUD.ret.className = 'scope' + (sg.sight.nv ? ' nv' : '') + (sg.sight.magnifier ? ' mag' : '');
            HUD.ret.innerHTML = '<div class="mask" style="--r:' + r.toFixed(0) + 'px"></div>' + (GN ? GN.reticleMarkup(sg.sight, sg.fov, W, H, zoom) : '');
          } else {
            const B = 256;
            HUD.ret.className = 'dot';
            HUD.ret.innerHTML = '<div class="box">' + (GN ? GN.reticleMarkup(sg.sight, sg.fov, B, B, 1, innerHeight, true) : '') + '</div>';
            HUD.retBox = HUD.ret.firstChild;
          }
        }
        if (sg.kind === 'dot' && HUD.retBox) {
          const x = (sg.x * 0.5 + 0.5) * innerWidth, y = (-sg.y * 0.5 + 0.5) * innerHeight;
          HUD.retBox.style.transform = 'translate(' + (x - 128).toFixed(1) + 'px,' + (y - 128).toFixed(1) + 'px)';
          HUD.retBox.style.opacity = String(U.clamp01((sg.k - 0.6) / 0.22));
        }
      } else if (HUD.retKey) {
        HUD.retKey = '';
        HUD.ret.className = '';
        HUD.ret.innerHTML = '';
        HUD.retBox = null;
      }
    }
    const JAM_NAME = { ftf: 'Недосыл', stovepipe: 'Гильза в окне', double: 'Двойная подача' };
    function updateHUD(dt) {
      const a = active();
      const emb = !!a;
      if (emb !== HUD.embodied) { HUD.embodied = emb; document.body.classList.toggle('embodied', emb); S.hudDirty = true; }
      if (a) {
        const c = a.ctrl, inv = curInv(a);
        const gren = a.cur && a.cur.kind === 'grenade';
        if (inv) {
          const t = inv.w.ammoTypes && inv.w.ammoTypes.length ? inv.w.ammoTypes[inv.ammoI % inv.w.ammoTypes.length] : null;
          setTxt(ui.ammoCal, 'cal', AE.WEAPONS[inv.id].name + ' · ' + AE.WEAPONS[inv.id].calName);
          setTxt(ui.ammoType, 'type', t ? t.name : '');
          setTxt(ui.ammoN, 'n', String(c.ammo));
          setCls(ui.ammoN, 'n', c.ammo === 0 ? 'empty' : (c.ammo <= Math.max(2, (c.magCap || 30) * 0.17) ? 'low' : ''));
          setTxt(ui.ammoR, 'r', '/ ' + c.reserve);
          setTxt(ui.mode, 'm', c.jam ? (c.reload >= 0 ? 'Устранение задержки' : 'Задержка · ' + (JAM_NAME[c.jam.type] || '') + ' — ' + keyOf('reload')) : (MODE_NAME[c.fireMode] || c.fireMode || ''));
          setCls(ui.ammo, 'a', 'on');
        } else if (gren) {
          const g = a.cur.grenade;
          let n = 0;
          for (let i = 0; i < SLOTN; i++) { const x = a.L.slots[i]; if (x && x.t === 'grenade' && x.g === g && !a.used[i]) n++; }
          setTxt(ui.ammoCal, 'cal', AE.GRENADES[g].name);
          setTxt(ui.ammoType, 'type', g === 'm67' ? 'Осколочная' : 'Светошумовая');
          setTxt(ui.ammoN, 'n', String(n));
          setCls(ui.ammoN, 'n', '');
          setTxt(ui.ammoR, 'r', 'шт.');
          setTxt(ui.mode, 'm', 'ЛКМ — сверху · ПКМ — снизу');
          setCls(ui.ammo, 'a', 'on');
        } else setCls(ui.ammo, 'a', '');
        const st = c.stamina / c.PHYS.staminaMax;
        const stOn = st < 0.995;
        if (HUD.last.st !== stOn) { HUD.last.st = stOn; ui.stamina.classList.toggle('on', stOn); }
        const sk = st.toFixed(2);
        if (HUD.last.sk !== sk) { HUD.last.sk = sk; ui.staminaBar.style.transform = 'scaleX(' + sk + ')'; }
        /* v13: кровопотеря и шок сужают поле зрения (та же виньетка — без
           полноэкранных фильтров, на слабом ПК бесплатно) */
        const vg = U.clamp01(c.sprint * 0.55 + (1 - st) * 0.25 + (c.shockK || 0) * 0.85 + (c.stun || 0) * 0.15).toFixed(2);
        if (HUD.last.vg !== vg) { HUD.last.vg = vg; ui.vig.style.opacity = vg; }
      } else {
        if (HUD.last.st !== false) { HUD.last.st = false; ui.stamina.classList.remove('on'); }
        if (HUD.last.vg !== '0') { HUD.last.vg = '0'; ui.vig.style.opacity = '0'; }
        setCls(ui.ammo, 'a', '');
      }
      if (S.hudDirty || ((S.time * 4) | 0) !== HUD.last.tq) { HUD.last.tq = (S.time * 4) | 0; S.hudDirty = false; updateSlots(a); }
      updateReticle(a);
      if (MED) MED.hud(a, dt, squad, camera, keyOf);
    }

    /* ------------------------------------------------- запуск игры ---- */
    if (ui.loading) ui.loading.classList.add('done');

    /* гильза, упавшая на землю — звук */
    fx.onCaseLand = (v) => audio.caseHit(v);

    /* H — поднять всех: раны, кровь и рэгдолл сбрасываются, бойцы снова в строю */
    function reviveAll() {
      let n = 0;
      for (const s of squad) {
        if (!s.dmg || (!s.dead && !s.dmg.hits)) continue;
        if (s.dead) { respawn(s); n++; continue; }
        F.DMG.revive(s);
        s.life = null;
        s.ctrl.aiReady = 0; s.ctrl.aiCrouch = false; s.ctrl.aimDip = 0;
        n++;
      }
      if (n && audio.ui) audio.ui(true);
      return n;
    }
    C.reviveAll = reviveAll;
    function testShot(i, y, o) {
      o = o || {};
      const s = squad[i], k = s.char.scale || 1, R = s.char.root;
      R.updateMatrixWorld(true);
      let tgt = R.localToWorld(new THREE.Vector3(o.x || 0, y * k, o.z || 0));
      /* v14: o.bone — целиться в кость (шея/живот), а не в фикс. высоту:
         после первого попадания тело смещается */
      const bn = o.bone && s.char.bone(o.bone);
      if (bn) { bn.getWorldPosition(tgt); if (o.off) tgt.add(new THREE.Vector3().fromArray(o.off)); }
      const ang = o.ang || 0, d = o.d || 8;
      const from = bn ? tgt.clone().add(new THREE.Vector3(Math.sin(ang) * d, (o.dy || 0), -Math.cos(ang) * d).applyQuaternion(R.quaternion))
        : R.localToWorld(new THREE.Vector3(Math.sin(ang) * d + (o.sx || 0), (o.sy === undefined ? 1.45 : o.sy), -Math.cos(ang) * d));
      return F.testFire(from, tgt.sub(from).normalize(), o.shooter === undefined ? null : squad[o.shooter], { ammo: o.ammo, v: o.v });
    }

    /* ================================================ МИННОЕ ПОЛЕ ===== */
    /* Периметр за ограждением заминирован (game/world: buildMinefield).
       ПМН-2 срабатывает под стопой: усилие 5–25 кгс на крестовину под
       резиновым колпаком (Ø ≈ 54 мм, корпус Ø 121 мм) — подошве хватает
       задеть колпак краем. ОЗМ-72 — от натяжения растяжки (взрыватель
       МУВ, ~1 кгс): вышибной заряд подбрасывает корпус на 0,6–0,8 м,
       основной (≈ 660 г ТНТ) рвётся в воздухе, ~2400 готовых поражающих
       элементов уходят поясом у горизонта — сплошное поражение до 25 м.
       ТМ-62М на выезде от человека не срабатывает (нужно 200+ кгс). */
    const MF = world.minefield || null;
    const RESPAWN_T = 5;
    /* v14: агония длится, пока раненый не истечёт кровью (физиология) —
       AGONY_T лишь страховка */
    const CORPSE_T = 14, AGONY_T = 300;
    const MZ = { near: [], q: [], n: 0, log: [], shk: 0, fade: 0 };
    const _mA = new THREE.Vector3(), _mB = new THREE.Vector3(), _mC = new THREE.Vector3(), _mD = new THREE.Vector3(), _mE = new THREE.Vector3();
    const _mRay = new THREE.Raycaster();
    const gAt = (x, z) => squad[0].ctrl.groundAt(x, z);
    /* ударная волна и звук приходят с запаздыванием d/343 */
    const later = (dt, fn) => MZ.q.push({ t: dt, fn });

    /* Стопа на мине: подошва (пятка — носок по костям голеностопа и
       плюсны) над колпаком и опирается на грунт. */
    function footOnMine(s, side) {
      const ch = s.char, ba = ch.bone('ankle' + side), bt = ch.bone('toe' + side);
      if (!ba || !bt) return null;
      const k = ch.scale || 1;
      ba.getWorldPosition(_mA); bt.getWorldPosition(_mB);
      let fx = _mB.x - _mA.x, fz = _mB.z - _mA.z;
      const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      const hx = _mA.x - fx * 0.065 * k, hz = _mA.z - fz * 0.065 * k;
      const tx = _mB.x + fx * 0.07 * k, tz = _mB.z + fz * 0.07 * k;
      const ux = tx - hx, uz = tz - hz, L2 = ux * ux + uz * uz || 1;
      MZ.near.length = 0;
      MF.near((hx + tx) * 0.5, (hz + tz) * 0.5, 0.35, MZ.near);
      for (const m of MZ.near) {
        if (!m.alive || m.type !== 'pmn') continue;
        const u = clamp(((m.x - hx) * ux + (m.z - hz) * uz) / L2, 0, 1);
        if (Math.hypot(hx + ux * u - m.x, hz + uz * u - m.z) > 0.08) continue;
        /* верх колпака: у мины на поверхности — высота корпуса */
        const top = m.y + (m.state === 'surface' ? 0.05 : m.state === 'flush' ? 0.01 : 0);
        const sole = Math.min(_mA.y - 0.10 * k, _mB.y - 0.042 * k);
        if (sole - top > 0.03) continue;
        return m;
      }
      return null;
    }

    /* Камеру встряхивает волной: от первого лица — шлем с бодикамом
       (BC.kick), иначе — сама камера. Слух глушит и звенит. */
    /* поверхность под ногой: вода / грязь / трава / сухая хвоя (+ шанс сучка) */
    function surfaceAt(x, z, soft) {
      if (soft === 'water') return { kind: 'water', k: 1 };
      const m = world.mudAt ? world.mudAt(x, z) : 0, w = world.wetAt ? world.wetAt(x, z) : 0;
      const g = C.GRASS && C.GRASS.densityAt ? C.GRASS.densityAt(x, z) : 0;
      const rain = F.SCARS ? F.SCARS.rain : 0;
      if (m > 0.45 || (typeof soft === 'number' && soft > 0.55)) return { kind: 'mud', k: Math.min(1, m + rain * 0.5) };
      if (g > 0.35) return { kind: 'grass', k: g, wet: Math.max(w, rain) };
      return { kind: 'needles', k: 1, wet: Math.max(w, rain), twig: Math.random() < 0.07 * (1 - rain) };
    }
    function shock(pos, big) {
      if (V8) try { V8.blast(pos, big, { fp: fpNow(), noMud: big < 0.9 }); } catch (e) { console.warn('v8 blast', e && e.message); }
      /* v6: ударная волна по траве/кустам/кронам, выжженное и срезанное пятно, след на грунте */
      if (world.env) {
        world.env.blast(pos.x, pos.z, 0.55 * big);
        if (big >= 1) world.env.cut(pos.x, pos.z, 0.9 + big * 0.7, 0.85);
        world.env.stamp(pos.x, pos.z, 2.2 * big, 1, 0, 0);
      }
      if (F.SCARS && big >= 1) F.SCARS.scorch(pos, big);
      const d = camera.position.distanceTo(pos);
      const k = clamp(1.25 - d / (11 * big), 0, 1.3);
      const kd = clamp(1.1 - d / (17 * big), 0, 1);
      if (k <= 0 && kd <= 0) return;
      _mE.set(1, 0, 0).applyQuaternion(camera.quaternion);
      const side = Math.sign(_mE.dot(_mC.copy(pos).sub(camera.position))) || 1;
      later(d / 343, () => {
        const a = active();
        if (k > 0) {
          if (BC && a && !S.tp && !S.spectate) BC.kick(k, side);
          else MZ.shk = Math.max(MZ.shk, k);
        }
        if (audio.deafen && kd > 0) audio.deafen(kd);
      });
    }
    /* одно событие на подрыв: бойцы вздрагивают, приседают, смотрят */
    function blastEvent(pos, victim, died) {
      (C.lifeEvents || (C.lifeEvents = [])).push({ type: 'hit', victim: victim || null, pos: pos.clone(), from: pos.clone(), zone: 'blast', died: !!died });
    }

    /* Осколки ОЗМ-72. Ожидаемое число попаданий в бойца — плотность ГПЭ
       в поясе ±20° у горизонта (2400 / 4πr²·sin20°) на площадь силуэта
       (~0,7 м² стоя, меньше в приседе), Пуассон. Точка прицеливания —
       случайная по сегментам тела; луч проверяется на укрытия, затем
       по капсулам зон (DMG.raySoldier) и бьёт как пуля, но слабее —
       и тем слабее, чем дальше (ГПЭ теряют скорость). */
    const FRAG_SEG = [['hips', 'spine', 3], ['spine', 'chest', 3], ['chest', 'neck', 2.2], ['neck', 'head', 1.2],
      ['shoulderR', 'elbowR', 1], ['shoulderL', 'elbowL', 1], ['elbowR', 'wristR', 0.8], ['elbowL', 'wristL', 0.8],
      ['hipR', 'kneeR', 2.2], ['hipL', 'kneeL', 2.2], ['kneeR', 'ankleR', 1.7], ['kneeL', 'ankleL', 1.7]];
    const FRAG_W = FRAG_SEG.reduce((a, x) => a + x[2], 0);
    function poisson(l) {
      if (l > 30) return Math.round(l + Math.sqrt(l) * (Math.random() + Math.random() + Math.random() - 1.5) * 2);
      const L = Math.exp(-l); let k = 0, p = 1;
      do { k++; p *= Math.random(); } while (p > L);
      return k - 1;
    }
    function fragBlocked(from, dir, len) {
      const objs = [];
      for (const key of ['ground', 'house', 'props', 'range', 'garden', 'v8props']) if (world[key]) objs.push(world[key]);
      _mRay.set(from, dir); _mRay.near = 0.05; _mRay.far = Math.max(0.1, len - 0.25);
      return _mRay.intersectObjects(objs, true).length > 0;
    }
    function ozmBurst(ap) {
      if (audio.explosion) audio.explosion(F.spatialFrom(ap), 'ozm');
      shock(ap, 1.6);
      let victim = null, anyDied = false;
      for (const s of squad) {
        if (!s.dmg || !F.DMG) continue;
        s.char.root.updateMatrixWorld(true);
        const hp = s.char.bone('hips').getWorldPosition(_mC);
        const r = Math.max(0.6, Math.hypot(hp.x - ap.x, hp.z - ap.z));
        if (r > 60) continue;
        const area = 0.7 * (1 - 0.38 * (s.ctrl.crouch || 0)) * (s.dead ? 0.45 : 1);
        const n = Math.min(16, poisson(2400 * area / (4 * Math.PI * r * r * 0.342)));
        if (!n) continue;
        const wasAlive = !s.dead, prevCause = s.deathCause;
        if (wasAlive) s.deathCause = 'Осколочное ранение · ОЗМ-72';
        let hits = 0, last = null;
        for (let j = 0; j < n; j++) {
          let w = Math.random() * FRAG_W, sg = FRAG_SEG[0];
          for (const x of FRAG_SEG) { w -= x[2]; if (w <= 0) { sg = x; break; } }
          const b0 = s.char.bone(sg[0]), b1 = s.char.bone(sg[1]);
          if (!b0 || !b1) continue;
          b0.getWorldPosition(_mA); b1.getWorldPosition(_mB);
          _mD.copy(_mA).lerp(_mB, Math.random());
          _mD.x += (Math.random() - 0.5) * 0.16; _mD.y += (Math.random() - 0.5) * 0.1; _mD.z += (Math.random() - 0.5) * 0.16;
          const dir = _mD.clone().sub(ap);
          const len = dir.length();
          dir.divideScalar(len);
          /* вне пояса разлёта — мимо */
          if (Math.abs(Math.asin(clamp(dir.y, -1, 1))) > 0.38) continue;
          if (fragBlocked(ap, dir, len)) continue;
          const h = F.DMG.raySoldier(s, ap, dir, len + 0.5);
          if (!h) continue;
          const sc = clamp(1.15 - r / 40, 0.32, 1.1);
          const res = F.DMG.hit(h, dir, null, S.time, { dmgScale: sc, frag: true, exit: Math.random() < 0.22 * sc, bloodScale: 0.6, woundScale: 0.8, silent: hits > 1, push: 0.45 });
          if (res) { hits++; last = res; }
        }
        if (wasAlive && !s.dead) s.deathCause = prevCause || null;
        if (last) {
          if (wasAlive && s.dead) { anyDied = true; victim = s; }
          else if (wasAlive && !s.active) { /* без плашки */ }
          else if (wasAlive && s.active) flashHurt(0.9);
          MZ.log.push({ t: +S.time.toFixed(2), frag: s.key, r: +r.toFixed(1), n, hits, died: !!s.dead });
        }
      }
      blastEvent(ap, victim, anyDied);
    }

    /* Осколки ручной гранаты M67: ~1600 эффективных осколков в верхнюю
       полусферу (разрыв у грунта). Ожидаемое число попаданий — плотность
       на площадь силуэта, Пуассон; дальше — как у ОЗМ: луч на укрытия,
       капсулы зон, урон падает с расстоянием. Ближе R — фугасное действие. */
    function fragBurst(ap, o) {
      let victim = null, anyDied = false;
      const a0 = active();
      for (const s of squad) {
        if (!s.dmg || !F.DMG) continue;
        s.char.root.updateMatrixWorld(true);
        const hp = s.char.bone('hips').getWorldPosition(_mC);
        const r = Math.max(0.5, Math.hypot(hp.x - ap.x, hp.z - ap.z));
        if (r > 40) continue;
        const wasAlive = !s.dead, prevCause = s.deathCause;
        if (wasAlive) s.deathCause = o.cause;
        if (r < o.R && !s.dead) {
          const res = F.DMG.blast(s, ap, 'near', { r: r * 2.7 / o.R * 1.15, cause: 'Подрыв гранаты M67' });
          if (res && res.died) { anyDied = true; victim = s; continue; }
        }
        const prone = s.ctrl.prone || 0;
        const area = 0.7 * (1 - 0.38 * (s.ctrl.crouch || 0)) * (1 - 0.55 * prone) * (s.dead ? 0.45 : 1);
        const n = Math.min(14, poisson(o.N * area / (2 * Math.PI * r * r)));
        let hits = 0, last = null;
        for (let j = 0; j < n; j++) {
          let wv = Math.random() * FRAG_W, sg = FRAG_SEG[0];
          for (const x of FRAG_SEG) { wv -= x[2]; if (wv <= 0) { sg = x; break; } }
          const b0 = s.char.bone(sg[0]), b1 = s.char.bone(sg[1]);
          if (!b0 || !b1) continue;
          b0.getWorldPosition(_mA); b1.getWorldPosition(_mB);
          _mD.copy(_mA).lerp(_mB, Math.random());
          _mD.x += (Math.random() - 0.5) * 0.16; _mD.y += (Math.random() - 0.5) * 0.1; _mD.z += (Math.random() - 0.5) * 0.16;
          const dir = _mD.clone().sub(ap);
          const len = dir.length();
          dir.divideScalar(len);
          if (dir.y < -0.15) continue;
          if (fragBlocked(ap, dir, len)) continue;
          const h = F.DMG.raySoldier(s, ap, dir, len + 0.5);
          if (!h) continue;
          const sc = clamp(1.2 - r / 16, 0.3, 1.1);
          const res = F.DMG.hit(h, dir, null, S.time, { dmgScale: sc, frag: true, exit: Math.random() < 0.2 * sc, bloodScale: 0.6, woundScale: 0.8, silent: hits > 1, push: 0.4 });
          if (res) { hits++; last = res; }
        }
        if (wasAlive && !s.dead) s.deathCause = prevCause || null;
        if (last) {
          if (wasAlive && s.dead) { anyDied = true; victim = s; }
          else if (wasAlive && s === a0) flashHurt(0.9);
          else if (wasAlive) { /* без плашки */ }
        }
      }
      blastEvent(ap, victim, anyDied);
    }

    /* Светошумовая M84: ~6–8 млн кд и 170–180 дБ. Ослепляет, если вспышка в
       поле зрения и не закрыта укрытием (сильнее — чем ближе и чем точнее
       взгляд на неё); оглушает по расстоянию. Генералы рядом вздрагивают,
       приседают и отворачиваются. */
    const FB = { k: 0, hold: 0, el: document.getElementById('flash') };
    function flashbang(pos) {
      const eye = camera.position;
      const d = eye.distanceTo(pos);
      const to = _mE.copy(pos).sub(eye);
      const len = to.length() || 1;
      to.divideScalar(len);
      const fwd = camera.getWorldDirection(_mD);
      const look = fwd.dot(to);
      const lifted = _mA.copy(pos); lifted.y += 0.08;
      const blockedV = len > 0.6 && fragBlocked(eye, to, len - 0.1);
      const kd = clamp(1.3 - d / 16, 0, 1);
      let k = 0;
      if (!blockedV && kd > 0) {
        const kl = look > 0.5 ? 1 : look > 0.15 ? 0.55 + (look - 0.15) * 1.3 : look > -0.2 ? 0.18 : 0;
        k = kd * kl;
        if (d < 2.2) k = Math.max(k, 0.55 * kd);
      }
      if (k > 0.04) {
        FB.k = Math.max(FB.k, Math.min(1, k * 1.1));
        FB.hold = Math.max(FB.hold, 0.6 + 3.2 * k);
      }
      const kh = clamp(1.25 - d / 14, 0, 1);
      if (audio.deafen && kh > 0.05) later(d / 343, () => audio.deafen(Math.min(1, kh * 1.1)));
      /* генералы со стороны */
      for (const s of squad) {
        if (s.dead || s.active) continue;
        const r = s.ctrl.pos.distanceTo(pos);
        if (r < 10) {
          /* v6: отвернулся и зажмурился — только оглушение звуком; смотрел на вспышку — ослеп */
          const c = s.ctrl, T = s.thr || {};
          const to = _mE.set(pos.x - c.pos.x, 0, pos.z - c.pos.z).normalize();
          const look = to.x * -Math.sin(c.yaw) + to.z * -Math.cos(c.yaw);
          const exp = clamp((look + 0.3) / 1.0, 0, 1) * (1 - 0.85 * (T.shut || 0));
          s.stunT = S.time + (1.2 + (10 - r) * 0.2) + exp * (2.5 + (10 - r) * 0.4);
          if (s.thr) s.thr.blind = exp;
          s.ctrl.aiCrouch = true;
        }
      }
      blastEvent(pos, null, false);
    }
    function updateFlash(dt) {
      if (FB.hold > 0) FB.hold -= dt;
      else if (FB.k > 0) FB.k = Math.max(0, FB.k - dt * (0.22 + FB.k * 0.25));
      if (FB.el) {
        const v = FB.k > 0.002 ? Math.min(1, FB.k) : 0;
        if (FB.el._v !== v) { FB.el._v = v; FB.el.style.opacity = v.toFixed(3); }
      }
    }

    /* Подрыв мины. victim — кто наступил (для ПМН — та стопа side). */
    function detonate(m, victim, side) {
      if (!MF || !m.alive) return;
      MF.remove(m);
      MZ.n++;
      const pos = new THREE.Vector3(m.x, m.y, m.z);
      MZ.log.push({ t: +S.time.toFixed(2), type: m.type, id: m.id, by: victim ? victim.key : null, x: +m.x.toFixed(2), z: +m.z.toFixed(2) });
      if (m.type === 'ozm') {
        /* хлопок вышибного заряда, корпус взлетает; разрыв — в onAir */
        if (audio.explosion) audio.explosion(F.spatialFrom(pos), 'ozm_pop');
        if (F.BLAST) F.BLAST.explode(pos, 'ozm', { onAir: (ap) => ozmBurst(ap) });
        else later(0.3, () => ozmBurst(pos.clone().setY(m.y + 0.7)));
        return;
      }
      const kind = m.type === 'tm' ? 'tm' : 'pmn';
      if (F.BLAST) F.BLAST.explode(pos, kind);
      if (audio.explosion) audio.explosion(F.spatialFrom(pos), kind);
      shock(pos, kind === 'tm' ? 2.2 : 1);
      let died = false;
      for (const s of squad) {
        if (s.dead || !s.dmg || !F.DMG) continue;
        if (s === victim && kind === 'pmn') {
          F.DMG.blast(s, pos, 'pmn', { side: side || 'R', cause: 'Подрыв на мине ПМН-2' });
          died = true;
          continue;
        }
        const r = Math.hypot(s.ctrl.pos.x - pos.x, s.ctrl.pos.z - pos.z);
        const R = kind === 'tm' ? 7 : 2.7;
        if (r < R) {
          const res = F.DMG.blast(s, pos, 'near', { r: r * 2.7 / R, cause: kind === 'tm' ? 'Подрыв ТМ-62М' : 'Подрыв на мине рядом' });
          if (res && res.died) died = true;
          else if (res && s.active) flashHurt(1);
        }
      }
      blastEvent(pos, victim, died);
    }

    /* Проверка мин для всех живых бойцов у периметра. */
    function minesStep(dt) {
      for (let k = MZ.q.length - 1; k >= 0; k--) {
        const e = MZ.q[k];
        e.t -= dt;
        if (e.t <= 0) { MZ.q.splice(k, 1); e.fn(); }
      }
      if (!MF) return;
      const a = active();
      for (let i = 0; i < squad.length; i++) {
        const s = squad[i];
        if (s.dead || !s.dmg) { s.mfPrev = null; continue; }
        const p = s.ctrl.pos;
        const out = MF.outside(p.x, p.z);
        if (out < -0.6) { s.mfPrev = null; continue; }
        /* растяжка: отрезок шага пересёк живую проволоку */
        const q = s.mfPrev;
        if (q) {
          const d2 = (p.x - q.x) * (p.x - q.x) + (p.z - q.z) * (p.z - q.z);
          const h = d2 > 1e-8 && d2 < 4 ? MF.crossWire(q.x, q.z, p.x, p.z) : null;
          q.x = p.x; q.z = p.z;
          if (h && h.w.mine && h.w.mine.alive) { detonate(h.w.mine, s, null); continue; }
        } else s.mfPrev = { x: p.x, z: p.z };
        /* нажимные: подошва на колпаке */
        for (const side of ['R', 'L']) {
          const m = footOnMine(s, side);
          if (m) { detonate(m, s, side); break; }
        }
      }
    }

    /* Ранение управляемого бойца: красная кромка по краям кадра. */
    const hurtEl = document.getElementById('dmg');
    let hurtA = 0;
    function flashHurt(k) { hurtA = Math.max(hurtA, clamp(k, 0, 1)); }

    /* ------------------------------------------------- возрождение ---- */
    /* Через 5 с после гибели боец снова в строю на своём месте: раны,
       рэгдолл и поведение сброшены, магазин полный. Кровь и воронки
       остаются там, где всё случилось. */
    function respawn(s) {
      if(C.teams)C.teams.beforeRespawn(s);
      if(C.tactics)C.tactics.reset(s);
      root.GContacts?.drop(root.GPhysics.get(world),s);
      root.GPhysics.get(world).dropPose(s);
      if (F.DMG) F.DMG.revive(s);
      s.ctrl._motorVX=0;s.ctrl._motorVZ=0;
      s.battle=null;s.combatAim=null;s.motion=null;s._posed=false;s._poseAccum=0;
      s.ctrl.aiADS=false;s.ctrl._vaultHands=null;s.ctrl.vault=null;s.ctrl._traversalHeight=undefined;
      s.ctrl.ladder=null;s.ctrl._ladLatch=null;s.ctrl._ladBlock=null;s.ctrl._ladNoGrab=0;
      s.life = null; s.hr = null;
      const sp = s.spawn, c = s.ctrl;
      const gy = c.groundAt ? c.groundAt(sp.x, sp.z) : 0;
      c.pos.set(sp.x, gy, sp.z); c.vel.set(0, 0, 0);
      if (c.moveDir) c.moveDir.set(0, 0);
      c.yaw = sp.yaw; c.lagYaw = sp.yaw; c.pitch = 0; c.lagPitch = 0;
      s.idleYaw = sp.yaw; s.formYaw = sp.yaw; s.turnT = 0; s.wasActive = false;
      c.grounded = true;
      c.crouch = 0; c.crouchWant = false; c.crouchMove = 0; c.lean = 0; c.leanWant = 0;
      c.sprint = 0; c.sprintWant = false; c.ads = 0; c.adsWant = false; c.speed = 0;
      if (c.PHYS) c.stamina = c.PHYS.staminaMax;
      c.exhausted = false;
      c.reload = -1; c.inspect = -1; c.triggerHeld = false; c.semiLatch = false;
      for (const key of ['recoil', 'recoilYaw', 'recoilBack']) if (c[key]) { c[key].x = 0; c[key].v = 0; }
      if (c.kickBack) { c.kickBack.p = 0; c.kickBack.y = 0; }
      c.aiReady = 0; c.aiCrouch = false; c.aimDip = 0;
      s.char.root.position.set(sp.x, gy, sp.z);
      s.char.root.rotation.set(0, sp.yaw, 0);
      s.char.root.visible = true;
      s.mfPrev = { x: sp.x, z: sp.z };
      s.stunT = 0;
      s.thr = null; c.aiWish = null; c.aiSprint = false; c.aiProne = undefined;
      resetInvState(s);
      /* LOD прятал оружие погибшего и запоминал «невидимо»; после возрождения
         это значение возвращалось — бот выходил из базы без автомата */
      s._lodHid = false; s._gunVis = undefined; s._posePos = null; s._needMW = true;
      if (s.active) ARS.onEmbody(s); else npcGun(s);
      /* v26: внешний вид сменили, пока боец лежал, — переодеть при возрождении */
      if (s._lookStale) { try { restyleSoldier(s); } catch (e) { console.warn('restyle', e && e.message); } }
      S.hudDirty = true;
    }

    /* ------------------------------------- гибель управляемого бойца -- */
    /* Камера остаётся в голове: ~1,6 с падение глазами бойца (кадр по
       частицам головы рэгдолла), затем медленно уходит вверх-назад и
       показывает тело (мышь поворачивает облёт). С 4,2 с — затемнение,
       на 5-й секунде боец возрождается в строю и управление возвращается. */
    const DC = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 74, eye: new THREE.Vector3(), q: new THREE.Quaternion(),
      q2: new THREE.Quaternion(), m: new THREE.Matrix4(), up: new THREE.Vector3(), f: new THREE.Vector3(), tgt: new THREE.Vector3(),
      o: new THREE.Vector3(), h: new THREE.Vector3(), top: new THREE.Vector3(), nose: new THREE.Vector3(), c: new THREE.Vector3(), pl: new THREE.Vector3() };
    const deathUI = { box: document.getElementById('death'), cause: document.getElementById('deathCause'), timer: document.getElementById('deathTimer'), fade: document.getElementById('fade') };
    C.onPlayerDeath = (s, zone) => {
      const i = squad.indexOf(s);
      if (i < 0) return;
      ARS.onDeath(s);
      s.active = false;
      s.ctrl.pullTrigger(false);
      s.ctrl.ads = 0;
      if (audio.motion) audio.motion(0);
      S.activeIdx = -1;
      S.mode = 'dead';
      const Z = root.GDamage && root.GDamage.ZONES ? root.GDamage.ZONES[zone] : null;
      const cause = s.deathCause || ('Огнестрельное ранение' + (Z ? ' · ' + Z.name : ''));
      S.death = { i, t: 0, cause, fy0: S.free.yaw, fp0: S.free.pitch, oy: s.ctrl.yaw, fp: true, sec: -1, near0: camera.near };
      DC.pos.copy(camera.position); DC.quat.copy(camera.quaternion); DC.fov = camera.fov;
      document.body.classList.add('dead');
      if (deathUI.cause) deathUI.cause.textContent = cause + ' · ' + s.char.preset.name;
      ui.whoName.textContent = s.char.preset.name;
      ui.whoSide.textContent = 'Погиб';
      hurtA = 0.6;
      /* пуля: шум в ушах и «вата»; подрыв уже оглушил волной */
      if (audio.deafen && !s.deathCause) audio.deafen(0.5);
    };
    function deathCam(dt) {
      const D = S.death, s = squad[D.i], R = s.rd, P = F.DMG ? F.DMG.PI : null, t = D.t;
      /* При падении конечность или оружие иногда проходят вплотную перед
         объективом. Чуть более дальняя near-plane не даёт камере показать
         изнанку полигонов, но оставляет руки и автомат в кадре. */
      if (Math.abs(camera.near - 0.08) > 0.001) { camera.near = 0.08; camera.updateProjectionMatrix(); }
      if (R && P) {
        const p = R.p, g = (n, out) => out.set(p[P[n] * 3], p[P[n] * 3 + 1], p[P[n] * 3 + 2]);
        g('head', DC.h); g('headTop', DC.top); g('nose', DC.nose);
        DC.up.subVectors(DC.top, DC.h).normalize();
        DC.f.subVectors(DC.nose, DC.h);
        DC.f.addScaledVector(DC.up, -DC.f.dot(DC.up)).normalize();
        DC.eye.copy(DC.h).addScaledVector(DC.f, 0.085).addScaledVector(DC.up, 0.03);
        const gy = gAt(DC.eye.x, DC.eye.z);
        if (DC.eye.y < gy + 0.09) DC.eye.y = gy + 0.09;
        DC.m.lookAt(DC.eye, DC.o.copy(DC.eye).add(DC.f), DC.up);
        DC.q.setFromRotationMatrix(DC.m);
        g('chest', DC.c); g('pelvis', DC.pl);
        DC.tgt.copy(DC.c).lerp(DC.pl, 0.35);
      }
      /* облёт над телом: ракурс выбирается один раз, когда камера
         начинает отходить, — тело к этому времени уже упало */
      const u = U.smoothstep(clamp((t - 1.5) / 1.8, 0, 1));
      D.fp = u < 0.35;
      if (D.cy === undefined && t > 1.3) D.cy = clearYaw(DC.tgt, D.oy, 1.8, 2.45);
      const lift = clamp(S.free.pitch - D.fp0, -0.7, 0.7);
      const yaw = (D.cy === undefined ? D.oy : D.cy) + (S.free.yaw - D.fy0) * 0.8 + (t - 1.3) * 0.06;
      const dist = 1.8 - lift * 0.6, hgt = 2.45 - lift * 1.2;
      DC.o.set(DC.tgt.x + Math.sin(yaw) * dist, DC.tgt.y + hgt, DC.tgt.z + Math.cos(yaw) * dist);
      const go = gAt(DC.o.x, DC.o.z);
      if (DC.o.y < go + 0.6) DC.o.y = go + 0.6;
      DC.m.lookAt(DC.o, DC.tgt, _mE.set(0, 1, 0));
      DC.q2.setFromRotationMatrix(DC.m);
      /* глазами бойца — с небольшим запаздыванием: голова не камера */
      const wantPos = _mD.copy(DC.eye).lerp(DC.o, u);
      DC.pos.lerp(wantPos, 1 - Math.exp(-(t < 0.08 ? 60 : 24) * dt));
      DC.quat.slerp(_q0.copy(DC.q).slerp(DC.q2, u), 1 - Math.exp(-(t < 0.08 ? 40 : 11) * dt));
      DC.fov = U.damp(DC.fov, U.lerp(76, 58, u), 6, dt);
      camera.position.copy(DC.pos);
      camera.quaternion.copy(DC.quat);
      if (Math.abs(camera.fov - DC.fov) > 0.01) { camera.fov = DC.fov; camera.updateProjectionMatrix(); }
      camRig.pos.copy(camera.position); camRig.quat.copy(camera.quaternion); camRig.fov = camera.fov;
    }
    const _q0 = new THREE.Quaternion();
    function endDeath() {
      const D = S.death;
      if (D && Number.isFinite(D.near0) && Math.abs(camera.near - D.near0) > 0.001) {
        camera.near = D.near0; camera.updateProjectionMatrix();
      }
      S.death = null;
      document.body.classList.remove('dead');
      renderer.domElement.style.filter = '';
      /* новая жизнь — чистый объектив: грязь/кровь, контузия, красная вспышка */
      hurtA = 0; if (hurtEl) hurtEl.style.opacity = '0';
      if (V8 && V8.reset) try { V8.reset(); } catch (e) { /* */ }
      FB.hold = 0; FB.k = 0;
      if (deathUI.box) deathUI.box.classList.remove('on');
      MZ.fade = 1;
      S.mode = 'free';
      if (C.embodyFn) C.embodyFn(D.i);
    }
    function lifeStep(dt) {
      for (let i = 0; i < squad.length; i++) {
        const s = squad[i];
        if (!s.dead || (S.death && S.death.i === i)) continue;
        /* тело лежит: убитый сразу — CORPSE_T; в агонии — пока не добьют или не истечёт кровью
           (AGONY_T); добитый — ещё CORPSE_T после последнего выстрела */
        const agony = /^(wound|blast|neck|para)$/.test(s.deathKind || '') && !s.finished;
        const lim = s.finished ? (s.finT || 0) + CORPSE_T : agony ? AGONY_T : CORPSE_T;
        if ((s.deadT || 0) >= lim && (!C.teams || C.teams.onDeath(s))) respawn(s);
      }
      const D = S.death;
      if (D) {
        D.t += dt;
        const s = squad[D.i];
        if (!s.dead) endDeath();                    // H — подняли на месте
        else if (D.t >= RESPAWN_T) {
          if (!C.teams || C.teams.onDeath(s)) { respawn(s); endDeath(); }
          else {   // no respawns left: another body, or free camera
            D.i = C.teams.nextBody(s);
            /* v22: игрок переходит в другое тело со СВОИМ снаряжением из оружейной
               (M416 с обвесом и т. д.), а не с автоматом бойца, в которого перешёл */
            const nb = D.i >= 0 ? squad[D.i] : null;
            if (nb && s.L) try { ARS.rebuild(nb, carryLoadout(s)); nb.tmGren = s.tmGren; } catch (e) { console.warn('loadout carry', e && e.message); }
            endDeath();
          }
        }
        else {
          const t = D.t;
          /* шок: кадр выцветает и темнеет, кромка кровит; затем чёрный */
          const sat = 1 - 0.5 * U.smoothstep(clamp(t / 2.2, 0, 1));
          const br = 1 - 0.2 * U.smoothstep(clamp((t - 0.4) / 3, 0, 1));
          renderer.domElement.style.filter = 'saturate(' + sat.toFixed(3) + ') brightness(' + br.toFixed(3) + ')';
          hurtA = Math.max(hurtA - dt * 0.2, 0.32);
          if (deathUI.fade) deathUI.fade.style.opacity = U.smoothstep(clamp((t - 4.2) / 0.8, 0, 1)).toFixed(3);
          if (deathUI.box) deathUI.box.classList.toggle('on', t > 1.1 && t < 4.6);
          const sec = Math.max(1, Math.ceil(RESPAWN_T - t));
          if (sec !== D.sec && deathUI.timer) { D.sec = sec; deathUI.timer.textContent = 'Возрождение через ' + sec + ' с'; }
        }
      }
      if (!S.death && MZ.fade > 0) {
        MZ.fade = Math.max(0, MZ.fade - dt / 0.9);
        if (deathUI.fade) deathUI.fade.style.opacity = MZ.fade.toFixed(3);
      }
      /* красная кромка: вспыхивает при ранении и гаснет за ~1,5 с */
      if (hurtEl) {
        if (!S.death) hurtA = Math.max(0, hurtA - dt * 0.7);
        hurtEl.style.opacity = hurtA.toFixed(3);
      }
    }
    /* вуаль облака подрыва (BLAST.veil): цвет пыли под освещением, sRGB */
    const veilEl = document.getElementById('veil');
    let veilA = -1;
    function updateVeil() {
      if (!veilEl) return;
      const V = F.BLAST && F.BLAST.veil;
      const a = V && !S.spectate ? clamp(V.a, 0, 0.97) : 0;
      if (Math.abs(a - veilA) < 0.004) return;
      veilA = a;
      veilEl.style.opacity = a.toFixed(3);
      if (a > 0) {
        /* столб бьёт снизу: у земли муть плотнее и темнее */
        const c = (x, k) => Math.round(255 * Math.pow(clamp(x * k, 0, 1), 1 / 2.2));
        const lo = c(V.r, 1.15) + ',' + c(V.g, 1.15) + ',' + c(V.b, 1.15), hi = c(V.r, 1.7) + ',' + c(V.g, 1.7) + ',' + c(V.b, 1.7);
        veilEl.style.background = 'linear-gradient(to top,rgba(' + lo + ',1) 0%,rgba(' + lo + ',.96) 35%,rgba(' + hi + ',.72) 100%)';
      }
    }
    /* облёт над телом: ракурс, с которого тело не закрыто стволами */
    /* лучи от тела к камере — по стволам, валежнику, камням, постройкам
       (трава и папоротник не в счёт): центр и два боковых */
    const _cyR = new THREE.Raycaster(), _cyO = new THREE.Vector3(), _cyF = new THREE.Vector3(), _cyD = new THREE.Vector3();
    function clearYaw(tgt, base, dist, hgt) {
      const objs = [];
      for (const key of ['forest', 'deadwood', 'rocks', 'props', 'house', 'range', 'garden']) if (world[key]) objs.push(world[key]);
      for (let k = 0; k < 16; k++) {
        const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
        _cyO.set(tgt.x + Math.sin(a) * dist, tgt.y + hgt, tgt.z + Math.cos(a) * dist);
        let ok = true;
        for (const off of [0, 0.4, -0.4]) {
          _cyF.set(tgt.x + Math.cos(a) * off, tgt.y + 0.25, tgt.z - Math.sin(a) * off);
          _cyD.subVectors(_cyO, _cyF);
          const L = _cyD.length();
          _cyD.divideScalar(L);
          _cyR.set(_cyF, _cyD); _cyR.near = 0; _cyR.far = L + 0.35;
          if (_cyR.intersectObjects(objs, true).length) { ok = false; break; }
        }
        if (ok) return a;
      }
      return base;
    }
    /* встряска камеры вне бодикама (свободная, со стороны, гибель) */
    function shakeCam(dt) {
      if (MZ.shk < 0.003) { MZ.shk = 0; return; }
      const k = MZ.shk, t = S.time;
      MZ.shk *= Math.exp(-dt * 4.5);
      if (S.spectate) return;
      const n = (f, p) => Math.sin(t * f + p) * 0.6 + Math.sin(t * f * 2.13 + p * 1.7) * 0.4;
      camera.rotateX(n(41, 0.3) * 0.022 * k);
      camera.rotateY(n(37, 1.9) * 0.016 * k);
      camera.rotateZ(n(29, 4.1) * 0.03 * k);
      camera.position.y += n(53, 2.7) * 0.02 * k;
    }

    /* ------------------------------------------------------- кадр ----- */
    /* Шаг симуляции вынесен из кадра: он детерминирован и не зависит от
       того, как быстро рисует видеокарта. Благодаря этому автотесты гоняют
       логику фиксированными шагами, а не «ждут» реальные кадры. */
    C.stepFn = (d) => step(d);
    /* v8: погода и состояние ствола у всех бойцов, эффекты кадра */
    function v8Frame(dt, t, a) {
      const P = C.WX.P || {}, rain = P.rain || 0, key = C.WX.key;
      const fp = fpNow(), tp = !!(a && S.tp && !S.spectate);
      const dark = !!(C.WX.gw && C.WX.gw.flash > 0.5);
      for (const s of squad) {
        const c = s.ctrl;
        if (!c || !c.vr) continue;
        if (c.vr._wx !== key && c.vr.setWeather) { c.vr.setWeather(key, rain, 1 + 7 * (P.wind || 0.3)); c.vr._wx = key; }
        c.wet = rain;
        c.hardcore = !!(S.hardcore && s === a && !S.spectate);
        const me = s === a && !S.spectate;
        V8.heat(s, dt, { rain, me, t, dark });
        V8.breath(s, dt, { weather: key, me, fp });
      }
      V8.mirage(a, { fp, rain, zoom: (BC && BC.sight && BC.sight.scope) ? 74 / Math.max(1, camera.fov || 74) : 1 });
      const GGc = root.GGloom;
      V8.ambient(dt, { rain, me: !!a && !S.spectate, helmet: !!a, canopy: GGc && a ? GGc.canopyAt(a.ctrl.pos.x, a.ctrl.pos.z) : 0,
        pos: a ? a.ctrl.pos : null, speed: a ? a.ctrl.speed : 0 });
      V8.frame(dt, { fp, tp, rain });
      const Zn = C.WX.zones;
      if (Zn) {
        const bodies = [];
        for (const s of squad) if (!s.dead && s.ctrl) bodies.push(s.ctrl.pos);
        Zn.update(dt, t, { wind: P.wind || 0.3, rain, scars: F.SCARS, bodies });
      }
    }
    /* чистый перенос поддерева: матрицы не пересобираются, только сдвиг */
    /* v20: боец снова в кадре (из-за угла / поворот камеры) — скелет сразу
       переезжает к капсуле; поза обновится в следующем кадре */
    function revealShift(s) {
      const pp = s._posePos, cp = s.ctrl.pos;
      if (!pp || s.rd || s.dead) return;
      const dx = cp.x - pp.x, dy = cp.y - pp.y, dz = cp.z - pp.z, q = dx * dx + dy * dy + dz * dz;
      if (q > 1e-10 && q < 16) {
        const r = s.char.root; r.position.x += dx; r.position.y += dy; r.position.z += dz;
        const me = r.matrix.elements; me[12] += dx; me[13] += dy; me[14] += dz; shiftTree(r, dx, dy, dz);
        if (s.gun && s.gun.root) { s.gun.root.position.x += dx; s.gun.root.position.y += dy; s.gun.root.position.z += dz; s.gun.root.updateMatrixWorld(true); }
      }
      pp.copy(cp);
    }
    /* v21: URO с интерполяцией (как Update Rate Optimization в UE). Раньше между
       редкими позами дальнего бойца (бюджет анимации на слабом ПК: 30…10 Гц) суставы
       замирали, а тело ехало за капсулой — на бегу ноги «застывали» и потом
       перескакивали: бот будто скакал. Теперь бегущий боец показывает плавное
       смешение двух последних рассчитанных поз (отставание — один интервал,
       0,03–0,1 с), опорная стопа при этом стоит на месте. Стоит дёшево: ~70 slerp
       и пересчёт матриц против полной позы с IK и запросами к физике. */
    const URO = { on: !(root.AEGIS_SETTINGS && root.AEGIS_SETTINGS.uro === false), q: new THREE.Quaternion(), m: new THREE.Matrix4(), m2: new THREE.Matrix4(), p: new THREE.Vector3(), s: new THREE.Vector3(), n: 0 };
    function uroSnap(s) {
      const bones = s.char.bones, n = bones.length;
      let u = s._uro;
      if (!u || u.n !== n) u = s._uro = { n, a: new Float32Array(n * 7), b: new Float32Array(n * 7), ga: new Float32Array(10), gb: new Float32Array(10), ok: 0, gun: null };
      let t = u.a; u.a = u.b; u.b = t; t = u.ga; u.ga = u.gb; u.gb = t;
      const B = u.b;
      for (let i = 0; i < n; i++) {
        const o = bones[i], q = o.quaternion, p = o.position, k = i * 7;
        B[k] = q.x; B[k + 1] = q.y; B[k + 2] = q.z; B[k + 3] = q.w; B[k + 4] = p.x; B[k + 5] = p.y; B[k + 6] = p.z;
      }
      const g = s.gun && s.gun.root;
      if (g && g.parent) {
        URO.m.copy(s.char.root.matrixWorld).invert().multiply(g.matrixWorld).decompose(URO.p, URO.q, URO.s);
        const G = u.gb; G[0] = URO.p.x; G[1] = URO.p.y; G[2] = URO.p.z; G[3] = URO.q.x; G[4] = URO.q.y; G[5] = URO.q.z; G[6] = URO.q.w; G[7] = URO.s.x; G[8] = URO.s.y; G[9] = URO.s.z;
      }
      if (u.gun !== g) u.ok = 0;
      u.gun = g;
      u.ok = Math.min(2, u.ok + 1);
      if (u.ok < 2) { u.a.set(u.b); u.ga.set(u.gb); }
    }
    function uroApply(s, k) {
      const u = s._uro; if (!u || u.ok < 2) return;
      const bones = s.char.bones, A = u.a, B = u.b, q = URO.q, k1 = 1 - k;
      for (let i = 0; i < u.n; i++) {
        const o = bones[i], j = i * 7;
        THREE.Quaternion.slerpFlat(o.quaternion._tmp || (o.quaternion._tmp = [0, 0, 0, 1]), 0, A, j, B, j, k);
        const r = o.quaternion._tmp; o.quaternion.set(r[0], r[1], r[2], r[3]);
        o.position.set(A[j + 4] * k1 + B[j + 4] * k, A[j + 5] * k1 + B[j + 5] * k, A[j + 6] * k1 + B[j + 6] * k);
      }
      const R = s.char.root; R.updateMatrixWorld(true);
      const g = s.gun && s.gun.root;
      if (g && g === u.gun && g.parent) {
        const GA = u.ga, GB = u.gb, tq = URO._gq || (URO._gq = [0, 0, 0, 1]);
        THREE.Quaternion.slerpFlat(tq, 0, GA, 3, GB, 3, k);
        URO.p.set(GA[0] * k1 + GB[0] * k, GA[1] * k1 + GB[1] * k, GA[2] * k1 + GB[2] * k);
        URO.s.set(GA[7] * k1 + GB[7] * k, GA[8] * k1 + GB[8] * k, GA[9] * k1 + GB[9] * k);
        q.set(tq[0], tq[1], tq[2], tq[3]);
        URO.m.compose(URO.p, q, URO.s).premultiply(R.matrixWorld);
        if (g.parent.matrixWorld) URO.m2.copy(g.parent.matrixWorld).invert(); else URO.m2.identity();
        URO.m.premultiply(URO.m2).decompose(g.position, g.quaternion, g.scale);
        g.matrix.compose(g.position, g.quaternion, g.scale);
        g.updateMatrixWorld(true);
      }
      URO.n++;
    }
    function shiftTree(o, dx, dy, dz) {
      const e = o.matrixWorld.elements; e[12] += dx; e[13] += dy; e[14] += dz;
      if (o.isSkinnedMesh && o.bindMode === 'attached') o.bindMatrixInverse.copy(o.matrixWorld).invert();
      const ch = o.children; for (let i = 0; i < ch.length; i++) shiftTree(ch[i], dx, dy, dz);
    }
    function step(dt) {
      const perfStart = performance.now();
      if (dt > 0.05) dt = 0.05;
      if (dt <= 0) dt = 1 / 120;
      S.time += dt;
      const t = S.time;
      if(world.update)world.update(dt,t);
      if(root.GPhysics){const physics=root.GPhysics.get(world);for(const soldier of squad)soldier.ctrl._physicsWorld=world;physics.begin(dt);}
      for (const soldier of squad) root.GStumble?.update(soldier,dt,F.DMG);
      const perfThink = performance.now();

      const locked = S.inputOn && !S.paused;
      const a = active();
      if(!C.tactics&&root.GTactics&&MED&&F.DMG){C.tactics=root.GTactics.create({squad,world,med:MED,THREE,PI:F.DMG.PI,
        speech:()=>C.SET.calloutSpeech!==false,
        speak:(s,text,kind)=>{/* v25: голос выбирает реплику и возвращает её текст для субтитра (31c_voice.js) */if(root.GVoice&&root.GVoice.line&&audio.on&&!S.paused)return root.GVoice.line(s,kind);return null;},
        caption:(s,text,time)=>{C.caption={text:(s.gen?s.gen.last:s.key)+': '+text,until:time+4};},
        occluded:(from,to)=>!C.worldVisible(from,to)
      });}
      if(C.tactics)C.tactics.think(t,a);
      if(world.mapId && !C.combat && root.GCombat)C.combat=root.GCombat.create({THREE,world,squad,visible:(from,to,ns)=>C.worldVisible(from,to,ns)});

      if(C.combat)C.combat.update(t,a);
      if(!C.teams&&world.mapId&&root.GTeams&&C.combat)C.teams=root.GTeams.init({THREE,scene,world,squad,camera,audio,F,S,GSIM:C.GSIM,active,visible:(from,to,ns)=>C.worldVisible(from,to,ns),
        occluded:C.SET.occlusion===false?null:(from,to)=>C.occludedRay(from,to),animBudget:C.SET.animBudget,insideStatic:(p)=>root.GPhysics.get(world).pointBlocked(p,.06),reveal:(s)=>revealShift(s),sunDir:C.sunDir});
      if(C.teams)C.teams.update(dt,t,a);
      /* v22: голосовые доклады бойцов (js/polygon/31c_voice.js) */
      if(root.GVoice){if(!C.voiceOn){C.voiceOn=1;root.GVoice.init({squad,active,camera,S,audio,spatial:(p)=>F.spatialFrom(p),set:()=>C.SET,caption:(s,text)=>{const P=s.char&&s.char.preset,m=/_(\d+)$/.exec(s.key||''),nm=s.npc&&m?(s.team==='delta'?'Дельта-':'Альфа-')+(+m[1]+1):(P&&P.name?P.name:s.key);C.caption={text:nm+': '+text,until:S.time+3.2};}});}root.GVoice.update(dt);}
      /* v21: сектор большой карты — запретная зона за красной линией (10 с на возвращение) */
      if(root.GSectors&&world.sector)root.GSectors.update(dt,t,a,(s,cause)=>{if(F.DMG&&F.DMG.kill&&!S.death)F.DMG.kill(s,cause);});
      root.GPerf?.record('tactics',performance.now()-perfThink);
      const perfMove=performance.now();
      /* 1. ввод и физика */
      /* v26: окно (обыск, инвентарь) открыто — боец остаётся под управлением игрока и просто стоит.
         Раньше он считался «неуправляемым» (active=false), и его вёл старый P.aiWish — боец сам шёл
         к телу или в строй, пока игрок перекладывал патроны */
      if (a) {
        const hold = !locked && S.mode === 'embodied' && !S.paused;
        if (hold) { a.ctrl.aiWish = null; a.ctrl.aiSprint = false; }
        const inp = locked ? Object.assign({}, input, { ads: input.ads })
          : hold ? Object.assign({}, input, { fwd: 0, back: 0, left: 0, right: 0, sprint: false, sneak: false, ads: false, leanL: false, leanR: false, jump: 0, crouch: (a.ctrl.crouch || 0) > 0.5 && !a.ctrl.proneWant }) : {};
        a.ctrl.update(dt, inp, locked || hold, t);
      }
      else if (locked && !S.death) updateFree(dt);
      arsenalStep(dt);
      cookStep();

      /* неактивные бойцы стоят на месте, но дышат */
      const lifeEnv = lifeFrame(dt, t);
      for (let i = 0; i < squad.length; i++) {
        const s = squad[i];
        if (i === S.activeIdx) { s.wasActive = true; continue; }
        if (s.dead) continue;
        const c = s.ctrl, k = s.idleSeed;
        /* Микродвижение в строю: боец переминается, чуть водит стволом и
           поворачивает голову. Без этого четыре манекена выглядят мёртвыми. */
        const swayYaw = Math.sin(t * 0.21 + k) * 0.045 + Math.sin(t * 0.07 + k * 2) * 0.03;
        const swayPitch = Math.sin(t * 0.17 + k * 1.7) * 0.05 - 0.04;
        /* Покачивание идёт вокруг курса, с которым бойца ОТПУСТИЛИ. Раньше
           yaw присваивался от курса спавна: отпущенный боец за один кадр
           разворачивался до 180°, а оружие, догоняющее взгляд с инерцией,
           на это время выносило вбок, мимо рук. Выход ловится по факту
           смены активного бойца — так покрыты и F, и смена бойца, и view. */
        if (s.wasActive) { s._posed=false;s._poseAccum=0; s.idleYaw = c.yaw - swayYaw; s.formYaw = s.idleYaw; s.wasActive = false; s.thr = null; c.aiWish = null; c.aiSprint = false; c.aiProne = undefined; }
        c.breathT += dt * 0.85;
        /* Взгляд возвращается к позе покоя плавно, а не скачком. */
        const TH = npcThreat(s, dt, t);
        if(C.tactics)C.tactics.drive(s,dt,t,a);
        if(C.combat)C.combat.drive(s,dt,t,a);
        const oldYaw=c.yaw;
        root.GAnimator.turnController(c,s.idleYaw + (TH.fast || s.combatAim ? 0 : swayYaw),dt,!!(TH.fast||s.combatAim));
        // Steering was computed in the OLD local frame. Preserve its world
        // direction when facing turns, otherwise every turn also kicks velocity.
        if(c.aiWish){const x=c.aiWish.x,y=c.aiWish.y,d=c.yaw-oldYaw,cs=Math.cos(d),sn=Math.sin(d);
          c.aiWish.set(x*cs-y*sn,x*sn+y*cs);}
        c.pitch = U.damp(c.pitch, s.combatAim ? s.combatAim.pitch : swayPitch, s.combatAim?8:3, dt);
        c.update(dt, {}, false, t);
        if(!s.combatAim && !C.combat)npcLife(s, i, dt, lifeEnv);
        if(C.tactics)C.tactics.drive(s,0,t,a);
      }
      if (C.lifeEvents) C.lifeEvents.length = 0;
      if (MED) MED.update(dt, squad, a);

      root.GPerf?.record('controllers',performance.now()-perfMove);
      const perfPose=performance.now();
      let fpRig = false;
      /* 2-4. поза, оружие, руки */
      for (let i = 0; i < squad.length; i++) {
        const s = squad[i];
        const isActive = i === S.activeIdx;
        /* убитый — рэгдолл; поза и оружие берутся из симуляции */
        if (s.dead && F.DMG) { F.DMG.ragdoll(s, dt); s.char.root.visible = true; continue; }
        if (s._balance && (s._balance.down || s._balance.recovering)) {
          if (s._balance.down) F.DMG.ragdoll(s,dt);
          else {
            const pose=F.poseSoldier(s,dt,isActive,t);
            if(s.gun){s.rig.poseDt=dt;F.placeWeapon(s,dt,false,camera.position,camera.quaternion,pose);reachFix(s,dt);gunClear(s,dt);npcHands(s);s.rig.solveArms(s.gun.gun);}
            else s.rig.relaxArms(0,0);
            root.GStumble.recoveryPose(s);
          }
          s.char.root.visible=true;
          if(isActive&&!S.spectate){
            const focus=s.char.bone('hips').getWorldPosition(new THREE.Vector3());
            const offset=new THREE.Vector3(2,1.1,2.4).applyAxisAngle(new THREE.Vector3(0,1,0),s.ctrl.yaw);
            const distance=offset.length(),dir=offset.clone().normalize(),
              obstruction=root.GPhysics.get(world).ray(focus,dir,distance);
            if(obstruction)offset.setLength(Math.max(.35,obstruction.timeOfImpact-.2));
            camera.position.lerp(focus.clone().add(offset),1-Math.exp(-dt*6));
            camera.lookAt(focus);camera.fov=74;camera.updateProjectionMatrix();
            if(BC){BC.hide();BC.sight.ads=0;BC.sight.k=0;}
          }
          continue;
        }
        /* Idle-only animation LOD: controls/medical/physics still run each step.
           Weapon and both hands are updated together, never separately. */
        s._poseAccum=(s._poseAccum||0)+dt;
        const idleLOD=s._poseGun===s.gun&&!isActive&&!s.hr&&!s._tacHands&&!s.ctrl.treating&&!s.ctrl.dragging&&!s.ctrl.vault&&!root.GContacts?.has(s)&&s.ctrl.reload<0&&(s.ctrl.speed||0)<.12&&!(s.thr&&s.thr.mode)&&(!s.tac||s.tac.mode==='idle')&&!(s.tac&&t<s.tac.until);
        const poseInterval=s._lodHid ? .2 : 0;
        if(idleLOD&&poseInterval&&s._posed&&s._poseAccum<poseInterval)continue;
        /* v20: скрытые — редкая поза, как в v19 (_lodI); видимые дальние —
           реже только под нагрузкой, когда бюджет анимации в teams.lod
           включил полосы частоты (_lodR); фазы разнесены, чтобы позы не
           собирались в один кадр */
        const lodI=!isActive&&!S.spectate&&(s._lodHid?s._lodI:s._lodR)||0;
        if(lodI&&s._lodPh===undefined){s._lodPh=1;s._poseAccum=Math.random()*lodI;}
        const uroUse=URO.on&&lodI>0&&!s._lodHid&&!s.dead&&!s.rd&&s.char.root.visible&&((s.ctrl.speed||0)>.35||(s.motion&&s.motion.moveBlend>.2));
        if(!uroUse&&s._uro)s._uro.ok=0;
        s._uroMode=null;
        if(lodI&&s._posed&&s._poseAccum<lodI){
          if(uroUse){s._uroMode='lerp';s._uroI=lodI;}
          /* между редкими позами дальний боец всё равно едет за контроллером —
             иначе на 30 Гц бег «дёргается» шагами по 10–15 см */
          const pp=s._posePos, cp=s.ctrl.pos;
          if(pp&&s.char.root.visible&&(cp.x!==pp.x||cp.y!==pp.y||cp.z!==pp.z)){
            const dx=cp.x-pp.x,dy=cp.y-pp.y,dz=cp.z-pp.z;
            if(dx*dx+dy*dy+dz*dz<1){const r=s.char.root;r.position.x+=dx;r.position.y+=dy;r.position.z+=dz;
              const me=r.matrix.elements;me[12]+=dx;me[13]+=dy;me[14]+=dz;shiftTree(r,dx,dy,dz);
              if(s.gun&&s.gun.root){const gr=s.gun.root,ge=gr.matrix.elements;gr.position.x+=dx;gr.position.y+=dy;gr.position.z+=dz;ge[12]+=dx;ge[13]+=dy;ge[14]+=dz;shiftTree(gr,dx,dy,dz);}}
            pp.copy(cp);
          }
          continue;
        }
        const poseDt=lodI?Math.min(.2,s._poseAccum):idleLOD?Math.min(.075,s._poseAccum):dt;s._poseAccum=0;s._posed=true;s._poseGun=s.gun;
        s.rig.poseDt=poseDt;
        const pose = F.poseSoldier(s, poseDt, isActive, t);
        /* v23: ноги выведены из строя — из рэгдолла плавно в позу «на спине» */
        if (s._balance && s._balance.settle) root.GStumble.settlePose(s, poseDt);
        if(uroUse){s._uroMode='snap';s._uroI=lodI;}
        /* v20: аниматор уже закончил полным пересчётом матриц — второй не нужен */
        if (!(s.motion && s.motion.mwFresh)) s.char.root.updateMatrixWorld(true);
        if (s.motion) s.motion.mwFresh = false;
        if(s._posePos)s._posePos.copy(s.ctrl.pos);else s._posePos=s.ctrl.pos.clone();
        s._needMW=true;
        if (!isActive && s.life && GLIFE) GLIFE.aimEyes(s.life, s, dt, t);
        const mode = bodycamMode(i);
        /* от первого лица тело скрыто: видны руки рига и оружие */
        s.char.root.visible = mode !== 'fp';
        if (mode) {
          if (s._shK || s._shB) F.shoulderReset(s);
          s.ctrl.ready = U.damp(s.ctrl.ready === undefined ? 1 : s.ctrl.ready, 1, 6, dt);
          if(s.ctrl.vault&&!s.ctrl.vault.handsOff){s.rig.relaxArms(0,0);root.GAnimator.solveTraversalHands(s);}
          BC.update(dt, s, mode);
          /* v21: за пулемётом руки рига не нужны — вид наводчика ставит GMG.cameraPose */
          if (mode === 'fp' && root.GMG && root.GMG.isMounted(s)) BC.hide();
          else if (mode === 'fp') fpRig = true;
          if (mode === 'tp') {
            const H = BC.handTargets({});
            s.rig.handTargets = { R: H.R, L: H.L };
            s.rig.handPoses = { R: H.poseR, L: H.poseL };
          }
        } else if (s.gun) {
          if(!s.ctrl.vault)root.GContacts?.update(s,poseDt,s.ctrl.pos.distanceTo(camera.position)<18);
          F.placeWeapon(s, poseDt, isActive, camera.position, camera.quaternion, pose);
          /* v25: оружие уходит на плечо — поправки хвата и упора ствола не нужны */
          if (!(s._shB > 0)) { reachFix(s, poseDt); gunClear(s, poseDt); gunObst(s, poseDt); }
          npcHands(s);
          coverEyes(s);
        }
        if (mode === 'fp') { root.GContacts?.drop(root.GPhysics.get(world),s); continue; }
        if (!s.gun && mode !== 'tp') {
          if(s._tacHands){root.GAnimator.solveHands(s);root.GContacts?.drop(root.GPhysics.get(world),s);continue;}
          /* без оружия — руки по швам, покачиваются в такт шагу */
          s.rig.handTargets = null;
          const c = s.ctrl, sp = Math.min(1.5, (s.motion?.speed ?? c.speed ?? 0) / 2.5);
          s._armSwing=U.damp(s._armSwing||0,Math.sin((s.motion?.phase ?? c.stepPhase ?? 0)*Math.PI*2)*sp,18,poseDt);
          s.rig.relaxArms(s._armSwing, Math.sin(t * 0.9 + s.idleSeed) * 0.02, s.motion?.run ?? root.GAnimator.runK(c), s.motion);
          root.GAnimator.solveTraversalHands(s);
          root.GStumble?.arms(s);
          root.GContacts?.update(s,poseDt,s.ctrl.pos.distanceTo(camera.position)<18);
          root.GAnimator.solveTraversalHands(s);
          root.GMocap12?.hands(s);
          if(root.GActionMotion?.hands(s))s.rig.solveArms(null);
          continue;
        }
        if(s.ctrl.vault&&!s.ctrl.vault.handsOff){
          s.rig.handTargets=null;s.rig.relaxArms(0,0);
          root.GAnimator.solveTraversalHands(s);root.GContacts?.update(s,poseDt);
          root.GAnimator.solveTraversalHands(s);continue;
        }
        /* руки подводятся к уже размещённому оружию */
        s.rig.poseDt=poseDt;
        s.rig.triggerCurl = triggerCurlFor(s);
        s.rig.adsAmount = s.ctrl.ads;
        s.rig.readyAmount = U.smoothstep(s.ctrl.ready === undefined ? 1 : s.ctrl.ready);
        s.rig.fingerEvery = isActive ? 1 : 3;
        root.GActionMotion?.hands(s);
        /* v25: «автомат на ремень» — руки с оружия на ремень/по шву */
        const shH = s.gun ? Math.max(s._shHR || 0, s._shHL || 0) : 0;
        if (shH > 0.001) F.shoulderArmsBegin(s);
        if (shH < 0.999) s.rig.solveArms(s.gun ? s.gun.gun : null);
        if (shH > 0.001) F.shoulderArmsEnd(s, shH >= 0.999, poseDt, t);
        else if (s.gun && s.gun._strap && s.gun._strap.visible) s.gun._strap.visible = false;
        if(s._tacHands)root.GAnimator.solveHands(s);
        root.GAnimator.solveTraversalHands(s);
        if(s.ctrl.vault)root.GContacts?.update(s,poseDt);
        root.GAnimator.solveTraversalHands(s);
      }
      /* v21: URO — снимок свежей позы и показ смешения (после рук и оружия) */
      if (URO.on) for (let i = 0; i < squad.length; i++) {
        const s = squad[i], m = s._uroMode; if (!m) continue;
        s._uroMode = null;
        if (m === 'snap') { uroSnap(s); uroApply(s, 0); }
        else uroApply(s, Math.min(1, (s._poseAccum || 0) / Math.max(1e-3, s._uroI || .05)));
      }
      if (C.updateTac) C.updateTac();
      /* Руки бодикамеры обновляются только внутри BC.update(); когда камера
         ни к кому не привязана (свободный обзор, боец убит/отпущен), риг
         оставался видимым в последней позе и «висел» в воздухе. */
      if (BC && !fpRig) BC.hide();

      /* мины под ногами и на растяжках; возрождение; экран гибели */
      minesStep(dt);
      lifeStep(dt);

      /* 5. камера */
      updateCamera(dt);
      /* v21: вид наводчика M2HB — глаз за целиком, линия прицела в центре кадра */
      if (a && !S.tp && !S.spectate && !S.death && root.GMG && root.GMG.isMounted(a)) root.GMG.cameraPose(camera, THREE, dt);
      shakeCam(dt);
      if (BC && !(a && !S.tp && !S.spectate)) BC.resetNear();
      /* линза бодикама — только от первого лица */
      const post = C.getPost && C.getPost();
      /* включается плавно, выключается сразу — иначе при переходе на вид
         со стороны кадр смазывается «хвостом» линзы */
      const lensOn = !!(a && BC && !a.ctrl._balanceBusy && !S.tp && !S.spectate);
      lensAmt = lensOn ? U.damp(lensAmt, 1, 10, dt) : 0;
      if (post && post.lens) {
        const lu = post.lens.uniforms;
        /* v10: линза — ещё и финальный апскейл/резкость, поэтому включена всегда */
        post.lens.enabled = true;
        lu.uAmt.value = lensAmt;
        /* капли на стекле: под дождём, под пологом их меньше (крона держит воду) */
        { const rk = (C.WX.P && C.WX.P.rain) || 0, GGc = root.GGloom; const cn = GGc ? GGc.canopyAt(camera.position.x, camera.position.z) : 0;
          lu.uRainL.value = U.damp(lu.uRainL.value, rk * (1 - 0.45 * cn), 0.4, dt); }
        lu.uTime.value = t;
        if (lensAmt > 0.005) lu.uShift.value.copy(BC.measureShift()); else lu.uShift.value.set(0, 0);
        /* v9: параметры линзы по прицеливанию (см. 21_game_bodycam: P.zoomRef) —
           в прицеле кадр почти без искажений, без смаза и «желе» */
        if (BC) { const sg = BC.sight, ad = sg.ads || 0;
          lu.uZoom.value = sg.lensZ || 1; lu.uDist.value = sg.lensD || 0; lu.uCA.value = sg.lensCA || 0;
          lu.uRS.value = BC.P.rollingShutter * (1 - 0.8 * ad); lu.uMB.value = BC.P.motionBlur * (1 - 0.7 * ad);
          lu.uGrain.value = BC.P.grainV9 * (1 - 0.3 * ad); }
      }
      /* v9: зерно — одно на кадр: при линзе бодикама грейд своё не кладёт */
      const eff=C.SET.effects||{};
      if(post&&post.lens){const lu=post.lens.uniforms;if(eff.distortion===false){lu.uDist.value=0;lu.uRS.value=0;}if(eff.chroma===false)lu.uCA.value=0;if(eff.blur===false)lu.uMB.value=0;if(eff.grain===false)lu.uGrain.value=0;lu.uVig.value=eff.vignette===false?0:(BC?BC.P.vignette:1);if(eff.dirt===false)lu.uRainL.value=0;}
      if(post&&post.grade){const gu=post.grade.uniforms;gu.uGrain.value=eff.grain===false?0:(post.grainBase||0)*.45*(1-lensAmt);if(eff.dirt===false&&gu.uMud)gu.uMud.value=0;if(eff.concussion===false&&gu.uConc)gu.uConc.value=0;}
      /* v26: ПНВ (AN/PVS-14 за коллиматором): монохромная зелёная картинка прямо в грейде — без лишнего прохода */
      if (post && post.grade) {
        const gu = post.grade.uniforms, nvOn = !!(BC && BC.sight && BC.sight.scope && BC.sight.sight && BC.sight.sight.nv);
        if (nvOn) {
          if (!S.nvSave) S.nvSave = { sat: gu.uSat.value, lift: gu.uLift.value, con: gu.uContrast.value, sh: gu.uShadowTint.value.toArray(), hi: gu.uHighTint.value.toArray() };
          gu.uSat.value = 0; gu.uLift.value = 0.07; gu.uContrast.value = 1.18;
          gu.uShadowTint.value.set(0.22, 1.0, 0.32); gu.uHighTint.value.set(0.72, 1.32, 0.62);
          gu.uGrain.value = Math.max(gu.uGrain.value, 0.1);
        } else if (S.nvSave) {
          const v = S.nvSave; S.nvSave = null;
          gu.uSat.value = v.sat; gu.uLift.value = v.lift; gu.uContrast.value = v.con; gu.uShadowTint.value.fromArray(v.sh); gu.uHighTint.value.fromArray(v.hi);
        }
      }

      if(!C.captionHUD){const h=document.createElement('div');h.style.cssText='position:fixed;bottom:105px;left:50%;transform:translateX(-50%);font:14px Arial;color:white;text-shadow:0 1px 3px black;pointer-events:none';document.body.appendChild(h);C.captionHUD=h;}
      /* v20: текст HUD меняем только при изменении — запись того же textContent
         каждый кадр пересобирала узел и запускала перерасчёт раскладки */
      const setTxt=(el,v)=>{if(el._v!==v){el._v=v;el.textContent=v;}};
      setTxt(C.captionHUD,C.caption&&t<C.caption.until?C.caption.text:'');
      if(!C.balanceHUD){const h=document.createElement('div');h.style.cssText='position:fixed;bottom:145px;left:50%;transform:translateX(-50%);font:13px Arial;color:#ead9b3;text-shadow:0 1px 3px black;pointer-events:none';document.body.appendChild(h);C.balanceHUD=h;}
      const balanceState=a&&a._balance;
      setTxt(C.balanceHUD,balanceState?(balanceState.down?(balanceState.blocked?'Нет места для подъёма':'Падение · восстановление опоры'):balanceState.recovering?'Подъём':balanceState.state!=='stable'?'Потеря равновесия':''):'');
      if(!C.zeroHUD){const h=document.createElement('div');h.style.cssText='position:fixed;bottom:125px;right:24px;color:#ddd;font:12px monospace;pointer-events:none;white-space:pre-line';document.body.appendChild(h);C.zeroHUD=h;}
      if(a&&a.gun&&((a.ctrl.ads||0)>.5||S.time<(C.zeroHudUntil||0))){const b=C.ballisticsInfo(a);setTxt(C.zeroHUD,'Ноль '+b.zero+' м · '+b.ammo+'\n'+b.holds.filter(h=>h&&h.R!==b.zero).map(h=>h.R+' м: '+h.mrad.toFixed(1)+' mil').join(' · '));}else setTxt(C.zeroHUD,'');
      updateSelfVisibility();
      if(C.teams)C.teams.lod();
      if(root.GLod)root.GLod.frame(camera,renderer.domElement.height||720,squad,(s)=>s.active&&!S.spectate);
      updateSun();

      /* 6. мир и эффекты */
      if (F.DMG) F.DMG.update(dt);
      if (F.voxUpdate) F.voxUpdate();
      const flagStart=performance.now();
      if (F.FLAGS) F.FLAGS.update(dt, camera);
      root.GPerf?.record('flags',performance.now()-flagStart);
      F.updateTargets(dt);
      const poseMs=performance.now()-perfPose;
      root.GPerf?.record('pose-and-hands',poseMs);
      /* v20: сглаженная цена поз за кадр — вход бюджета анимации (teams.lod) */
      if(Number.isFinite(poseMs))S.poseEma=S.poseEma===undefined?poseMs:S.poseEma+(poseMs-S.poseEma)*.05;
      if(C.combat)C.combat.fire(t);
      if (world.grassMat && world.grassMat.userData.sh)
        world.grassMat.userData.sh.uniforms.uTime.value = t;
      if (world.windTime) world.windTime.value = t;
      if(root.GBodycam)root.GBodycam.P.fov=C.SET.fov||88;
      if(world.env&&world.env.uniforms){const w=root.AEGIS_WIND(0,10,0,t),u=world.env.uniforms;if(u.uWindDir)u.uWindDir.value.set(w.x,w.z).normalize();if(u.uWindStr)u.uWindStr.value=Math.hypot(w.x,w.z)/4.5;}

      /* v6: бойцы приминают траву и папоротник: под стопами сильно, вокруг корпуса
         слабее; лёжа — пятно в рост; направление — по ходу движения */
      if (world.env) {
        for (const s of squad) {
          const c = s.ctrl, p = c.pos;
          const v = Math.hypot(c.vel.x, c.vel.z), dx = v > 0.2 ? c.vel.x / v : 0, dz = v > 0.2 ? c.vel.z / v : 0;
          const pr = c.prone || 0;
          if(v<.15&&t<(s._stampNext||0))continue;s._stampNext=t+.12;
          if (pr > 0.5) {
            const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
            for (let k = -2; k <= 2; k++) world.env.stamp(p.x + fx * k * 0.35, p.z + fz * k * 0.35, 0.65, 0.95, fx, fz);
          } else {
            world.env.stamp(p.x, p.z, 0.55 + 0.25 * (c.crouch || 0), v > 0.3 ? 0.9 : 0.7, dx, dz);
            world.env.stamp(p.x, p.z, 1.15, 0.28, dx, dz);
          }
          /* шаг (касание стопы по фазе походки): след, натоптанность, звук поверхности */
          const sph = Math.floor((c.stepPhase || 0) * 2);
          if (s._sph !== undefined && sph !== s._sph && v > 0.35 && c.grounded !== false && pr < 0.5 && F.SCARS) {
            const run = clamp((v - 1.6) / 2.6, 0, 1), foot = sph % 2 === 0 ? 1 : -1;
            let surf = 0;
            try { surf = F.SCARS.step(p.x, p.z, c.yaw, foot, run); } catch (e) { /* */ }
            if (audio.surfStep && !s._audFar) try {
              const act = squad[S.activeIdx] === s && !S.spectate;
              audio.surfStep(act ? null : F.spatialFrom(s.char.root.position), surfaceAt(p.x, p.z, surf), run, act ? 1 : 0.6);
            } catch (e) { /* */ }
          }
          s._sph = sph;
        }
        world.env.update(dt);
      }
      fx.update(dt, 0);
      if (fx.sfx) {
        /* ветер и струйка с горячего ствола своего оружия (свет для дыма — applyLook) */
        const SF = fx.sfx;
        const wd = (C.WX && C.WX.P && C.WX.P.wind) || 0.6;
        const wind=root.AEGIS_WIND(camera.position.x,camera.position.y,camera.position.z);SF.wind.set(wind.x,wind.y,wind.z);
        const aw = active(), gw = aw && aw.gun;
        let mz = null;
        if (gw && gw.gun && SF.heat > 0.3) mz = gw.gun.localToWorld(_sfxM9.copy(gw.muzzleLocal));
        SF.update(dt, camera, mz);
      }
      if (V8) try { v8Frame(dt, t, a); } catch (e) { if (!S._v8err) { S._v8err = 1; console.warn('v8 frame', e && e.message, e && e.stack); } }
      if (F.SCARS) F.SCARS.update(dt);
      if (F.BLOOD) F.BLOOD.update(dt);
      if (F.GORE) F.GORE.update(dt);
      if (F.BLAST) F.BLAST.update(dt);
      if (C.magsStep) C.magsStep(dt);
      updateVeil();
      updateFlash(dt);
      updateSelection(dt);
      if (S.inputOn && !S.death) updateUse(dt);
      else ui.prompt.classList.remove('on');
      updateHUD(dt);
      /* Матрицы живых бойцов считаются здесь, один раз и только у тех, кого
         в этом кадре ставили в позу или сдвигали. Рендер их не обходит
         (matrixWorldAutoUpdate=false): 64 × 160 костей и мешей каждый кадр
         пересчитывались заново, даже у бойцов вне кадра. */
      for (const s of squad) {
        /* v20: улёгшееся (спящее) тело не пересчитывается вовсе */
        const r = s.char.root, frozen = !!(s.rd && s.rd._frozen && !s.active), auto = !!(((s.dead || s.rd) && !frozen) || s.active);
        /* в r166 matrixWorldAutoUpdate=false блокирует и явный пересчёт, поэтому
           пропускаем только неявный обход рендера (force=false) */
        if (!r._mwSkip) { r._mwSkip = { on: false }; const sk = r._mwSkip, base = THREE.Object3D.prototype.updateMatrixWorld;
          r.updateMatrixWorld = function (force) { if (sk.on && !force) return; base.call(this, force); }; }
        if (r.matrixWorldAutoUpdate !== true) r.matrixWorldAutoUpdate = true;
        if (r._mwSkip.on === auto) { r._mwSkip.on = !auto; s._needMW = true; }
        if (!auto && s._needMW) { s._needMW = false; r.updateMatrixWorld(true); }
      }
      root.GPerf?.record('simulation',performance.now()-perfStart);
    }

    let prev = performance.now();
    let warmN = 0, warmT = 0;
    const tick = () => {
      requestAnimationFrame(tick);
      const now = performance.now();
      const dt = (now - prev) / 1000;
      prev = now;
      if (!S.paused) step(dt);
      /* v26: окно «Внешний вид» рисует свою сцену (боец на подиуме) вместо полигона */
      if (S.preview) {
        try { S.preview(renderer, dt); } catch (e) { console.warn('preview:', e && e.message); S.preview = null; }
        return;
      }
      if (S.noRender) return;
      /* v10: пока на экране заставка, полигон под ней не рисуем каждый кадр
         (было два полных рендера за кадр — заставка «тормозила» на любом ПК):
         только 3 кадра прогрева (шейдеры теней, AO, постобработки), дальше —
         раз в секунду, чтобы кэши и карта теней были готовы к закрытию */
      const IN = root.AEGIS_INTRO;
      if (IN && IN.active && !IN.closed) {
        warmN++;
        if (warmN > 3 && (now - warmT) < 1000) return;
        warmT = now;
      }
      const renderStart=performance.now();
      if (C.renderFrame) C.renderFrame(dt);
      else renderer.render(scene, camera);
      root.GPerf?.record('render-submit',performance.now()-renderStart);
      if (world.groundSafe && !world._groundSafeDone) world.groundSafe(renderer);
    };

    /* Указательный палец: лежит на спуске, дожимает при выстреле. */
    function triggerCurlFor(s) {
      const c = s.ctrl;
      /* Палец вне скобы, вдоль ствольной коробки (< 0,5), пока боец не
         стреляет и не целится: на ремне, на предохранителе, на бегу. */
      if (c.ready !== undefined && c.ready < 0.5) return 0.08;
      if (c.fireMode === 'safe' || c.reload>=0 || c.sprint>.3 || s._tacHands || c.vault) return 0.08;
      const shotAge=S.time-c.lastShot;
      const firing = shotAge>=0 && shotAge<.085;
      const held = c.triggerHeld && c.ammo > 0;
      if (firing || held) return 1.08;
      return c.ads > 0.5 && c.sprint < 0.3 ? 0.82 : 0.08;
    }

    /* ------------------------------------- выбранный генерал --------- */
    /* Контур — «вывернутая оболочка»: копии SkinnedMesh на том же скелете,
       раздутые по нормали и нарисованные изнанкой. Плюс HTML-метка над
       головой. Видно только в свободном полёте, у бойца в теле — нет. */
    const SEL = { on: false, mat: null, hulls: new Map(), tag: document.getElementById('tag'), tagKey: '', v: new THREE.Vector3() };
    /* Контур — свечение по силуэту (френель) на копиях мешей того же
       скелета: рисуется поверх тех же пикселей (равная глубина), поэтому
       внутренние слои снаряжения не просвечивают, как у «оболочки». */
    SEL.mat = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(0xf2cf74) }, uT: { value: 0 } },
      vertexShader: [
        '#include <common>', '#include <skinning_pars_vertex>',
        'varying vec3 vN; varying vec3 vV;',
        'void main(){',
        '  #include <beginnormal_vertex>', '  #include <skinbase_vertex>', '  #include <skinnormal_vertex>',
        '  #include <begin_vertex>', '  #include <skinning_vertex>',
        '  vec4 mv = modelViewMatrix * vec4(transformed, 1.0);',
        '  vN = normalize(normalMatrix * objectNormal); vV = normalize(-mv.xyz);',
        '  gl_Position = projectionMatrix * mv;',
        '}'].join('\n'),
      fragmentShader: [
        'uniform vec3 uCol; uniform float uT; varying vec3 vN; varying vec3 vV;',
        'void main(){',
        '  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));',
        '  float rim = smoothstep(0.45, 0.92, f);',
        '  float a = rim * 0.95 + 0.07 + 0.04 * sin(uT * 3.0);',
        '  gl_FragColor = vec4(uCol * a, 1.0);',
        '}'].join('\n'),
      transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, fog: false
    });
    function hullsFor(s) {
      if (SEL.hulls.has(s)) return SEL.hulls.get(s);
      const list = [];
      const src = [];
      s.char.root.traverse((o) => {
        if (!o.isSkinnedMesh || !o.geometry || !o.geometry.attributes.normal || o.userData.lodProxy) return;
        if (/brow|lash|cornea|eye|teeth|tongue|tear|hair_card/i.test(o.name || '')) return;
        if (o.geometry.attributes.position.count < 120) return;
        src.push(o);
      });
      for (const o of src) {
        const m2 = new THREE.SkinnedMesh(o.geometry, SEL.mat);
        m2.bind(o.skeleton, o.bindMatrix);
        m2.frustumCulled = false; m2.castShadow = false; m2.receiveShadow = false;
        m2.userData.noAO = true; m2.renderOrder = 5;
        m2.visible = false;
        o.parent.add(m2);
        m2.position.copy(o.position); m2.quaternion.copy(o.quaternion); m2.scale.copy(o.scale);
        list.push({ m: m2, o });
      }
      SEL.hulls.set(s, list);
      return list;
    }
    function setHull(s, on) {
      const L = on ? hullsFor(s) : SEL.hulls.get(s);
      if (L) for (const h of L) h.m.visible = on && h.o.visible !== false;
    }
    let selShown = -1;
    /* v26: смена внешнего вида на лету (редактор «Внешний вид»). Живым бойцам
       пресетов keys — новые сетки и материалы на тех же костях (character.restyle):
       риг, ИИ, физика и оружие не трогаются. Погибшим — при возрождении. */
    function restyleSoldier(s) {
      const ch = s.char;
      if (!CHAR.restyle || !ch) return false;
      if (s.dead || s.rd || (s._gore && s._gore.cuts && s._gore.cuts.length)) { s._lookStale = true; return false; }
      const base = CHAR.PRESETS[ch.key];
      if (!base) return false;
      const P0 = ch.preset || {}, P = JSON.parse(JSON.stringify(base));
      const sameArmor = (P0.armor || 'plate') === (P.armor || 'plate') && P0.head === P.head;
      const old = CHAR.restyle(THREE, ch, P);
      if (!old) return false;
      s._lookStale = false;
      if (root.GGloom) root.GGloom.markTree(ch.root, 0.5, 0);
      const H = SEL.hulls.get(s);
      if (H) { for (const h of H) if (h.m.parent) h.m.parent.remove(h.m); SEL.hulls.delete(s); }
      if (root.GLod && root.GLod.forget) root.GLod.forget(ch.root);
      s._lodShadow = undefined;
      /* от первого лица: новые группы (маскировка) после выхода из тела — видимы */
      if (s._fpVis) for (const g in ch.meshes) if (!(g in s._fpVis)) s._fpVis[g] = true;
      if (s._gore && s._gore.depth) for (const k in ch.meshes) if (ch.meshes[k].castShadow) ch.meshes[k].customDepthMaterial = s._gore.depth;
      if (s.dmg && !sameArmor) s.dmg.armor = null;
      s._needMW = true;
      ch.root.updateMatrixWorld(true);
      if (BC && BC.restyle && s.active) BC.restyle(s);
      setTimeout(() => { try { CHAR.disposeLook(old); } catch (e) { /* */ } }, 0);
      return true;
    }
    function reskin(keys) {
      const LC = C.looksCtx;
      if (!LC) return 0;
      try { const L = root.GLooks ? root.GLooks.load() : LC.get(); LC.set(L); if (L && CHAR.applyLooks) CHAR.applyLooks(L.units); }
      catch (e) { console.warn('looks:', e && e.message); return 0; }
      let n = 0;
      for (const s of squad) {
        if (keys && !keys.includes(s.char.key)) continue;
        try { if (restyleSoldier(s)) n++; } catch (e) { console.warn('reskin', s.key, e && e.message); }
      }
      for (const s of squad) if (s.band) s.band.material = LC.BAND_MAT[LC.teamBand(LC.teamOf(s.spawn || s))];
      if (selShown >= 0 && squad[selShown]) setHull(squad[selShown], true);
      try { shadowDetail(C.SET.quality); } catch (e) { /* */ }
      renderer.shadowMap.needsUpdate = true;
      return n;
    }
    function updateSelection() {
      const idx = SEL.on && !world.mapId && S.mode === 'free' && !S.death ? S.selected : -1;
      const s = idx >= 0 ? squad[idx] : null;
      const show = s && !s.dead ? idx : -1;
      if (show !== selShown) {
        if (selShown >= 0) setHull(squad[selShown], false);
        if (show >= 0) setHull(squad[show], true);
        selShown = show;
      }
      SEL.mat.uniforms.uT.value = S.time;
      const tag = SEL.tag;
      if (!tag) return;
      if (show < 0) { if (SEL.tagKey) { SEL.tagKey = ''; tag.classList.remove('on'); } return; }
      const head = s.char.bone ? s.char.bone('head') : null;
      if (head) head.getWorldPosition(SEL.v); else SEL.v.copy(s.ctrl.pos).setY(s.ctrl.pos.y + 1.7);
      SEL.v.y += 0.38;
      SEL.v.project(camera);
      const vis = SEL.v.z < 1 && Math.abs(SEL.v.x) < 1.2 && Math.abs(SEL.v.y) < 1.2;
      const key = s.key;
      if (SEL.tagKey !== key) {
        SEL.tagKey = key;
        const P = s.char.preset, G = s.gen || {};
        tag.className = 'on ' + (P.faction || '');
        tag.innerHTML = '<b></b><span></span><i>выбран</i>';
        tag.children[0].textContent = P.name;
        tag.children[1].textContent = (P.faction === 'delta' ? 'Дельта' : 'Альфа') + (G.call ? ' · «' + G.call + '»' : '');
      }
      tag.style.visibility = vis ? 'visible' : 'hidden';
      if (vis) tag.style.transform = 'translate(' + ((SEL.v.x * 0.5 + 0.5) * innerWidth).toFixed(1) + 'px,' + ((-SEL.v.y * 0.5 + 0.5) * innerHeight).toFixed(1) + 'px) translate(-50%,-100%)';
    }

    /* «Низкая»: в карту теней не идут детали, которые почти не дают
       тени (кожа под одеждой, подошвы, шнурки, манжеты, подсумки) —
       это ~1/3 треугольников бойца в проходе теней. */
    const LOW_NOSHADOW = /_(skin|bootSole|bootLace|bootHard|cuff|sleevePatch|headGear|headHard|vestMag|vestHard)$/;
    function shadowDetail(tier) {
      const low=tier==='low'||tier==='ultra';
      for (const s of squad) s.char.root.traverse((o) => {
        if (!o.isMesh || !LOW_NOSHADOW.test(o.name || '')) return;
        if (o.userData.cs0 === undefined) o.userData.cs0 = o.castShadow;
        o.castShadow = low ? false : o.userData.cs0;
      });
      renderer.shadowMap.needsUpdate = true;
    }
    shadowDetail(C.SET.quality);

    /* ------------------------------------------ API для интерфейса --- */
    const keyIdx = (key) => squad.findIndex((s) => s.key === key);
    const API = {
      generals: () => squad.filter(s=>!s.npc).map((s) => ({ key: s.key, name: s.char.preset.name, call: s.gen && s.gen.call, faction: s.char.preset.faction, dead: !!s.dead })),
      selected: () => (S.selected >= 0 && squad[S.selected] ? squad[S.selected].key : null),
      select: (key) => { const i = keyIdx(key); if (i >= 0) S.selected = i; return API.selected(); },
      ensureSelected: () => {
        if (S.selected < 0 || !squad[S.selected]) {
          const alive = squad.map((s, i) => (s.dead || s.npc ? -1 : i)).filter((i) => i >= 0);
          const pool = alive.length ? alive : squad.map((s, i) => s.npc?-1:i).filter(i=>i>=0);
          S.selected = pool[Math.floor(Math.random() * pool.length)];
          return { key: squad[S.selected].key, random: true };
        }
        return { key: squad[S.selected].key, random: false };
      },
      setHighlight: (on) => { SEL.on = !!on; },
      /* камера перед генералом: смотрит ему в лицо с 3,2 м */
      focus: (key) => {
        const i = keyIdx(key);
        if (i < 0 || S.mode !== 'free') return;
        const c = squad[i].ctrl, f = S.free;
        const yaw = c.yaw + 0.35;
        f.pos.set(c.pos.x - Math.sin(yaw) * 3.2, c.pos.y + 1.75, c.pos.z - Math.cos(yaw) * 3.2);
        f.yaw = Math.atan2(f.pos.x - c.pos.x, f.pos.z - c.pos.z);
        f.pitch = -0.12;
        if (f.vel) f.vel.set(0, 0, 0);
      },
      currentMap:()=>world.mapId||null,
      travel:(map,key,opts)=>{const a=active();if(BC&&BC.throwing)throw new Error('Сначала завершите бросок гранаты');root.GMaps.travel(map,key||(a&&a.key)||API.ensureSelected().key,levelSnapshot(),opts);},
      state: () => ({ mode: S.mode, active: S.activeIdx >= 0 ? squad[S.activeIdx].key : null, selected: API.selected(), locked: S.pointerLocked, paused: !!S.paused }),
      setInput: (on) => { S.inputOn = !!on; if (!on) { C.releaseAll(); C.unlockPointer(); } },
      lock: () => C.lockPointer(),
      unlock: () => C.unlockPointer(),
      pause: (on) => { S.paused = !!on; if (on) C.releaseAll(); if (audio.ctx) { try { audio.setPaused(on); } catch (e) { /* */ } } },
      setRender: (on) => { S.noRender = !on; },
      /* v26: редактор «Внешний вид» (js/app/looks.js): своя сцена вместо полигона и смена вида бойцов на лету */
      setPreview: (fn) => { S.preview = typeof fn === 'function' ? fn : null; },
      renderer: () => renderer,
      reskin: (keys) => reskin(keys),
      presetOf: (key) => { const i = keyIdx(key); return i >= 0 && squad[i].char ? squad[i].char.key : null; },
      /* фон леса: выключается в оружейной (там помещение) */
      /* состояние для обучения в игре (js/app/ui.js опрашивает раз в 250 мс) */
      tutProbe: () => {
        const a = S.activeIdx >= 0 ? squad[S.activeIdx] : null, c = a && a.ctrl;
        return {
          emb: !!a, gun: !!(a && curInv(a)), shots: c ? c.shots || 0 : 0, ads: c ? c.ads || 0 : 0,
          reload: !!(c && c.reload >= 0), score: S.score, healed: S.tutHealed || 0, free: S.mode === 'free',
          inv: S.tutInv || 0, sightKeys: S.tutSight || 0,
          hasGun: !!(a && a.L && a.L.slots && a.L.slots.some((x) => x && x.t === 'gun'))
        };
      },
      setAmbient: (on) => { S.ambOff = !on; if (audio.setAmbient) audio.setAmbient(!!on); },
      loadout: (key) => { const i = keyIdx(key); return i >= 0 ? JSON.parse(JSON.stringify(squad[i].L)) : null; },
      setLoadout: (key, L) => {
        const i = keyIdx(key);
        if (i < 0 || !AE) return;
        const s = squad[i];
        const NL = AE.normLoadout(L);
        ARS.rebuild(s, NL);
        /* v26: оружейная закрывается в меню паузы — симуляция стоит, и в кадре оставались руки
           без оружия (новое оружие ещё ни разу не ставилось в руки бодикамом). Несколько коротких шагов
           (≈0,23 с) ставят руки/оружие/HUD в новое состояние ещё под паузой — пружины рига успевают сесть. */
        if (S.paused && s.active) { try { for (let k = 0; k < 14; k++) step(1 / 60); } catch (e) { console.warn('loadout refresh', e && e.message); } }
        const all = AE.loadLoadouts();
        all[key] = NL;
        AE.saveLoadouts(all);
      },
      applySettings: (st) => {
        if (!st) return;
        Object.assign(C.SET,st);root.AEGIS_SETTINGS=C.SET;
        if(root.GBodycam&&st.fov!==undefined)root.GBodycam.P.fov=st.fov;
        if(st.voices===0&&root.speechSynthesis)root.speechSynthesis.cancel();
        if(audio.setGroups)audio.setGroups(C.SET);
        if (st.quality) { C.QM.setTier(st.quality); shadowDetail(st.quality); if (root.GSmoke && root.GSmoke.setQuality) root.GSmoke.setQuality(st.quality); }
        if (st.sens !== undefined) C.setSens(st.sens);
        if (st.volume !== undefined && audio.setVolume) audio.setVolume(st.volume);
        if (st.binds) C.setBinds(st.binds);
        if (st.fps !== undefined) C.QM.setFps(!!st.fps);
        if (st.weather && C.WX) C.WX.set(st.weather);
        /* v8: хардкор — задержки, «самострел» перегретого патронника */
        if (st.hardcore !== undefined) S.hardcore = !!st.hardcore;
      },
      weather: (k) => (k && C.WX ? C.WX.set(k) : C.WX && C.WX.key),
      loadCube: (text) => C.WX && C.WX.loadCube(text),
      audioInit: () => { try { audio.init(); audio.resume(); if (S.paused) audio.setPaused(true); if (S.ambOff) audio.setAmbient(false); } catch (e) { /* */ } },
      embody: (key) => { const i = keyIdx(key); if (i >= 0) C.embodyFn(i); return S.activeIdx; },
      disembody: () => { C.disembodyFn(); },
      binds: () => C.getBinds()
    };
    /* Шейдеры компилируются заранее и параллельно (KHR_parallel_shader_compile),
       пока ещё идёт заставка: первый кадр не замирает на секунды. */
    /* v10: мелочь (болты табличек, детали ворон, банки, шурупы) не
       отбрасывает тени: тень < 2–3 текселей карты теней не видна, а каждый
       такой меш — отдельный вызов отрисовки в проходе теней (их было ~280) */
    try {
      const _sb = new THREE.Sphere();
      scene.updateMatrixWorld(true);
      let nOff = 0;
      scene.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.castShadow || !o.geometry) return;
        const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
        if (!g.boundingSphere) return;
        _sb.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
        if (_sb.radius < 0.11) { o.castShadow = false; nOff++; }
      });
      root.AEGIS_SHADOW_TINY_OFF = nOff;
    } catch (e) { /* не критично */ }
    let started = false, gameReadyOk = false;
    const startGame = () => {
      if (started) return;
      started = true;
      root.AEGIS_GAME = API;
      BOOTMARK('startGame');
      tick();
      BOOTMARK('firstFrame');
      if (gameReadyOk) uiCall('onGameReady', API);
    };
    /* v15: статичный мир (лес, сухостой, подрост, «мрачный лес», зоны,
       минное поле) не двигается: его матрицы считаются один раз, и
       scene.updateMatrixWorld больше не обходит эти ~300 узлов каждый кадр.
       Ветер, примятая трава и подрывы — в шейдерах и instanceMatrix, их
       это не касается (проверено: за минуту боя матрицы не менялись). */
    try {
      for (const c of scene.children) {
        if (!/^(forest|deadwood|saplings|gloom_world|zones_v8|minefield)$/.test(c.name)) continue;
        c.updateMatrixWorld(true);
        c.matrixWorldAutoUpdate = false;
        /* мины и растяжки лежат в траве/в земле: их тень (≈90 тыс.
           треугольников в карте теней) не видна, а стоит как два солдата */
        if (c.name === 'minefield') c.traverse((o) => { if (o.isMesh || o.isLine) o.castShadow = false; });
      }
      scene.traverse((o) => { if (o.name === 'stumps_roots') o.castShadow = false; });
      /* Сцена сама не двигается. С matrixAutoUpdate=true она каждый кадр
         «меняла» свою матрицу и принудительно (force) пересчитывала все 17 тыс.
         узлов, а флаги matrixWorldAutoUpdate=false выше не работали. */
      scene.updateMatrix(); scene.matrixAutoUpdate = false; scene.updateMatrixWorld(true);
    } catch (e) { /* */ }
    /* v15: прогрев ВСЕХ шейдеров, включая скрытые до первого боя (капли и
       брызги крови, вспышки, пробоины брони, подрыв): three.js компилирует
       только видимое, и первая очередь/первый взрыв подвешивали кадр на
       0,1–0,5 с, пока драйвер собирал программу (на встроенной графике —
       дольше всего). Скрытые объекты на время компиляции включаются. */
    const hidden = [];
    /* источники света не трогаем: их число входит в ключ программы, и
       включённый на прогрев выключенный свет (hemi при intensity 0) давал
       программы «не того» варианта */
    try { scene.traverse((o) => { if (!o.visible && !o.isLight) { hidden.push(o); o.visible = true; } }); } catch (e) { /* */ }
    /* программы собираются под тот буфер, куда реально рисуется кадр:
       сцена идёт в цель композера, а не прямо в холст — иначе ключи
       программ не совпадали и прогрев пропадал впустую */
    const prevRT = renderer.getRenderTarget();
    try { const PT = C.getPost && C.getPost(); const rt = PT && PT.composer && PT.composer.renderTarget1; if (rt) renderer.setRenderTarget(rt); } catch (e) { /* */ }
    const unhide = () => { for (const o of hidden) o.visible = false; hidden.length = 0; try { renderer.setRenderTarget(prevRT); } catch (e) { /* */ } };
    /* compile() собирает программы не со всеми ключами, с которыми их
       потом рисует настоящий кадр (спрайты и точки эффектов в цели
       композера получали другой ключ и пересобирались при первом
       выстреле). Поэтому после compile — один настоящий кадр за экраном
       загрузки со всеми скрытыми объектами, без отсечения по кадру. */
    let warmed = false;
    const warm = () => {
      if (warmed) return; warmed = true;
      try { renderer.setRenderTarget(prevRT); } catch (e) { /* */ }
      const fc = [];
      for (const o of hidden) o.traverse((q) => { if (q.frustumCulled) { q.frustumCulled = false; fc.push(q); } });
      try { renderFrame(0); } catch (e) { /* */ }
      for (const q of fc) q.frustumCulled = true;
      unhide();
    };
    const go = () => { warm(); startGame(); };
    try {
      if (renderer.compileAsync && renderer.extensions.has('KHR_parallel_shader_compile')) {
        const pr = renderer.compileAsync(scene, camera);
        pr.then(go, go);
        setTimeout(go, 12000);
      } else { try { renderer.compile(scene, camera); } catch (e) { /* */ } go(); }
    } catch (e) { go(); }

    /* ------------------------------------------- отладочные хуки ------ */
    /* Используются автотестами (tools/test). */
    window.__GAME = {
      physicsStep:(dt)=>{if(root.GPhysics){for(const s of squad)s.ctrl._physicsWorld=world;root.GPhysics.get(world).begin(dt);}},
      performance:()=>({timings:root.GPerf?.report(),physics:root.GPhysics?.stats(),render:renderer.info,ai:C.combat?.stats()}),
      get BC() { return BC; }, get combat() { return C.combat; }, get teams() { return C.teams; }, state: S, squad, world, camera, scene, renderer, fx, audio, sling: F.SLING,
      dmg: F.DMG, med: MED, testShot, revive: reviveAll, blood: F.BLOOD, blast: F.BLAST, gore: F.GORE, flags: F.FLAGS,
      /* минное поле: подрыв по id, журнал срабатываний, гибель и возрождение */
      mines: {
        mf: MF, log: MZ.log, count: () => MZ.n,
        detonate: (id, who, side) => { const m = MF && MF.mines[id]; if (!m || !m.alive) return false; detonate(m, who === undefined || who === null ? null : squad[who], side || 'R'); return true; },
        nearest: (x, z, type) => {
          let best = null, bd = 1e9;
          for (const m of MF ? MF.mines : []) { if (!m.alive || (type && m.type !== type)) continue; const d = Math.hypot(m.x - x, m.z - z); if (d < bd) { bd = d; best = m; } }
          return best ? { id: best.id, type: best.type, x: best.x, z: best.z, y: best.y, state: best.state, d: bd } : null;
        }
      },
      death: () => (S.death ? { i: S.death.i, t: +S.death.t.toFixed(2), cause: S.death.cause, fp: S.death.fp } : null),
      respawnT: RESPAWN_T,
      /* Прогон симуляции без рендера: n шагов по dt секунд. */
      step: (n, dt) => { for (let i = 0; i < (n || 1); i++) step(dt || 1 / 60); return S.time; },
      /* Снижение пули на заданных дистанциях: стреляем горизонтально из
         точки без препятствий и смотрим, на сколько траектория ушла вниз. */
      ballistics: (i)=>C.ballisticsInfo(squad[i||0]),
      traceStats: ()=>C.traceStats&&C.traceStats(),
      measureDrop: dists => (dists||[10,30,100,800]).map(R=>{const p=root.GBallistics.trajectory(root.GBallistics.spec('545','7N6'),880,0,R,R).at(-1);return {dist:R,drop:-p.y,v:p.v,t:p.t};}),

      /* Управление вводом из автотестов: позволяет проверить полную цепочку
         «клавиша -> контроллер -> выстрел -> попадание», а не только её конец.
         pointerLocked имитирует захват курсора, которого нет в headless. */
      setInput: (o) => {
        if (o.lock !== undefined) { S.pointerLocked = !!o.lock; S.started = true; }
        for (const k of ['fwd', 'back', 'left', 'right', 'sprint', 'sneak', 'crouch', 'ads', 'leanL', 'leanR', 'proneTog', 'jump'])
          if (o[k] !== undefined) input[k] = o[k];
        if (o.trigger !== undefined) { const a = active(); a && a.ctrl.pullTrigger(!!o.trigger); }
        return { locked: S.pointerLocked, input: Object.assign({}, input) };
      },
      embody: (i) => { S.activeIdx >= 0 && null; C.embody ? C.embody(i) : null; },
      info: () => ({
        mode: S.mode, activeIdx: S.activeIdx, score: S.score,
        camera: camera.position.toArray().map((v) => +v.toFixed(3)),
        fov: +camera.fov.toFixed(2),
        targets: world.targets.map((t) => ({ d: t.dist, s: t.state, hits: t.hits })),
        squad: squad.map((s) => ({
          key: s.key,
          pos: s.ctrl.pos.toArray().map((v) => +v.toFixed(3)),
          ammo: s.ctrl.ammo, speed: +s.ctrl.speed.toFixed(3),
          yaw: +s.ctrl.yaw.toFixed(2), prone: +(s.ctrl.prone || 0).toFixed(2), crouch: +(s.ctrl.crouch || 0).toFixed(2),
          thr: s.thr ? [s.thr.mode, +s.thr.cover.toFixed(2), +s.thr.shut.toFixed(2), 'iy' + (+s.idleYaw).toFixed(2), 'ty' + (s.thr.yaw === null ? '-' : (+s.thr.yaw).toFixed(2)), 'w' + (s.ctrl.aiWish ? s.ctrl.aiWish.y.toFixed(1) : '-')].join('/') : '', stun: s.stunT > S.time
        }))
      }),
      /* геометрия: проверка, что руки реально держат оружие */
      gripCheck: () => squad.filter((s) => s.gun).map((s) => {
        const g = s.gun.gun;
        g.updateMatrixWorld(true);
        s.char.root.updateMatrixWorld(true);
        const out = {};
        /* Меряем до ФАКТИЧЕСКОЙ точки хвата, которую выбрал риг: кисть
           скользит вдоль цевья под длину руки, поэтому расстояние до
           исходного узла оружия ничего не доказывало бы. */
        for (const [bone, SS] of [['palmR', 'R'], ['palmL', 'L']]) {
          const target = s.rig.gripTarget && s.rig.gripTarget[SS];
          if (!target) { out[bone] = -1; continue; }
          const bp = s.char.bone(s.char.hands ? 'wrist' + SS : bone).getWorldPosition(new THREE.Vector3());
          out[bone] = +bp.distanceTo(target).toFixed(4);
          out['wristError' + SS] = out[bone];
        }
        /* Углы в локтях: у стрелка рабочая рука согнута на 70–95°,
           опорная — на 100–130°. Прямая или сложенная вдвое рука сразу
           выдаёт неправильную постановку оружия. */
        const ang = (a, b, c) => {
          const A = s.char.bone(a).getWorldPosition(new THREE.Vector3());
          const B = s.char.bone(b).getWorldPosition(new THREE.Vector3());
          const C = s.char.bone(c).getWorldPosition(new THREE.Vector3());
          const u = A.sub(B).normalize(), v = C.sub(B).normalize();
          return Math.round(Math.acos(U.clamp(u.dot(v), -1, 1)) * 180 / Math.PI);
        };
        /* Независимая проверка цели: её сдвиг не должен скрывать промах
           мимо установленной рукоятки. */
        if (s.char.hands && s.wspec && s.wspec.foregrip) {
          const fixed = new THREE.Vector3().setFromMatrixPosition(
            g.matrixWorld.clone().multiply(s.wspec.leftGrip));
          const actual = s.char.bone('wristL').getWorldPosition(new THREE.Vector3());
          out.fixedGripError = +actual.distanceTo(fixed).toFixed(5);
        }
        out.elbowR = ang('shoulderR', 'elbowR', 'wristR');
        out.elbowL = ang('shoulderL', 'elbowL', 'wristL');
        /* насколько далеко кисть от плеча — источник обоих углов */
        const sh = (n) => s.char.bone(n).getWorldPosition(new THREE.Vector3());
        out.reachR = +sh('shoulderR').distanceTo(sh('wristR')).toFixed(3);
        out.reachL = +sh('shoulderL').distanceTo(sh('wristL')).toFixed(3);
        /* висит ли оружие в воздухе относительно бойца */
        const chest = s.char.bone('chest').getWorldPosition(new THREE.Vector3());
        const gunP = s.gun.root.getWorldPosition(new THREE.Vector3());
        out.gunToChest = +chest.distanceTo(gunP).toFixed(4);
        /* Постановка рук в системе груди: отведение плеча от корпуса (°) и
           вынос локтя от оси тела (м). Прижатая к рёбрам рука даёт < 10° и
           локоть внутри контура туловища. */
        const cInv = s.char.bone('chest').getWorldQuaternion(new THREE.Quaternion()).invert();
        const loc = (n) => sh(n).sub(chest).applyQuaternion(cInv);
        for (const SS of ['R', 'L']) {
          const sg = SS === 'R' ? 1 : -1;
          const up = loc('elbow' + SS).sub(loc('shoulder' + SS));
          out['abduct' + SS] = Math.round(Math.atan2(sg * up.x, -up.y) * 180 / Math.PI);
          out['elbowOut' + SS] = +(sg * loc('elbow' + SS).x).toFixed(3);
        }
        const bq = g.getWorldQuaternion(new THREE.Quaternion());
        const bd = new THREE.Vector3(0, 0, -1).applyQuaternion(bq);
        out.gunPitch = Math.round(Math.asin(U.clamp(-bd.y, -1, 1)) * 180 / Math.PI);
        out.key = s.key;
        return out;
      }),
      /* Прицел: опорная кисть не должна подниматься к прицельной линии
         (0,116 м в системе оружия, верх цевья — 0,112). top — наивысшая
         точка левой перчатки у цевья в системе оружия, clearance — запас
         до линии. Вершины считаются линейным скиннингом на CPU: он
         расходится с шейдерным на миллиметры, запас это покрывает. */
      sightCheck: (i) => {
        const s = squad[i === undefined ? Math.max(0, S.activeIdx) : i];
        const mesh = s.char.meshes.glove;
        if (!mesh || !s.gun) return null;
        const g = s.gun.gun;
        g.updateMatrixWorld(true);
        s.char.root.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
        const pos = mesh.geometry.attributes.position, v = new THREE.Vector3();
        let top = -Infinity;
        for (let k = 0; k < pos.count; k++) {
          if (pos.getX(k) > 0) continue;                 // левая перчатка: в позе покоя x < 0
          v.fromBufferAttribute(pos, k);
          mesh.applyBoneTransform(k, v);
          v.applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);
          if (v.z < -0.2) top = Math.max(top, v.y);      // только у цевья
        }
        return { key: s.key, ads: +s.ctrl.ads.toFixed(2), top: +top.toFixed(4), clearance: +(0.116 - top).toFixed(4) };
      }
    };

    /* Ручная постановка камеры для съёмки и визуальных проверок:
       __GAME.view([x,y,z], [tx,ty,tz]) — камера в точке, взгляд в цель. */
    window.__GAME.wx = C.WX;
    window.__GAME.view = (from, to, fov) => {
      S.activeIdx = -1;
      S.mode = 'free';
      const f = new THREE.Vector3().fromArray(from);
      const t = new THREE.Vector3().fromArray(to);
      const dir = new THREE.Vector3().subVectors(t, f).normalize();
      S.free.pos.copy(f);
      S.free.yaw = Math.atan2(-dir.x, -dir.z);
      S.free.pitch = Math.asin(U.clamp(dir.y, -1, 1));
      camRig.pos.copy(f);
      camRig.quat.setFromEuler(new THREE.Euler(S.free.pitch, S.free.yaw, 0, 'YXZ'));
      S.free.fov = fov || 0;
      if (fov) { camRig.fov = fov; camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.position.copy(f); camera.quaternion.copy(camRig.quat); camera.updateMatrixWorld(true);
      if (C.WX && C.WX.eye) C.WX.eye.snap = true;
      return { pos: f.toArray(), yaw: S.free.yaw, pitch: S.free.pitch };
    };

    /* Принудительный вход в бойца — для автотестов и съёмки. */
    window.__GAME.embody = (i) => { C.embodyFn(i); return S.activeIdx; };
    window.__GAME.dropMagazine = (i) => C.dropMag(squad[i === undefined ? Math.max(0, S.activeIdx) : i], null);
    window.__GAME.mags = () => (C.MAGS || []).map((m) => ({ p: m.o.position.toArray().map((v) => +v.toFixed(3)), rest: m.rest > 0.4, t: +m.t.toFixed(2) }));
    /* Съёмка: spectate([x,y,z], [tx,ty,tz], fov) ставит внешнюю камеру, не
       отнимая управление у бойца; spectate(null) возвращает обычную.
       pause(true) останавливает симуляцию в кадре — дальше step(n, dt). */
    window.__GAME.spectate = (from, to, fov) => {
      if (!from) { S.spectate = null; return null; }
      const f = new THREE.Vector3().fromArray(from), t = new THREE.Vector3().fromArray(to);
      const m = new THREE.Matrix4().lookAt(f, t, new THREE.Vector3(0, 1, 0));
      S.spectate = { pos: f, quat: new THREE.Quaternion().setFromRotationMatrix(m), fov: fov || 40 };
      updateCamera(0);
      updateSelfVisibility();
      return true;
    };
    window.__GAME.pause = (on) => { S.paused = !!on; return S.paused; };
    /* кадр по запросу (автотесты/съёмка): отрисовать и вернуть снимок холста */
    window.__GAME.renderNow = (dt, q) => { if (C.renderFrame) C.renderFrame(dt || 1 / 60); else renderer.render(scene, camera); return renderer.domElement.toDataURL('image/jpeg', q || 0.85); };
    window.__GAME.bodycam = BC;
    window.__GAME.qm = C.QM;
    window.__GAME.carry = root.__AEGIS_CARRY;   // лаборатория: подстройка позы «на ремне»
    window.__GAME.tpPoff = _tpPoff;   // лаборатория: подстройка подсумка
    window.__GAME.tpKeep = (v) => { if (v !== undefined) TP_KEEP = v; return TP_KEEP; };
    window.__GAME.tpFwd = (v) => { if (v !== undefined) TP_FWD = v; return TP_FWD; };
    window.__GAME.renderPNG = (dt) => { if (C.renderFrame) C.renderFrame(dt || 1 / 60); else renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); };
    /* v8 автотесты: разрыв в точке (ударная волна, грязь на объективе, контузия) */
    window.__GAME.stumble = (i=0,severity=.55,direction=[1,0,0]) => root.GStumble.trigger(squad[i],new THREE.Vector3().fromArray(direction),severity,{force:true,reason:'manual-test'});
    window.__GAME.bodyImpulse = (i,impulse,point) => root.GStumble.impulse(squad[i||0],new THREE.Vector3().fromArray(impulse),point?new THREE.Vector3().fromArray(point):undefined);
    window.__GAME.balanceStats = () => root.GStumble.stats();
    window.__GAME.shock = (p, big) => shock(new THREE.Vector3().fromArray(p), big || 1);
    /* отладка/автотесты: доступ к внутренностям кадра */
    /* Изолированный стенд: та же цепочка поза → оружие → досягаемость →
       кисти, но без ИИ, угроз и выстрелов. Не вызывается игровым циклом. */
    window.__GAME.equipStand = (i, slot) => selectSlot(squad[i || 0], slot || 0, { instant: true, force: true });
    window.__GAME.poseStand = (i, opt) => {
      const s = squad[i || 0], c = s.ctrl, o = opt || {};
      if (!s || s.dead) return null;
      c.crouch = o.crouch || 0; c.crouchMove = 0; c.prone = o.prone || 0;
      c.ready = o.ready || 0; c.ads = o.ads || 0; c.speed = 0;
      c.pitch = o.pitch || 0; c.yaw = s.spawn.yaw;
      c.lagYaw = c.yaw; c.lagPitch = c.pitch;
      c.reload = o.reload === undefined ? -1 : o.reload;
      s.hr = null;
      root.GContacts?.drop(root.GPhysics.get(world),s);root.GPhysics.get(world).dropPose(s); s.motion = null;
      for (let n = 0; n < 45; n++) {
        const pose = F.poseSoldier(s, 1 / 60, false, S.time);
        s.char.root.updateMatrixWorld(true);
        if (s.gun) {
          F.placeWeapon(s, 1 / 60, false, camera.position, camera.quaternion, pose);
          reachFix(s, 1 / 60); gunClear(s, 1 / 60); npcHands(s);
          s.rig.poseDt=1/60;s.rig.triggerCurl=triggerCurlFor(s);
          s.rig.adsAmount = c.ads; s.rig.readyAmount = U.smoothstep(c.ready);
          s.rig.solveArms(s.gun.gun);
        } else { s.rig.handTargets = null; s.rig.relaxArms(0, 0); }
      }
      return window.__GAME.gripCheck().find((x) => x.key === s.key) || null;
    };
    window.__GAME._C = C; window.__GAME._F = F; window.__GAME.step = (n, dt) => { for (let i = 0; i < (n || 1); i++) C.stepFn && C.stepFn(dt || 1 / 60); };
    window.__GAME.tac = (laser, light) => { const a = active(), inv = a ? curInv(a) : null; if (!inv) return false; if (laser !== undefined) inv.laser = !!laser; if (light !== undefined) inv.light = !!light; return true; };
    window.__GAME.aim = () => { const a = active(); return a ? { pitch: +a.ctrl.pitch.toFixed(5), yaw: +a.ctrl.yaw.toFixed(5), sx: BC ? +(BC.sight.x || 0).toFixed(4) : 0, sy: BC ? +(BC.sight.y || 0).toFixed(4) : 0, ammo: a.ctrl.ammo, ads: +a.ctrl.ads.toFixed(2) } : null; };
    window.__GAME.setTP = () => false;   /* вид от третьего лица удалён */

    window.__GAME.disembody = () => { C.disembodyFn(); return S.activeIdx; };
    window.__GAME.setPose = (o) => {
      const a = active();
      if (!a) return null;
      if (o.ads !== undefined) a.ctrl.ads = o.ads;
      if (o.yaw !== undefined) a.ctrl.yaw = o.yaw;
      if (o.pitch !== undefined) a.ctrl.pitch = o.pitch;
      if (o.pos) a.ctrl.pos.fromArray(o.pos);
      if (o.crouch !== undefined) a.ctrl.crouch = o.crouch;
      return true;
    };

    gameReadyOk = true;
    { const BS = root.AEGIS_BOOT; if (BS) { BS.k = 1; BS.t.push(['main', Math.round(performance.now() - BS.t0)]); } }
    if (started) uiCall('onGameReady', API);
    return window.__GAME;
  }

  return { main, SPAWN, HOLD_TIME, USE_RANGE, startLoop, finishLoop };
});