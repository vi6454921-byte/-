/* ==========================================================================
   МОДУЛЬ: GZones — новые зоны карты (v8)
   ==========================================================================
   Рельеф и вода зон — в 17_world (heightAt/waterAt), здесь — всё, что на них:
   • овраг: ручей (лента воды с течением, пена, камни), бревно-мостик поперёк
     (по нему можно пройти — цепочка опор), упавший ствол в русле;
   • болото: вода окнами между кочками, ряска, кочки осоки, сухой рогоз,
     сухие берёзы (две — поперёк воды);
   • гарь: обугленные пни и упавшие стволы (сам сухостой — в 17_world);
   • вырубка: пни на месте спиленных сосен, штабель брёвен, кучи порубочных
     остатков;
   • следы войны: ящики из-под патронов у блиндажа, оплывшее пулемётное
     гнездо из мешков (пули выбивают песок), обрывки брезента, сигнальная
     проволока с консервными банками (звенят от ветра, шагов и пуль),
     стреляные гильзы на дне траншеи;
   • жизнь: падающие листья у берёз, капли с веток после дождя, журчание.
   Пулям все предметы доступны через world.v8props (аналитические тела),
   игроку — через world.colliders.
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.GUtil;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lin = (c) => Math.pow(Math.max(0, c), 2.2);

  function Merge() { this.p = []; this.n = []; this.u = []; this.c = []; }
  Merge.prototype.add = function (geo, m, col) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    if (m) g.applyMatrix4(m);
    const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      this.p.push(x, y, z);
      this.n.push(N ? N.getX(i) : 0, N ? N.getY(i) : 1, N ? N.getZ(i) : 0);
      this.u.push(UV ? UV.getX(i) : 0, UV ? UV.getY(i) : 0);
      const c = typeof col === 'function' ? col(x, y, z) : (col || [1, 1, 1]);
      this.c.push(c[0], c[1], c[2]);
    }
    g.dispose();
    return this;
  };
  Merge.prototype.build = function (THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  };
  Merge.prototype.empty = function () { return this.p.length === 0; };

  function canvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    return [c, c.getContext('2d')];
  }

  function create(THREE, o) {
    const scene = o.scene, world = o.world, camera = o.camera, audio = o.audio;
    const F = world.layout;
    if (!F || !F.RV || !world.heightAt) return null;
    const H = world.heightAt;
    const rnd = U.rng(880088), R = (a, b) => a + (b - a) * rnd();
    const grp = new THREE.Group(); grp.name = 'zones_v8'; scene.add(grp);
    const Z = { group: grp, stats: { meshes: 0 }, quality: 'medium' };
    const disposables = [];
    const cols = world.colliders || [];
    const PX = world.v8props || null;
    /* v10: коллизии — по всей зоне, куда может дойти игрок (до края минного поля) */
    const MFp = world && world.minefield, PLX = MFp ? MFp.XF + MFp.depth + 1.5 : 36.1, PLZ = MFp ? MFp.ZF + MFp.depth + 1.5 : 41.1;
    const inPlay = (x, z) => Math.abs(x) < PLX && Math.abs(z) < PLZ;
    const V = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S3 = new THREE.Vector3();
    const mtx = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().compose(V.set(x, y, z), Q.setFromEuler(E.set(rx || 0, ry || 0, rz || 0, 'YXZ')), S3.set(sx || 1, sy || sx || 1, sz || sx || 1));
    const mesh = (geo, mat, name, cast) => {
      const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = cast !== false; m.receiveShadow = true;
      m.matrixAutoUpdate = false; m.updateMatrix(); grp.add(m); disposables.push(geo); Z.stats.meshes++; return m;
    };
    const texCache = {};
    const etex = (k, srgb, rx, ry) => {
      const key = k + '|' + rx + '|' + ry;
      if (texCache[key]) return texCache[key];
      const t = world.envTex ? world.envTex(k, srgb, 8) : null;
      if (t) t.repeat.set(rx || 1, ry || rx || 1);
      return (texCache[key] = t);
    };
    const ctex = (cv, srgb, rep) => {
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      if (rep) t.repeat.set(rep[0], rep[1]);
      return t;
    };
    const addCol = (c) => { if (inPlay(c.x !== undefined ? c.x : (c.x0 + c.x1) / 2, c.z !== undefined ? c.z : (c.z0 + c.z1) / 2)) cols.push(c); };

    /* ------------------------------------------------ материалы ---- */
    const barkMat = new THREE.MeshStandardMaterial({ map: etex('bark_diff', true, 1, 1), normalMap: etex('bark_nor', false, 1, 1), color: 0xffffff, vertexColors: true, roughness: 0.95 });
    /* срез: годичные кольца, трещины от сердцевины, серость старого спила */
    const ringTex = (() => {
      const [c, g] = canvas(256, 256);
      g.fillStyle = '#8a7a62'; g.fillRect(0, 0, 256, 256);
      for (let r = 120; r > 2; r -= 2 + Math.random() * 3) {
        g.strokeStyle = 'rgba(70,52,34,' + (0.25 + Math.random() * 0.35) + ')'; g.lineWidth = 0.8 + Math.random() * 1.2;
        g.beginPath(); g.ellipse(128 + Math.random() * 2, 128 + Math.random() * 2, r, r * (0.95 + Math.random() * 0.06), 0, 0, TAU); g.stroke();
      }
      g.strokeStyle = 'rgba(30,22,14,0.7)'; g.lineWidth = 2;
      for (let i = 0; i < 5; i++) { const a = Math.random() * TAU; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * (40 + Math.random() * 80), 128 + Math.sin(a) * (40 + Math.random() * 80)); g.stroke(); }
      const gr = g.createRadialGradient(128, 128, 90, 128, 128, 128); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(40,30,20,0.9)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      return ctex(c, true);
    })();
    const cutMat = new THREE.MeshStandardMaterial({ map: ringTex, color: 0xffffff, vertexColors: true, roughness: 0.9 });
    /* береста: белая, с чёрными чечевичками и трещинами, у комля — чёрная */
    const birchTex = (() => {
      const [c, g] = canvas(256, 512);
      g.fillStyle = '#d9d6cc'; g.fillRect(0, 0, 256, 512);
      for (let i = 0; i < 260; i++) {
        const y = Math.random() * 512, x = Math.random() * 256, w = 6 + Math.random() * 40, h = 1 + Math.random() * 3.5;
        g.fillStyle = 'rgba(25,22,20,' + (0.5 + Math.random() * 0.5) + ')'; g.fillRect(x, y, w, h);
        if (x + w > 256) g.fillRect(x - 256, y, w, h);
      }
      for (let i = 0; i < 26; i++) {
        const y = Math.random() * 512, x = Math.random() * 256;
        g.fillStyle = 'rgba(20,18,16,0.85)'; g.beginPath(); g.ellipse(x, y, 8 + Math.random() * 18, 3 + Math.random() * 8, 0, 0, TAU); g.fill();
      }
      const gr = g.createLinearGradient(0, 512, 0, 380); gr.addColorStop(0, 'rgba(30,27,24,0.95)'); gr.addColorStop(1, 'rgba(30,27,24,0)');
      g.fillStyle = gr; g.fillRect(0, 380, 256, 132);
      return ctex(c, true);
    })();
    const birchMat = new THREE.MeshStandardMaterial({ map: birchTex, color: 0xffffff, vertexColors: true, roughness: 0.82 });
    /* уголь: «крокодиловая кожа» обугленной древесины */
    const charTex = (() => {
      const [c, g] = canvas(256, 256);
      g.fillStyle = '#141210'; g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 9 + Math.random() * 5) {
        let x = 0;
        while (x < 256) {
          const w = 10 + Math.random() * 18;
          const v = 22 + Math.random() * 22;
          g.fillStyle = 'rgb(' + v + ',' + (v * 0.92 | 0) + ',' + (v * 0.85 | 0) + ')';
          g.fillRect(x + 1.5, y + 1.5, w - 3, 8);
          x += w;
        }
      }
      return ctex(c, true);
    })();
    const charMat = new THREE.MeshStandardMaterial({ map: charTex, color: 0xffffff, vertexColors: true, roughness: 0.75, metalness: 0.0 });
    const rwood = etex('rwood_diff', true, 1, 1);
    const greyLog = new THREE.MeshStandardMaterial({ map: etex('bark_diff', true, 1, 1), normalMap: etex('bark_nor', false, 1, 1), color: 0xb9b2a6, vertexColors: true, roughness: 0.96 });
    const rotMat = new THREE.MeshStandardMaterial({ map: rwood, color: 0xffffff, vertexColors: true, roughness: 0.95 });
    const stoneMat = new THREE.MeshStandardMaterial({ map: etex('rock_diff', true, 1, 1), normalMap: etex('rock_nor', false, 1, 1), color: 0x9a968c, vertexColors: true, roughness: 0.6 });

    /* ============================================ ОВРАГ И РУЧЕЙ ==== */
    const RV = F.RV;
    const lat = (ang) => [Math.cos(ang), -Math.sin(ang)];
    let brookMat = null;
    (function brook() {
      const wN = world.waterNormal ? world.waterNormal.clone() : null;
      if (wN) { wN.repeat.set(1, 1); wN.needsUpdate = true; }
      brookMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.045, 0.042, 0.03), roughness: 0.07, metalness: 0,
        normalMap: wN, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 0.4, transparent: true, opacity: 0.9, depthWrite: false });
      const U0 = { uT: world.windTime || { value: 0 } };
      brookMat.customProgramCacheKey = () => 'brook-v8';
      brookMat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U0);
        sh.vertexShader = 'varying vec2 vBk;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvBk = uv;');
        sh.fragmentShader = 'varying vec2 vBk;\nuniform float uT;\nfloat bkH(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }\nfloat bkN(vec2 x){ vec2 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(mix(bkH(i), bkH(i+vec2(1,0)), f.x), mix(bkH(i+vec2(0,1)), bkH(i+vec2(1,1)), f.x), f.y); }\n' + sh.fragmentShader
          .replace('#include <normal_fragment_maps>', `
            #ifdef USE_NORMALMAP_TANGENTSPACE
              float sp = 0.55 + 0.35 * sin(vBk.y * 1.7);
              vec3 n1 = texture2D(normalMap, vec2(vBk.x * 0.9 - uT * 0.42 * sp, vBk.y * 0.6)).xyz * 2.0 - 1.0;
              vec3 n2 = texture2D(normalMap, vec2(vBk.x * 1.9 - uT * 0.7 * sp + 0.37, vBk.y * 1.3 + 0.21)).xyz * 2.0 - 1.0;
              vec3 mapN = vec3((n1.xy + n2.xy) * normalScale, 1.0);
              normal = normalize(tbn * mapN);
            #else
              #include <normal_fragment_maps>
            #endif`)
          .replace('#include <color_fragment>', `#include <color_fragment>
            float fo = bkN(vec2(vBk.x * 6.0 - uT * 2.6, vBk.y * 5.0)) * bkN(vec2(vBk.x * 2.0 - uT * 1.3, vBk.y * 2.0 + 3.0));
            diffuseColor.rgb += vec3(0.30, 0.29, 0.26) * smoothstep(0.42, 0.62, fo);`);
      };
      /* лента вдоль оси: шаг 0.6 м, 7 колонок поперёк (±2.6 м) */
      const pos = [], uv = [], idx = [];
      const COLS = 7, HW = 2.6;
      let rows = 0;
      for (let s = 0; s <= RV.len; s += 0.6) {
        const q = RV.axis(s), l = lat(q[2]), y = RV.bed(s) + 0.05;
        for (let c = 0; c < COLS; c++) {
          const o = -HW + (2 * HW) * c / (COLS - 1);
          pos.push(q[0] + l[0] * o, y, q[1] + l[1] * o);
          uv.push(s * 0.35, o);
        }
        rows++;
      }
      for (let r = 0; r < rows - 1; r++) for (let c = 0; c < COLS - 1; c++) {
        const a = r * COLS + c, b = a + COLS;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      /* нормали строго вверх (вода горизонтальна поперёк) */
      const N = g.attributes.normal; for (let i = 0; i < N.count; i++) N.setXYZ(i, 0, 1, 0);
      const m = mesh(g, brookMat, 'brook_water', false);
      m.renderOrder = 1;
      /* камни в русле: окатанные, мокрые, часть торчит из воды */
      const st = new Merge();
      const sg = new THREE.IcosahedronGeometry(1, 1);
      { const P = sg.attributes.position; for (let i = 0; i < P.count; i++) { const k = 1 + 0.18 * Math.sin(P.getX(i) * 5 + P.getZ(i) * 3) * Math.cos(P.getY(i) * 4); P.setXYZ(i, P.getX(i) * k, P.getY(i) * k, P.getZ(i) * k); } sg.computeVertexNormals(); }
      for (let i = 0; i < 70; i++) {
        const s = R(14, RV.len - 6), q = RV.axis(s), l = lat(q[2]), off = R(-1.6, 1.6);
        const x = q[0] + l[0] * off, z = q[1] + l[1] * off, r = R(0.08, 0.32) * (rnd() < 0.15 ? 2 : 1);
        const y = H(x, z) + r * R(-0.2, 0.25);
        const wet = Math.abs(off) < 1.0;
        st.add(sg, mtx(x, y, z, R(0, 3), R(0, 3), 0, r * R(1, 1.6), r * R(0.5, 0.8), r), () => wet ? [0.42, 0.42, 0.38] : [0.75, 0.74, 0.68]);
        if (r > 0.25 && inPlay(x, z) && PX) PX.sph(x, y, z, r * 0.9, { mat: 'rock', name: 'stone' });
      }
      mesh(st.build(THREE), stoneMat, 'brook_stones');
    })();

    /* бревно-мостик поперёк оврага и ствол, упавший в русло */
    const bridges = [];
    function logBetween(m, x0, z0, x1, z1, r, colFn, sink) {
      const y0 = H(x0, z0) + r * (sink || 0.7), y1 = H(x1, z1) + r * (sink || 0.7);
      const L = Math.hypot(x1 - x0, z1 - z0, y1 - y0);
      const g = new THREE.CylinderGeometry(r * 0.82, r, L, 12, Math.max(2, Math.round(L / 1.2)), false);
      const UV = g.attributes.uv; for (let i = 0; i < UV.count; i++) UV.setXY(i, UV.getX(i) * 2, UV.getY(i) * L / 1.6);
      const dir = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize();
      const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const M = new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), qq, new THREE.Vector3(1, 1, 1));
      m.add(g, M, colFn);
      return { x0, y0, z0, x1, y1, z1, r, L };
    }
    (function ravineLogs() {
      const logs = new Merge(), ends = new Merge();
      const mk = (s, half, r, walk) => {
        const q = RV.axis(s), l = lat(q[2]), sk = R(-0.25, 0.25);
        const x0 = q[0] - l[0] * half + l[1] * sk, z0 = q[1] - l[1] * half - l[0] * sk;
        const x1 = q[0] + l[0] * half - l[1] * sk, z1 = q[1] + l[1] * half + l[0] * sk;
        const b = logBetween(logs, x0, z0, x1, z1, r, () => [0.8, 0.78, 0.72], 0.6);
        /* торцы: светлый спил/слом */
        const dx = (b.x1 - b.x0) / b.L, dy = (b.y1 - b.y0) / b.L, dz = (b.z1 - b.z0) / b.L;
        for (const e of [[b.x0, b.y0, b.z0, -1], [b.x1, b.y1, b.z1, 1]]) {
          const c = new THREE.CircleGeometry(e[3] < 0 ? r : r * 0.82, 12);
          const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(dx * e[3], dy * e[3], dz * e[3]));
          ends.add(c, new THREE.Matrix4().compose(new THREE.Vector3(e[0], e[1], e[2]), qq, new THREE.Vector3(1, 1, 1)), () => [0.7, 0.66, 0.6]);
        }
        /* опоры для ног и препятствие (цепочка цилиндров вдоль ствола) */
        const n = Math.ceil(b.L / 0.35);
        for (let i = 0; i <= n; i++) {
          const u = i / n, x = b.x0 + (b.x1 - b.x0) * u, z = b.z0 + (b.z1 - b.z0) * u, y = b.y0 + (b.y1 - b.y0) * u;
          if (!inPlay(x, z)) continue;
          cols.push({ type: 'cyl', x, z, r: r * 0.9, h: 1, _top: y + r * 0.92, log: true });
        }
        if (PX) {
          const n2 = Math.ceil(b.L / 0.6);
          for (let i = 0; i <= n2; i++) {
            const u = i / n2, x = b.x0 + (b.x1 - b.x0) * u, z = b.z0 + (b.z1 - b.z0) * u, y = b.y0 + (b.y1 - b.y0) * u;
            PX.sph(x, y, z, r, { mat: 'wood', name: 'log', tree: { x, z, y: y - r, hs: 0.2, rs: r / 0.24, dead: true } });
          }
        }
        if (walk) bridges.push(b);
        return b;
      };
      mk(38, 5.6, 0.27, true);
      mk(60, 4.8, 0.22, false);
      mk(24, 5.2, 0.24, false);
      mesh(logs.build(THREE), greyLog, 'ravine_logs');
      mesh(ends.build(THREE), cutMat, 'ravine_log_ends');
    })();

    /* ============================================ БОЛОТО ============ */
    const SW = F.SW;
    let swampMat = null;
    (function swamp() {
      const wN = world.waterNormal ? world.waterNormal.clone() : null;
      if (wN) { wN.repeat.set(0.25, 0.25); wN.needsUpdate = true; }
      swampMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.035, 0.032, 0.02), roughness: 0.16, metalness: 0,
        normalMap: wN, normalScale: new THREE.Vector2(0.12, 0.12), envMapIntensity: 0.25, transparent: true, depthWrite: false });
      const WU = world.waterUniforms || {};
      const U1 = { uSw: { value: new THREE.Vector4(SW.x, SW.z, SW.rx, SW.rz) }, uRip: WU.uRip || { value: [] }, uWT: WU.uWT || { value: 0 }, uRainW: WU.uRainW || { value: 0 } };
      swampMat.customProgramCacheKey = () => 'swamp-v8';
      swampMat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U1);
        sh.vertexShader = 'varying vec3 vSw;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSw = (modelMatrix * vec4(position, 1.0)).xyz;');
        sh.fragmentShader = `varying vec3 vSw;
          uniform vec4 uSw; uniform vec4 uRip[8]; uniform float uWT, uRainW;
          float swH(vec2 p){ p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
          float swN(vec2 x){ vec2 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(mix(swH(i), swH(i+vec2(1,0)), f.x), mix(swH(i+vec2(0,1)), swH(i+vec2(1,1)), f.x), f.y); }
          vec2 swRings(vec2 p) {
            vec2 acc = vec2(0.0);
            for (int i = 0; i < 8; i++) {
              float age = uWT - uRip[i].z;
              if (age < 0.0 || age > 3.0) continue;
              vec2 d = p - uRip[i].xy; float r = length(d), front = age * 0.42;
              float w = exp(-age * 1.3) * uRip[i].w * smoothstep(0.35, 0.0, abs(r - front)) / (1.0 + r * 2.0);
              acc += d / max(r, 1e-3) * sin((r - front) * 38.0) * w;
            }
            return acc;
          }
          float swDuck;
        ` + sh.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>
            float swE = length((vSw.xz - uSw.xy) / uSw.zw);
            if (swE > 1.5) discard;
            float dn = swN(vSw.xz * 0.35) * 0.65 + swN(vSw.xz * 1.7) * 0.35;
            swDuck = smoothstep(0.5, 0.58, dn + 0.08 * swN(vSw.xz * 9.0));
            float dots = smoothstep(0.62, 0.7, swN(vSw.xz * 14.0)) * smoothstep(0.38, 0.5, dn);
            swDuck = max(swDuck, dots * 0.9);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.055, 0.085, 0.012) * (0.8 + 0.4 * swN(vSw.xz * 5.0)), swDuck);
            diffuseColor.a *= 1.0 - smoothstep(1.3, 1.5, swE);`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.75, swDuck);')
          .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n{ vec2 rg = swRings(vSw.xz) * (1.0 - swDuck * 0.8); normal = normalize(normal + (viewMatrix * vec4(rg.x * 0.25, 0.0, rg.y * 0.25, 0.0)).xyz); }');
      };
      const g = new THREE.PlaneGeometry(SW.rx * 3.1, SW.rz * 3.1, 1, 1);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, swampMat); m.position.set(SW.x, SW.L, SW.z); m.name = 'swamp_water'; m.receiveShadow = true; m.renderOrder = 1;
      grp.add(m); disposables.push(g);

      /* кочки с осокой: пучки карточек (текстура травы мира, сухой тон) */
      const tufts = etex('tufts', true, 1, 1);
      const tuftMat = new THREE.MeshStandardMaterial({ map: tufts, alphaTest: 0.45, side: THREE.DoubleSide, color: new THREE.Color(0.95, 0.82, 0.55), roughness: 0.95, vertexColors: true });
      const tm = new Merge(), card = new THREE.PlaneGeometry(1, 1); card.translate(0, 0.5, 0);
      let nt = 0;
      for (let i = 0; i < 1600 && nt < 230; i++) {
        const a = rnd() * TAU, r = Math.sqrt(rnd()) * 1.2;
        const x = SW.x + Math.cos(a) * SW.rx * r, z = SW.z + Math.sin(a) * SW.rz * r;
        const y = H(x, z);
        if (F.swampE(x, z) > 1.15 || y < SW.L + 0.04 || y > SW.L + 0.45) continue;
        nt++;
        const s = R(0.45, 0.85), dry = R(0.75, 1.15), ry = R(0, TAU);
        for (let k = 0; k < 3; k++) tm.add(card, mtx(x, y - 0.04, z, R(-0.12, 0.12), ry + k * Math.PI / 3, 0, s * R(0.9, 1.2), s * R(0.7, 1.0), 1), () => [dry, dry * R(0.92, 1), dry * 0.9]);
      }
      if (!tm.empty()) { const mm = mesh(tm.build(THREE), tuftMat, 'swamp_sedge', false); mm.userData.wind = 0.4; }
      /* рогоз: стебли и бархатные початки у кромки воды */
      const reedTex = (() => {
        const [c, gg] = canvas(128, 256);
        gg.clearRect(0, 0, 128, 256);
        for (let i = 0; i < 26; i++) {
          const x0 = 10 + Math.random() * 108, w = 2 + Math.random() * 3, h = 140 + Math.random() * 110, bend = (Math.random() - 0.5) * 30;
          const v = 120 + Math.random() * 60;
          gg.strokeStyle = 'rgb(' + v + ',' + (v * 0.86 | 0) + ',' + (v * 0.55 | 0) + ')'; gg.lineWidth = w; gg.lineCap = 'round';
          gg.beginPath(); gg.moveTo(x0, 256); gg.quadraticCurveTo(x0 + bend * 0.3, 256 - h * 0.6, x0 + bend, 256 - h); gg.stroke();
        }
        return ctex(c, true);
      })();
      const reedMat = new THREE.MeshStandardMaterial({ map: reedTex, alphaTest: 0.4, side: THREE.DoubleSide, color: 0xffffff, roughness: 0.9, vertexColors: true });
      /* качание на ветру: верх карточки (uv.y → 1) ходит сильнее */
      { const WT = world.windTime || { value: 0 };
        reedMat.customProgramCacheKey = () => 'reed-v8';
        reedMat.onBeforeCompile = (sh) => {
          sh.uniforms.uT = WT;
          sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
            float rk = uv.y * uv.y;
            transformed.x += (sin(uT * 1.3 + position.x * 0.7 + position.z * 0.3) * 0.08 + sin(uT * 3.7 + position.z * 2.0) * 0.025) * rk;
            transformed.z += sin(uT * 1.1 + position.z * 0.6) * 0.05 * rk;`);
        }; }
      const rm = new Merge(), heads = new Merge();
      const rc = new THREE.PlaneGeometry(1, 1); rc.translate(0, 0.5, 0);
      const hg = new THREE.CapsuleGeometry(0.018, 0.13, 2, 6);
      let nr = 0;
      for (let i = 0; i < 3000 && nr < 70; i++) {
        const a = rnd() * TAU, r = Math.sqrt(rnd()) * 1.25;
        const x = SW.x + Math.cos(a) * SW.rx * r, z = SW.z + Math.sin(a) * SW.rz * r;
        const y = H(x, z);
        if (F.swampE(x, z) > 1.2 || Math.abs(y - SW.L) > 0.09) continue;
        nr++;
        const hh = R(1.1, 1.9), ry = R(0, TAU);
        for (let k = 0; k < 2; k++) rm.add(rc, mtx(x, y - 0.05, z, R(-0.08, 0.08), ry + k * Math.PI / 2, 0, R(0.6, 0.9), hh, 1), () => [R(0.8, 1.05), R(0.78, 1), 0.85]);
        for (let k = 0, nh = 1 + (rnd() * 3 | 0); k < nh; k++) {
          const hx = x + R(-0.25, 0.25), hz = z + R(-0.25, 0.25), hy = y + hh * R(0.75, 0.95);
          heads.add(hg, mtx(hx, hy, hz, R(-0.15, 0.15), 0, R(-0.15, 0.15)), () => [lin(0.30), lin(0.19), lin(0.11)]);
          /* у старых — растрёпанный пух */
          if (rnd() < 0.3) heads.add(new THREE.SphereGeometry(0.035, 6, 4), mtx(hx, hy + 0.06, hz, 0, 0, 0, 1, 1.4, 1), () => [lin(0.62), lin(0.58), lin(0.5)]);
        }
      }
      if (!rm.empty()) { const mm = mesh(rm.build(THREE), reedMat, 'swamp_reeds', false); mm.userData.wind = 1; }
      if (!heads.empty()) mesh(heads.build(THREE), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), 'swamp_cattails', false);

      /* сухие берёзы: стоят на кочках, две упали поперёк окон */
      const bm = new Merge();
      let nb = 0;
      for (let i = 0; i < 600 && nb < 11; i++) {
        const a = rnd() * TAU, r = Math.sqrt(rnd()) * 1.1;
        const x = SW.x + Math.cos(a) * SW.rx * r, z = SW.z + Math.sin(a) * SW.rz * r;
        const y = H(x, z);
        if (y < SW.L + 0.03 || F.swampE(x, z) > 1.1) continue;
        nb++;
        const fallen = nb <= 2, hh = fallen ? R(5, 7) : R(3.2, 8.5), r0 = R(0.07, 0.14);
        const pts = [], rads = [], bx = R(-0.3, 0.3), bz = R(-0.3, 0.3);
        for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(new THREE.Vector3(bx * t * t, t * hh, bz * t * t)); rads.push(r0 * (1 - 0.65 * t) * (k === 0 ? 1.25 : 1)); }
        const curve = new THREE.CatmullRomCurve3(pts);
        const tg = new THREE.TubeGeometry(curve, 10, 1, 8, false);
        /* радиус по длине */
        const P = tg.attributes.position, UVb = tg.attributes.uv;
        for (let k = 0; k < P.count; k++) {
          const t = UVb.getX(k), cp = curve.getPoint(t), rr = r0 * (1 - 0.65 * t);
          P.setXYZ(k, cp.x + (P.getX(k) - cp.x) * rr, cp.y + (P.getY(k) - cp.y) * rr, cp.z + (P.getZ(k) - cp.z) * rr);
          UVb.setXY(k, UVb.getY(k), t * hh * 0.6);
        }
        tg.computeVertexNormals();
        const ry = R(0, TAU);
        let M;
        if (fallen) {
          M = mtx(x, y + r0 * 0.6, z, 0, ry, Math.PI / 2 - 0.04);
        } else M = mtx(x, y - 0.1, z, R(-0.06, 0.06), ry, R(-0.06, 0.06));
        bm.add(tg, M, () => [R(0.85, 1), R(0.85, 1), R(0.82, 0.95)]);
        /* обломанные сучья */
        if (!fallen) for (let k = 0, n = 3 + (rnd() * 4 | 0); k < n; k++) {
          const yy = R(1.2, hh * 0.9), L = R(0.3, 1.1), aa = R(0, TAU);
          const c = new THREE.CylinderGeometry(0.008, 0.025, L, 5); c.translate(0, L / 2, 0);
          bm.add(c, mtx(x, y + yy, z, 0, aa, 0).multiply(mtx(0, 0, 0, 0, 0, -Math.PI / 2 + R(0.2, 0.7))), () => [0.5, 0.48, 0.46]);
        }
        if (!fallen) {
          if (inPlay(x, z)) cols.push({ type: 'cyl', x, z, r: r0 + 0.05, h: 3 });
          if (PX) PX.cyl(x, y, z, r0, hh * 0.95, { mat: 'wood', name: 'birch', tree: { x, z, y, hs: hh / 21, rs: r0 / 0.24, dead: true } });
        } else if (PX) {
          const dx = Math.cos(ry), dz = -Math.sin(ry);
          for (let k = 0; k < hh; k += 0.6) PX.sph(x + dx * k, y + r0, z + dz * k, r0 * 1.1, { mat: 'wood', name: 'birch_log' });
        }
      }
      if (!bm.empty()) mesh(bm.build(THREE), birchMat, 'swamp_birches');
      Z.birches = nb;
    })();

    /* ряска в старых воронках (свежие — мутная бурая вода без неё) */
    (function duckweed() {
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.07, 0.11, 0.015), roughness: 0.8, transparent: true, depthWrite: false });
      mat.customProgramCacheKey = () => 'duck-v8';
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = 'varying vec2 vDk;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvDk = position.xy;');
        sh.fragmentShader = 'varying vec2 vDk;\nfloat dkH(vec2 p){ p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }\nfloat dkN(vec2 x){ vec2 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(mix(dkH(i), dkH(i+vec2(1,0)), f.x), mix(dkH(i+vec2(0,1)), dkH(i+vec2(1,1)), f.x), f.y); }\n' + sh.fragmentShader
          .replace('#include <dithering_fragment>', `#include <dithering_fragment>
            float r = length(vDk);
            float n = dkN(vDk * 4.0) * 0.6 + dkN(vDk * 13.0) * 0.4;
            /* ряску прибивает к краю: гуще у берега, в середине — окна */
            float a = smoothstep(0.45, 0.6, n + r * 0.45 - 0.15) * (1.0 - smoothstep(0.86, 1.0, r));
            gl_FragColor.rgb *= 0.8 + 0.4 * dkN(vDk * 30.0);
            gl_FragColor.a *= a;`);
      };
      const list = (F.CRATERS || []).filter((c) => c.water);
      list.forEach((c, i) => {
        if (i % 2 === 1) return;          // через одну: старые/свежие
        const g = new THREE.CircleGeometry(1, 40);
        const m = new THREE.Mesh(g, mat); m.rotation.x = -Math.PI / 2;
        m.scale.set(c.R * 0.64, c.R * 0.64, 1); m.position.set(c.x, c.h0 - c.D * 0.5 + 0.006, c.z);
        m.name = 'duckweed'; m.renderOrder = 2; m.receiveShadow = true;
        grp.add(m); disposables.push(g);
      });
    })();

    /* ============================================ ГАРЬ ============== */
    (function burnt() {
      const B = F.BURN, lm = new Merge(), sm = new Merge();
      for (let i = 0, n = 0; i < 200 && n < 7; i++) {
        const a = rnd() * TAU, r = Math.sqrt(rnd()) * B.r * 0.9;
        const x = B.x + Math.cos(a) * r, z = B.z + Math.sin(a) * r;
        if (F.burnAt(x, z) < 0.5 || F.craterD(x, z) < 1.2 || F.laneD(x, z) < 1.5) continue;
        if (world.trees && world.trees.near && world.trees.near(x, z, 0.8)) continue;
        n++;
        const L = R(3, 7), ang = R(0, TAU), rr = R(0.14, 0.26);
        const x1 = x + Math.cos(ang) * L, z1 = z + Math.sin(ang) * L;
        logBetween(lm, x, z, x1, z1, rr, () => { const v = R(0.8, 1.2); return [v, v, v]; }, 0.45);
        const nn = Math.ceil(L / 0.7);
        for (let k = 0; k <= nn; k++) {
          const u = k / nn, px = x + (x1 - x) * u, pz = z + (z1 - z) * u;
          if (inPlay(px, pz)) cols.push({ type: 'cyl', x: px, z: pz, r: rr * 0.9, h: rr * 1.6 });
          if (PX) PX.sph(px, H(px, pz) + rr * 0.45, pz, rr, { mat: 'wood', name: 'char_log', tree: { x: px, z: pz, y: H(px, pz), hs: 0.2, rs: rr / 0.24, burnt: 1 } });
        }
      }
      /* обугленные пни: конус «свечой», верх выгорел */
      for (let i = 0, n = 0; i < 200 && n < 9; i++) {
        const a = rnd() * TAU, r = Math.sqrt(rnd()) * B.r;
        const x = B.x + Math.cos(a) * r, z = B.z + Math.sin(a) * r;
        if (F.burnAt(x, z) < 0.4 || F.craterD(x, z) < 1.1) continue;
        if (world.trees && world.trees.near && world.trees.near(x, z, 0.6)) continue;
        n++;
        const h = R(0.3, 1.4), rr = R(0.16, 0.3);
        const g = new THREE.CylinderGeometry(rr * 0.5, rr * 1.15, h, 9, 3, false);
        const P = g.attributes.position;
        for (let k = 0; k < P.count; k++) { const yy = P.getY(k); if (yy > h / 2 - 0.01) P.setY(k, yy - R(0, h * 0.5)); }
        g.computeVertexNormals(); g.translate(0, h / 2, 0);
        sm.add(g, mtx(x, H(x, z) - 0.08, z, R(-0.08, 0.08), R(0, TAU), R(-0.08, 0.08)), () => [1, 1, 1]);
        if (inPlay(x, z)) cols.push({ type: 'cyl', x, z, r: rr, h });
        if (PX) PX.cyl(x, H(x, z), z, rr, h, { mat: 'wood', name: 'char_stump', tree: { x, z, y: H(x, z), hs: 0.1, rs: rr / 0.24, burnt: 1 } });
      }
      if (!lm.empty()) mesh(lm.build(THREE), charMat, 'burnt_logs');
      if (!sm.empty()) mesh(sm.build(THREE), charMat, 'burnt_stumps');
    })();

    /* ============================================ ВЫРУБКА =========== */
    (function logging() {
      const L = F.LOGC, side = new Merge(), top = new Merge();
      const cuts = (F.cuts || []).slice(0, 40);
      for (const c of cuts) {
        const r = 0.24 * c.rs * 1.15, h = R(0.25, 0.55);
        const g = new THREE.CylinderGeometry(r, r * 1.3, h, 12, 2, true);
        const P = g.attributes.position;
        for (let k = 0; k < P.count; k++) if (P.getY(k) < 0) { const a = Math.atan2(P.getZ(k), P.getX(k)); const kk = 1 + 0.25 * Math.max(0, Math.sin(a * 4 + c.rot)); P.setX(k, P.getX(k) * kk); P.setZ(k, P.getZ(k) * kk); }
        g.computeVertexNormals();
        const tilt = R(-0.06, 0.06);
        const y0 = c.y - 0.1;
        side.add(g, mtx(c.x, y0 + h / 2, c.z, 0, c.rot, 0), () => { const v = 0.8 + 0.2 * c.age; return [v, v, v * 0.95]; });
        const cap = new THREE.CircleGeometry(r, 16); cap.rotateX(-Math.PI / 2);
        const grey = 0.55 + 0.45 * (1 - c.age);
        top.add(cap, mtx(c.x, y0 + h + 0.002, c.z, tilt, c.rot, tilt), () => [grey, grey * 0.97, grey * 0.92]);
        if (inPlay(c.x, c.z)) cols.push({ type: 'cyl', x: c.x, z: c.z, r: r * 1.05, h: h - 0.1 });
        if (PX) PX.cyl(c.x, y0, c.z, r, h + 0.1, { mat: 'wood', name: 'stump', tree: { x: c.x, z: c.z, y: y0, hs: 0.05, rs: r / 0.24, dead: true } });
      }
      /* штабель: 3 ряда, брёвна 4.5 м, вдоль X — у волока */
      const sx = L.x + 1.5, sz = L.z + 2.6, LL = 4.5;
      const gy = Math.max(H(sx - 2, sz), H(sx + 2, sz), H(sx, sz - 0.8), H(sx, sz + 0.8));
      const logs = new Merge(), ends = new Merge();
      const rows = [5, 4, 3];
      let topY = gy;
      rows.forEach((n, row) => {
        for (let i = 0; i < n; i++) {
          const r = R(0.13, 0.17), zz = sz + (i - (n - 1) / 2) * 0.32, yy = gy + 0.15 + row * 0.27, xo = R(-0.15, 0.15);
          const g = new THREE.CylinderGeometry(r, r * 1.03, LL, 10, 1, true);
          const UVl = g.attributes.uv; for (let k = 0; k < UVl.count; k++) UVl.setXY(k, UVl.getX(k) * 2, UVl.getY(k) * 3);
          logs.add(g, mtx(sx + xo, yy, zz, 0, 0, Math.PI / 2), () => [0.75, 0.73, 0.68]);
          for (const e of [-1, 1]) {
            const c = new THREE.CircleGeometry(r, 12);
            ends.add(c, mtx(sx + xo + e * LL / 2, yy, zz, 0, e * Math.PI / 2, R(0, TAU)), () => { const v = R(0.62, 0.8); return [v, v * 0.95, v * 0.9]; });
          }
          topY = Math.max(topY, yy + r);
        }
      });
      mesh(logs.build(THREE), greyLog, 'logpile');
      mesh(ends.build(THREE), cutMat, 'logpile_ends');
      cols.push({ type: 'box', x0: sx - LL / 2 - 0.1, x1: sx + LL / 2 + 0.1, z0: sz - 0.85, z1: sz + 0.85, h: 1, _top: topY });
      if (PX) PX.box(sx, (gy + topY) / 2, sz, LL / 2, (topY - gy) / 2, 0.82, 0, { mat: 'wood', name: 'logpile', big: true });
      Z.logpile = { x: sx, z: sz, top: topY };
      /* порубочные остатки: кучи сучьев.
         v13: раньше сучья ставились на случайную высоту 0–0,45 м с наклоном
         наугад — половина висела в воздухе, а без текстуры (только светлый
         цвет вершин) они читались как белые палки. Теперь куча «насыпается»:
         каждый сук кладётся на то, что под ним (грунт + уже лежащие сучья,
         сетка высот 5 см), — опирается на самую высокую точку и
         проворачивается вокруг неё к стороне центра масс до второй опоры
         (как реальная палка). Кора — та же текстура, что у пней, цвет
         старой серо-бурой древесины; у толстых — короткие боковые ветки. */
      const br = new Merge();
      const _up = new THREE.Vector3(0, 1, 0), _dv = new THREE.Vector3(), _qq = new THREE.Quaternion();
      for (let p = 0; p < 3; p++) {
        const a = R(0, TAU), d = R(1.5, L.r * 0.8), cx = L.x + Math.cos(a) * d, cz = L.z + Math.sin(a) * d;
        if (F.trackD(cx, cz) < 2) continue;
        const G = 0.05, GN = 56, g0x = cx - GN * G / 2, g0z = cz - GN * G / 2;
        const hf = new Float32Array(GN * GN).fill(-1e9);
        const sup = (x, z) => {
          const i = Math.floor((x - g0x) / G), j = Math.floor((z - g0z) / G);
          const hs = i >= 0 && j >= 0 && i < GN && j < GN ? hf[j * GN + i] : -1e9;
          return Math.max(H(x, z), hs);
        };
        const mark = (x, z, y) => {
          const i = Math.floor((x - g0x) / G), j = Math.floor((z - g0z) / G);
          for (let jj = j - 1; jj <= j + 1; jj++) for (let ii = i - 1; ii <= i + 1; ii++) {
            if (ii < 0 || jj < 0 || ii >= GN || jj >= GN) continue;
            const w = ii === i && jj === j ? 0 : 0.006;
            hf[jj * GN + ii] = Math.max(hf[jj * GN + ii], y - w);
          }
        };
        /* преобладающее направление: сучья сбрасывают охапками, вдоль волока */
        const yaw0 = R(0, Math.PI);
        let top = H(cx, cz);
        for (let k = 0; k < 46; k++) {
          const len = R(0.5, 2.0) * (k < 8 ? 1.15 : 1), rr = R(0.01, 0.032) * (0.6 + 0.5 * len / 2);
          const yaw = yaw0 + R(-0.75, 0.75) + (rnd() < 0.25 ? Math.PI / 2 : 0);
          const ux = Math.cos(yaw), uz = Math.sin(yaw);
          /* центр — ближе к середине кучи (гауссово) */
          const ox = (R(-1, 1) + R(-1, 1)) * 0.55, oz = (R(-1, 1) + R(-1, 1)) * 0.55;
          const mx = cx + ox, mz = cz + oz;
          /* профиль опор вдоль сука */
          const NSm = Math.max(5, Math.ceil(len / 0.06));
          const ts = [], ss = [];
          for (let q = 0; q <= NSm; q++) {
            const t = -len / 2 + len * q / NSm;
            ts.push(t); ss.push(sup(mx + ux * t, mz + uz * t) + rr);
          }
          let i1 = 0;
          for (let q = 1; q < ss.length; q++) if (ss[q] > ss[i1]) i1 = q;
          /* центр масс (t = 0) по какую сторону от верхней опоры */
          const t1 = ts[i1], s1 = ss[i1];
          let m = 0;
          if (Math.abs(t1) > 0.02) {
            const dirS = t1 > 0 ? -1 : 1;
            /* линия y = s1 + m·(t − t1) не ниже ни одной опоры на стороне
               опрокидывания: со стороны +t — максимум наклона, со стороны
               −t — минимум (деление на отрицательное плечо) */
            m = dirS > 0 ? -1e9 : 1e9;
            for (let q = 0; q < ts.length; q++) {
              const dt2 = ts[q] - t1;
              if (dt2 * dirS <= 0.01) continue;
              const mq = (ss[q] - s1) / dt2;
              m = dirS > 0 ? Math.max(m, mq) : Math.min(m, mq);
            }
            if (Math.abs(m) > 1e8) m = 0;
          }
          m = Math.max(-0.9, Math.min(0.9, m));
          const yC = s1 - m * t1;           // высота оси в центре сука
          const pitch = Math.atan(m);
          const c = new THREE.CylinderGeometry(rr * 0.55, rr, len, 5, 1);
          const UVc = c.attributes.uv; for (let q = 0; q < UVc.count; q++) UVc.setXY(q, UVc.getX(q) * 0.35, UVc.getY(q) * len * 1.6);
          _dv.set(ux * Math.cos(pitch), Math.sin(pitch), uz * Math.cos(pitch)).normalize();
          _qq.setFromUnitVectors(_up, _dv);
          const M4 = new THREE.Matrix4().compose(V.set(mx, yC, mz), _qq, S3.set(1, 1, 1));
          const tone = R(0.42, 0.62);
          br.add(c, M4, () => [tone * 0.92, tone * 0.86, tone * 0.78]);
          for (let q = 0; q < ts.length; q++) mark(mx + ux * ts[q], mz + uz * ts[q], yC + m * ts[q] + rr);
          top = Math.max(top, yC + Math.abs(m) * len / 2 + rr);
          /* боковые веточки у толстых сучьев: лежат в плоскости кучи */
          if (rr > 0.02 && rnd() < 0.6) {
            const tb = R(-0.3, 0.3) * len, bl = R(0.18, 0.45), by = yaw + (rnd() < 0.5 ? 1 : -1) * R(0.5, 0.9);
            const bx0 = mx + ux * tb, bz0 = mz + uz * tb, by0 = yC + m * tb;
            const ex = bx0 + Math.cos(by) * bl, ez = bz0 + Math.sin(by) * bl;
            const ey = Math.max(sup(ex, ez) + rr * 0.3, by0 - bl * 0.6);
            const bc = new THREE.CylinderGeometry(rr * 0.2, rr * 0.45, bl, 4, 1); bc.translate(0, bl / 2, 0);
            _dv.set(ex - bx0, ey - by0, ez - bz0).normalize();
            _qq.setFromUnitVectors(_up, _dv);
            br.add(bc, new THREE.Matrix4().compose(V.set(bx0, by0, bz0), _qq, S3.set(1, 1, 1)), () => [tone * 0.85, tone * 0.8, tone * 0.72]);
          }
        }
        if (inPlay(cx, cz)) cols.push({ type: 'cyl', x: cx, z: cz, r: 0.9, h: Math.max(0.15, top - H(cx, cz)) });
      }
      if (!br.empty()) {
        const slashMat = barkMat.clone();
        slashMat.color.setRGB(0.62, 0.58, 0.52);
        slashMat.roughness = 0.97;
        mesh(br.build(THREE), slashMat, 'slash_piles');
      }
      if (!side.empty()) { mesh(side.build(THREE), barkMat, 'stumps'); mesh(top.build(THREE), cutMat, 'stump_tops'); }
      Z.stumps = cuts.length;
    })();

    /* ============================================ СЛЕДЫ ВОЙНЫ ======= */
    /* ящик: оливковая краска по доскам, трафарет */
    const crateTex = (() => {
      const [c, g] = canvas(256, 128);
      g.fillStyle = '#4f5534'; g.fillRect(0, 0, 256, 128);
      for (let y = 0; y < 128; y += 32) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, 256, 2); }
      for (let i = 0; i < 900; i++) { g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '20,18,10' : '120,110,80') + ',' + Math.random() * 0.25 + ')'; g.fillRect(Math.random() * 256, Math.random() * 128, 2 + Math.random() * 8, 1); }
      g.fillStyle = 'rgba(205,200,180,0.75)'; g.font = 'bold 22px monospace';
      g.fillText('7,62x39 ПС', 40, 58); g.font = 'bold 15px monospace'; g.fillText('1980 гж  440 ШТ', 52, 84);
      /* облезшая краска — серое дерево */
      for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(112,104,90,0.7)'; g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 128, 3 + Math.random() * 14, 1 + Math.random() * 4, 0, 0, TAU); g.fill(); }
      return ctex(c, true);
    })();
    const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, color: 0xffffff, roughness: 0.88 });
    const crates = [];
    function crate(x, z, ry, open, tilt) {
      const y = H(x, z);
      const g = new THREE.BoxGeometry(0.72, 0.24, 0.4);
      const m = new THREE.Mesh(g, crateMat);
      m.position.set(x, y + 0.11, z); m.rotation.set(tilt || 0, ry, 0); m.castShadow = m.receiveShadow = true; m.name = 'ammo_crate';
      grp.add(m); disposables.push(g);
      if (open) {
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.03, 0.4), crateMat);
        lid.position.set(x + Math.sin(ry) * 0.42, y + 0.05, z + Math.cos(ry) * 0.42); lid.rotation.set(0.25, ry + 0.3, 0.1);
        lid.castShadow = lid.receiveShadow = true; grp.add(lid); disposables.push(lid.geometry);
        /* внутри — пусто, гнилые «соты» картона */
        const inner = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.02, 0.34), new THREE.MeshStandardMaterial({ color: 0x1d1912, roughness: 1 }));
        inner.position.set(x, y + 0.2, z); inner.rotation.y = ry; grp.add(inner); disposables.push(inner.geometry);
      }
      if (inPlay(x, z)) cols.push({ type: 'box', x0: x - 0.38, x1: x + 0.38, z0: z - 0.38, z1: z + 0.38, h: 0.26 });
      if (PX) PX.box(x, y + 0.12, z, 0.36, 0.12, 0.2, ry, { mat: 'wood', name: 'crate' });
      crates.push(m);
    }
    (function debris() {
      const T = F.TRENCH;
      if (T) {
        const [dx0, dz0, rot] = T.dug, nx = T.nx, nz = T.nz;
        /* у входа в блиндаж: штабель из двух ящиков и один открытый */
        const ex = dx0 + nx * 2.1, ez = dz0 + nz * 2.1, tx = -nz, tz = nx;
        crate(ex + tx * 1.4, ez + tz * 1.4, rot + 0.1, false);
        crate(ex + tx * 1.5 + 0.03, ez + tz * 1.5, rot + 0.15, false, 0.02);
        crates[1].position.y += 0.24;
        crate(ex - tx * 1.6, ez - tz * 1.6, rot + 0.7, true);
        /* гильзы на дне траншеи (зелёный лак, латунь), россыпями у бойниц */
        const N = 90;
        const cg = new THREE.CylinderGeometry(0.0057, 0.0062, 0.039, 6); cg.rotateZ(Math.PI / 2);
        const cm = new THREE.MeshStandardMaterial({ color: 0x6f6a45, metalness: 0.65, roughness: 0.55 });
        const im = new THREE.InstancedMesh(cg, cm, N); im.name = 'trench_casings'; im.receiveShadow = true;
        const P = T.pts;
        const cc = new THREE.Color();
        for (let i = 0; i < N; i++) {
          const k = Math.floor(rnd() * (P.length - 1)), u = rnd(), a = P[k], b = P[k + 1];
          const x = a[0] + (b[0] - a[0]) * u + R(-0.35, 0.35), z = a[1] + (b[1] - a[1]) * u + R(-0.35, 0.35);
          im.setMatrixAt(i, mtx(x, H(x, z) + 0.004, z, 0, R(0, TAU), R(-0.2, 0.2)));
          const br = rnd() < 0.35;
          im.setColorAt(i, br ? cc.setRGB(0.55, 0.4, 0.16) : cc.setRGB(0.42, 0.42, 0.3).multiplyScalar(R(0.6, 1)));
        }
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        grp.add(im); disposables.push(cg);
      }
      /* пулемётное гнездо на бровке оврага: подкова из гнилых мешков */
      const nestS = 30, q = RV.axis(nestS), l = lat(q[2]);
      const NX = q[0] + l[0] * 6.4, NZ = q[1] + l[1] * 6.4;
      const face = Math.atan2(-l[0], -l[1]);    // «лицом» к оврагу
      Z.nest = { x: NX, z: NZ };
      const bag = new THREE.SphereGeometry(1, 10, 6);
      { const P = bag.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i); P.setY(i, Math.sign(y) * Math.pow(Math.abs(y), 0.6)); } bag.computeVertexNormals(); }
      const burlap = (() => {
        const [c, g] = canvas(128, 128);
        g.fillStyle = '#7d7356'; g.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 128; i += 3) { g.fillStyle = 'rgba(40,34,20,0.25)'; g.fillRect(i, 0, 1, 128); g.fillRect(0, i, 128, 1); }
        for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(30,28,18,' + (0.2 + Math.random() * 0.4) + ')'; g.beginPath(); g.ellipse(Math.random() * 128, Math.random() * 128, 4 + Math.random() * 18, 3 + Math.random() * 12, 0, 0, TAU); g.fill(); }
        return ctex(c, true, [2, 2]);
      })();
      const bagMat = new THREE.MeshStandardMaterial({ map: burlap, color: 0xffffff, vertexColors: true, roughness: 0.97 });
      const bm = new Merge();
      const arc = [];
      for (let i = 0; i < 9; i++) arc.push(-1.25 + i * (2.5 / 8));
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < arc.length; i++) {
          if (row === 2 && (i % 3 === 1 || rnd() < 0.3)) continue;      // верхний ряд осыпался
          const a = face + arc[i] + (row % 2) * 0.12, rr = 1.55;
          const x = NX + Math.sin(a) * rr, z = NZ + Math.cos(a) * rr;
          const y = H(x, z) + 0.09 + row * 0.16 - (row === 2 ? 0.03 : 0);
          const sag = rnd() < 0.3 ? 0.65 : 1;
          bm.add(bag, mtx(x, y, z, R(-0.1, 0.1), a + Math.PI / 2, R(-0.12, 0.12), 0.29, 0.09 * sag, 0.17), () => { const v = R(0.65, 1); return [v, v * 0.97, v * 0.9]; });
          if (row === 0 && PX) PX.box(x, y + 0.14, z, 0.28, 0.25, 0.17, a + Math.PI / 2, { mat: 'sand', name: 'sandbag' });
          if (row === 0 && inPlay(x, z)) cols.push({ type: 'cyl', x, z, r: 0.24, h: 0.42 });
        }
      }
      /* рваные мешки — вывалившийся песок */
      for (let i = 0; i < 4; i++) {
        const a = face + R(-1.3, 1.3), x = NX + Math.sin(a) * 1.85, z = NZ + Math.cos(a) * 1.85;
        bm.add(new THREE.SphereGeometry(1, 8, 5, 0, TAU, 0, Math.PI / 2), mtx(x, H(x, z) - 0.02, z, 0, R(0, TAU), 0, R(0.2, 0.4), 0.06, R(0.2, 0.35)), () => [0.75, 0.68, 0.5]);
      }
      mesh(bm.build(THREE), bagMat, 'sandbag_nest');
      crate(NX - Math.sin(face) * 0.6 + Math.cos(face) * 0.5, NZ - Math.cos(face) * 0.6 - Math.sin(face) * 0.5, face + 0.4, true);

      /* брезент: обрывок на земле у гнезда и лоскут на суку у блиндажа (качается) */
      const tarpTex = (() => {
        const [c, g] = canvas(128, 128);
        g.fillStyle = '#4d4f37'; g.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 400; i++) { g.fillStyle = 'rgba(20,20,10,' + Math.random() * 0.2 + ')'; g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 6, 1 + Math.random() * 6); }
        g.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(Math.random() * 128, Math.random() * 128, 3 + Math.random() * 12, 2 + Math.random() * 9, Math.random() * 3, 0, TAU); g.fill(); }
        /* рваный край */
        for (let x = 0; x < 128; x += 4) { g.fillRect(x, 0, 4, Math.random() * 14); g.fillRect(x, 128 - Math.random() * 12, 4, 14); }
        return ctex(c, true);
      })();
      const tarpMat = new THREE.MeshStandardMaterial({ map: tarpTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.92 });
      {
        const g = new THREE.PlaneGeometry(1.8, 1.3, 12, 9); g.rotateX(-Math.PI / 2);
        const cx = NX + Math.sin(face + Math.PI) * 1.4, cz = NZ + Math.cos(face + Math.PI) * 1.4, ry = R(0, TAU);
        const P = g.attributes.position, cs = Math.cos(ry), sn = Math.sin(ry);
        for (let i = 0; i < P.count; i++) {
          const lx = P.getX(i), lz = P.getZ(i), wx = cx + lx * cs + lz * sn, wz = cz - lx * sn + lz * cs;
          P.setXYZ(i, wx, H(wx, wz) + 0.025 + 0.06 * Math.max(0, Math.sin(lx * 3.1 + lz * 2.3)), wz);
        }
        g.computeVertexNormals();
        mesh(g, tarpMat, 'tarp_ground', false);
      }
      if (T) {
        const g = new THREE.PlaneGeometry(0.9, 1.2, 6, 8); g.translate(0, -0.6, 0);
        const mat2 = tarpMat.clone();
        const WT = world.windTime || { value: 0 };
        mat2.onBeforeCompile = (sh) => {
          sh.uniforms.uT = WT;
          sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
            float k = -position.y / 1.2;
            transformed.z += sin(uT * 2.3 + position.y * 3.0) * 0.16 * k + sin(uT * 5.1 + position.x * 6.0) * 0.04 * k;
            transformed.x += sin(uT * 1.7 + 1.3) * 0.05 * k;`);
        };
        mat2.customProgramCacheKey = () => 'tarp-flap-v8';
        const [dx0, dz0] = T.dug;
        const m = new THREE.Mesh(g, mat2);
        const tx = dx0 + T.nx * 2.6 - T.nz * 2.4, tz = dz0 + T.nz * 2.6 + T.nx * 2.4;
        m.position.set(tx, H(tx, tz) + 1.75, tz); m.rotation.y = R(0, TAU); m.castShadow = true; m.name = 'tarp_flap';
        grp.add(m); disposables.push(g);
        /* кол, на котором он висит */
        const sg = new THREE.CylinderGeometry(0.035, 0.05, 1.9, 6);
        { const n = sg.attributes.position.count, cc = new Float32Array(n * 3); for (let i = 0; i < n; i++) { cc[i * 3] = 0.42; cc[i * 3 + 1] = 0.36; cc[i * 3 + 2] = 0.29; } sg.setAttribute('color', new THREE.BufferAttribute(cc, 3)); }
        const st = new THREE.Mesh(sg, rotMat);
        st.position.set(tx, H(tx, tz) + 0.9, tz); st.rotation.z = 0.06; st.castShadow = true; grp.add(st); disposables.push(st.geometry);
        if (PX) PX.cyl(tx, H(tx, tz), tz, 0.05, 1.9, { mat: 'wood', name: 'stake' });
      }
    })();

    /* сигнальная проволока с банками: перед траншеей, между кольями */
    const CANS = { list: [], wire: null, t: 0, cool: 0 };
    (function cans() {
      const T = F.TRENCH;
      if (!T) return;
      const A = T.pts[0], B = T.pts[T.pts.length - 1];
      const at = (t, off) => [A[0] + (B[0] - A[0]) * t + T.nx * off, A[1] + (B[1] - A[1]) * t + T.nz * off];
      const p0 = at(0.2, 6.6), p1 = at(0.38, 6.6);
      const y0 = H(p0[0], p0[1]) + 0.55, y1 = H(p1[0], p1[1]) + 0.55;
      const st = new Merge();
      for (const [p, y] of [[p0, y0], [p1, y1]]) {
        const c = new THREE.CylinderGeometry(0.025, 0.035, 0.9, 5); c.translate(0, 0.45, 0);
        st.add(c, mtx(p[0], y - 0.65, p[1], R(-0.1, 0.1), 0, R(-0.1, 0.1)), () => [0.5, 0.45, 0.38]);
      }
      mesh(st.build(THREE), rotMat, 'cans_stakes');
      const pts = [];
      for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push(new THREE.Vector3(p0[0] + (p1[0] - p0[0]) * u, y0 + (y1 - y0) * u - 0.12 * Math.sin(u * Math.PI), p0[1] + (p1[1] - p0[1]) * u)); }
      const curve = new THREE.CatmullRomCurve3(pts);
      const wg = new THREE.TubeGeometry(curve, 24, 0.0035, 3, false);
      const rust = new THREE.MeshStandardMaterial({ map: etex('rust_diff', true, 1, 1), color: 0x8a7a6a, roughness: 0.8, metalness: 0.4 });
      mesh(wg, rust, 'cans_wire', false);
      const canG = new THREE.CylinderGeometry(0.037, 0.037, 0.105, 10, 1, true);
      const canMat = new THREE.MeshStandardMaterial({ map: etex('rust_diff', true, 1, 1), color: 0xb0a090, roughness: 0.55, metalness: 0.65, side: THREE.DoubleSide });
      for (let i = 0; i < 5; i++) {
        const u = 0.15 + i * 0.17 + R(-0.03, 0.03), hp = curve.getPoint(u);
        const pivot = new THREE.Object3D(); pivot.position.copy(hp); grp.add(pivot);
        const can = new THREE.Mesh(canG, canMat); can.position.y = -0.09; can.castShadow = true; can.name = 'can';
        pivot.add(can);
        const c = { pivot, can, a: 0, v: 0, b: 0, bv: 0, x: hp.x, y: hp.y - 0.09, z: hp.z };
        if (PX) c.px = PX.sph(hp.x, hp.y - 0.09, hp.z, 0.06, { mat: 'metal', name: 'can', onHit: (hit, dir) => { c.v += R(6, 10) * (rnd() < 0.5 ? -1 : 1); c.bv += R(4, 8); CANS.ring(1, hp); } });
        CANS.list.push(c);
      }
      disposables.push(canG);
      CANS.mid = new THREE.Vector3((p0[0] + p1[0]) / 2, (y0 + y1) / 2, (p0[1] + p1[1]) / 2);
      CANS.p0 = p0; CANS.p1 = p1;
      CANS.ring = (k, p) => {
        if (CANS.cool > 0 || !audio || !audio.cans) return;
        CANS.cool = 0.25;
        try { audio.cans(Z.spatialFrom ? Z.spatialFrom(p || CANS.mid) : { gain: 0.5, pan: 0 }, k); } catch (e) { /* */ }
        Z.stats.cans = (Z.stats.cans || 0) + 1;
      };
    })();

    if (root.GGloom) { root.GGloom.markTree(grp, 0.9, 1); }

    /* ============================================ ЖИЗНЬ ============ */
    const _c = new THREE.Vector3(), _r = new THREE.Vector3();
    let leafT = 0, dripT = 0, wetT = 0;
    const segD = (x, z, a, b) => {
      const ex = b[0] - a[0], ez = b[1] - a[1], t = clamp(((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez), 0, 1);
      return Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t);
    };
    Z.update = (dt, t, ctx) => {
      if (!(dt > 0)) return;
      ctx = ctx || {};
      const cam = camera.position, wind = ctx.wind || 0.3, rain = ctx.rain || 0;
      const S = ctx.scars;
      /* банки: качаются на проволоке (маятник), звенят на порывах и от касаний */
      CANS.cool -= dt;
      if (CANS.list.length) {
        const gust = Math.max(0, Math.sin(t * 0.37) * Math.sin(t * 0.91 + 1)) * wind;
        let near = false;
        const bodies = ctx.bodies || [];
        for (const b of bodies) if (segD(b.x, b.z, CANS.p0, CANS.p1) < 0.55 && Math.abs(b.y - CANS.mid.y) < 1.4) near = true;
        for (const c of CANS.list) {
          c.v += (-9.81 / 0.09 * Math.sin(c.a) - c.v * 1.2 + (gust > 0.25 ? (rnd() - 0.5) * 40 * gust : 0)) * dt;
          if (near) c.v += (rnd() - 0.5) * 120 * dt;
          c.a += c.v * dt;
          c.bv += (-60 * c.b - 2 * c.bv) * dt; c.b += c.bv * dt;
          c.pivot.rotation.set(c.a * 0.9, 0, c.a * 0.35 + c.b * 0.2);
        }
        /* касание банок друг о друга — звон */
        let maxV = 0; for (const c of CANS.list) maxV = Math.max(maxV, Math.abs(c.v));
        if (maxV > 3.2 && rnd() < dt * 6) CANS.ring(clamp(maxV / 10, 0.25, 1));
      }
      /* журчание ручья: громкость по расстоянию до воды */
      if (audio && audio.setBrook) {
        const d = F.ravineD(cam.x, cam.z), s = F.ravineS();
        const q = F.RV.axis(s);
        const by = F.RV.bed(s);
        let k = clamp(1 - (d - 1) / 22, 0, 1);
        k *= k; k *= clamp(1 - (cam.y - by - 2) / 14, 0.25, 1);
        _c.set(q[0], by, q[1]).sub(cam);
        const r = _r.set(1, 0, 0).applyQuaternion(camera.quaternion);
        const pan = _c.lengthSq() > 0.01 ? clamp(_c.normalize().dot(r), -1, 1) * 0.7 : 0;
        if (k > 0.005 || Z._bk > 0.005) audio.setBrook(k, pan);
        Z._bk = k;
      }
      /* листья с берёз у болота и хвоя/листья в лесу при ветре */
      if (S && S.spawn && Z.quality !== 'low') {
        leafT -= dt;
        const swE = F.swampE(cam.x, cam.z);
        const rate = (swE < 1.6 ? 2.2 : 0.35) * (0.4 + wind * 1.6);
        if (leafT <= 0) {
          leafT = 1 / rate * R(0.5, 1.5);
          const a = R(0, TAU), r = R(2, 13), x = cam.x + Math.cos(a) * r, z = cam.z + Math.sin(a) * r;
          const y = H(x, z) + R(4, 9);
          const yellow = swE < 1.6 || rnd() < 0.3;
          const p = S.spawn(x, y, z, R(-0.3, 0.3) + wind * 0.6, -R(0.35, 0.6), R(-0.3, 0.3), 16, 0.04, 0.04, 1,
            yellow ? R(0.42, 0.55) : R(0.22, 0.3), yellow ? R(0.33, 0.42) : R(0.18, 0.24), yellow ? R(0.06, 0.1) : R(0.07, 0.1), 2, 0.5, 2.4, 1.6);
          if (p) Z.stats.leaves = (Z.stats.leaves || 0) + 1;
        }
        /* капли с веток: в дождь и ещё 1.5 мин после */
        wetT = rain > 0.1 ? 90 : Math.max(0, wetT - dt);
        const wk = rain > 0.1 ? 1 : wetT / 90;
        if (wk > 0.02) {
          dripT -= dt;
          if (dripT <= 0) {
            dripT = R(0.04, 0.16) / wk;
            const a = R(0, TAU), r = R(0.8, 7), x = cam.x + Math.cos(a) * r, z = cam.z + Math.sin(a) * r;
            const cn = root.GGloom ? root.GGloom.canopyAt(x, z) : 0.5;
            if (rnd() < 0.3 + cn) {
              S.spawn(x, H(x, z) + R(2.5, 5), z, 0, -R(1, 3), 0, 2.5, 0.012, 0.01, 0.55, 0.62, 0.66, 0.68, 1, 9.8, 0.05, 0);
              Z.stats.drips = (Z.stats.drips || 0) + 1;
            }
          }
        }
      }
    };
    Z.setQuality = (q) => {
      Z.quality = q;
      grp.traverse((m) => { if (m.name === 'swamp_sedge' || m.name === 'trench_casings') m.visible = q !== 'low'; });
    };
    Z.bridges = bridges; Z.cans = CANS;
    Z.dispose = () => { for (const g of disposables) g.dispose && g.dispose(); scene.remove(grp); };
    return Z;
  }
  root.GZones = { create };
})(typeof self !== 'undefined' ? self : this);
