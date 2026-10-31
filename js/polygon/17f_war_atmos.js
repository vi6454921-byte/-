/* ==========================================================================
   МОДУЛЬ: GWarAtmos — «рядом идёт война» на картах (v25)
   ==========================================================================
   Без ряби, марева и экранных фильтров — только то, что видно и слышно днём
   на реальной передовой (фото и видео с фронта, описания «звуков передка»):
   • дымы на горизонте: 2–4 столба от горящих строений и техники за краем
     карты (2–5 км): чёрно-бурое основание (горит топливо, резина), выше —
     серо-бурая шапка; дым поднимается, замедляется, сносится ветром и
     расплывается под слоем инверсии. Воздушная перспектива: чем дальше —
     тем светлее и ближе к цвету дымки (выше — дымки меньше);
   • старые воронки: 82-мм мины (Ø 1,5–2,5 м) и 122/152-мм снаряды
     (Ø 4–6 м): обожжённое дно, вал свежего грунта (геометрия над землёй),
     лучи выброса и комья земли вокруг; на бетоне (Ангар) — скол и копоть. Ставятся только на
     открытый грунт: не под крышей, не в постройке, не в воде, не у базы;
   • далёкий бой: глухие пулемётные очереди, автоматные короткие,
     одиночные, «очередь — ответ» (0,8–3,6 км), артиллерия — удар и раскат (4–9 км); затишья по
     минуте-две и оживление. Направление — по линии фронта (поперёк оси баз),
     у каждого выстрела — своё направление и расстояние (громкость 8/d,
     верх съеден воздухом, длинное эхо), см. GAudioDist.far.
   Цена: дымы — 1 вызов отрисовки (инстансы, движение целиком в шейдере),
   воронки — 2 вызова (декали одной сеткой + комья инстансами), звук —
   несколько событий в минуту. На паузе и в меню бой не слышен.
   ========================================================================== */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let s = (seed >>> 0) || 0x9e3779b9; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  /* =========================================================== дымы === */
  /* клуб дыма: десятки мягких пятен разной плотности — рваный край, плотная середина */
  function puffTexture(THREE) {
    const N = 128, cv = canvas(N, N), g = cv.getContext('2d'), R = rng(7741);
    g.clearRect(0, 0, N, N);
    for (let i = 0; i < 46; i++) {
      const a = R() * TAU, rr = Math.pow(R(), 0.7) * N * 0.3, x = N / 2 + Math.cos(a) * rr, y = N / 2 + Math.sin(a) * rr;
      const r = N * (0.08 + R() * 0.2), al = 0.1 + R() * 0.22;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${al})`); gr.addColorStop(0.6, `rgba(255,255,255,${al * 0.45})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    /* общий спад к краю квада — без резких границ */
    const d = g.getImageData(0, 0, N, N), p = d.data;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (x + 0.5) / N * 2 - 1, dy = (y + 0.5) / N * 2 - 1, r = Math.sqrt(dx * dx + dy * dy);
      const k = clamp(1 - r, 0, 1), i = (y * N + x) * 4;
      p[i + 3] = Math.min(255, p[i + 3] * Math.pow(k, 0.6) * 1.35);
    }
    g.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }

  function makePlumes(THREE, o, R, frame, q) {
    const n = q === 'low' ? 2 : q === 'ultra' ? 4 : 3, per = q === 'low' ? 30 : 44;
    const base = [], shape = [];
    for (let k = 0; k < 4; k++) { base.push(new THREE.Vector4(0, -1e4, 0, 0)); shape.push(new THREE.Vector4(1, 1, 1, 100)); }
    const list = [];
    for (let k = 0; k < n; k++) {
      /* концы линии фронта (поперёк оси баз), один столб — далеко за противником */
      const side = k === 2 ? 0 : (k % 2 ? 1 : -1);
      const a = side === 0 ? frame.axisA + R() * 0.7 - 0.35 : frame.frontA + (side < 0 ? Math.PI : 0) + R() * 1.0 - 0.5;
      const d = 2200 + R() * 2600, x = frame.cx + Math.cos(a) * d, z = frame.cz + Math.sin(a) * d;
      const big = 0.75 + R() * 0.55;
      base[k].set(x, frame.y0 - 25, z, big);
      /* высота подъёма, радиус у основания и в шапке, жизнь клуба, с */
      shape[k].set(420 + 480 * big * R(), 14 + 12 * big, 110 + 120 * big, 220 + 120 * R());
      list.push({ a, d, big });
    }
    const quad = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.attributes.position); g.setAttribute('uv', quad.attributes.uv);
    const seed = new Float32Array(n * per * 4);
    for (let k = 0; k < n; k++) for (let i = 0; i < per; i++) {
      const j = (k * per + i) * 4;
      seed[j] = k; seed[j + 1] = (i + R() * 0.6) / per; seed[j + 2] = R(); seed[j + 3] = R();
    }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = n * per;
    const uni = {
      uT: { value: 0 }, uBase: { value: base }, uShape: { value: shape }, uWind: { value: new THREE.Vector2(2.6, 1.2) },
      uFar: { value: 392 }, uTex: { value: puffTexture(THREE) }, uSun: { value: new THREE.Vector3(0.3, 0.8, 0.2) },
      uSunC: { value: new THREE.Color(1, 0.95, 0.88) }, uAmb: { value: new THREE.Color(0.55, 0.6, 0.68) },
      uFog: { value: new THREE.Color(0.5, 0.55, 0.6) }, uBeta: { value: 0.00034 }
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: uni, transparent: true, depthWrite: false, depthTest: true, fog: false,
      vertexShader: `
        attribute vec4 aSeed;
        uniform float uT, uFar;
        uniform vec4 uBase[4], uShape[4];
        uniform vec2 uWind;
        varying vec2 vUv, vQ; varying float vA, vH, vD;
        void main() {
          int k = int(aSeed.x + 0.5);
          vec4 B = uBase[0], S = uShape[0];
          if (k == 1) { B = uBase[1]; S = uShape[1]; } else if (k == 2) { B = uBase[2]; S = uShape[2]; } else if (k == 3) { B = uBase[3]; S = uShape[3]; }
          float life = S.w * (0.85 + 0.3 * aSeed.z);
          float a = fract(uT / life + aSeed.y), age = a * life;
          float hk = 1.0 - exp(-age / (life * 0.3));          /* всплытие с замедлением */
          float h = S.x * hk;
          vec2 drift = uWind * age * (0.1 + 0.9 * hk * hk);    /* сдвиг ветра растёт с высотой */
          float ph = aSeed.w * 6.2832;
          vec2 jit = vec2(sin(ph + age * 0.021), cos(ph * 1.7 + age * 0.017)) * (2.0 + S.y * 0.6 + S.z * 0.35 * hk);
          vec3 c = B.xyz + vec3(drift.x + jit.x, h, drift.y + jit.y);
          float R = mix(S.y, S.z, pow(hk, 0.85)) * (0.7 + 0.6 * aSeed.w) * (0.85 + 0.3 * a);
          vec3 cR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 cU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float rot = aSeed.z * 6.2832 + age * 0.003, cr = cos(rot), sr = sin(rot);
          vec2 q = vec2(position.x * cr - position.y * sr, position.x * sr + position.y * cr);
          vec3 wp = c + (cR * q.x + cU * q.y) * R * 2.0;
          vec3 v = wp - cameraPosition; float d = length(v);
          vD = d;
          /* столб — за краем карты, дальше дальней плоскости камеры: рисуем на uFar
             с тем же угловым размером и направлением (параллакс верный) */
          wp = cameraPosition + v * min(1.0, uFar / d);
          vUv = uv; vQ = q * 2.0; vH = hk;
          vA = B.w > 0.0 ? smoothstep(0.0, 0.05, a) * (1.0 - smoothstep(0.55, 1.0, a)) : 0.0;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uTex;
        uniform vec3 uSun, uSunC, uAmb, uFog;
        uniform float uBeta;
        varying vec2 vUv, vQ; varying float vA, vH, vD;
        void main() {
          float den = texture2D(uTex, vUv).a;
          float al = den * vA * mix(0.92, 0.5, vH);
          if (al < 0.004) discard;
          /* объём клуба: нормаль сферы в плоскости квада */
          vec3 cR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 cU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 cF = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
          float r2 = clamp(dot(vQ, vQ), 0.0, 1.0);
          vec3 n = normalize(cR * vQ.x + cU * vQ.y + cF * sqrt(1.0 - r2));
          float lam = clamp((dot(n, uSun) + 0.35) / 1.35, 0.0, 1.0);
          /* чёрно-бурое основание -> серо-бурая шапка */
          vec3 alb = mix(vec3(0.028, 0.025, 0.022), vec3(0.2, 0.19, 0.175), smoothstep(0.05, 0.75, vH));
          vec3 col = alb * (uAmb * (0.55 + 0.45 * n.y) + uSunC * lam * 1.1);
          /* воздушная перспектива: дымка у земли плотнее */
          float f = 1.0 - exp(-vD * uBeta * mix(1.0, 0.45, vH));
          col = mix(col, uFog, f);
          gl_FragColor = vec4(col, al * (1.0 - 0.3 * f));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false; mesh.renderOrder = -1; mesh.name = 'warPlumes';
    mesh.userData.noAO = true; mesh.userData.noTrace = true; mesh.castShadow = false; mesh.receiveShadow = false;
    o.scene.add(mesh);
    return { mesh, uni, list, dispose() { o.scene.remove(mesh); g.dispose(); mat.dispose(); uni.uTex.value.dispose(); } };
  }

  /* ======================================================== воронки === */
  function craterTextures(THREE, concrete) {
    const N = 256, cA = canvas(N * 2, N), cN = canvas(N * 2, N), ga = cA.getContext('2d');
    const img = ga.createImageData(N * 2, N), nimg = cN.getContext('2d').createImageData(N * 2, N), A = img.data, NM = nimg.data;
    const R = rng(concrete ? 913 : 377);
    /* шум значений для неровностей */
    const G = 32, grid = new Float32Array(G * G); for (let i = 0; i < grid.length; i++) grid[i] = R();
    const vn = (x, y) => {
      x = ((x % G) + G) % G; y = ((y % G) + G) % G; const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const a = grid[y0 * G + x0], b = grid[y0 * G + (x0 + 1) % G], c = grid[((y0 + 1) % G) * G + x0], d = grid[((y0 + 1) % G) * G + (x0 + 1) % G];
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
    const fbm = (x, y) => vn(x, y) * 0.55 + vn(x * 2.1 + 5, y * 2.1 + 3) * 0.3 + vn(x * 4.3 + 9, y * 4.3 + 1) * 0.15;
    for (let v = 0; v < 2; v++) {
      /* v=0: мина (крутое дно, мало вала), v=1: снаряд (широкий вал, лучи выброса) */
      const rays = []; for (let i = 0; i < (v ? 34 : 22); i++) rays.push({ a: R() * TAU, w: 0.05 + R() * 0.12, l: 1.15 + R() * (v ? 0.55 : 0.4), k: 0.4 + R() * 0.6 });
      const H = (rr, ang, px, py) => {
        const wob = (fbm(px * 0.06 + v * 7, py * 0.06) - 0.5) * 0.22;
        const r = rr * (1 + wob);
        /* чаша — только в карте нормалей (рельеф прорезать нельзя: декаль лежит поверх грунта);
           вал — настоящей геометрией (placeCraters), в карте — лишь гребень и неровности */
        const bowl = r < 1 ? -(1 - r * r) * (v ? 0.55 : 0.75) : 0;
        const rim = (concrete ? 1 : 0.3) * (v ? 0.22 : 0.14) * Math.exp(-Math.pow((r - 0.98) / (v ? 0.2 : 0.15), 2));
        return bowl + rim + (fbm(px * 0.2, py * 0.2) - 0.5) * 0.06;
      };
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const px = x + v * N, i = (y * N * 2 + px) * 4;
        const dx = (x + 0.5) / N * 2 - 1, dy = (y + 0.5) / N * 2 - 1;
        const rr = Math.sqrt(dx * dx + dy * dy) * 1.65, ang = Math.atan2(dy, dx);   // 1,0 — край воронки, квад до 1,65
        const wob = (fbm(x * 0.06 + v * 7, y * 0.06) - 0.5) * 0.22, r = rr * (1 + wob);
        let ray = 0; for (const q of rays) { let da = Math.abs(((ang - q.a + Math.PI * 3) % TAU) - Math.PI); if (da < q.w && r < q.l) ray = Math.max(ray, q.k * (1 - da / q.w) * (1 - Math.max(0, r - 1) / (q.l - 1 + 1e-3))); }
        const nz = fbm(x * 0.35, y * 0.35);
        let cr, cg, cb, al;
        if (!concrete) {
          /* грунт: дно — горелое, вал — свежая (светлее) земля, выброс — пятнами */
          const inner = clamp(1 - r / 0.92, 0, 1), rimK = Math.exp(-Math.pow((r - 1.0) / 0.22, 2));
          cr = 58 - 26 * inner + 34 * rimK; cg = 47 - 22 * inner + 26 * rimK; cb = 36 - 17 * inner + 17 * rimK;
          const sc = 0.75 + 0.5 * nz; cr *= sc; cg *= sc; cb *= sc;
          /* вал (геометрия поднята до r ≈ 1,4) — непрозрачный, дальше — выброс пятнами и лучами */
          const solid = clamp((1.4 - r) / 0.16, 0, 1);
          al = Math.max(solid, clamp((ray * 0.9 + (nz > 0.62 ? 0.5 : 0)) * (1 - (r - 1.2) / 0.5), 0, 1));
          if (r > 1.25 && nz > 0.7 && R() < 0.12) al = Math.max(al, 0.9);               // комочки
          al *= clamp((1.65 - rr) / 0.12, 0, 1);
        } else {
          /* бетон: скол (серый, светлее), копоть звездой, тёмная выбоина */
          const inner = clamp(1 - r / 0.7, 0, 1), soot = clamp(ray * 1.2 + (r < 1.2 ? 0.5 * (1 - r / 1.2) : 0), 0, 1);
          cr = 120 - 70 * soot - 30 * inner; cg = 118 - 70 * soot - 30 * inner; cb = 114 - 68 * soot - 30 * inner;
          const sc = 0.82 + 0.36 * nz; cr *= sc; cg *= sc; cb *= sc;
          al = clamp(Math.max(r < 0.75 ? 1 : 0, soot * 0.85) * clamp((1.6 - rr) / 0.2, 0, 1), 0, 1);
        }
        A[i] = clamp(cr, 0, 255); A[i + 1] = clamp(cg, 0, 255); A[i + 2] = clamp(cb, 0, 255); A[i + 3] = clamp(al * 255, 0, 255);
        /* нормаль из профиля высоты (касательное пространство: x — u, y — v) */
        const e = 1.65 / N * 2, sx = (x + 0.5) / N * 2 - 1, sy = (y + 0.5) / N * 2 - 1;
        /* уклон на единицу длины (высота и r — в радиусах воронки); 0,7 — чаша старая, оплывшая */
        const kk = (concrete ? 0.25 : 0.7) / (2 * e * 1.65);
        const hx = (H(Math.hypot(sx + e, sy) * 1.65, 0, x + 1, y) - H(Math.hypot(sx - e, sy) * 1.65, 0, x - 1, y)) * kk;
        const hy = (H(Math.hypot(sx, sy + e) * 1.65, 0, x, y + 1) - H(Math.hypot(sx, sy - e) * 1.65, 0, x, y - 1)) * kk;
        let nx = -hx, ny = hy, nzv = 1; const L = Math.hypot(nx, ny, nzv); nx /= L; ny /= L; nzv /= L;
        NM[i] = (nx * 0.5 + 0.5) * 255; NM[i + 1] = (ny * 0.5 + 0.5) * 255; NM[i + 2] = (nzv * 0.5 + 0.5) * 255; NM[i + 3] = 255;
      }
    }
    ga.putImageData(img, 0, 0); cN.getContext('2d').putImageData(nimg, 0, 0);
    const map = new THREE.CanvasTexture(cA); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    const nrm = new THREE.CanvasTexture(cN); nrm.colorSpace = THREE.NoColorSpace;
    /* та же неровность края, что в рисунке, — чтобы вал геометрии лёг ровно на светлое кольцо текстуры */
    const wob = (x, y, v) => (fbm(x * 0.06 + v * 7, y * 0.06) - 0.5) * 0.22;
    return { map, nrm, wob, N };
  }

  function placeCraters(THREE, o, R, frame, q, phys) {
    const w = o.world, b = w.bounds, hAt = (x, z) => (w.heightAt ? w.heightAt(x, z) : 0);
    if (!b) return null;
    const concrete = w.mapId === 'angar_map';
    const want = q === 'low' ? 10 : q === 'ultra' ? 26 : q === 'high' ? 20 : 15;
    const bases = w.bases ? Object.values(w.bases) : [];
    const RA = root.RAPIER, sim = phys && phys.sim, terrainH = phys && phys.terrain && phys.terrain.handle;
    const free = (x, y, z, r) => {
      if (!sim || !RA) return true;
      let hit = false;
      try {
        sim.intersectionsWithShape({ x, y: y + 1.1, z }, { x: 0, y: 0, z: 0, w: 1 }, new RA.Cylinder(1.0, r), (col) => {
          if (col.handle === terrainH) return true;
          hit = true; return false;
        }, RA.QueryFilterFlags.EXCLUDE_SENSORS, 0x00020001);
      } catch (e) { return false; }
      if (hit) return false;
      /* под открытым небом: вверх до 40 м ничего */
      try { if (phys.ray({ x, y: y + 2.2, z }, { x: 0, y: 1, z: 0 }, 40)) return false; } catch (e) { /* */ }
      /* сверху вниз первым попадается грунт, а не крыша/настил */
      try { const g = phys.ray({ x, y: y + 30, z }, { x: 0, y: -1, z: 0 }, 32); if (g && g.collider && g.collider.handle !== terrainH) return false; } catch (e) { /* */ }
      return true;
    };
    const items = [];
    for (let tries = 0; tries < want * 30 && items.length < want; tries++) {
      const big = R() < 0.35, r = big ? 2.0 + R() * 1.1 : 0.75 + R() * 0.5;
      const x = b.x0 + 8 + R() * (b.x1 - b.x0 - 16), z = b.z0 + 8 + R() * (b.z1 - b.z0 - 16), y = hAt(x, z);
      if (bases.some((p) => Math.hypot(p.x - x, p.z - z) < 32)) continue;
      if (items.some((c) => Math.hypot(c.x - x, c.z - z) < (c.r + r) * 1.8 + 1.5)) continue;
      if (Number.isFinite(w.waterY) && y < w.waterY + 0.35) continue;
      if (w.waterAt) { try { const h = w.waterAt(x, z); if (h !== null && h !== undefined) continue; } catch (e) { /* */ } }
      let steep = false; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; if (Math.abs(hAt(x + Math.cos(a) * r * 1.4, z + Math.sin(a) * r * 1.4) - y) > r * 0.45) { steep = true; break; } }
      if (steep || !free(x, y, z, r * 0.9 + 0.2)) continue;
      items.push({ x, y, z, r, v: big ? 1 : 0, a: R() * TAU, old: R() });
    }
    if (!items.length) return null;
    /* декали: полярная сетка по рельефу. Вал выброшенного грунта — настоящая геометрия над землёй:
       ближний вал заслоняет часть дна, дальний внутренний склон смотрит на игрока и освещается
       солнцем — по этому глаз и читает яму (дно ниже грунта опустить нельзя — его не прорезать).
       Высота вала — как у настоящих: мина 82 мм — 6–10 см, снаряд 122/152 мм — 22–34 см
       (старая воронка оплыла — ниже); на бетоне вала нет. Коллайдера у вала нет. */
    const T = craterTextures(THREE, concrete);
    const RINGS = [0, 0.2, 0.4, 0.56, 0.68, 0.76, 0.84, 0.91, 0.97, 1.02, 1.08, 1.15, 1.23, 1.32, 1.42, 1.53, 1.65], SEG = 24;
    const bermK = (r) => (r <= 0.72 || r >= 1.42 ? 0 : r < 1.0 ? Math.pow(Math.sin((r - 0.72) / 0.28 * Math.PI / 2), 1.6) : Math.pow(Math.cos((r - 1.0) / 0.42 * Math.PI / 2), 1.3));
    const pos = [], uv = [], idx = [];
    for (const c of items) {
      const o0 = pos.length / 3, ca = Math.cos(c.a), sa = Math.sin(c.a);
      const bH = concrete ? 0 : c.r * (c.v ? 0.11 : 0.08) * (1 - 0.3 * c.old);
      for (let i = 0; i < RINGS.length; i++) for (let j = 0; j < SEG; j++) {
        const rr = RINGS[i], an = j / SEG * TAU, lx = Math.cos(an) * rr, lz = Math.sin(an) * rr;
        const x = c.x + (lx * ca - lz * sa) * c.r, z = c.z + (lx * sa + lz * ca) * c.r;
        /* точка текстуры (u вдоль lx, v вдоль lz; холст перевёрнут по v) → тот же радиус, что у рисунка */
        const tx = (c.v ? T.N : 0) + (0.5 + lx / 1.65 * 0.5) * T.N, ty = (0.5 - lz / 1.65 * 0.5) * T.N;
        const rt = rr * (1 + T.wob(tx - (c.v ? T.N : 0), ty, c.v));
        const rim = bH * bermK(rt) * (1 + 0.15 * Math.sin(an * 3 + c.a * 5));
        pos.push(x, hAt(x, z) + 0.03 + rim, z);
        uv.push((c.v ? 0.5 : 0) + (0.5 + lx / 1.65 * 0.5) * 0.5, 0.5 + lz / 1.65 * 0.5);
      }
      for (let i = 0; i < RINGS.length - 1; i++) for (let j = 0; j < SEG; j++) {
        const a = o0 + i * SEG + j, b2 = o0 + i * SEG + (j + 1) % SEG, c2 = a + SEG, d = b2 + SEG;
        idx.push(a, b2, c2, b2, d, c2);   /* против часовой сверху — нормаль вверх (иначе грань отсекается) */
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ map: T.map, normalMap: T.nrm, normalScale: new THREE.Vector2(1, 1), roughness: 0.97, metalness: 0,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = 'warCraters'; mesh.receiveShadow = true; mesh.castShadow = false; mesh.renderOrder = 1;
    mesh.userData.noTrace = true; mesh.userData.noImpact = true;
    o.scene.add(mesh);
    /* комья земли / куски бетона вокруг */
    let clods = null;
    {
      const list = [];
      for (const c of items) {
        const n = Math.round((concrete ? 6 : 10) + c.r * (concrete ? 4 : 9) * (1 - c.old * 0.5));
        for (let k = 0; k < n; k++) {
          const an = R() * TAU, rr = c.r * (0.95 + Math.pow(R(), 1.6) * 1.3), x = c.x + Math.cos(an) * rr, z = c.z + Math.sin(an) * rr;
          const s = (concrete ? 0.05 : 0.035) + R() * (c.v ? 0.1 : 0.055);
          list.push([x, hAt(x, z) + s * 0.35, z, s, R() * TAU, R() * TAU, 0.75 + R() * 0.45]);
        }
      }
      const geo = new THREE.DodecahedronGeometry(1, 0);
      /* комья — цвета свежего грунта с вала (не чёрные камни), у каждого своя яркость */
      const cm = new THREE.MeshStandardMaterial({ color: concrete ? 0x6d6b66 : 0x5c4a36, roughness: 1, metalness: 0, flatShading: true });
      clods = new THREE.InstancedMesh(geo, cm, list.length);
      const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), cc = new THREE.Color();
      list.forEach((L, i) => { e.set(L[4], L[5], 0); qq.setFromEuler(e); sv.set(L[3], L[3] * 0.62, L[3] * 0.85); pv.set(L[0], L[1], L[2]); clods.setMatrixAt(i, m4.compose(pv, qq, sv)); clods.setColorAt(i, cc.setScalar(L[6])); });
      if (clods.instanceColor) clods.instanceColor.needsUpdate = true;
      clods.instanceMatrix.needsUpdate = true; clods.computeBoundingSphere();
      clods.name = 'warClods'; clods.receiveShadow = true; clods.castShadow = false; clods.userData.noTrace = true;
      o.scene.add(clods);
    }
    return {
      items, mesh, clods,
      dispose() { o.scene.remove(mesh); g.dispose(); mat.dispose(); T.map.dispose(); T.nrm.dispose(); if (clods) { o.scene.remove(clods); clods.geometry.dispose(); clods.material.dispose(); } }
    };
  }

  /* ===================================================== далёкий бой === */
  function makeBattle(o, R, frame) {
    const B = { t: 0, next: 6 + R() * 8, I: 0.55, It: 0.6, nextI: 50, side: R() < 0.5 ? 1 : -1, stats: { mg: 0, auto: 0, single: 0, art: 0, duel: 0 } };
    const MG = ['akm'], AUTO = ['ak74', 'akm', 'm416'], SINGLE = ['svd', 'akm', 'ak74'];
    const pick = (a) => a[(R() * a.length) | 0];
    /* точка на линии фронта: концы (frontA, frontA+π), иногда — глубже за противником */
    const spot = (dMin, dMax) => {
      const deep = R() < 0.2, end = R() < 0.62 ? B.side : -B.side;
      const a = deep ? frame.axisA + (R() - 0.5) * 1.2 : frame.frontA + (end < 0 ? Math.PI : 0) + (R() - 0.5) * 1.1;
      const d = dMin + R() * (dMax - dMin);
      return { x: frame.cx + Math.cos(a) * d, z: frame.cz + Math.sin(a) * d, d, a };
    };
    const listen = (D) => { if (D && D.listen && o.camera) D.listen(o.camera.position, o.camera.quaternion); };
    const far = (p) => { const D = o.audio && o.audio.dist; if (!D || !D.far) return false; listen(D); return D.far(p); };
    const panOf = (x, z) => {
      const D = o.audio && o.audio.dist, GD = root.GAudioDist;
      if (!D || !GD || !GD.panFrom) return 0;
      listen(D);
      const L = D.L; return GD.panFrom(x - L.x, z - L.z, L.rx, L.rz, L.fx, L.fz).pan;
    };
    function event() {
      const r = R(), I = B.I;
      if (r < 0.05 + 0.04 * I) {
        /* артиллерия: одиночный или серия 2–4 (батарея), редко и глухо — за 4–9 км это
           низкий удар, а не взрыв рядом (замер: ≈ −35 дБ RMS против −33 у выстрела в 120 м) */
        const p = spot(4000, 9000), A = o.audio;
        if (A && A.artillery) { A.artillery({ n: R() < 0.55 ? 1 : 2 + ((R() * 3) | 0), pan: panOf(p.x, p.z) * 0.8, gain: clamp(0.45 + 0.5 * I, 0.35, 1) * (0.7 + R() * 0.3) * 0.5 }); B.stats.art++; }
        return;
      }
      if (r < 0.42) {
        /* пулемёт: очередь 4–12, иногда длинная; часто — ответ */
        const p = spot(1100, 3600), n = R() < 0.25 ? 12 + ((R() * 10) | 0) : 4 + ((R() * 8) | 0);
        far({ id: pick(MG), n, rpm: 640 + R() * 80, d: p.d, x: p.x, z: p.z, gain: 1.1 });
        B.stats.mg++;
        if (R() < 0.55) { const q = spot(1100, 3600); far({ id: pick(AUTO), n: 3 + ((R() * 6) | 0), rpm: 620, d: q.d, x: q.x, z: q.z, delay: 0.8 + R() * 2.4, gain: 0.95 }); B.stats.duel++; }
        return;
      }
      if (r < 0.75) {
        /* автоматы: короткие по 2–5, перестрелка из 2–4 очередей */
        const p = spot(900, 2800), m = 2 + ((R() * 3) | 0);
        let t = 0;
        for (let i = 0; i < m; i++) {
          const q = i % 2 ? spot(900, 2800) : p;
          far({ id: pick(AUTO), n: 2 + ((R() * 4) | 0), rpm: 600 + R() * 100, d: q.d, x: q.x, z: q.z, delay: t, gain: 0.9 });
          t += 0.7 + R() * 2.2;
        }
        B.stats.auto++;
        return;
      }
      /* одиночные: снайпер/прицельные, 1–3 с паузами */
      const p = spot(800, 2600), n = 1 + ((R() * 3) | 0);
      let t = 0;
      for (let i = 0; i < n; i++) { far({ id: pick(SINGLE), n: 1, d: p.d, x: p.x, z: p.z, delay: t, gain: 0.85 }); t += 0.9 + R() * 2.5; }
      B.stats.single++;
    }
    B.update = (dt, on) => {
      if (!on || !(dt > 0)) return;
      dt = Math.min(dt, 0.1);
      B.t += dt;
      /* интенсивность: затишья (≈25 %) и оживление, переход ~15 с */
      B.nextI -= dt;
      if (B.nextI < 0) { B.nextI = 45 + R() * 90; B.It = R() < 0.25 ? 0.06 : 0.3 + R() * 0.7; if (R() < 0.3) B.side = -B.side; }
      B.I += (B.It - B.I) * Math.min(1, dt / 15);
      B.next -= dt;
      if (B.next > 0) return;
      const perMin = 0.5 + 6.5 * B.I;                       // событий в минуту
      B.next = -Math.log(1 - R() * 0.97) * 60 / perMin;
      try { event(); } catch (e) { /* звук не критичен */ }
    };
    return B;
  }

  /* ========================================================= сборка === */
  function create(THREE, o) {
    const w = o.world, id = String(w.mapId || 'polygon'), R = rng(hashStr('war:' + id));
    const b = w.bounds || { x0: -100, x1: 100, z0: -100, z1: 100 };
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    let axisA = R() * TAU;
    if (w.bases && w.bases.alpha && w.bases.delta) axisA = Math.atan2(w.bases.delta.z - w.bases.alpha.z, w.bases.delta.x - w.bases.alpha.x);
    const frame = { cx, cz, axisA, frontA: axisA + Math.PI / 2, y0: w.heightAt ? w.heightAt(cx, cz) : 0 };
    const q = o.quality || 'medium';
    const W = { frame, plumes: null, craters: null, battle: null, quality: q, on: true };
    try { W.plumes = makePlumes(THREE, o, rng(hashStr('plume:' + id)), frame, q); } catch (e) { console.warn('war plumes:', e && e.message); }
    W.battle = makeBattle(o, rng(hashStr('battle:' + id) ^ (Date.now() & 0xffff)), frame);
    let craterTry = 0;
    W.update = (dt, t, st) => {
      st = st || {};
      if (W.plumes) {
        const u = W.plumes.uni;
        u.uT.value = t;
        if (o.sunDir) u.uSun.value.copy(o.sunDir);
        if (o.sunColor) u.uSunC.value.copy(o.sunColor).multiplyScalar(o.sunK ? o.sunK() : 1);
        if (o.fogColor) { u.uFog.value.copy(o.fogColor).multiplyScalar(1.12); u.uAmb.value.copy(o.fogColor).multiplyScalar(2.2); }
        const GG = root.GGloom;
        if (GG && GG.W) u.uWind.value.set(GG.W.x * 4.5 + 0.8, GG.W.y * 4.5 + 0.4);
        if (o.camera) u.uFar.value = Math.max(50, o.camera.far * 0.98);
      }
      /* воронки — один раз, когда готова физика (проверка «открытого грунта») */
      if (!W.craters && o.craters !== false && craterTry < 3 && st.physReady) {
        craterTry++;
        try { W.craters = placeCraters(THREE, o, rng(hashStr('crater:' + id)), frame, q, root.GPhysics ? root.GPhysics.get(w) : null); if (W.craters) craterTry = 9; }
        catch (e) { console.warn('war craters:', e && e.message); }
      }
      if (W.battle) W.battle.update(dt, W.on && !st.paused && !!st.battle);
    };
    W.dispose = () => { if (W.plumes) W.plumes.dispose(); if (W.craters) W.craters.dispose(); };
    return W;
  }
  root.GWarAtmos = { create };
})(typeof self !== 'undefined' ? self : this);
