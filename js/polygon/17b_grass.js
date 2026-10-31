/* ==========================================================================
   МОДУЛЬ: grass.js (v6)
   ==========================================================================
   Геометрическая трава вблизи — по мотивам доклада Sucker Punch «Procedural
   Grass in Ghost of Tsushima» (GDC 2021) и его WebGL-переносов:

   • каждая травинка — полоска из 5 сегментов (LOD1 — 3), форма задаётся
     квадратичной кривой Безье: корень, контрольная точка, кончик; изгиб,
     ветер, примятость и взрывная волна лишь наклоняют кончик, длина
     травинки сохраняется;
   • травинки растут «клумбами» (ячейки Вороного, 0,5–0,9 м): у клумбы общий
     курс, рост и цвет, травинки наклонены к её центру, к краю ячейки
     редеют; ~8 % — одиночки со случайным курсом;
   • освещение: цвет корня взят от подстилки, к кончику светлее, у корня
     затенение (контактная тень), просвечивание против солнца (backlit
     translucency через тень солнца), «скруглённая» нормаль поперёк
     травинки и лёгкий блик; если травинка повёрнута к камере ребром — её
     ширина в кадре увеличивается, чтобы трава не рябила;
   • ветер общий с пучками, папоротником, подростом и кронами (карта
     порывов в world.js), туда же — карта следов (примятость, срезы пулями)
     и взрывные кольца;
   • травинки только в радиусе 15–22 м (обрыв ±15 % на травинку, чтобы не
     было ровной границы), дальше — старые пучки-карточки, ещё дальше —
     «ковёр» в шейдере грунта (канал B карты грунта);
   • где расти: по картам грунта и сырости — осока у мокрых воронок, низкая
     сухая примятая трава на тропах, у ёлок почти ничего, кроме кислицы,
     редкий иван-чай по краю поляны;
   • чанки 8 × 8 м, своя сфера отсечения у каждого (frustum culling), два
     LOD, на «Низкой» система выключена.
   ========================================================================== */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;

  /* типы травы: 0 — луговая, 1 — сухая примятая (тропы), 2 — осока (сырость), 3 — лесной луговик (тень) */
  const TYPES = [
    { h: [0.28, 0.58], w: 0.021, bend: 0.36, stiff: 1.0, cell: 0.62 },
    { h: [0.10, 0.22], w: 0.017, bend: 1.05, stiff: 0.8, cell: 0.50 },
    { h: [0.42, 0.80], w: 0.014, bend: 0.30, stiff: 1.5, cell: 0.45 },
    { h: [0.22, 0.46], w: 0.011, bend: 0.62, stiff: 0.85, cell: 0.75 }
  ];
  const QUAL = { high: { R: 22, dens: 110 }, medium: { R: 15, dens: 60 }, low: { R: 0, dens: 0 } };

  function hash2(i, j, s) {
    let h = (i * 374761393 + j * 668265263 + (s | 0) * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  /* ---------------------------------------- геометрия одной травинки --- */
  function bladeBase(THREE, seg) {
    const pos = [], idx = [];
    for (let r = 0; r < seg; r++) { const t = r / seg; pos.push(-1, t, 0, 1, t, 0); }
    pos.push(0, 1, 0);
    for (let r = 0; r < seg - 1; r++) { const a = r * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const a = (seg - 1) * 2; idx.push(a, a + 1, seg * 2);
    return { pos: new THREE.Float32BufferAttribute(pos, 3), idx: new THREE.Uint16BufferAttribute(idx, 1) };
  }

  /* ------------------------------------------------------- шейдер ---- */
  const VERT_HEAD = `
    attribute vec4 iA;   // корень xyz, курс
    attribute vec4 iB;   // высота, ширина, изгиб, тип + оттенок
    attribute vec4 iC;   // наклон к центру клумбы xz, rnd, жёсткость
    varying float vGT;
    varying vec3 vGCol;
    varying float vGTr;
    uniform vec3 uGRoot[4];
    uniform vec3 uGTip[4];
    uniform float uGTime;
    vec3 gPosW;
  `;
  const VERT_BODY = `
    float gt = position.y, gside = position.x;
    vec3 gorg = iA.xyz;
    float gh = iB.x, gw = iB.y, gbend = iB.z;
    int gtype = int(floor(iB.w));
    float gcv = fract(iB.w);
    float grnd = iC.z, gstiff = iC.w;
    float gcd = distance(gorg.xz, cameraPosition.xz);
    float gfr = uBladeR * (0.85 + 0.30 * grnd);
    float gfade = 1.0 - smoothstep(gfr - 2.5, gfr, gcd);
    vec4 gtr = fwTrample(gorg.xz);
    gh *= gfade * (1.0 - gtr.a * 0.78);
    vec2 gfd = vec2(sin(iA.w), cos(iA.w));
    vec2 gpush = gfd * gbend + iC.xy;
    gpush += fwWind(gorg, 1.0, uGTime, 1.0).xz * (0.42 / gstiff);
    gpush += fwBlast(gorg, 1.0, uGTime).xz * 1.7;
    gpush += (gtr.rg * 2.0 - 1.0) * gtr.b * 1.7;
    float ga = length(gpush);
    vec2 gpd = ga > 1e-4 ? gpush / ga : gfd;
    ga = min(ga, 1.42);
    vec3 gtip = vec3(gpd.x * sin(ga), cos(ga), gpd.y * sin(ga)) * gh;
    vec3 gP1 = vec3(gpd.x * 0.08 * gh * ga, gh * (0.62 - 0.12 * ga), gpd.y * 0.08 * gh * ga);
    float gu = 1.0 - gt;
    vec3 gP = 2.0 * gu * gt * gP1 + gt * gt * gtip;
    vec3 gdP = normalize(2.0 * gu * gP1 + 2.0 * gt * (gtip - gP1) + vec3(0.0, 1e-4, 0.0));
    vec3 gsd = normalize(vec3(gfd.y, 0.0, -gfd.x));
    vec3 gN0 = normalize(cross(gdP, gsd));
    vec3 gV = normalize(cameraPosition - gorg - gP);
    /* нормаль — к зрителю (двусторонняя полоска без переворота в фрагменте) */
    if (dot(gN0, gV) < 0.0) gN0 = -gN0;
    float gedge = 1.0 - abs(dot(gN0, gV));
    float gwk = gw * (1.0 - pow(gt, 1.6)) * (1.0 + 2.2 * gedge * gedge * gedge) * step(0.004, gh);
    gPosW = gorg + gP + gsd * gside * gwk * 0.5;
    objectNormal = normalize(gN0 + gsd * gside * 0.6 + vec3(0.0, 0.25, 0.0));
    vGT = gt;
    vec3 groot = uGRoot[gtype], gtipc = uGTip[gtype];
    vGCol = mix(groot, gtipc, pow(gt, 0.8)) * (0.82 + 0.36 * gcv);
    vGTr = (0.35 + 0.65 * gt) * gfade;
  `;
  const FRAG_HEAD = `
    varying float vGT;
    varying vec3 vGCol;
    varying float vGTr;
  `;

  function makeMaterial(THREE, env) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.52, metalness: 0, side: THREE.DoubleSide });
    const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
    const U = Object.assign({
      uGRoot: { value: [lin(0.30, 0.29, 0.16), lin(0.40, 0.34, 0.21), lin(0.22, 0.27, 0.17), lin(0.32, 0.30, 0.18)] },
      uGTip: { value: [lin(0.58, 0.62, 0.34), lin(0.72, 0.64, 0.42), lin(0.42, 0.52, 0.34), lin(0.66, 0.66, 0.40)] },
      uGTime: env.windTime, uGTrans: { value: 0.65 }
    }, env.uniforms);
    mat.userData.grassU = U;
    mat.customProgramCacheKey = () => 'aegis-grass-blades-v6';
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = env.GLSL + VERT_HEAD + sh.vertexShader
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal;\n' + VERT_BODY)
        .replace('#include <begin_vertex>', 'vec3 transformed = gPosW;');
      const lp = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
        /void RE_Direct_Physical\(([^)]*)\) \{/,
        (m) => m + `
          /* просвечивание: солнце за травинкой (тень солнца уже в directLight.color) */
          float gBk = pow(saturate(dot(geometryViewDir, -directLight.direction)), 3.0);
          float gWrap = saturate(dot(geometryNormal, directLight.direction) * 0.5 + 0.5);
          reflectedLight.directDiffuse += directLight.color * material.diffuseColor * (gBk * uGTrans * vGTr * 1.6 + gWrap * 0.12);`);
      sh.fragmentShader = FRAG_HEAD + 'uniform float uGTrans;\n' + sh.fragmentShader
        .replace('#include <normal_fragment_begin>', '#undef DOUBLE_SIDED\n#include <normal_fragment_begin>\n#define DOUBLE_SIDED')
        .replace('#include <lights_physical_pars_fragment>', lp)
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb *= vGCol;
          /* контактная тень у корня: травинки затеняют друг друга */
          diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, 0.4, vGT));`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.85, 0.45, vGT);');
    };
    return mat;
  }

  /* ------------------------------------------------ карта «где растёт» --- */
  function buildField(THREE, world, opts) {
    const F = world.layout, N = 256, S = N / 128;
    const dens = new Float32Array(N * N), type = new Uint8Array(N * N);
    const U = root.GUtil;
    const nz = U.fbm(8181, 3, 0.5, 2.0), nz2 = U.fbm(4343, 2, 0.5, 2.0);
    const zones = world._noGrass || [];
    const inZ = root.GWorld && root.GWorld.inZones ? root.GWorld.inZones : () => false;
    const spr = world.spruces || [];
    /* сетка ёлок: «под елью почти ничего» */
    const sprAt = (x, z) => {
      let m = 9;
      for (const o of spr) { const d = Math.hypot(o.x - x, o.z - z) / (0.55 + o.s * 0.85); if (d < m) m = d; }
      return m;
    };
    const sprGrid = new Float32Array(N * N).fill(9);
    for (const o of spr) {
      const r = 0.55 + o.s * 0.85 + 1;
      for (let j = Math.floor((o.z - r + 64) * S); j <= Math.ceil((o.z + r + 64) * S); j++) for (let i = Math.floor((o.x - r + 64) * S); i <= Math.ceil((o.x + r + 64) * S); i++) {
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const x = (i + 0.5) / S - 64, z = (j + 0.5) / S - 64;
        const d = Math.hypot(o.x - x, o.z - z) / (0.55 + o.s * 0.85);
        if (d < sprGrid[j * N + i]) sprGrid[j * N + i] = d;
      }
    }
    void sprAt;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / S - 64, z = (j + 0.5) / S - 64, k = j * N + i;
      if (inZ(zones, x, z)) { dens[k] = 0; continue; }
      const ce = F.clearE(x, z), mud = world.mudAt ? world.mudAt(x, z) : 0, wet = world.wetAt ? world.wetAt(x, z) : 0;
      const n = nz(x * 0.11 + 3, z * 0.11 + 9), n2 = nz2(x * 0.37, z * 0.37);
      let d, t = 0;
      if (ce < 1.0) d = 0.55 + 0.45 * smooth(0.25, 0.65, n);                 // поляна
      else if (ce < 1.35) d = 0.85 + 0.15 * n;                                 // опушка — самая густая
      else d = Math.max(0, smooth(0.52, 0.72, n) * 0.55 - (ce - 1.35) * 0.08); // лес — пятнами
      if (ce > 1.25) t = 3;
      /* под соснами — тень и хвоя */
      const tr = world.trees && world.trees.near ? world.trees.near(x, z, 0.9) : null;
      if (tr) d *= 0.35;
      /* сырость — осока */
      if (wet > 0.42 && mud < 0.5) { t = 2; d = Math.max(d, 0.75 * smooth(0.42, 0.62, wet)); }
      /* тропы: сухая низкая примятая трава, в самой грязи — ничего */
      if (mud > 0.16) { t = mud > 0.24 ? 1 : t; d *= 1 - smooth(0.3, 0.46, mud); if (t === 1) d = Math.max(d * 0.85, 0.35 * (1 - smooth(0.3, 0.46, mud))); }
      /* ёлки */
      const sd = sprGrid[k];
      if (sd < 1.6) d *= smooth(0.7, 1.6, sd);
      /* мокрое дно воронок */
      if (F.craterD(x, z) < 0.62) d = 0;
      dens[k] = Math.max(0, Math.min(1, d * (0.75 + 0.5 * n2)));
      type[k] = t;
    }
    /* старые пучки-карточки: там, где они стоят, должны быть и травинки */
    const g = world.grass;
    if (g && g.count) {
      const m = new THREE.Matrix4(), p = new THREE.Vector3();
      for (let q = 0; q < g.count; q++) {
        g.getMatrixAt(q, m); p.setFromMatrixPosition(m);
        const i = Math.floor((p.x + 64) * S), j = Math.floor((p.z + 64) * S);
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
          const ii = i + a, jj = j + b;
          if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
          const kk = jj * N + ii;
          dens[kk] = Math.max(dens[kk], (a || b) ? 0.45 : 0.8);
        }
      }
    }
    /* в канал B карты грунта — для «ковра» вдали и подсада под травой */
    if (world.maskData) {
      const D = world.maskData, MS = world.maskS, K = MS / 128;
      for (let j = 0; j < MS; j++) for (let i = 0; i < MS; i++) {
        const x = (i + 0.5) / K - 64, z = (j + 0.5) / K - 64;
        const ii = Math.min(N - 1, Math.floor((x + 64) * S)), jj = Math.min(N - 1, Math.floor((z + 64) * S));
        D[(j * MS + i) * 4 + 2] = Math.round(dens[jj * N + ii] * (type[jj * N + ii] === 1 ? 0.5 : 1) * 255);
      }
      world.maskTex.needsUpdate = true;
    }
    const at = (x, z) => {
      const fi = (x + 64) * S - 0.5, fj = (z + 64) * S - 0.5;
      const i = Math.floor(fi), j = Math.floor(fj);
      if (i < 0 || j < 0 || i >= N - 1 || j >= N - 1) return 0;
      const u = fi - i, v = fj - j, k = j * N + i;
      return (dens[k] * (1 - u) + dens[k + 1] * u) * (1 - v) + (dens[k + N] * (1 - u) + dens[k + N + 1] * u) * v;
    };
    const typeAt = (x, z) => {
      const i = Math.floor((x + 64) * S), j = Math.floor((z + 64) * S);
      if (i < 0 || j < 0 || i >= N || j >= N) return 0;
      return type[j * N + i];
    };
    return { at, typeAt, sprGrid, N, S };
  }

  /* ------------------------------------------------------ система ---- */
  function create(THREE, scene, world, opts) {
    const env = world.env;
    if (!env || !world.layout) return null;
    const field = buildField(THREE, world, opts || {});
    const mat = makeMaterial(THREE, env);
    const B0 = bladeBase(THREE, 5), B1 = bladeBase(THREE, 3);
    const H = world.heightAt;
    const CH = 8;
    const chunks = new Map();
    const group = new THREE.Group(); group.name = 'grassBlades';
    scene.add(group);
    const G = { group, mat, field, chunks, R: 0, dens: 0, q: 'off', stats: { blades: 0, chunks: 0 } };

    function makeGeo(base, attrs, n) {
      const g = new THREE.InstancedBufferGeometry();
      g.setIndex(base.idx);
      g.setAttribute('position', base.pos);
      for (const k of Object.keys(attrs)) g.setAttribute(k, attrs[k]);
      g.instanceCount = n;
      return g;
    }
    function buildChunk(ci, cj) {
      const x0 = ci * CH, z0 = cj * CH;
      const step = 1 / Math.sqrt(G.dens);
      const A = [], Bv = [], Cv = [];
      let ymin = 1e9, ymax = -1e9;
      const nx = Math.ceil(CH / step);
      for (let b = 0; b < nx; b++) for (let a = 0; a < nx; a++) {
        const hx = hash2(ci * 4096 + a, cj * 4096 + b, 11), hz = hash2(ci * 4096 + a, cj * 4096 + b, 23);
        const x = x0 + (a + hx) * step, z = z0 + (b + hz) * step;
        const d = field.at(x, z);
        if (d < 0.02) continue;
        const tp = field.typeAt(x, z), T = TYPES[tp];
        /* клумба: ближайший центр ячеек Вороного */
        const cs = T.cell, gi = Math.floor(x / cs), gj = Math.floor(z / cs);
        let best = 9, cx = 0, cz = 0, cid = 0;
        for (let q = -1; q <= 1; q++) for (let p = -1; p <= 1; p++) {
          const ii = gi + p, jj = gj + q;
          const px = (ii + 0.15 + 0.7 * hash2(ii, jj, 5)) * cs, pz = (jj + 0.15 + 0.7 * hash2(ii, jj, 7)) * cs;
          const dd = Math.hypot(px - x, pz - z);
          if (dd < best) { best = dd; cx = px; cz = pz; cid = hash2(ii, jj, 13); }
        }
        const r = hash2(Math.floor(x * 97), Math.floor(z * 97), 31);
        const single = r < 0.08;
        const edgeK = best / (cs * 0.62);
        const keep = d * (single ? 0.6 : (1 - 0.75 * smooth(0.45, 1.0, edgeK)));
        if (hash2(Math.floor(x * 131), Math.floor(z * 131), 41) > keep) continue;
        const r2 = hash2(Math.floor(x * 211), Math.floor(z * 211), 43), r3 = hash2(Math.floor(x * 307), Math.floor(z * 307), 47);
        const hS = single ? 0.7 + 0.6 * r2 : (0.62 + 0.75 * cid) * (0.78 + 0.44 * r2);
        const h = (T.h[0] + (T.h[1] - T.h[0]) * hS * 0.75) * (0.55 + 0.45 * d) * (1 - 0.35 * smooth(0.0, 0.8, 1 - d) * (tp === 1 ? 1 : 0));
        const face = single ? r3 * TAU : cid * TAU + (r3 - 0.5) * 1.2;
        /* к центру клумбы — кончиками наружу (пучок «раскрыт») */
        const lx = (x - cx) / cs * 0.55, lz = (z - cz) / cs * 0.55;
        const y = H(x, z) - 0.01;
        A.push(x, y, z, face);
        Bv.push(h, T.w * (0.8 + 0.5 * r2), T.bend * (0.6 + 0.8 * r3), tp + Math.min(0.99, cid * 0.5 + r2 * 0.49));
        Cv.push(single ? 0 : lx, single ? 0 : lz, r, T.stiff);
        if (y < ymin) ymin = y; if (y > ymax) ymax = y;
      }
      const n = A.length / 4;
      if (!n) return { n: 0, mesh: null, ci, cj };
      const attrs = {
        iA: new THREE.InstancedBufferAttribute(new Float32Array(A), 4),
        iB: new THREE.InstancedBufferAttribute(new Float32Array(Bv), 4),
        iC: new THREE.InstancedBufferAttribute(new Float32Array(Cv), 4)
      };
      const g0 = makeGeo(B0, attrs, n), g1 = makeGeo(B1, attrs, n);
      const sph = new THREE.Sphere(new THREE.Vector3(x0 + CH / 2, (ymin + ymax) / 2 + 0.4, z0 + CH / 2), CH * 0.72 + (ymax - ymin) / 2 + 0.8);
      g0.boundingSphere = sph; g1.boundingSphere = sph.clone();
      g0.boundingBox = new THREE.Box3(new THREE.Vector3(x0 - 1, ymin - 0.1, z0 - 1), new THREE.Vector3(x0 + CH + 1, ymax + 1.2, z0 + CH + 1));
      g1.boundingBox = g0.boundingBox.clone();
      const mesh = new THREE.Mesh(g0, mat);
      mesh.userData.noAO = true;
      mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.name = 'grassChunk';
      group.add(mesh);
      return { n, mesh, g0, g1, ci, cj, cx: x0 + CH / 2, cz: z0 + CH / 2 };
    }
    function dropChunk(k, c) {
      if (c.mesh) { group.remove(c.mesh); c.g0.dispose(); c.g1.dispose(); }
      chunks.delete(k);
    }
    G.setQuality = (q) => {
      const Q = QUAL[q] || QUAL.medium;
      if (q === G.q) return;
      G.q = q;
      for (const [k, c] of [...chunks]) dropChunk(k, c);
      G.R = Q.R; G.dens = Q.dens;
      env.uniforms.uBladeR.value = Q.R;
      group.visible = Q.R > 0;
    };
    G.update = (camera, dt) => {
      if (!G.R) return;
      const p = camera.position, R = G.R;
      const ci0 = Math.floor((p.x - R) / CH), ci1 = Math.floor((p.x + R) / CH);
      const cj0 = Math.floor((p.z - R) / CH), cj1 = Math.floor((p.z + R) / CH);
      let built = 0;
      /* построить недостающие — ближние первыми, не больше 3 за кадр */
      const want = [];
      for (let j = cj0; j <= cj1; j++) for (let i = ci0; i <= ci1; i++) {
        if (i < -8 || j < -8 || i >= 8 || j >= 8) continue;
        const cx = i * CH + CH / 2, cz = j * CH + CH / 2;
        const d = Math.max(0, Math.hypot(cx - p.x, cz - p.z) - CH * 0.71);
        if (d > R) continue;
        const k = i * 1000 + j;
        if (!chunks.has(k)) want.push([d, i, j, k]);
      }
      want.sort((a, b) => a[0] - b[0]);
      for (const w of want) { if (built >= 3) break; chunks.set(w[3], buildChunk(w[1], w[2])); built++; }
      let blades = 0, vis = 0;
      for (const [k, c] of chunks) {
        if (!c.mesh) { if (Math.hypot(c.ci * CH + CH / 2 - p.x, c.cj * CH + CH / 2 - p.z) > R + 24) chunks.delete(k); continue; }
        const d = Math.hypot(c.cx - p.x, c.cz - p.z);
        if (d > R + 24) { dropChunk(k, c); continue; }
        const on = d - CH * 0.71 < R;
        c.mesh.visible = on;
        if (!on) continue;
        const g = d < 10 ? c.g0 : c.g1;
        if (c.mesh.geometry !== g) c.mesh.geometry = g;
        blades += c.n; vis++;
      }
      G.stats.blades = blades; G.stats.chunks = vis;
    };
    G.dispose = () => { for (const [k, c] of [...chunks]) dropChunk(k, c); scene.remove(group); mat.dispose(); };
    G.densityAt = field.at; G.typeAt = field.typeAt;
    return G;
  }

  root.GGrass = { create, TYPES, QUAL };
})(typeof self !== 'undefined' ? self : this);
