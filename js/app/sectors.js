/* AEGIS v21 · сектора больших карт.
   «Заречье» (stroyka_zarechye_v2) и «Тихий бор» (forest_map_camp) делятся на три
   логические мини-карты. В бою активен один сектор: в нём своя пара баз (точки
   возрождения и флаги каждый бой выбираются случайно из кандидатов, стороны
   команд тоже меняются), людей втрое меньше, граница — красная линия на земле
   и сигнальная лента на кольях. За линией — запретная зона: игроку даётся
   OUT_SEC секунд, чтобы вернуться (как в Battlefield), боты туда не ходят —
   их навсетка обрезана по границе сектора, а цели приказов прижимаются внутрь.
   Чистая геометрия экспортируется для Node-тестов (tools/ai-tests/sectors.cjs). */
(function (root, factory) {
  const M = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else root.GSectors = M;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const S2 = Math.SQRT1_2;
  const OUT_SEC = 10;          // секунд на возвращение из запретной зоны
  const HARD_PAD = 32;         // невидимая стена (границы физики) — за линией
  const NAV_PAD = 2.2;         // навсетка ботов — чуть шире линии

  /* half-plane [a, b, c]: a·x + b·z <= c, (a, b) — единичная внешняя нормаль */
  /* Тихий бор: u — вдоль длинной оси озера (на лагерь), v — поперёк */
  const uLE = (c) => [S2, S2, c], uGE = (c) => [-S2, -S2, -c], vLE = (c) => [S2, -S2, c], vGE = (c) => [-S2, S2, -c];
  const fuv = (u, v) => [(u + v) * S2, (u - v) * S2];
  /* Заречье: a — поперёк реки (на запад растёт), b — вдоль деревенской улицы (на юг растёт) */
  const VU = [-0.92388, 0.38268], VN = [0.38268, 0.92388];
  const aLE = (c) => [VU[0], VU[1], c], aGE = (c) => [-VU[0], -VU[1], -c], bLE = (c) => [VN[0], VN[1], c], bGE = (c) => [-VN[0], -VN[1], -c];
  const vab = (a, b) => [a * VU[0] + b * VN[0], a * VU[1] + b * VN[1]];
  /* стройка: lx/lz — оси ограждения ангара (повёрнуты на 45°) */
  const lxLE = (c) => [S2, S2, c], lxGE = (c) => [-S2, -S2, -c], lzLE = (c) => [-S2, S2, c], lzGE = (c) => [S2, -S2, -c];
  const xLE = (c) => [1, 0, c], xGE = (c) => [-1, 0, -c], zLE = (c) => [0, 1, c], zGE = (c) => [0, -1, -c];

  /* sides: две стороны сектора, у каждой — кандидаты баз; pairs — пары связаны
     (один индекс на обе стороны), иначе выбираются независимо. centre — точки
     встречи (куда идёт штурмовая группа до фазы штурма), берётся одна случайно. */
  const DEFS = {
    forest_map_camp: {
      half: 106,
      sectors: [
        {
          id: 1, name: 'Турбаза «Лесное»', short: 'Турбаза',
          about: 'Корпуса и домики турбазы, старая дорога, пирс',
          planes: [uLE(-44)],
          sides: [[[-86, -4], [-79, -16], [-94, -16]], [[-4, -86], [-16, -79], [-16, -94]]],
          centre: [[-50, -50], [-56, -44], [-44, -58]]
        },
        {
          id: 2, name: 'Пионерлагерь «Волчонок»', short: 'Лагерь',
          about: 'Корпуса лагеря, линейка, столовая, дорога к лагерю',
          planes: [uGE(44)],
          sides: [[[86, 4], [79, 16], [94, 16]], [[4, 86], [16, 79], [16, 94]]],
          centre: [[62, 62], [56, 66], [66, 56]]
        },
        {
          id: 3, name: 'Озеро', short: 'Озеро',
          about: 'Кольцевая дорога, пирсы и берега лесного озера',
          planes: [uLE(60), uGE(-60), vLE(82), vGE(-82)],
          sides: [[fuv(0, -64), fuv(12, -64), fuv(-12, -64)], [fuv(0, 64), fuv(-12, 64), fuv(12, 64)]],
          centre: [fuv(-50, 0), fuv(50, 0)]
        }
      ]
    },
    stroyka_zarechye_v2: {
      half: 148,
      sectors: [
        {
          id: 1, name: 'Заречье', short: 'Заречье',
          about: 'Деревня за рекой: улица, огороды, брод и перекат',
          planes: [aGE(55), bLE(80), bGE(-80)],
          sides: [[vab(117, -61), vab(102, -64), vab(108, -52)], [vab(117, 61), vab(102, 64), vab(128, 55)]],
          centre: [vab(117, 0), vab(104, 8), vab(110, -10)]
        },
        {
          id: 2, name: 'Стройка', short: 'Стройка',
          about: 'Недостроенный ангар, краны, леса и котлован',
          planes: [lxLE(59), lxGE(-59), lzLE(70), lzGE(-70), aLE(68), zGE(-58)],
          pairs: true,
          sides: [[[38.2, -38.2], [-29, -29]], [[-38.2, 38.2], [29, 29]]],
          centre: [[0, 0], [4, -4], [-4, 4]]
        },
        {
          id: 3, name: 'Ферма', short: 'Ферма',
          about: 'Ферма на холме, пулемётные гнёзда, поля и тропы',
          planes: [xLE(98), xGE(-72), zLE(-62)],
          sides: [[[-52, -108], [-48, -86], [-56, -128]], [[72, -108], [66, -86], [74, -128]]],
          centre: [[0, -116], [8, -104], [-6, -126]]
        }
      ]
    }
  };

  /* ---------------------------------------------------------- geometry -- */
  function clip(poly, hp) {
    const [a, b, c] = hp, out = [];
    const f = (p) => a * p[0] + b * p[1] - c;
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i], Q = poly[(i + 1) % poly.length], fp = f(P), fq = f(Q);
      if (fp <= 0) out.push(P);
      if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
        const t = fp / (fp - fq);
        out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
      }
    }
    return out;
  }
  function area(poly) {
    let s = 0;
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; s += p[0] * q[1] - q[0] * p[1]; }
    return s / 2;
  }
  function polygonOf(def, sec) {
    const h = def.half;
    let p = [[-h, -h], [h, -h], [h, h], [-h, h]];
    for (const hp of sec.planes) p = clip(p, hp);
    /* убрать почти совпадающие вершины */
    const q = [];
    for (const v of p) { const l = q[q.length - 1]; if (!l || Math.hypot(v[0] - l[0], v[1] - l[1]) > 0.05) q.push(v); }
    if (q.length > 2 && Math.hypot(q[0][0] - q[q.length - 1][0], q[0][1] - q[q.length - 1][1]) < 0.05) q.pop();
    if (area(q) < 0) q.reverse(); // одна ориентация: в осях x→, z↓ это обход «по часовой» на карте
    return q;
  }
  function contains(poly, x, z) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }
  /* ближайшая точка границы, расстояние до неё и внешняя нормаль ребра */
  function nearestEdge(poly, x, z) {
    let best = null, bd = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], ex = q[0] - p[0], ez = q[1] - p[1], L2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((x - p[0]) * ex + (z - p[1]) * ez) / L2)), px = p[0] + ex * t, pz = p[1] + ez * t, d = Math.hypot(x - px, z - pz);
      if (d < bd) { bd = d; const L = Math.sqrt(L2); best = { x: px, z: pz, d, nx: ez / L, nz: -ex / L, i, t }; }
    }
    return best;
  }
  /* > 0 внутри (запас до линии), < 0 снаружи */
  function margin(poly, x, z) {
    const e = nearestEdge(poly, x, z);
    return contains(poly, x, z) ? e.d : -e.d;
  }
  /* сектор выпуклый (пересечение полуплоскостей): многоугольник «внутри с запасом m» —
     те же рёбра, сдвинутые внутрь на m. Кэш по m на самом массиве вершин. */
  function inset(poly, m) {
    const cache = poly._inset || (Object.defineProperty(poly, '_inset', { value: new Map(), enumerable: false }), poly._inset);
    const key = Math.round(m * 1000);
    if (cache.has(key)) return cache.get(key);
    let q = poly.slice();
    for (let i = 0; i < poly.length && q.length; i++) {
      const p = poly[i], r = poly[(i + 1) % poly.length], L = Math.hypot(r[0] - p[0], r[1] - p[1]) || 1;
      const nx = (r[1] - p[1]) / L, nz = -(r[0] - p[0]) / L; // внешняя нормаль
      q = clip(q, [nx, nz, nx * p[0] + nz * p[1] - m]);
    }
    cache.set(key, q);
    return q;
  }
  /* ближайшая точка внутри с запасом m (точно для выпуклого сектора) */
  function inside(poly, x, z, m) {
    if (margin(poly, x, z) >= m) return { x, z };
    const q = inset(poly, m);
    if (q.length < 3) { // сектор уже 2m — к его центру
      let cx = 0, cz = 0; for (const v of poly) { cx += v[0]; cz += v[1]; }
      return { x: cx / poly.length, z: cz / poly.length };
    }
    const e = nearestEdge(q, x, z);
    /* на линию внутреннего контура + 1 см внутрь от округления */
    return { x: e.x - e.nx * 0.01, z: e.z - e.nz * 0.01 };
  }
  function bbox(poly, pad) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    pad = pad || 0;
    return { x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad };
  }
  function perimeter(poly) {
    let s = 0;
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; s += Math.hypot(q[0] - p[0], q[1] - p[1]); }
    return s;
  }

  /* --------------------------------------------------------- selection -- */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const has = (mapId) => !!DEFS[mapId];
  function list(mapId) {
    const def = DEFS[mapId];
    return def ? def.sectors.map((s) => ({ id: s.id, name: s.name, short: s.short, about: s.about })) : [];
  }
  /* param: '1' | '2' | '3' | 'random' | 'all' | null (= random) ; seed — на бой */
  function resolve(mapId, param, seed) {
    const def = DEFS[mapId];
    if (!def || param === 'all' || param === '0') return null;
    const r = rng(seed >>> 0);
    let sec = def.sectors.find((s) => String(s.id) === String(param));
    if (!sec) sec = def.sectors[Math.floor(r() * def.sectors.length) % def.sectors.length];
    const poly = polygonOf(def, sec);
    const pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length];
    const swap = r() < 0.5;
    let iA, iB;
    if (sec.pairs) { iA = iB = Math.floor(r() * sec.sides[0].length) % sec.sides[0].length; }
    else { iA = Math.floor(r() * sec.sides[0].length) % sec.sides[0].length; iB = Math.floor(r() * sec.sides[1].length) % sec.sides[1].length; }
    const A = sec.sides[0][iA], B = sec.sides[1][iB];
    const alpha = swap ? B : A, delta = swap ? A : B;
    const c = pick(sec.centre);
    return {
      mapId, id: sec.id, name: sec.name, short: sec.short, about: sec.about, seed: seed >>> 0, poly,
      bases: { alpha: { x: alpha[0], z: alpha[1] }, delta: { x: delta[0], z: delta[1] } },
      centre: { x: c[0], z: c[1] }, choice: { swap, iA, iB },
      area: Math.abs(area(poly)), perimeter: perimeter(poly)
    };
  }

  /* ===================================================================== *
   *  Runtime (browser only)
   * ===================================================================== */
  let cur = null;

  /* world: из GMaps.build; native — результат строителя карты */
  function apply(THREE, scene, world, param, opts) {
    opts = opts || {};
    const seed = opts.seed !== undefined ? opts.seed : ((Date.now() ^ (Math.random() * 4294967296)) >>> 0);
    const sec = resolve(world.mapId, param, seed);
    if (!sec) return null;
    const poly = sec.poly;
    const nb = world.bounds;
    const clampB = (b) => ({ x0: Math.max(nb.x0, b.x0), x1: Math.min(nb.x1, b.x1), z0: Math.max(nb.z0, b.z0), z1: Math.min(nb.z1, b.z1) });
    sec.contains = (x, z) => contains(poly, x, z);
    sec.margin = (x, z) => margin(poly, x, z);
    sec.inside = (x, z, m) => inside(poly, x, z, m === undefined ? 2 : m);
    sec.nearestEdge = (x, z) => nearestEdge(poly, x, z);
    sec.navContains = (x, z) => margin(poly, x, z) > -NAV_PAD;
    world.sector = sec;
    world.nativeBounds = nb;
    world.nativeBases = world.bases;
    world.bases = sec.bases;
    /* физика, навсетка, сетки ИИ и свободная камера — в пределах сектора с запасом */
    world.bounds = clampB(bbox(poly, HARD_PAD));
    world.navBounds = clampB(bbox(poly, NAV_PAD + 1));
    try { buildLine(THREE, scene, world, sec); } catch (e) { console.warn('sector line', e && e.message); }
    cur = { world, sec, out: 0, hud: null, warned: false, t0: null };
    return sec;
  }

  /* ---------------------------------------------- красная линия, лента -- */
  function buildLine(THREE, scene, world, sec) {
    const poly = sec.poly, H = world.heightAt, wy = world.waterY;
    const parent = world.props || scene;
    const g = new THREE.Group();
    g.name = 'sector_boundary';
    const ground = (x, z) => Math.max(H(x, z), wy !== undefined ? wy + 0.04 : -1e9);
    /* дискретизация контура: шаг 0,6 м, нормали в вершинах — средние соседних рёбер */
    const pts = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.max(1, Math.ceil(L / 0.6));
      const nx = (q[1] - p[1]) / L, nz = -(q[0] - p[0]) / L;
      for (let k = 0; k < n; k++) { const t = k / n; pts.push({ x: p[0] + (q[0] - p[0]) * t, z: p[1] + (q[1] - p[1]) * t, nx, nz, corner: k === 0, s: 0 }); }
    }
    const N = pts.length;
    for (let i = 0; i < N; i++) {
      const P = pts[i];
      if (P.corner) {
        const Q = pts[(i - 1 + N) % N], ax = P.nx + Q.nx, az = P.nz + Q.nz, L = Math.hypot(ax, az) || 1;
        /* миттер: ширина полосы на углу не сужается */
        const dot = (ax / L) * P.nx + (az / L) * P.nz;
        P.mx = ax / L / Math.max(0.5, dot); P.mz = az / L / Math.max(0.5, dot);
      } else { P.mx = P.nx; P.mz = P.nz; }
    }
    for (let i = 1; i < N; i++) pts[i].s = pts[i - 1].s + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const total = pts[N - 1].s + Math.hypot(pts[0].x - pts[N - 1].x, pts[0].z - pts[N - 1].z);

    /* 1) красная полоса по земле, 0,32 м, и розово-красный «подтёк» наружу (запретная сторона) */
    const ribbon = (w0, w1, lift, colIn, colOut, aIn, aOut) => {
      const pos = new Float32Array((N + 1) * 2 * 3), col = new Float32Array((N + 1) * 2 * 4), idx = [];
      for (let i = 0; i <= N; i++) {
        const P = pts[i % N];
        const xa = P.x + P.mx * w0, za = P.z + P.mz * w0, xb = P.x + P.mx * w1, zb = P.z + P.mz * w1;
        pos.set([xa, ground(xa, za) + lift, za, xb, ground(xb, zb) + lift, zb], i * 6);
        col.set([colIn[0], colIn[1], colIn[2], aIn, colOut[0], colOut[1], colOut[2], aOut], i * 8);
        if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      return geo;
    };
    const red = [1, 0.06, 0.04];
    const lineMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false });
    const line = new THREE.Mesh(ribbon(-0.16, 0.16, 0.07, red, red, 0.95, 0.95), lineMat);
    line.name = 'sector_line'; line.renderOrder = 2; line.frustumCulled = false;
    g.add(line);
    const band = new THREE.Mesh(ribbon(0.16, 3.6, 0.06, [0.85, 0.05, 0.03], [0.85, 0.05, 0.03], 0.3, 0), lineMat);
    band.name = 'sector_band'; band.renderOrder = 1; band.frustumCulled = false;
    g.add(band);

    /* 2) колья с сигнальной лентой (красно-белая, как на реальных ограждениях) — шаг ~6 м;
       в воде и внутри построек колья не ставятся, лента там прерывается */
    const posts = [];
    const nPosts = Math.max(8, Math.round(total / 6));
    for (let k = 0; k < nPosts; k++) {
      const s = (k / nPosts) * total;
      let i = 0; while (i < N - 1 && pts[i + 1].s < s) i++;
      const P = pts[i], Q = pts[(i + 1) % N], seg = (Q.s || total) - P.s || 1, t = Math.min(1, Math.max(0, (s - P.s) / seg));
      const x = P.x + (Q.x - P.x) * t, z = P.z + (Q.z - P.z) * t, h = H(x, z);
      const wet = wy !== undefined && h < wy + 0.05;
      const inWall = world.blocked && world.blocked(x, z, h, 0.12);
      posts.push({ x, z, y: h, ok: !wet && !inWall });
    }
    const cvs = document.createElement('canvas'); cvs.width = 128; cvs.height = 16;
    const c2 = cvs.getContext('2d');
    c2.fillStyle = '#f4f1ea'; c2.fillRect(0, 0, 128, 16);
    c2.fillStyle = '#d0141a';
    for (let x = -32; x < 160; x += 32) { c2.beginPath(); c2.moveTo(x, 16); c2.lineTo(x + 16, 0); c2.lineTo(x + 32, 0); c2.lineTo(x + 16, 16); c2.closePath(); c2.fill(); }
    const tapeTex = new THREE.CanvasTexture(cvs);
    tapeTex.wrapS = THREE.RepeatWrapping; tapeTex.colorSpace = THREE.SRGBColorSpace || tapeTex.colorSpace; tapeTex.anisotropy = 4;
    const tPos = [], tUv = [], tIdx = [];
    const TH = 0.95, TW = 0.075;
    for (let k = 0; k < posts.length; k++) {
      const A = posts[k], B = posts[(k + 1) % posts.length];
      if (!A.ok || !B.ok) continue;
      const L = Math.hypot(B.x - A.x, B.z - A.z);
      if (L > 9) continue;
      /* лента не проходит сквозь машины, стены и штабели: пролёт с препятствием пропускаем */
      let hit = false;
      for (const f of [0.25, 0.5, 0.75]) {
        const x = A.x + (B.x - A.x) * f, z = A.z + (B.z - A.z) * f, h = H(x, z);
        if ((wy !== undefined && h < wy + 0.05) || (world.blocked && world.blocked(x, z, h + 0.2, 0.06))) { hit = true; break; }
      }
      if (hit) continue;
      const n = 4, base = tPos.length / 3;
      for (let j = 0; j <= n; j++) {
        const t = j / n, x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t;
        const y0 = A.y + (B.y - A.y) * t, sag = Math.sin(Math.PI * t) * 0.06 * (L / 6);
        const y = Math.max(y0 + TH - sag, ground(x, z) + 0.25);
        tPos.push(x, y + TW / 2, z, x, y - TW / 2, z);
        const u = (t * L) / 0.6;
        tUv.push(u, 1, u, 0);
        if (j < n) { const a = base + j * 2; tIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
    }
    if (tPos.length) {
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.Float32BufferAttribute(tPos, 3));
      tg.setAttribute('uv', new THREE.Float32BufferAttribute(tUv, 2));
      tg.setIndex(tIdx);
      tg.computeVertexNormals();
      tg.computeBoundingSphere();
      const tape = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ map: tapeTex, side: THREE.DoubleSide, emissive: 0x220000 }));
      tape.name = 'sector_tape'; tape.frustumCulled = false;
      g.add(tape);
    }
    const okPosts = posts.filter((p) => p.ok);
    if (okPosts.length) {
      const pg = new THREE.CylinderGeometry(0.022, 0.028, 1.25, 5, 1);
      pg.translate(0, 1.25 / 2 - 0.12, 0);
      const pm = new THREE.MeshLambertMaterial({ color: 0x6b5a43 });
      const im = new THREE.InstancedMesh(pg, pm, okPosts.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
      okPosts.forEach((p, i) => {
        e.set((Math.sin(i * 12.9898) * 0.5) * 0.08, 0, (Math.sin(i * 78.233) * 0.5) * 0.08);
        q.setFromEuler(e); v.set(p.x, p.y, p.z); m.compose(v, q, sc); im.setMatrixAt(i, m);
      });
      im.instanceMatrix.needsUpdate = true;
      im.name = 'sector_posts'; im.frustumCulled = false;
      g.add(im);
    }
    for (const o of [line, band]) { o.castShadow = false; o.receiveShadow = false; }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.userData.noImpact = true; } });
    parent.add(g);
    sec.group = g;
    sec.posts = okPosts.length;
    return g;
  }

  /* ----------------------------------------------- запретная зона: игрок -- */
  function hud() {
    if (cur.hud) return cur.hud;
    const box = document.createElement('div');
    box.id = 'sectorWarn';
    box.style.cssText = 'position:fixed;inset:0;z-index:40;pointer-events:none;display:none;align-items:center;justify-content:flex-start;flex-direction:column;padding-top:18vh;font-family:system-ui,Segoe UI,Arial,sans-serif;text-align:center;color:#fff;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 55%,rgba(150,0,0,.42) 100%)';
    box.innerHTML = '<div style="font:800 34px/1.1 system-ui,Segoe UI,Arial,sans-serif;letter-spacing:.12em;color:#ff4a3d;text-shadow:0 2px 8px #000">ЗАПРЕТНАЯ ЗОНА</div>' +
      '<div style="margin-top:8px;font:600 17px/1.3 system-ui,Segoe UI,Arial,sans-serif;text-shadow:0 1px 4px #000">Вернитесь за красную линию в район боя</div>' +
      '<div id="sectorWarnT" style="margin-top:10px;font:800 54px/1 system-ui,Segoe UI,Arial,sans-serif;color:#ffd0c8;text-shadow:0 2px 10px #000"></div>';
    document.body.appendChild(box);
    const banner = document.createElement('div');
    banner.id = 'sectorBanner';
    banner.style.cssText = 'position:fixed;left:50%;top:13vh;transform:translateX(-50%);z-index:31;pointer-events:none;font-family:system-ui,Segoe UI,Arial,sans-serif;text-align:center;color:#f2eee6;text-shadow:0 1px 4px #000;opacity:0;transition:opacity .8s';
    document.body.appendChild(banner);
    cur.hud = { box, t: box.querySelector('#sectorWarnT'), banner };
    return cur.hud;
  }
  /* вызывается каждый шаг из 29_game.js; a — активный боец (или null) */
  function update(dt, t, a, kill) {
    if (!cur || !cur.sec) return;
    const sec = cur.sec, h = hud();
    if (cur.t0 === null) {
      cur.t0 = t;
      h.banner.innerHTML = '<div style="font:700 13px/1.2 system-ui,Segoe UI,Arial,sans-serif;letter-spacing:.2em;color:#d9a257">СЕКТОР ' + sec.id + '</div>' +
        '<div style="font:800 30px/1.15 system-ui,Segoe UI,Arial,sans-serif;letter-spacing:.04em">' + sec.name + '</div>' +
        '<div style="font:500 14px/1.3 system-ui,Segoe UI,Arial,sans-serif;opacity:.85">Граница района боя — красная линия</div>';
      h.banner.style.opacity = '1';
    }
    if (t - cur.t0 > 6 && h.banner.style.opacity !== '0') h.banner.style.opacity = '0';
    const alive = a && !a.dead && !a.finished && a.ctrl;
    const outside = alive && !sec.contains(a.ctrl.pos.x, a.ctrl.pos.z);
    if (!outside) {
      if (cur.out) { cur.out = 0; h.box.style.display = 'none'; }
      return;
    }
    if (!cur.out) { cur.out = t; h.box.style.display = 'flex'; }
    const left = Math.max(0, OUT_SEC - (t - cur.out));
    const txt = String(Math.ceil(left));
    if (h.t.textContent !== txt) h.t.textContent = txt;
    if (left <= 0) {
      cur.out = 0; h.box.style.display = 'none';
      if (kill) kill(a, 'Покинул район боя · запретная зона');
    }
  }
  /* прижать цель приказа ИИ внутрь сектора */
  function clampGoal(world, g, m) {
    const sec = world && world.sector;
    if (!sec || !g) return g;
    if (sec.margin(g.x, g.z) >= (m || 2)) return g;
    const p = sec.inside(g.x, g.z, m || 2.5);
    return { x: p.x, z: p.z, y: world.heightAt ? world.heightAt(p.x, p.z) : g.y };
  }

  return {
    DEFS, OUT_SEC, clip, area, polygonOf, contains, nearestEdge, margin, inside, inset, bbox, perimeter, has, list, resolve, rng, hash,
    apply, update, clampGoal,
    get current() { return cur ? cur.sec : null; },
    reset: () => { cur = null; }
  };
});
