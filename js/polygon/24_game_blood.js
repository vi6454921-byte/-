
/* ==========================================================================
   МОДУЛЬ: game/blood.js
   ========================================================================== */
/* ============================================================================
   Кровь: брызги, взвесь, капли, пятна на грунте и лужа под телом.

   Пуля 5,45×39 входит в тело и почти всегда выходит, кувыркаясь. У входа —
   короткий обратный выброс мелкой взвеси (backspatter: капли < 1 мм,
   1–4 м/с), у выхода — конус крупных капель по ходу пули (forward spatter:
   1–4 мм, 4–12 м/с) и облачко аэрозоля, которое за 0,3–0,6 с расплывается
   и оседает. Капли летят по баллистике с сопротивлением воздуха (мелкие
   тормозят сильнее) и, упав на грунт, оставляют пятна: круглые с венчиком
   при отвесном падении, вытянутые «восклицательные знаки» — при косом;
   размер пятна растёт со скоростью удара.

   Убитый истекает кровью: пока тело падает, из раны капает, после падения
   под раной растёт лужа — быстро в первые секунды, потом медленнее; край
   неровный, с языками вниз по уклону. Свежая кровь глянцевая, почти
   чёрно-красная, тонкий край светлее; за минуты она темнеет, матовеет и
   буреет, по краю проступает тёмный ободок. Пятна и лужи лежат по рельефу,
   остаются после возрождения бойца и через несколько минут выцветают.
   ========================================================================== */
