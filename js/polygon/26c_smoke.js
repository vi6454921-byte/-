/* AEGIS v23 · дымовая завеса (граната M18 / РДГ-2) — новый визуал.
   Как у настоящей шашки (M18: запал 1,2–2 с, дымление 50–90 с; РДГ-2: ~60 с):
     • запал (05d_grenades.js), затем хлопок воспламенителя и шипение;
     • первые 2–3 с из отверстий бьёт плотная струя (3,5–6 м/с), клубы быстро
       разбухают — за 4–6 с у шашки стоит плотное облако высотой по грудь–голову;
     • ~52 с ровного дымления (4–5 клубов/с), затем шашка выгорает за ~14 с;
     • клубы разрастаются до 4–7 м, стелются по земле, сносятся ветром и редеют:
       у шашки — непрозрачная стена, по ветру — всё более прозрачный шлейф;
       завеса живёт ещё 25–35 с после конца дымления.
   Рисуется так же, как дым взрывов (26_game_blast.js): billboard-клубы с обычным
   PBR-светом сцены — солнце, тени крон и построек на клубах, небо (IBL), туман,
   тон-маппинг. Атлас — кадры настоящего облака (Unity VFX Flipbooks Cloud02, CC0):
   нормаль + толщина + покрытие. Сверху:
     • самозатенение: клуб в глубине облака (по лучу на солнце) получает меньше
       прямого света, низ и сердцевина облака — меньше неба; поэтому облако
       объёмное — светлая шапка, серое брюхо, а не плоское белое пятно;
     • прямое рассеяние: тонкие края светятся против солнца;
     • сортировка от дальних к ближним, мягкий край у земли и у камеры.
   Плотность считается по клубам (сферы с мягким краем):
     • blocks(a, b) — оптическая толщина отрезка; ИИ не видит сквозь дым (C.worldVisible);
     • densityAt(p) — камера внутри облака: экран заливает серой мутью под цвет дыма. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const R = Math.random;
  const sr = (a, b) => a + R() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const CFG = {
    ignite: 2.6,          /* струя: первые секунды после воспламенения */
    full: 52,             /* ровное дымление */
    burnout: 14,          /* выгорание */
    rateJet: 10,          /* клубов/с в струе */
    rate: 4.4,            /* клубов/с в основном режиме */
    life: [24, 34],       /* жизнь основного клуба, с */
    r1: [2.1, 3.4],       /* радиус разросшегося клуба, м */
    /* выброс: струя первых секунд и ровное дымление (скорость, сопротивление воздуха, рост, всплытие) */
    jet: { v: [2.6, 4.6], drag: 2.0, r0: [0.12, 0.2], r1: [1.3, 2.0], tau: [0.8, 1.4], life: [10, 16], buoy: 0.45 },
    main: { v: [0.8, 1.9], drag: 1.6, r0: [0.3, 0.5], tau: [1.3, 2.2], buoy: 0.45 },
    turb: 0.28,           /* боковое турбулентное расплывание шлейфа, м/с */
    windK: 0.8,
    floor: 0.42,          /* центр клуба не ниже r·floor над землёй */
    tauOptic: 0.95,       /* порог «не видно» для ИИ */
    nearCull: true,       /* не отправлять квады, полностью погашенные у объектива */
    cap: { ultra: 130, low: 170, medium: 240, high: 320 }
  };
  const S = { T: null, scene: null, mesh: null, mat: null, clouds: [], puffs: [], order: [], overlay: null, ov: 0, ovCol: [150, 152, 154],
    audio: null, ground: null, sun: null, max: 200, rr: 0, sunDir: null, attrs: null, quality: 'low', stamp: 0 };

  /* запасной атлас (если нет атласа взрывов): RG — плоская нормаль, B — толщина, A — покрытие */
  function fallbackAtlas(T) {
    const N = 128, W = N * 2, data = new Uint8Array(W * W * 4);
    const rnd = (i, j, s) => { const v = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
    const noise = (x0, y0, s) => {
      const i = Math.floor(x0), j = Math.floor(y0), fx = x0 - i, fy = y0 - j;
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const a = rnd(i, j, s), b = rnd(i + 1, j, s), c = rnd(i, j + 1, s), e = rnd(i + 1, j + 1, s);
      return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
    };
    for (let q = 0; q < 4; q++) {
      const ox = (q & 1) * N, oy = (q >> 1) * N;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const u = x / N * 2 - 1, v = y / N * 2 - 1;
        let f = 0, amp = 0.5, fr = 2;
        for (let o = 0; o < 3; o++) { f += noise(x / N * fr + q * 17, y / N * fr + q * 9, q) * amp; amp *= 0.5; fr *= 2; }
        const r = Math.hypot(u, v) * (0.85 + 0.3 * f);
        const d = clamp(1 - smooth(0.25, 1, r), 0, 1);
        const k = ((oy + y) * W + ox + x) * 4;
        data[k] = 128; data[k + 1] = 128; data[k + 2] = Math.round(d * 230); data[k + 3] = Math.round(smooth(0.02, 0.6, d) * 255);
      }
    }
    const t = new T.DataTexture(data, W, W, T.RGBAFormat);
    t.colorSpace = T.NoColorSpace; t.generateMipmaps = true;
    t.minFilter = T.LinearMipmapLinearFilter; t.magFilter = T.LinearFilter; t.needsUpdate = true;
    return t;
  }

  function makeMaterial(T, atlas) {
    const mat = new T.MeshStandardMaterial({ map: atlas, roughness: 1, metalness: 0, transparent: true, depthWrite: false });
    mat.customProgramCacheKey = () => 'm18-smoke-v23';
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 iPos; attribute vec2 iSz; attribute vec4 iCol; attribute vec4 iMs;
          varying vec4 vSCol; varying vec4 vSMs; varying vec4 vSRot; varying float vSWy; varying float vSNear;`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          vMapUv = uv * 0.5 + vec2(mod(iMs.x, 2.0), floor(iMs.x * 0.5)) * 0.5;`)
        .replace('#include <beginnormal_vertex>', `
          vec3 bbR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 bbU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 objectNormal = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);`)
        .replace('#include <begin_vertex>', `
          float bc = cos(iSz.y), bs = sin(iSz.y);
          vec2 bq = vec2(bc * position.x - bs * position.y, bs * position.x + bc * position.y) * iSz.x;
          vec3 transformed = iPos + bbR * bq.x + bbU * bq.y;
          vSCol = iCol; vSMs = iMs; vSWy = transformed.y;
          vSRot = vec4(bc, bs, -bs, bc);`)
        .replace('#include <project_vertex>', `#include <project_vertex>
          vSNear = -mvPosition.z;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec4 vSCol; varying vec4 vSMs; varying vec4 vSRot; varying float vSWy; varying float vSNear;`)
        .replace('#include <map_fragment>', `
          vec4 sm = texture2D(map, vMapUv);
          float sTh = sm.b;
          /* мягкий край: у грунта (клуб стелется, а не режется землёй) и у объектива */
          float sG = smoothstep(0.0, max(0.06, 0.34 * vSMs.w), vSWy - vSMs.z);
          float sN = smoothstep(0.3, 0.3 + 0.55 * vSMs.w, vSNear);
          /* толстая середина клуба чуть темнее края (многократное рассеяние внутри) */
          diffuseColor.rgb = vSCol.rgb * mix(1.05, 0.8, sTh * sTh);
          diffuseColor.a = sm.a * vSCol.a * sG * sN;
          if (diffuseColor.a < 0.003) discard;`)
        .replace('#include <normal_fragment_maps>', `
          {
            vec2 tn2 = sm.rg * 2.0 - 1.0;
            vec3 tn = vec3(tn2, sqrt(max(0.0, 1.0 - dot(tn2, tn2))));
            vec3 bx = vec3(vSRot.xy, 0.0), by = vec3(vSRot.zw, 0.0);
            normal = normalize(bx * tn.x + by * tn.y + vec3(0.0, 0.0, tn.z * 1.2));
            /* дым светится сверху, как от неба, а не как твёрдый шар */
            normal = normalize(normal + (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz * 0.5);
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          #if NUM_DIR_LIGHTS > 0
          {
            /* прямое рассеяние (Хеньи–Гринстейн, g = 0,55): против солнца тонкие края светятся */
            vec3 sV = normalize(vViewPosition);
            float mu = dot(-directionalLights[0].direction, sV);
            float g = 0.55, ph = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) * 0.0796;
            totalEmissiveRadiance += directionalLights[0].color * diffuseColor.rgb * ph * (1.0 - 0.85 * sTh) * vSMs.y * 0.55;
          }
          #endif`)
        .replace('#include <aomap_fragment>', `
          /* самозатенение: прямой свет солнца — по лучу через облако (CPU), блика у дыма нет */
          reflectedLight.directDiffuse *= vSMs.y;
          reflectedLight.directSpecular *= 0.0;
          reflectedLight.indirectSpecular *= 0.0;
          #include <aomap_fragment>`);
    };
    return mat;
  }

  function init(ctx) {
    if (S.mesh || !ctx || !ctx.THREE || !ctx.scene) return !!S.mesh;
    const T = ctx.THREE;
    S.T = T; S.scene = ctx.scene; S.audio = ctx.audio || null; S.ground = ctx.groundAt || null; S.sun = ctx.sun || null;
    S.quality = ctx.quality || 'low';
    S.max = CFG.cap[S.quality] || CFG.cap.low;
    S.sunDir = new T.Vector3(0.4, 0.8, 0.3).normalize();
    const MAXP = CFG.cap.high;
    const base = new T.PlaneGeometry(1, 1);
    const geo = new T.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    geo.setAttribute('normal', base.attributes.normal);
    const A = S.attrs = {
      pos: new T.InstancedBufferAttribute(new Float32Array(MAXP * 3), 3).setUsage(T.DynamicDrawUsage),
      sz: new T.InstancedBufferAttribute(new Float32Array(MAXP * 2), 2).setUsage(T.DynamicDrawUsage),
      col: new T.InstancedBufferAttribute(new Float32Array(MAXP * 4), 4).setUsage(T.DynamicDrawUsage),
      ms: new T.InstancedBufferAttribute(new Float32Array(MAXP * 4), 4).setUsage(T.DynamicDrawUsage)
    };
    geo.setAttribute('iPos', A.pos); geo.setAttribute('iSz', A.sz); geo.setAttribute('iCol', A.col); geo.setAttribute('iMs', A.ms);
    geo.instanceCount = 0;
    const atlas = ctx.atlas || fallbackAtlas(T);
    const mat = S.mat = makeMaterial(T, atlas);
    const mesh = S.mesh = new T.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 7; mesh.name = 'smokeClouds';
    mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.userData.noAO = true;
    mesh.visible = false;
    ctx.scene.add(mesh);
    /* камера в облаке — муть поверх кадра (цвет — освещённый дым, не белый лист) */
    if (typeof document !== 'undefined' && document.body) {
      const el = S.overlay = document.createElement('div');
      el.id = 'smokeVeil';
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;opacity:0;transition:none';
      document.body.appendChild(el);
    }
    return true;
  }
  function setQuality(q) { S.quality = q || 'low'; S.max = CFG.cap[S.quality] || CFG.cap.low; }

  /* ---------------------------------------------------- звук --- */
  function noiseBuf(ac) {
    const n = ac.sampleRate * 2, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    let p = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; p = p * 0.6 + w * 0.4; d[i] = p * (0.8 + 0.2 * Math.sin(i / ac.sampleRate * 31)); }
    return b;
  }
  function soundStart(cl) {
    const Au = S.audio, ac = Au && Au.ctx;
    if (!ac || Au.on === false) return;
    try {
      S.nbuf = S.nbuf || noiseBuf(ac);
      const src = ac.createBufferSource(); src.buffer = S.nbuf; src.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.6;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
      const g = ac.createGain(); g.gain.value = 0;
      src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(Au.dry || Au.master);
      src.start();
      cl.snd = { src, g, lp };
      /* хлопок воспламенителя */
      const ps = ac.createBufferSource(); ps.buffer = S.nbuf;
      const pg = ac.createGain(); const pf = ac.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 1800;
      ps.connect(pf); pf.connect(pg); pg.connect(Au.dry || Au.master);
      const t0 = ac.currentTime, d = cl.camD || 10, v = clamp(1.6 / (1 + d / 6), 0.02, 0.6);
      pg.gain.setValueAtTime(v, t0); pg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
      ps.start(t0, Math.random()); ps.stop(t0 + 0.15);
    } catch (e) { cl.snd = null; }
  }
  function soundStep(cl, k) {
    const sn = cl.snd; if (!sn) return;
    const ac = S.audio.ctx, d = cl.camD || 10;
    /* струя шипит громче, ровное дымление — тише */
    const v = k * clamp(0.5 / (1 + d / 5), 0.0, 0.35) * (1 - (S.audio.deafK || 0));
    sn.g.gain.setTargetAtTime(v, ac.currentTime, 0.12);
    sn.lp.frequency.setTargetAtTime(clamp(12000 / (1 + d / 10), 900, 12000), ac.currentTime, 0.2);
    if (k <= 0 && cl.t > 5) { try { sn.src.stop(ac.currentTime + 0.5); } catch (e) { /* */ } cl.snd = null; }
  }

  /* ------------------------------------------------ облако --- */
  /* g — граната из GSIM (лежит и дымит; позиция и ось берутся каждый кадр) */
  function start(g, o) {
    if (!S.mesh) return null;
    o = o || {};
    const p = g && g.pos ? g.pos : g;
    const T = S.T;
    const cl = { g: g && g.pos ? g : null, p: new T.Vector3(p.x, p.y, p.z), ax: new T.Vector3(0, 1, 0), t: 0, acc: 0, emitting: true, puffs: 0,
      team: o.team || null, camD: 10, R: 1, c: new T.Vector3(p.x, p.y, p.z), seed: R() * 100 };
    S.clouds.push(cl);
    soundStart(cl);
    while (S.clouds.length > 6) end(S.clouds[0], true);
    return cl;
  }
  function end(cl, now) {
    cl._ended = true;
    if (cl.snd) { try { cl.snd.src.stop(); } catch (e) { /* */ } cl.snd = null; }
    if (now) { for (const q of S.puffs) if (q.cl === cl) q.dead = true; }
    const i = S.clouds.indexOf(cl); if (i >= 0) S.clouds.splice(i, 1);
  }
  /* интенсивность: струя → ровное дымление → выгорание */
  function rateAt(t) {
    if (t < CFG.ignite) return CFG.rateJet;
    if (t < CFG.ignite + 1.5) return CFG.rateJet + (CFG.rate - CFG.rateJet) * (t - CFG.ignite) / 1.5;
    if (t < CFG.ignite + CFG.full) return CFG.rate;
    const e = (t - CFG.ignite - CFG.full) / CFG.burnout;
    return e >= 1 ? 0 : CFG.rate * (1 - e) * (1 - 0.6 * e);
  }
  function emit(cl) {
    if (S.puffs.length >= S.max) {
      /* лимит: уходит самый «прожитый» (самый прозрачный) клуб */
      let o = 0, ou = -1;
      for (let i = 0; i < S.puffs.length; i++) { const q = S.puffs[i], u = q.t / q.life; if (u > ou) { ou = u; o = i; } }
      const q = S.puffs[o]; if (q.cl) q.cl.puffs--; S.puffs.splice(o, 1);
    }
    const t = cl.t, jet = t < CFG.ignite + 0.8;
    const burn = t > CFG.ignite + CFG.full ? 1 - clamp((t - CFG.ignite - CFG.full) / CFG.burnout, 0, 1) : 1;
    /* сопло — верхний торец шашки; струя по оси, у земли отражается вверх и в стороны */
    const ax = cl.ax;
    let dx = ax.x + sr(-0.45, 0.45), dy = ax.y + sr(-0.15, 0.45), dz = ax.z + sr(-0.45, 0.45);
    if (dy < 0.08) dy = 0.08 + R() * 0.25;
    const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
    const M = jet ? CFG.jet : CFG.main;
    const v = sr(M.v[0], M.v[1]) * (jet ? 1 : 0.55 + 0.45 * burn);
    const gy = S.ground ? S.ground(cl.p.x, cl.p.z) : cl.p.y - 0.03;
    /* турбулентность: у каждого клуба своё медленное боковое смещение — шлейф расплывается */
    const ta = R() * TAU, tv = CFG.turb * Math.sqrt(R());
    S.puffs.push({
      cl, x: cl.p.x + ax.x * 0.07, y: Math.max(cl.p.y + ax.y * 0.07, gy + 0.05), z: cl.p.z + ax.z * 0.07,
      vx: dx * v, vy: dy * v, vz: dz * v, tx: Math.cos(ta) * tv, tz: Math.sin(ta) * tv,
      r0: sr(M.r0[0], M.r0[1]),
      r1: jet ? sr(M.r1[0], M.r1[1]) : sr(CFG.r1[0], CFG.r1[1]) * (0.7 + 0.3 * burn),
      tau: sr(M.tau[0], M.tau[1]),
      r: 0.15, t: 0, life: jet ? sr(M.life[0], M.life[1]) : sr(CFG.life[0], CFG.life[1]),
      drag: M.drag, buoy: M.buoy,
      rot: R() * TAU, spin: sr(-0.09, 0.09), tile: (R() * 4) | 0,
      a0: (jet ? sr(0.8, 0.95) : sr(0.82, 1.0)) * (0.75 + 0.25 * burn), a: 0,
      alb: sr(0.6, 0.7), sun: 1, sunT: 1, amb: 1, ambT: 1, gy, dead: false, d2: 0
    });
    cl.puffs++;
  }
  /* ветер в точке на опорной высоте 2 м над землёй; у самой земли он слабее (логарифмический профиль, см. windK) —
     дым у шашки задерживается, верх шлейфа сносит быстрее */
  const _wind = { x: 0, z: 0 };
  function windAt(p) {
    const W = root.AEGIS_WIND ? root.AEGIS_WIND(p.x, p.gy + 2, p.z) : null;
    if (W) { _wind.x = W.x * CFG.windK; _wind.z = W.z * CFG.windK; } else { _wind.x = 0.5; _wind.z = 0.3; }
    return _wind;
  }
  const LOG101 = Math.log(101), PROF2 = Math.log(21) / LOG101;
  const windProfile = (h) => Math.min(1.3, Math.log((Math.max(0.15, h) + 0.1) / 0.1) / LOG101) / PROF2;
  /* направление на солнце (от цели света к источнику) */
  function sunDir() {
    const sun = S.sun;
    if (sun && sun.position) {
      const tx = sun.target ? sun.target.position.x : 0, ty = sun.target ? sun.target.position.y : 0, tz = sun.target ? sun.target.position.z : 0;
      S.sunDir.set(sun.position.x - tx, sun.position.y - ty, sun.position.z - tz);
      if (S.sunDir.lengthSq() < 1e-6) S.sunDir.set(0.4, 0.8, 0.3);
      S.sunDir.normalize();
    }
    return S.sunDir;
  }
  /* самозатенение части клубов за кадр (по кругу): сколько дыма по лучу на солнце
     и сколько вокруг (сердцевина облака получает меньше неба) */
  function shade(n) {
    const P = S.puffs, N = P.length; if (!N) return;
    const L = sunDir(), lx = L.x, ly = L.y, lz = L.z;
    for (let k = 0; k < n; k++) {
      const i = (S.rr = (S.rr + 1) % N), q = P[i];
      let occ = 0, near = 0, top = 0;
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const o = P[j]; if (o.a < 0.03) continue;
        const ex = o.x - q.x, ey = o.y - q.y, ez = o.z - q.z, d2 = ex * ex + ey * ey + ez * ez;
        const ro = o.r * 0.9;
        const t = ex * lx + ey * ly + ez * lz;
        if (t > -ro * 0.2) {
          const c2 = d2 - t * t, rr = ro * ro;
          if (c2 < rr) occ += o.a * (1 - Math.sqrt(c2) / ro) * 1.15;
        }
        const rs = (q.r + o.r) * 0.55;
        if (d2 < rs * rs) { near += o.a * (1 - Math.sqrt(d2) / rs); if (ey > 0) top += o.a; }
      }
      q.sunT = clamp(Math.exp(-occ * 0.9), 0.12, 1);
      q.ambT = clamp(1 - 0.12 * near - 0.08 * top, 0.5, 1);
    }
  }

  function update(dt, camera) {
    if (!S.mesh || dt <= 0) return;
    dt = Math.min(dt, 0.1);
    const cam = camera ? camera.position : null;
    for (let i = S.clouds.length - 1; i >= 0; i--) {
      const cl = S.clouds[i];
      cl.t += dt;
      if (cl.g && cl.g.pos) {
        cl.p.copy(cl.g.pos);
        if (cl.g.q) cl.ax.set(0, 1, 0).applyQuaternion(cl.g.q);
      }
      if (cam) cl.camD = cam.distanceTo(cl.p);
      const r = rateAt(cl.t);
      if (r > 0) {
        cl.acc += r * dt;
        while (cl.acc >= 1) { cl.acc -= 1; emit(cl); }
      } else cl.emitting = false;
      soundStep(cl, r > 0 ? clamp(r / CFG.rateJet, 0.25, 1) : 0);
      if (!cl.emitting && cl.puffs <= 0) end(cl, false);
    }
    const P = S.puffs;
    let wind = null, wT = 0, n = 0;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i];
      q.t += dt;
      if (q.dead || q.t >= q.life) { P.splice(i, 1); if (q.cl) q.cl.puffs--; continue; }
      if (!wind || (wT++ & 15) === 0) wind = windAt(q);
      /* выброс тормозится воздухом и уходит в ветер; горячий дым первые секунды всплывает */
      const k = 1 - Math.exp(-dt * q.drag);
      const wp = windProfile(q.y - q.gy);
      q.vx += (wind.x * wp + q.tx - q.vx) * k; q.vz += (wind.z * wp + q.tz - q.vz) * k;
      q.vy += (q.buoy * Math.exp(-q.t / 3.5) - q.vy) * (1 - Math.exp(-dt * 1.2));
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      /* рост: быстрое вовлечение воздуха, затем медленная турбулентная диффузия */
      q.r = q.r1 + (q.r0 - q.r1) * Math.exp(-q.t / q.tau) + 0.035 * q.t;
      if ((i & 7) === (wT & 7) && S.ground) q.gy = S.ground(q.x, q.z);
      const minY = q.gy + q.r * CFG.floor;
      if (q.y < minY) { q.y = minY; if (q.vy < 0) q.vy = 0; }
      q.rot += q.spin * dt;
      const u = q.t / q.life;
      /* плотность: набирается за 0,4 с, редеет по мере разрастания, тает к концу жизни */
      const thin = clamp(Math.pow(1.25 / Math.max(q.r, 0.3), 0.55), 0.34, 1);
      q.a = smooth(0, 0.4 / q.life, u) * (1 - smooth(0.5, 1, u)) * q.a0 * thin;
      q.sun += (q.sunT - q.sun) * (1 - Math.exp(-dt * 3));
      q.amb += (q.ambT - q.amb) * (1 - Math.exp(-dt * 3));
      n++;
    }
    shade(Math.min(P.length, Math.max(12, Math.ceil(P.length / 3))));
    /* порядок отрисовки: от дальних к ближним */
    const O = S.order; O.length = 0;
    let vA = 0, vS = 0;
    /* ось взгляда камеры: квад клуба параллелен экрану, его глубина одна на весь квад */
    let fx = 0, fy = 0, fz = -1;
    if (cam && camera.matrixWorld) { const e = camera.matrixWorld.elements, l = Math.hypot(e[8], e[9], e[10]) || 1; fx = -e[8] / l; fy = -e[9] / l; fz = -e[10] / l; }
    for (const q of P) {
      if (cam) {
        const dx = q.x - cam.x, dy = q.y - cam.y, dz = q.z - cam.z;
        q.d2 = dx * dx + dy * dy + dz * dz;
        const rq = q.r * 0.95;
        if (q.d2 < rq * rq) { const w = q.a * (1 - Math.sqrt(q.d2) / rq); vA += w; vS += w * (0.35 + 0.65 * q.sun) * q.amb; }
        /* клуб у самого объектива или за ним шейдер гасит целиком (мягкий край у камеры:
           smoothstep(0,3; 0,3 + 0,55·размер) по глубине) — такой квад во весь экран не
           отправляем вовсе: картинка та же, без лишней заливки экрана */
        const dep = dx * fx + dy * fy + dz * fz, e1 = 0.55 * q.r * 2.3, tN = clamp((dep - 0.3) / e1, 0, 1);
        if (CFG.nearCull && q.a * tN * tN * (3 - 2 * tN) < 0.003) continue;
      }
      O.push(q);
    }
    if (cam) O.sort((a, b) => b.d2 - a.d2);
    const A = S.attrs, iP = A.pos.array, iS = A.sz.array, iC = A.col.array, iM = A.ms.array;
    const cnt = Math.min(O.length, iP.length / 3);
    for (let k = 0; k < cnt; k++) {
      const q = O[k];
      iP[k * 3] = q.x; iP[k * 3 + 1] = q.y; iP[k * 3 + 2] = q.z;
      iS[k * 2] = q.r * 2.3; iS[k * 2 + 1] = q.rot;
      const c = q.alb * q.amb;
      iC[k * 4] = c; iC[k * 4 + 1] = c * 1.005; iC[k * 4 + 2] = c * 1.02; iC[k * 4 + 3] = q.a;
      iM[k * 4] = q.tile; iM[k * 4 + 1] = q.sun; iM[k * 4 + 2] = q.gy; iM[k * 4 + 3] = q.r * 2.3;
    }
    S.mesh.geometry.instanceCount = cnt;
    S.mesh.visible = cnt > 0;
    if (cnt) { A.pos.needsUpdate = A.sz.needsUpdate = A.col.needsUpdate = A.ms.needsUpdate = true; }
    /* камера внутри: муть под цвет освещённого дыма (днём — светло-серая, под кронами и в тени — темнее) */
    const target = vA > 1e-4 ? clamp(1 - Math.exp(-vA * 1.6), 0, 0.95) : 0;
    S.ov += (target - S.ov) * (1 - Math.exp(-dt * 6));
    if (S.overlay) {
      const v = S.ov < 0.01 ? '0' : S.ov.toFixed(3);
      if (vA > 1e-4) {
        const sunI = S.sun ? clamp(S.sun.intensity / 3, 0.25, 1.2) : 0.8;
        const lit = clamp((vS / vA) * sunI, 0.2, 1.1);
        const can = root.GGloom && cam ? root.GGloom.canopyAt(cam.x, cam.z) || 0 : 0;
        const L = clamp(lit * (1 - 0.35 * can), 0.18, 1);
        const lo = Math.round(70 + 120 * L), hi = Math.round(88 + 132 * L);
        const key = lo + ',' + hi;
        if (S.overlay._c !== key) { S.overlay._c = key; S.overlay.style.background = 'linear-gradient(to top,rgba(' + lo + ',' + lo + ',' + (lo + 3) + ',1) 0%,rgba(' + hi + ',' + hi + ',' + (hi + 4) + ',.94) 100%)'; }
      }
      if (S.overlay._v !== v) { S.overlay._v = v; S.overlay.style.opacity = v; }
    }
    /* грубые границы облаков — для быстрых проверок видимости */
    for (const cl of S.clouds) { cl.R = 0; cl.c.copy(cl.p); cl._n = 0; cl._sx = 0; cl._sy = 0; cl._sz = 0; }
    if (P.length) {
      /* центр облака — среднее по его клубам (без временных объектов в кадре) */
      for (const q of P) { const cl = q.cl; if (!cl || cl._ended) continue; cl._sx += q.x; cl._sy += q.y; cl._sz += q.z; cl._n++; }
      for (const cl of S.clouds) if (cl._n) cl.c.set(cl._sx / cl._n, cl._sy / cl._n, cl._sz / cl._n);
      for (const q of P) { const cl = q.cl; if (!cl || cl._ended) continue; const d = Math.hypot(q.x - cl.c.x, q.y - cl.c.y, q.z - cl.c.z) + q.r; if (d > cl.R) cl.R = d; }
    }
  }

  /* оптическая толщина отрезка a→b (≈ сколько «плотных клубов» на пути) */
  function depth(a, b) {
    if (!S.puffs.length) return 0;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz);
    if (L < 0.05) return 0;
    const ux = dx / L, uy = dy / L, uz = dz / L;
    let tau = 0;
    /* сначала грубые границы облаков: отрезок мимо всех облаков — дыма на пути нет
       (метка _lv вместо временного списка: проверка вызывается ИИ много раз за кадр) */
    const st = ++S.stamp;
    let nLive = 0;
    for (const cl of S.clouds) {
      const R0 = cl.R || 0; if (R0 <= 0) continue;
      const ox = cl.c.x - a.x, oy = cl.c.y - a.y, oz = cl.c.z - a.z, t = clamp(ox * ux + oy * uy + oz * uz, 0, L);
      const px = a.x + ux * t - cl.c.x, py = a.y + uy * t - cl.c.y, pz = a.z + uz * t - cl.c.z;
      if (px * px + py * py + pz * pz < R0 * R0) { cl._lv = st; nLive++; }
    }
    if (!nLive) return 0;
    for (const q of S.puffs) {
      if (q.a < 0.05 || q.dead) continue;
      if (q.cl && q.cl._lv !== st && !q.cl._ended) continue;
      const r = q.r * 0.85;
      const ox = q.x - a.x, oy = q.y - a.y, oz = q.z - a.z, t = ox * ux + oy * uy + oz * uz;
      const c2 = ox * ox + oy * oy + oz * oz - t * t;
      if (c2 >= r * r) continue;
      const h = Math.sqrt(r * r - c2);
      const t0 = clamp(t - h, 0, L), t1 = clamp(t + h, 0, L);
      if (t1 <= t0) continue;
      tau += q.a * (t1 - t0) / r * 0.75;
      if (tau > 4) return tau;
    }
    return tau;
  }
  const blocks = (a, b) => depth(a, b) > CFG.tauOptic;
  function densityAt(p) {
    let d = 0;
    for (const q of S.puffs) {
      const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z, r = q.r;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < r * r) d += q.a * (1 - Math.sqrt(d2) / r);
    }
    return d;
  }
  /* облака рядом с точкой (для ИИ: бросать ли ещё одну) */
  function near(p, r) {
    for (const cl of S.clouds) if (Math.hypot(cl.p.x - p.x, cl.p.z - p.z) < r + (cl.R || 2)) return cl;
    return null;
  }
  function clear() {
    for (const cl of S.clouds.slice()) end(cl, true);
    S.puffs.length = 0; S.order.length = 0;
    if (S.mesh) { S.mesh.geometry.instanceCount = 0; S.mesh.visible = false; }
    S.ov = 0; if (S.overlay) { S.overlay.style.opacity = '0'; S.overlay._v = '0'; }
  }
  root.GSmoke = { init, start, update, blocks, depth, densityAt, near, clear, setQuality, CFG,
    state: () => ({ clouds: S.clouds.length, puffs: S.puffs.length, veil: +S.ov.toFixed(2), max: S.max }),
    _S: S };
})(typeof self !== 'undefined' ? self : this);