(function (root, factory) {
  const B = factory(root.GUtil);
  if (typeof module !== 'undefined' && module.exports) module.exports = B;
  else root.GBlood = B;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';
  const TAU = Math.PI * 2;
  const R = Math.random;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const rr = (a, b) => a + (b - a) * R();

  /* срок жизни следов, с */
  const SPLAT_LIFE = 330, POOL_LIFE = 420;

  /* ------------------------------------------------------- текстуры --- */
  /* Атлас пятен 4×2: верхний ряд — отвесные капли (круглое пятно с
     зубчатым венчиком и брызгами-спутниками), нижний — косые (вытянутое
     пятно с хвостом и отлетевшей каплей впереди). R — толщина слоя
     (центр толще), A — покрытие. */
  function splatAtlas() {
    const T = 128, cv = document.createElement('canvas');
    cv.width = T * 4; cv.height = T * 2;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, cv.width, cv.height);
    const blob = (cx, cy, r0, k, seed, sx) => {
      const n = 56, ph = [R() * TAU, R() * TAU, R() * TAU, R() * TAU];
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = i / n * TAU;
        let r = r0 * (1 + k * (0.5 * Math.sin(3 * a + ph[0]) + 0.3 * Math.sin(5 * a + ph[1]) + 0.2 * Math.sin(9 * a + ph[2])));
        const x = cx + Math.cos(a) * r * (sx || 1), y = cy + Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r0 * 1.15 * (sx || 1));
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.7, 'rgba(205,205,205,1)');
      gr.addColorStop(1, 'rgba(150,150,150,1)');
      g.fillStyle = gr;
      g.fill();
    };
    const dot = (x, y, r, a) => {
      g.beginPath(); g.arc(x, y, r, 0, TAU);
      g.fillStyle = 'rgba(170,170,170,' + (a || 1) + ')'; g.fill();
    };
    for (let k = 0; k < 8; k++) {
      const ox = (k % 4) * T, oy = Math.floor(k / 4) * T, cx = ox + T / 2, cy = oy + T / 2;
      g.save();
      g.beginPath(); g.rect(ox + 1, oy + 1, T - 2, T - 2); g.clip();
      if (k < 4) {
        const r0 = rr(15, 21);
        /* венчик: короткие лучи-зубцы по краю */
        const nsp = 9 + Math.floor(R() * 10);
        for (let i = 0; i < nsp; i++) {
          const a = R() * TAU, L = r0 * rr(1.08, 1.55), w = rr(1.2, 2.6);
          g.beginPath();
          g.moveTo(cx + Math.cos(a + 0.18) * r0 * 0.8, cy + Math.sin(a + 0.18) * r0 * 0.8);
          g.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L);
          g.lineTo(cx + Math.cos(a - 0.18) * r0 * 0.8, cy + Math.sin(a - 0.18) * r0 * 0.8);
          g.closePath(); g.fillStyle = 'rgba(175,175,175,1)'; g.fill();
          dot(cx + Math.cos(a) * L, cy + Math.sin(a) * L, w * 0.8);
        }
        blob(cx, cy, r0, 0.10 + k * 0.03);
        /* спутники */
        const ns = 6 + Math.floor(R() * 14);
        for (let i = 0; i < ns; i++) {
          const a = R() * TAU, d = r0 * rr(1.4, 2.7);
          dot(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr(0.8, 3.2) * (1.6 - d / (r0 * 2.7)));
        }
      } else {
        /* косая капля: эллипс 1:2,2, хвост вперёд (+x), отлетевшая капля */
        const r0 = rr(11, 15), cx2 = cx - 14;
        blob(cx2, cy, r0, 0.08, 0, rr(1.6, 2.2));
        g.beginPath();
        g.moveTo(cx2 + r0 * 1.4, cy - r0 * 0.45);
        g.quadraticCurveTo(cx2 + r0 * 3.0, cy - r0 * 0.12, cx2 + r0 * 3.6, cy);
        g.quadraticCurveTo(cx2 + r0 * 3.0, cy + r0 * 0.12, cx2 + r0 * 1.4, cy + r0 * 0.45);
        g.closePath(); g.fillStyle = 'rgba(165,165,165,1)'; g.fill();
        dot(cx2 + r0 * 4.3, cy + rr(-1.5, 1.5), rr(2.0, 3.4));
        const ns = 3 + Math.floor(R() * 6);
        for (let i = 0; i < ns; i++) {
          const a = rr(-0.5, 0.5), d = r0 * rr(2.0, 4.4);
          dot(cx2 + Math.cos(a) * d, cy + Math.sin(a) * d, rr(0.7, 2.0));
        }
      }
      g.restore();
    }
    return cv;
  }

  /* Карта растекания лужи: R — «время прихода» крови в точку (0 — центр,
     1 — предельный край). Край неровный, несколько языков, в одну сторону
     (по оси +u) — длинный язык: его разворачивают вниз по уклону. */
  function poolSpread(seed) {
    const N = 256, cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const g = cv.getContext('2d', { willReadFrequently: true }), img = g.createImageData(N, N), d = img.data;
    const ph = [], fr = [3, 5, 7, 11, 17];
    for (let i = 0; i < fr.length; i++) ph.push(R() * TAU);
    const lobes = [];
    lobes.push({ a: 0, w: 0.30, L: rr(0.20, 0.30) });
    const nl = 2 + Math.floor(R() * 3);
    for (let i = 0; i < nl; i++) lobes.push({ a: R() * TAU, w: rr(0.12, 0.30), L: rr(0.06, 0.16) });
    const bnd = (a) => {
      let b = 0.60;
      b += 0.055 * Math.sin(3 * a + ph[0]) + 0.04 * Math.sin(5 * a + ph[1]) + 0.025 * Math.sin(7 * a + ph[2])
        + 0.015 * Math.sin(11 * a + ph[3]) + 0.01 * Math.sin(17 * a + ph[4]);
      for (const l of lobes) {
        let da = Math.abs(((a - l.a) % TAU + TAU) % TAU);
        if (da > Math.PI) da = TAU - da;
        b += l.L * Math.exp(-(da * da) / (l.w * l.w));
      }
      return Math.min(0.96, b);
    };
    /* мелкий шум края */
    const nz = (x, y) => Math.sin(x * 23.1 + seed) * Math.sin(y * 19.7 - seed * 0.7) * 0.5 + Math.sin(x * 51.3 - y * 47.9 + seed * 2.1) * 0.5;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N * 2 - 1, y = (j + 0.5) / N * 2 - 1;
      const r = Math.hypot(x, y), a = Math.atan2(y, x);
      let t = r / bnd(a) + nz(x, y) * 0.025;
      t = clamp(t, 0, 1);
      const k = (j * N + i) * 4;
      d[k] = Math.round(t * 255); d[k + 1] = 0; d[k + 2] = 0; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cv;
  }

  /* мягкое облачко взвеси */
  function mistCanvas() {
    const N = 64, cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0.85)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, N, N);
    /* крапинки: взвесь неоднородна */
    for (let i = 0; i < 70; i++) {
      const a = R() * TAU, d = Math.pow(R(), 0.7) * N * 0.42;
      g.beginPath(); g.arc(N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d, rr(0.6, 1.8), 0, TAU);
      g.fillStyle = 'rgba(255,255,255,' + rr(0.2, 0.6).toFixed(2) + ')'; g.fill();
    }
    return cv;
  }

  function create(THREE, o) {
    const scene = o.scene;
    const groundAt = o.groundAt || (() => 0);
    const BL = { t: 0, group: new THREE.Group(), stats: { drops: 0, splats: 0, pools: 0 } };
    BL.group.name = 'blood';
    scene.add(BL.group);
    const V = () => new THREE.Vector3();
    const _a = V(), _b = V(), _n = V(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = V();
    const UP = new THREE.Vector3(0, 1, 0);
    const normalAt = (x, z, out) => {
      const e = 0.12;
      const hx = groundAt(x + e, z) - groundAt(x - e, z), hz = groundAt(x, z + e) - groundAt(x, z - e);
      return out.set(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
    };

    /* --------------------------------------------------- капли --- */
    const DN = 2600;
    const dPos = new Float32Array(DN * 3), dCol = new Float32Array(DN * 4), dSize = new Float32Array(DN);
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3).setUsage(THREE.DynamicDrawUsage));
    dGeo.setAttribute('aCol', new THREE.BufferAttribute(dCol, 4).setUsage(THREE.DynamicDrawUsage));
    dGeo.setAttribute('aSize', new THREE.BufferAttribute(dSize, 1).setUsage(THREE.DynamicDrawUsage));
    const dMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 400 } }]),
      vertexShader: `
        attribute float aSize; attribute vec4 aCol;
        uniform float uScale;
        varying vec4 vCol;
        #include <common>
        #include <fog_pars_vertex>
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float px = aSize * uScale / max(0.05, -mvPosition.z);
          float pc = max(px, 2.0);
          gl_PointSize = pc;
          vCol = aCol;
          /* субпиксельная капля — бледнее, а не крупнее */
          vCol.a *= clamp(px / pc, 0.4, 1.0);
          #include <fog_vertex>
        }`,
      fragmentShader: `
        varying vec4 vCol;
        #include <common>
        #include <fog_pars_fragment>
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r2 = dot(d, d) * 4.0;
          if (r2 > 1.0 || vCol.a < 0.003) discard;
          float a = vCol.a * (1.0 - smoothstep(0.55, 1.0, r2));
          /* капля — шарик: блик сверху, низ темнее */
          vec3 c = vCol.rgb * (0.72 + 0.55 * (0.5 - d.y)) + vec3(0.06, 0.03, 0.03) * smoothstep(0.25, 0.0, length(d - vec2(-0.12, -0.16)));
          gl_FragColor = vec4(c, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true
    });
    const dropPts = new THREE.Points(dGeo, dMat);
    dropPts.frustumCulled = false;
    dropPts.renderOrder = 5;
    BL.group.add(dropPts);
    const drops = [];
    /* v15: есть ли живые капли — в спокойном кадре цикл по 2600 каплям пропускается */
    let dLive = false;
    for (let i = 0; i < DN; i++) drops.push({ on: false, p: V(), v: V(), r: 0.001, t: 0, ttl: 3, dark: 1, splat: true });
    let dI = 0;
    /* r — радиус капли, м; splat — оставить пятно */
    function drop(p, v, r, splat, dark) {
      const d = drops[dI = (dI + 1) % DN];
      d.on = true; d.p.copy(p); d.v.copy(v); d.r = r; d.t = 0; d.ttl = 4; dLive = true;
      d.splat = splat !== false; d.dark = dark === undefined ? rr(0.8, 1.15) : dark;
      BL.stats.drops++;
      return d;
    }
    BL.drop = drop;

    /* ------------------------------------------------ взвесь --- */
    const mistTex = new THREE.CanvasTexture(mistCanvas());
    const MN = 72, mists = [];
    for (let i = 0; i < MN; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: mistTex, color: 0x6e0b08, transparent: true, opacity: 0, depthWrite: false, fog: true
      }));
      sp.visible = false;
      sp.renderOrder = 6;
      BL.group.add(sp);
      mists.push({ o: sp, t: 99, ttl: 0.5, v: V(), r0: 0.05, r1: 0.3, op: 0.5 });
    }
    let mI = 0;
    function mist(p, v, r0, r1, ttl, op, color) {
      const m = mists[mI = (mI + 1) % MN];
      m.t = 0; m.ttl = ttl; m.r0 = r0; m.r1 = r1; m.op = op;
      m.v.copy(v);
      m.o.position.copy(p);
      m.o.material.color.set(color === undefined ? 0x6e0b08 : color);
      m.o.material.rotation = R() * TAU;
      m.o.visible = true;
    }
    BL.mist = mist;

    /* ------------------------------------------- пятна на грунте --- */
    const SN = 720;
    const atlas = new THREE.CanvasTexture(splatAtlas());
    atlas.anisotropy = 4;
    const sGeo = new THREE.PlaneGeometry(1, 1);
    sGeo.rotateX(-Math.PI / 2);
    const aTile = new Float32Array(SN * 2), aBirth = new Float32Array(SN).fill(-1e6), aThick = new Float32Array(SN).fill(1);
    sGeo.setAttribute('aTile', new THREE.InstancedBufferAttribute(aTile, 2).setUsage(THREE.DynamicDrawUsage));
    sGeo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(aBirth, 1).setUsage(THREE.DynamicDrawUsage));
    sGeo.setAttribute('aThick', new THREE.InstancedBufferAttribute(aThick, 1).setUsage(THREE.DynamicDrawUsage));
    const uTime = { value: 0 };
    const BLOOD_GLSL = `
      vec3 bloodColor(float thick, float dry) {
        vec3 fresh = mix(vec3(0.105, 0.0055, 0.0045), vec3(0.040, 0.0022, 0.0018), thick);
        vec3 dried = mix(vec3(0.050, 0.017, 0.010), vec3(0.024, 0.007, 0.0045), thick);
        return mix(fresh, dried, dry);
      }`;
    const sMat = new THREE.MeshStandardMaterial({
      map: atlas, transparent: true, depthWrite: false, roughness: 0.5, metalness: 0, envMapIntensity: 0.05,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3
    });
    sMat.customProgramCacheKey = () => 'blood-splat';
    sMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec2 aTile; attribute float aBirth; attribute float aThick;
          uniform float uTime;
          varying float vAge; varying float vThick;`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          vMapUv = vMapUv * vec2(0.25, 0.5) + aTile;
          vAge = uTime - aBirth; vThick = aThick;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vAge; varying float vThick;
          ${BLOOD_GLSL}`)
        .replace('#include <map_fragment>', `
          vec4 bt = texture2D(map, vMapUv);
          float bDry = smoothstep(20.0, 200.0, vAge);
          float bFade = 1.0 - smoothstep(${(SPLAT_LIFE - 60).toFixed(1)}, ${SPLAT_LIFE.toFixed(1)}, vAge);
          diffuseColor.rgb = bloodColor(clamp(bt.r * vThick, 0.0, 1.0), bDry);
          diffuseColor.a *= smoothstep(0.08, 0.5, bt.a) * bFade;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(0.5, 0.9, bDry) + (1.0 - bt.r) * 0.2;`);
    };
    const splats = new THREE.InstancedMesh(sGeo, sMat, SN);
    splats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    splats.frustumCulled = false;
    splats.renderOrder = 2;
    splats.receiveShadow = true;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < SN; i++) splats.setMatrixAt(i, _m);
    BL.group.add(splats);
    let sI = 0;
    /* p — точка на грунте, size — поперечник квадрата, м; dirX/dirZ —
       направление удара (для косых пятен), tile: 0..3 — круглые, 4..7 — косые */
    function splat(p, size, tile, dirX, dirZ, stretch, thick) {
      const i = sI = (sI + 1) % SN;
      const y = groundAt(p.x, p.z);
      normalAt(p.x, p.z, _n);
      const yaw = dirX !== undefined && (dirX || dirZ) ? Math.atan2(-dirZ, dirX) : R() * TAU;
      _q.setFromUnitVectors(UP, _n).multiply(_q2.setFromAxisAngle(UP, yaw));
      _s.set(size * (stretch || 1), 1, size);
      _m.compose(_a.set(p.x, y + 0.006 + R() * 0.002, p.z), _q, _s);
      splats.setMatrixAt(i, _m);
      aTile[i * 2] = (tile % 4) * 0.25; aTile[i * 2 + 1] = tile < 4 ? 0.5 : 0.0;
      aBirth[i] = BL.t; aThick[i] = thick === undefined ? 1 : thick;
      splats.instanceMatrix.needsUpdate = true;
      sGeo.attributes.aTile.needsUpdate = true;
      sGeo.attributes.aBirth.needsUpdate = true;
      sGeo.attributes.aThick.needsUpdate = true;
      BL.stats.splats++;
    }
    BL.splat = splat;
    /* пятно от упавшей капли: размер — от объёма и скорости удара */
    function dropSplat(d) {
      const vh = Math.hypot(d.v.x, d.v.z), vs = d.v.length();
      /* поперечник пятна; ×1,4 — пятно в атласе занимает треть плитки */
      const D = 2 * d.r * (2.2 + 0.42 * vs) * 1.4;
      const oblique = vh > 1.2 && vh > Math.abs(d.v.y) * 0.9;
      if (oblique) splat(d.p, D * 2.4, 4 + Math.floor(R() * 4), d.v.x / vh, d.v.z / vh, clamp(vh / Math.max(0.5, Math.abs(d.v.y)), 1, 1.8), d.dark);
      else splat(d.p, D * 2.3, Math.floor(R() * 4), undefined, undefined, 1, d.dark);
    }

    /* ---------------------------------------------------- лужи --- */
    const spreadTex = [];
    for (let k = 0; k < 3; k++) {
      const t = new THREE.CanvasTexture(poolSpread(k * 7.3 + 1.1));
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      spreadTex.push(t);
    }
    const pools = [];
    const PN = 20;
    function makePool(x, z, Rm, opts) {
      opts = opts || {};
      if (pools.length >= PN) { const old = pools.shift(); BL.group.remove(old.mesh); old.mesh.geometry.dispose(); old.mesh.material.dispose(); }
      /* язык лужи — вниз по уклону */
      normalAt(x, z, _n);
      const downA = Math.hypot(_n.x, _n.z) > 0.02 ? Math.atan2(_n.z, _n.x) : R() * TAU;
      const RINGS = 14, SEGS = 56;
      const pos = [], uv = [], idx = [];
      const y0 = groundAt(x, z);
      const ca = Math.cos(-downA), sa = Math.sin(-downA);
      pos.push(0, groundAt(x, z) - y0 + 0.009, 0); uv.push(0.5, 0.5);
      for (let r = 1; r <= RINGS; r++) {
        const rad = Rm * r / RINGS;
        for (let s2 = 0; s2 < SEGS; s2++) {
          const a = s2 / SEGS * TAU;
          const lx = Math.cos(a) * rad, lz = Math.sin(a) * rad;
          pos.push(lx, groundAt(x + lx, z + lz) - y0 + 0.009, lz);
          /* в текстуре язык смотрит по +u: поворачиваем к уклону */
          const ux = (lx * ca - lz * sa) / Rm, uz = (lx * sa + lz * ca) / Rm;
          uv.push(0.5 + 0.5 * ux, 0.5 + 0.5 * uz);
        }
      }
      for (let s2 = 0; s2 < SEGS; s2++) idx.push(0, 1 + (s2 + 1) % SEGS, 1 + s2);
      for (let r = 1; r < RINGS; r++) {
        const a0 = 1 + (r - 1) * SEGS, a1 = 1 + r * SEGS;
        for (let s2 = 0; s2 < SEGS; s2++) {
          const s3 = (s2 + 1) % SEGS;
          idx.push(a0 + s2, a0 + s3, a1 + s2, a0 + s3, a1 + s3, a1 + s2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const U3 = { uGrow: { value: 0 }, uDry: { value: 0 }, uFade: { value: 1 } };
      const mat = new THREE.MeshStandardMaterial({
        map: spreadTex[Math.floor(R() * spreadTex.length)], transparent: true, depthWrite: false,
        roughness: 0.4, metalness: 0, envMapIntensity: 0.05,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -4
      });
      mat.customProgramCacheKey = () => 'blood-pool';
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U3);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
            uniform float uGrow, uDry, uFade;
            ${BLOOD_GLSL}`)
          .replace('#include <map_fragment>', `
            float pThr = texture2D(map, vMapUv).r;
            float pEdge = uGrow - pThr;
            float pCover = smoothstep(-0.004, 0.010, pEdge) * step(pThr, 0.985);
            /* подстилка: хвоинки, веточки и листья торчат сквозь кровь,
               тонкий слой уходит в грунт пятнами */
            vec2 lq = vMapUv * 38.0;
            float lit = fract(sin(dot(floor(lq), vec2(12.9898, 78.233))) * 43758.5453);
            float lit2 = fract(sin(dot(floor(lq * 2.7 + 3.1), vec2(39.346, 11.135))) * 24634.6345);
            float pBreak = smoothstep(0.55, 0.9, lit * 0.6 + lit2 * 0.4) * (1.0 - smoothstep(0.02, 0.09, pEdge));
            pCover *= 1.0 - pBreak * 0.85;
            /* лужа — слой 2–4 мм с валиком по краю (поверхностное натяжение):
               тонкая кайма узкая; за краем — впитавшаяся в подстилку кровь,
               тёмная и матовая */
            float pThick = clamp(pEdge * 5.0, 0.0, 1.0);
            float pSoak = smoothstep(-0.045, -0.002, pEdge) * step(pThr, 0.985) * (1.0 - pCover);
            vec3 pCol = bloodColor(pThick, uDry);
            /* засыхающий край темнеет ободком */
            float pRim = smoothstep(0.0, 0.006, pEdge) * (1.0 - smoothstep(0.008, 0.025, pEdge));
            pCol *= 1.0 - pRim * (0.25 + 0.45 * uDry);
            pCol = mix(pCol, vec3(0.030, 0.007, 0.004), pSoak);
            diffuseColor.rgb = pCol;
            diffuseColor.a = (pCover * mix(0.8, 0.97, pThick) + pSoak * 0.6 * min(1.0, uGrow * 3.0)) * uFade;
            /* мокрый блеск — только там, где слой толстый: на подстилке
               кровь впитывается и почти матовая (иначе в ней отражается
               серое небо, и лужа выглядит розово-белёсой) */
            float pWet = pCover * smoothstep(0.25, 0.9, pThick);`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
            roughnessFactor = mix(mix(0.92, 0.32, pWet), 0.8, uDry);`);
      };
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y0, z);
      mesh.renderOrder = 1;
      mesh.receiveShadow = true;
      BL.group.add(mesh);
      const P = { mesh, U: U3, t: 0, tau: opts.tau || 3.0, gMax: opts.gMax || 1, feed: true, x, z, R: Rm };
      pools.push(P);
      BL.stats.pools++;
      return P;
    }
    BL.pool = makePool;

    /* --------------------------------------- попадание пули --- */
    /* толщина тела по ходу пули — до выходного отверстия, м */
    const THRU = { head: 0.17, neck: 0.11, thorax: 0.24, abdomen: 0.22, pelvis: 0.2, uarm: 0.09, farm: 0.07, hand: 0.04, thigh: 0.15, shin: 0.10, foot: 0.08 };
    const _d = V(), _e = V(), _v = V(), _w = V();
    function cone(dir, spread, out) {
      /* случайное направление в конусе вокруг dir */
      _w.set(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(2 * spread);
      return out.copy(dir).add(_w).normalize();
    }
    /* Пулевое попадание (судебно-медицинские данные о брызгах крови):
       • обратный выброс у входа — струйки 6–45 м/с длительностью 60–100 мс,
         конус ±13–45°, капли < 1 мм и аэрозоль (misting) при высокой энергии;
       • прямой выброс из выходного отверстия — крупнее, шире и дальше
         (до 2–3 м по ходу пули), облако аэрозоля и косые следы на грунте за целью.
       Для игры добавлена короткая «вспышка» алой взвеси у входа — так попадание
       читается на 20–50 м, где капли меньше пикселя. */
    BL.hit = (pos, dir, opt) => {
      opt = opt || {};
      const k = (opt.scale||1)*((globalThis.AEGIS_SETTINGS||{}).gore??1), fatal = !!opt.fatal, corpse = !!opt.corpse;
      _d.copy(dir).normalize();
      /* вход: обратный выброс */
      const nb = Math.round((26 + R() * 18) * k);
      for (let i = 0; i < nb; i++) {
        const fast = R() < 0.55;
        cone(_e.copy(_d).negate(), fast ? 0.32 : 0.75, _v).multiplyScalar(fast ? rr(3, 9) : rr(0.8, 3.2));
        _v.y += rr(0.0, 0.7);
        drop(pos, _v, fast ? rr(0.0003, 0.0008) : rr(0.0006, 0.0015), R() < 0.6);
      }
      /* вспышка взвеси у входа: яркая, 0,15–0,25 с */
      mist(_a.copy(pos).addScaledVector(_d, -0.03), _v.copy(_d).multiplyScalar(-1.4), 0.04, rr(0.2, 0.3) * Math.sqrt(k), rr(0.16, 0.24), corpse ? 0.55 : 0.85, 0xa3170f);
      mist(_a.copy(pos).addScaledVector(_d, -0.06), _v.copy(_d).multiplyScalar(-0.6).add(_w.set(0, 0.15, 0)), 0.05, rr(0.3, 0.42) * Math.sqrt(k), rr(0.5, 0.75), 0.42, 0x7a0f0a);
      if (opt.exit === false) {
        /* пуля застряла: из раневого канала — короткий плевок крови вниз */
        for (let i = 0; i < 6 * k; i++) drop(pos, _v.set(rr(-0.3, 0.3), rr(-0.4, 0.3), rr(-0.3, 0.3)).addScaledVector(_d, -0.4), rr(0.0012, 0.0026));
        return;
      }
      /* выход: конус крупных капель и облако аэрозоля по ходу пули */
      const thru = THRU[opt.zone] || 0.2;
      const ex = _b.copy(pos).addScaledVector(_d, thru);
      const nf = Math.round((48 + R() * 30) * k * (fatal ? 1.3 : 1));
      for (let i = 0; i < nf; i++) {
        const big = R() < 0.3;
        const sp = cone(_d, big ? 0.42 : 0.28, _v);
        sp.multiplyScalar(big ? rr(1.5, 4.5) : rr(3, 11));
        drop(ex, sp, big ? rr(0.0018, 0.004) : rr(0.0006, 0.0018));
      }
      /* аэрозоль: три-четыре облачка, дальнее — крупнее */
      const nm = fatal ? 4 : 3;
      for (let i = 0; i < nm; i++) {
        const f = (i + 1) / nm;
        _e.copy(ex).addScaledVector(_d, 0.05 + 0.16 * i);
        mist(_e, _v.copy(_d).multiplyScalar(rr(1.4, 3.0) * f).add(_w.set(rr(-0.2, 0.2), rr(-0.1, 0.25), rr(-0.2, 0.2))),
          0.08, (0.4 + 0.36 * f) * k * (fatal ? 1.3 : 1), rr(0.55, 0.9), (0.9 - 0.12 * i) * (fatal ? 1 : 0.85), i ? 0x7c120e : 0x9a150e);
      }
      /* косые следы на грунте за целью: часть струи долетает до земли сразу */
      const gx = _d.x, gz = _d.z, gl = Math.hypot(gx, gz);
      if (gl > 0.2 && ex.y < 2.2) {
        const n = Math.round((3 + R() * 4) * k);
        for (let i = 0; i < n; i++) {
          const dd = rr(0.4, 1.6 + ex.y), j = rr(-0.25, 0.25) * dd;
          _e.set(ex.x + gx / gl * dd - gz / gl * j, 0, ex.z + gz / gl * dd + gx / gl * j);
          splat(_e, rr(0.04, 0.13) * Math.sqrt(k), 4 + Math.floor(R() * 4), gx / gl, gz / gl, rr(1.3, 2.2), rr(0.8, 1.15));
        }
      }
    };

    /* ------------------------------- артериальная струя --- */
    /* Пульсирующий выброс из перебитого сосуда или культи: ~1,2 удара
       в секунду, напор слабеет по мере кровопотери. posFn/dirFn
       возвращают текущие точку и направление (тело движется). */
    const jets = [];
    BL.spurt = (posFn, dirFn, opt) => {
      opt = opt || {};
      if (jets.length > 10) jets.shift();
      jets.push({ posFn, dirFn, t: 0, dur: opt.dur || 8, k: opt.k || 1, acc: 0, ph: R() * TAU, hz: rr(1.05, 1.5) });
    };
    function updateJets(dt) {
      for (let i = jets.length - 1; i >= 0; i--) {
        const J = jets[i];
        J.t += dt;
        if (J.t > J.dur) { jets.splice(i, 1); continue; }
        const fall = Math.exp(-J.t / (J.dur * 0.45));
        const beat = Math.pow(Math.max(0, Math.sin(J.ph + J.t * J.hz * TAU)), 3);
        const p = J.posFn(), d = J.dirFn();
        if (!p || !d) continue;
        J.acc += (8 + 70 * beat) * fall * J.k * dt;
        while (J.acc >= 1) {
          J.acc -= 1;
          cone(_e.copy(d).normalize(), 0.16, _v).multiplyScalar((0.8 + 3.4 * beat) * (0.5 + 0.5 * fall) * rr(0.8, 1.2));
          _v.y += 0.3;
          drop(p, _v, R() < 0.3 ? rr(0.0018, 0.0034) : rr(0.0008, 0.0018));
        }
        if (beat > 0.9 && R() < 6 * dt) mist(p, _w.copy(d).multiplyScalar(0.8), 0.02, 0.1 * J.k, 0.35, 0.35);
      }
    }
    BL._jets = jets;
    /* фонтан из места отрыва: ведро крови и облако взвеси */
    BL.gush = (pos, dir, k) => {
      k = k || 1;
      const n = Math.round(110 * k);
      for (let i = 0; i < n; i++) {
        cone(_e.copy(dir).normalize(), 0.6, _v).multiplyScalar(rr(1, 7));
        _v.y += rr(0, 1.5);
        drop(pos, _v, R() < 0.35 ? rr(0.002, 0.0045) : rr(0.0007, 0.002));
      }
      for (let i = 0; i < 3; i++)
        mist(_e.copy(pos).add(_w.set(rr(-0.1, 0.1), rr(-0.05, 0.15), rr(-0.1, 0.1))), _v.copy(dir).multiplyScalar(rr(0.6, 1.8)), 0.06, rr(0.45, 0.8) * k, rr(0.6, 1), 0.55, 0x6a0b08);
    };

    /* ----------------------------------------------- подрыв --- */
    /* разрыв мины рядом с бойцом: ноги и низ корпуса в клочья не
       рисуем, но кровь — во все стороны вверх, широким веером */
    BL.blast = (pos, k) => {
      k = k || 1;
      const n = Math.round(260 * k);
      for (let i = 0; i < n; i++) {
        const a = R() * TAU, up = rr(0.15, 1.0);
        _v.set(Math.cos(a) * (1 - up * 0.6), up, Math.sin(a) * (1 - up * 0.6)).normalize().multiplyScalar(rr(2, 11));
        drop(_e.copy(pos).add(_w.set(rr(-0.15, 0.15), rr(0, 0.5), rr(-0.15, 0.15))), _v, R() < 0.3 ? rr(0.002, 0.0045) : rr(0.0007, 0.002));
      }
      for (let i = 0; i < 4; i++)
        mist(_e.copy(pos).add(_w.set(rr(-0.3, 0.3), rr(0.2, 0.8), rr(-0.3, 0.3))), _v.set(rr(-0.6, 0.6), rr(0.2, 1.0), rr(-0.6, 0.6)), 0.1, rr(0.6, 0.9) * k, rr(0.8, 1.2), 0.4, 0x5a0a07);
      /* сразу — крупные пятна вокруг */
      for (let i = 0; i < 16 * k; i++) {
        const a = R() * TAU, d = rr(0.2, 2.4);
        _e.set(pos.x + Math.cos(a) * d, 0, pos.z + Math.sin(a) * d);
        splat(_e, rr(0.07, 0.22), Math.floor(R() * 8), Math.cos(a), Math.sin(a), rr(1, 1.6), rr(0.8, 1.2));
      }
    };

    /* -------------------------------------- кровотечение тела --- */
    /* Источник — частица рэгдолла у раны. Пока тело падает, из раны
       капает; когда легло — под раной растёт лужа. */
    const bleeders = [];
    /* Радиус пятна под телом, м. Сердце остановилось — кровь вытекает
       только самотёком; 0,5–1 л на лесной подстилке (хвоя, листья, гумус)
       большей частью впитывается: пятно 25–55 см, растёт минутами, а не
       секундами. Обширнее — только сосуд/подрыв. */
    const ZONE_POOL = { head: 0.42, helmet: 0.32, neck: 0.5, thorax: 0.46, abdomen: 0.44, pelvis: 0.4, thigh: 0.44, uarm: 0.26, farm: 0.22, hand: 0.18, shin: 0.24, foot: 0.2, blast: 0.7, stump: 0.6 };
    BL.bleed = (s, pi, zone, opt) => {
      opt = opt || {};
      const rd = s.rd;
      if (!rd) return;
      for (let i = bleeders.length - 1; i >= 0; i--) if (bleeders[i].s === s) bleeders.splice(i, 1);
      bleeders.push({ s, rd, pi, zone, t: 0, prev: null, still: 0, pool: null, acc: 0,
        R: (ZONE_POOL[zone] || 0.55) * rr(0.85, 1.15) * (opt.scale || 1), rate: opt.rate || 1 });
    };
    /* живой раненый: капли из раны (pos — мировая точка раны) */
    BL.dripAt = (pos, vel) => {
      drop(pos, _v.set(rr(-0.05, 0.05), rr(-0.2, 0), rr(-0.05, 0.05)).add(vel || _w.set(0, 0, 0)), rr(0.0015, 0.0028));
    };

    function updateBleeders(dt) {
      for (let k = bleeders.length - 1; k >= 0; k--) {
        const b = bleeders[k];
        b.t += dt;
        const alive = b.s.rd === b.rd;
        if (!alive) { if (b.pool) b.pool.feed = false; bleeders.splice(k, 1); continue; }
        const p = b.rd.p, i = b.pi;
        const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
        if (!b.prev) b.prev = V().set(x, y, z);
        _v.set(x - b.prev.x, y - b.prev.y, z - b.prev.z).divideScalar(Math.max(dt, 1e-3));
        b.prev.set(x, y, z);
        const spd = _v.length();
        /* капли: в полёте тела — часто, после — реже */
        const rate = (b.t < 3 ? 7 * Math.exp(-b.t / 1.0) + 1.2 : 0.35 * Math.exp(-(b.t - 3) / 25)) * b.rate;
        b.acc += rate * dt;
        while (b.acc >= 1) {
          b.acc -= 1;
          _e.set(x + rr(-0.04, 0.04), y + rr(-0.02, 0.03), z + rr(-0.04, 0.04));
          drop(_e, _w.copy(_v).multiplyScalar(0.9).add(_a.set(rr(-0.25, 0.25), rr(-0.3, 0.2), rr(-0.25, 0.25))), rr(0.0012, 0.003));
        }
        /* тело легло — лужа */
        b.still = spd < 0.35 ? b.still + dt : 0;
        /* v14: раненый в агонии ворочается и отползает — рана уходит от
           лужи: старая перестаёт расти, под новым местом начинается новая,
           по пути — мазки (не больше 3 луж на тело) */
        if (b.pool && b.np < 4 && b.still > 0.6 && Math.hypot(x - b.px, z - b.pz) > 0.42) {
          b.pool.feed = false;
          for (let j = 1; j <= 3; j++) { const u = j / 4; _e.set(b.px + (x - b.px) * u, 0, b.pz + (z - b.pz) * u); splat(_e, rr(0.05, 0.1), Math.floor(R() * 8), x - b.px, z - b.pz, rr(1.4, 2.2), 1); }
          b.pool = makePool(x, z, b.R * 0.75, { tau: 35 + R() * 40 }); b.px = x; b.pz = z; b.np++;
        }
        if (!b.pool && (b.still > 0.25 || b.t > 2.6) && b.t > 0.5) {
          b.pool = makePool(x, z, b.R, { tau: 35 + R() * 40 }); b.px = x; b.pz = z; b.np = 1;
          /* удар тела о грунт выбрасывает крупные пятна у раны */
          for (let j = 0; j < 4; j++) {
            const a = R() * TAU, d = rr(0.15, 0.5);
            _e.set(x + Math.cos(a) * d, 0, z + Math.sin(a) * d);
            splat(_e, rr(0.05, 0.12), Math.floor(R() * 8), Math.cos(a), Math.sin(a), rr(1, 1.5), 1.1);
          }
        }
      }
    }

    /* ------------------------------------------------- кадр --- */
    const _sz = new THREE.Vector2();
    BL.update = (dt) => {
      BL.group.visible=((globalThis.AEGIS_SETTINGS||{}).gore??1)>0;
      BL.t += dt;
      uTime.value = BL.t;
      if (o.renderer && o.camera) {
        o.renderer.getDrawingBufferSize(_sz);
        dMat.uniforms.uScale.value = _sz.y * (globalThis.AEGIS_RS || 1) / (2 * Math.tan(o.camera.fov * Math.PI / 360));
      }
      updateBleeders(dt);
      updateJets(dt);
      /* капли */
      let any = false;
      if (dLive) for (let i = 0; i < DN; i++) {
        const d = drops[i], k3 = i * 3, k4 = i * 4;
        if (!d.on) { if (dSize[i] !== 0) { dSize[i] = 0; dCol[k4 + 3] = 0; } continue; }
        any = true;
        d.t += dt;
        /* сопротивление воздуха ~ v² / r: мелкая взвесь тормозит сразу */
        const kd = 2.0e-4 / d.r;
        const vl = d.v.length();
        const dec = Math.min(0.9, kd * vl * dt);
        d.v.multiplyScalar(1 - dec);
        d.v.y -= 9.81 * dt;
        d.p.addScaledVector(d.v, dt);
        const gy = groundAt(d.p.x, d.p.z);
        if (d.p.y <= gy + 0.003) {
          d.p.y = gy;
          if (d.splat && d.r > 0.0006) dropSplat(d);
          d.on = false;
        } else if (d.t > d.ttl) d.on = false;
        dPos[k3] = d.p.x; dPos[k3 + 1] = d.p.y; dPos[k3 + 2] = d.p.z;
        dSize[i] = d.on ? d.r * 2 * (1 + Math.min(1.5, vl * 0.06)) : 0;
        const c = d.dark;
        dCol[k4] = 0.16 * c; dCol[k4 + 1] = 0.008 * c; dCol[k4 + 2] = 0.006 * c; dCol[k4 + 3] = d.on ? 0.95 : 0;
      }
      dropPts.visible = any; dLive = any;
      if (any) {
        dGeo.attributes.position.needsUpdate = true;
        dGeo.attributes.aCol.needsUpdate = true;
        dGeo.attributes.aSize.needsUpdate = true;
      }
      /* взвесь: быстро расплывается, тормозит и оседает */
      for (const m of mists) {
        if (m.t >= m.ttl) { if (m.o.visible) m.o.visible = false; continue; }
        m.t += dt;
        const u = clamp(m.t / m.ttl, 0, 1);
        m.v.multiplyScalar(Math.exp(-dt * 5));
        m.v.y -= 0.35 * dt;
        m.o.position.addScaledVector(m.v, dt);
        const r = lerp(m.r0, m.r1, 1 - Math.pow(1 - u, 4.0));
        m.o.scale.set(r, r, 1);
        m.o.material.opacity = Math.min(1, m.op * Math.pow(1 - u, 1.8) * Math.min(1, m.t / 0.012));
        m.o.visible = true;
      }
      /* лужи */
      for (let k = pools.length - 1; k >= 0; k--) {
        const P = pools[k];
        P.t += dt;
        /* площадь растёт примерно как объём: радиус ~ √(1 − e^(−t/τ));
           тело убрали — подтекать перестаёт, растекается остаток */
        const target = Math.sqrt(1 - Math.exp(-P.t / P.tau)) * P.gMax;
        if (!P.feed && P.gStop === undefined) P.gStop = P.g || 0;
        const cap = P.feed ? P.gMax : Math.min(P.gMax, P.gStop + 0.12);
        P.g = Math.min(cap, Math.max(P.g || 0, target));
        P.U.uGrow.value = P.g;
        P.U.uDry.value = clamp((P.t - 25) / 220, 0, 1);
        P.U.uFade.value = 1 - clamp((P.t - (POOL_LIFE - 80)) / 80, 0, 1);
        if (P.t > POOL_LIFE) { BL.group.remove(P.mesh); P.mesh.geometry.dispose(); P.mesh.material.dispose(); pools.splice(k, 1); }
      }
    };
    BL.clear = () => {
      for (const d of drops) d.on = false;
      for (const P of pools) { BL.group.remove(P.mesh); P.mesh.geometry.dispose(); P.mesh.material.dispose(); }
      pools.length = 0; bleeders.length = 0; jets.length = 0;
      aBirth.fill(-1e6); sGeo.attributes.aBirth.needsUpdate = true;
    };
    BL._pools = pools; BL._bleeders = bleeders;
    return BL;
  }
  return { create };
});
